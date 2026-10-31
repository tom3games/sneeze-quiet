// 密室おなら選手権 / ELEVATOR FART
import * as THREE from 'three'

const D = window.HS
const $ = s => document.querySelector(s)
const STEP = 1 / 60, TAIL = 0.5, PRE = 0.22, TH = 0.25
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k) }
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }
const pick = a => a[Math.floor(S.rand() * a.length) % a.length]

// ---------- 状態
const S = {
  lang: store.get('hs.lang') || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  mode: 'title', time: 0, seed: (Date.now() & 0xffffff) || 1, rand: null,
  stageIdx: 0, st: 0, modeT: 0, evs: [], level: 0,
  gauge: 0, strain: 0, flush: 0, holding: false, downAt: 0, toggled: false, ignoreUp: false, everHeld: false,
  snz: null, react: 0, relief: 0, shame: 0, haStep: 0, humT: 0, shake: 0, punch: -1, hop: 0,
  later: [], rec: [], maxDb: 0, photo: false, capT: -1, doCap: false,
  dbgPause: false, fps: 0, resT: 0, result: null, mood: '',
  // 匂い・乗客・誤魔化し
  smell: 0, sniff: 0, sniffStep: 0, smellBusts: 0, pax: [], rode: [], floor: 1, floorT: 0, door: 0, stop: null,
  ruseLeft: {}, ruseLog: [], coughT: 0, coughN: 0, lastBad: null, exiting: false, exitT: 0,
}
S.rand = mulberry(S.seed)
const TT = () => D.T[S.lang]
const L2 = pair => pair[S.lang === 'ja' ? 0 : 1]

// ---------- 音（WebAudio だけで鳴らす）
const Snd = {
  ctx: null, muted: store.get('hs.mute') === '1', next: 0, step: 0, track: null, want: null, switchAt: 0, played: {},
  TEMPO: { title: 116, quiet: 96, happy: 132, sad: 70 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8
      this.an = c.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(c.destination)
      this.bgm = c.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      // 金属の箱の響き
      this.echo = c.createGain(); const dl = c.createDelay(1); dl.delayTime.value = 0.09; const fb = c.createGain(); fb.gain.value = 0.5
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const wet = c.createGain(); wet.gain.value = 0.5
      this.echo.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(lp); lp.connect(wet); wet.connect(this.master)
      const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; store.set('hs.mute', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.8 },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(Math.max(0.0002, vol), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02)
  },
  swell(t0, w, p, tail, vol, f1, f2, type = 'lowpass', q = 1) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q
    f.frequency.setValueAtTime(f1, t0); f.frequency.exponentialRampToValueAtTime(f2, t0 + w + 0.05)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.28, t0 + w); g.gain.exponentialRampToValueAtTime(vol, t0 + w + 0.06)
    g.gain.setValueAtTime(vol, t0 + w + p); g.gain.exponentialRampToValueAtTime(0.0001, t0 + w + p + tail)
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + w + p + tail + 0.05)
  },
  // 声っぽい音（のこぎり波を母音のフィルタに通す）
  voice(f, t0, dur, vol, formant = 900, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = 3
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(bp); bp.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  // 震える低音（おならの本体）。rate=ブルブルの速さ
  rumble(t0, dur, vol, f1, f2, rate, dest) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f1, t0); o.frequency.linearRampToValueAtTime(f1 * 1.25, t0 + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 4
    lfo.type = 'square'; lfo.frequency.setValueAtTime(rate, t0); lfo.frequency.linearRampToValueAtTime(rate * 0.6, t0 + dur); lg.gain.value = 0.5; am.gain.value = 0.5
    lfo.connect(lg); lg.connect(am.gain)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(lp); lp.connect(am); am.connect(g); g.connect(dest || this.master)
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05)
  },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  duck(sec) {
    if (!this.ctx) return; const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(0.0001, now); g.setValueAtTime(0.0001, now + sec); g.linearRampToValueAtTime(this.vol(), now + sec + 0.6)
  },
  vol() { return this.track === 'quiet' ? 0.32 : 0.26 },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(this.vol(), c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  pluck(n, t, dur = 0.09, vol = 0.07) { this.tone(this.mtof(n), t, dur, 'triangle', vol, this.bgm) },
  // タイトル: 抜き足差し足のつま先ジャズ（Em）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [40, 40, 45, 47][bar]
    if (s % 4 === 0) this.tone(this.mtof(root), t, 0.12, 'triangle', 0.32, this.bgm)
    if (s % 4 === 2) this.tone(this.mtof(root + 7), t, 0.08, 'triangle', 0.16, this.bgm)
    if (s % 2 === 1) this.noise(t, 0.025, 0.03, 7000, 'highpass', this.bgm)
    const m = [[64, -1, 67, -1, 69, -1, 70, 71, -1, -1, 64, -1, -1, -1, -1, -1], [64, -1, 67, -1, 69, -1, 70, 71, -1, -1, 76, -1, 75, -1, -1, -1],
      [69, -1, 72, -1, 74, -1, 75, 76, -1, -1, 69, -1, -1, -1, -1, -1], [71, -1, -1, 70, -1, -1, 69, -1, 67, -1, 64, -1, 63, -1, 64, -1]][bar]
    if (m[s] > 0) { this.pluck(m[s] + 12, t, 0.08, 0.06); this.tone(this.mtof(m[s]), t, 0.1, 'square', 0.018, this.bgm) }
  },
  // プレイ: のんきなエレベーター音楽（ボサノバ）
  p_quiet(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const ch = [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [67, 71, 74, 77]][bar], root = [41, 40, 38, 43][bar]
    if (s === 0 || s === 10) this.tone(this.mtof(root), t, 0.3, 'sine', 0.22, this.bgm)
    if (s === 6 || s === 14) this.tone(this.mtof(root + 7), t, 0.22, 'sine', 0.14, this.bgm)
    if ([0, 3, 6, 10, 12].includes(s)) for (const n of ch) this.tone(this.mtof(n), t, 0.16, 'triangle', 0.018, this.bgm)
    if (s % 2 === 0) this.noise(t, 0.02, 0.012, 6000, 'highpass', this.bgm)
    const mel = [[76, -1, -1, 77, -1, 76, -1, -1, 72, -1, -1, -1, 74, -1, -1, -1], [74, -1, -1, 72, -1, 71, -1, -1, 67, -1, -1, -1, -1, -1, -1, -1],
      [72, -1, -1, 74, -1, 76, -1, -1, 77, -1, 76, -1, 74, -1, -1, -1], [74, -1, -1, -1, 71, -1, -1, -1, 67, -1, 69, -1, 71, -1, -1, -1]][bar]
    if (mel[s] > 0) this.tone(this.mtof(mel[s]), t, 0.3, 'sine', 0.035, this.bgm)
  },
  p_happy(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16, root = [48, 45, 41, 43][bar]
    if (s === 0 || s === 8) this.tone(150, t, 0.16, 'sine', 0.6, this.bgm, 45)
    if (s === 4 || s === 12) this.noise(t, 0.08, 0.14, 1500, 'bandpass', this.bgm)
    if (s % 2 === 0) this.noise(t, 0.03, 0.04, 8000, 'highpass', this.bgm)
    if ([0, 6, 10].includes(s)) this.tone(this.mtof(root - 12), t, 0.16, 'triangle', 0.35, this.bgm)
    const m = [[72, 76, 79, 76], [72, 76, 81, 79], [77, 76, 74, 72], [74, 79, 77, 74]][bar]
    if (s % 4 === 0) this.pluck(m[s / 4], t, 0.14, 0.07)
  },
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.tone(this.mtof(root), t, 0.8, 'sine', 0.3, this.bgm)
    if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.06, this.bgm) }
  },
  // おなかが鳴る
  growl(v = 1) { if (!this.ctx) return; const t = this.now(); this.mark('growl'); this.rumble(t, 0.5, 0.12 * v, 70, 110, 11); this.noise(t, 0.45, 0.06 * v, 260, 'lowpass') },
  // おなら。big=バレた・暴発、small=かき消した
  fart(v, echo, big, small) {
    if (!this.ctx) return; const t = this.now(); this.mark('fart'); if (echo) this.mark('echo')
    const outs = echo ? [this.master, this.echo] : [this.master]
    for (const o of outs) {
      if (small) { this.noise(t, 0.18, 0.22 * v, 900, 'bandpass', o, 1.5); this.rumble(t, 0.16, 0.25 * v, 150, 120, 30, o) }
      else {
        const d = big ? 1.1 : 0.55
        this.rumble(t, d, 0.55 * v, big ? 62 : 88, big ? 48 : 70, big ? 26 : 34, o)
        this.noise(t, d * 0.9, 0.18 * v, 380, 'lowpass', o)
        if (big) { this.rumble(t + d, 0.22, 0.4 * v, 120, 180, 40, o); this.noise(t + d + 0.18, 0.12, 0.12 * v, 1100, 'bandpass', o, 2) }
      }
    }
  },
  cough() { if (!this.ctx) return; const t = this.now(); this.mark('cough'); for (const d of [0, 0.22]) { this.noise(t + d, 0.16, 0.6, 900, 'bandpass', null, 1.2); this.voice(170, t + d, 0.16, 0.25, 700, null, 120) } },
  event(type, w, p, fake) {
    if (!this.ctx) return; const t = this.now() + 0.01; this.mark('ev:' + type)
    const R = Math.random
    if (fake) { this.mark('fake:' + type); return this.fakeEvent(type, t, w) }
    const s = t + w
    switch (type) {
      case 'chime': {
        this.swell(t, w, 0.05, 0.3, 0.08, 120, 90, 'lowpass', 0.7) // 減速のうなり
        this.tone(1318, s, 1.2, 'sine', 0.42); this.tone(1046, s + 0.42, 1.4, 'sine', 0.42); this.tone(2637, s, 0.6, 'sine', 0.06)
        // アナウンス（声っぽく）
        const vf = [[660, 0.12], [540, 0.12], [900, 0.14], [700, 0.18]]; let k = s + 0.25
        for (const [f, d] of vf) { this.voice(230, k, d, 0.16, f); k += d + 0.02 }
        this.noise(s + 0.5, 0.7, 0.12, 500, 'bandpass', null, 0.8) // ドア
        break
      }
      case 'phone': {
        const n = Math.floor(w / 0.42)
        for (let k = 0; k < n; k++) this.tone(110, t + k * 0.42, 0.24, 'square', 0.015 + 0.05 * k / n)
        const mel = [84, 88, 91, 96, 91, 88]
        for (let k = 0; s + k * 0.075 < s + p + 0.25; k++) this.tone(this.mtof(mel[k % mel.length]), s + k * 0.075, 0.07, 'square', 0.13)
        break
      }
      case 'shake': {
        for (let k = 0; k < 4; k++) this.voice(300 + k * 20, t + w * (0.2 + k * 0.2), 0.35, 0.03 + k * 0.012, 1200, null, 340 + k * 25) // きしみ
        this.tone(70, s, 0.6, 'sine', 0.9, null, 35); this.noise(s, 0.5, 0.8, 900, 'lowpass')
        for (let k = 0; k < 10; k++) this.tone(2200 + R() * 1800, s + R() * (p + 0.3), 0.12, 'triangle', 0.08) // 金属のガチャガチャ
        break
      }
      case 'laugh': {
        for (let k = 0; k < 3; k++) this.voice(140, t + w * 0.25 + k * 0.4, 0.22, 0.05, 600)
        for (let k = 0; s + k * 0.15 < s + p + 0.35; k++) this.voice(k % 2 ? 175 : 160, s + k * 0.15, 0.12, 0.42, k % 2 ? 750 : 900, null, 130)
        break
      }
      case 'baby': {
        for (let k = 0; k < 3; k++) this.voice(420, t + w * 0.3 + k * 0.45, 0.25, 0.04 + 0.02 * k, 1400, null, 380)
        this.voice(520, s, p + 0.45, 0.45, 1500, null, 560); this.voice(1040, s, p + 0.4, 0.08, 2600, null, 1100)
        break
      }
      case 'bark': {
        this.voice(110, t + w * 0.3, w * 0.6, 0.12, 400, null, 95)
        for (let k = 0; s + k * 0.17 < s + p + 0.2; k++) { this.noise(s + k * 0.17, 0.08, 0.4, 700, 'bandpass', null, 1.5); this.voice(420, s + k * 0.17, 0.1, 0.4, 900, null, 230) }
        break
      }
      case 'cart': {
        for (let k = 0; k < 10; k++) this.noise(t + (k / 10) * w, 0.05, 0.03 + 0.05 * k / 10, 1800, 'bandpass', null, 2)
        this.noise(s, 0.8, 0.9, 700, 'lowpass'); this.tone(90, s, 0.5, 'sine', 0.7, null, 45)
        for (let k = 0; k < 8; k++) { const d = R() * (p + 0.3); this.noise(s + d, 0.1, 0.5, 400 + R() * 600, 'bandpass', null, 2); this.tone(140 + R() * 80, s + d, 0.12, 'square', 0.12, null, 70) }
        break
      }
      case 'giggle': {
        for (let k = 0; k < 4; k++) this.voice(380, t + w * 0.3 + k * 0.3, 0.07, 0.04, 1600)
        for (let k = 0; s + k * 0.11 < s + p + 0.35; k++) this.voice(k % 2 ? 470 : 430, s + k * 0.11, 0.09, 0.32, 1700, null, 400)
        break
      }
      case 'music': {
        for (let k = 0; t + k * 0.125 < s; k++) this.noise(t + k * 0.125, 0.02, 0.02 + 0.05 * k * 0.125 / w, 7000, 'highpass')
        for (let k = 0; s + k * 0.2 < s + p + 0.35; k++) { this.tone(130, s + k * 0.2, 0.18, 'sine', 0.95, null, 42); this.noise(s + k * 0.2 + 0.1, 0.04, 0.25, 6000, 'highpass') }
        this.tone(110, s, p + 0.3, 'sawtooth', 0.12, null, 110)
        break
      }
    }
  },
  // 予告だけして来ない音
  fakeEvent(type, t, w) {
    switch (type) {
      case 'chime': this.swell(t, w, 0.05, 0.6, 0.06, 120, 140, 'lowpass', 0.7); this.tone(880, t + w, 0.15, 'sine', 0.05); break
      case 'shake': for (let k = 0; k < 4; k++) this.voice(300 + k * 20, t + w * (0.2 + k * 0.2), 0.35, 0.03 + k * 0.012, 1200, null, 340 + k * 25); break
      default: this.swell(t, w, 0.01, 0.4, 0.1, 400, 700, 'bandpass', 0.6)
    }
  },
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'count': this.tone(660, t, 0.08, 'sine', 0.12); break
      case 'go': this.tone(1300, t, 0.3, 'sine', 0.14, null, 1900); break
      case 'hum': this.tone(140, t, 0.45, 'triangle', 0.07, null, 175); this.tone(146, t, 0.45, 'sine', 0.05, null, 150); break
      case 'scratch': this.tone(900, t, 0.14, 'sawtooth', 0.09, null, 180); this.noise(t, 0.14, 0.2, 1500, 'bandpass', null, 3); this.tone(250, t + 0.15, 0.12, 'sawtooth', 0.08, null, 800); break
      case 'gasp': for (let k = 0; k < 7; k++) { const f = 380 + Math.random() * 320; this.tone(f, t + Math.random() * 0.1, 0.28, 'sawtooth', 0.025, null, f * 0.62) } this.noise(t + 0.1, 0.8, 0.12, 700, 'bandpass', null, 0.8); break
      case 'sniff': for (let k = 0; k < 3; k++) this.noise(t + k * 0.14, 0.09, 0.08, 2600, 'bandpass', null, 2); break
      case 'thud': this.tone(95, t, 0.22, 'sine', 0.5, null, 45); this.noise(t, 0.12, 0.25, 500, 'lowpass'); break
      case 'clink': this.tone(2600, t, 0.18, 'triangle', 0.1); this.tone(3900, t + 0.02, 0.12, 'sine', 0.06); break
      case 'door': this.noise(t, 0.7, 0.1, 500, 'bandpass', null, 0.8); break
      case 'ding': this.tone(1318, t, 0.9, 'sine', 0.2); this.tone(1046, t + 0.35, 1.1, 'sine', 0.2); break
      case 'step': for (let k = 0; k < 4; k++) this.noise(t + k * 0.24, 0.05, 0.06, 900, 'bandpass', null, 2); break
      case 'spray': for (const d of [0, 0.3]) this.noise(t + d, 0.25, 0.25, 5000, 'highpass'); break
      case 'mash': for (let k = 0; k < 9; k++) this.tone(1500, t + k * 0.07, 0.03, 'square', 0.06); break
      case 'stare': this.tone(200, t, 0.6, 'triangle', 0.08, null, 400); break
      case 'safe': this.tone(1046, t, 0.12, 'triangle', 0.13); this.tone(1568, t + 0.08, 0.2, 'triangle', 0.12); break
      case 'perfect': this.noise(t, 0.25, 0.06, 1400, 'bandpass', null, 2); this.tone(1318, t + 0.05, 0.1, 'triangle', 0.12); this.tone(1760, t + 0.12, 0.1, 'triangle', 0.12); this.tone(2637, t + 0.19, 0.25, 'triangle', 0.1); break
      case 'sus': this.tone(500, t, 0.2, 'triangle', 0.1, null, 700); this.tone(700, t + 0.2, 0.25, 'triangle', 0.08, null, 560); break
      case 'pop': this.tone(500, t, 0.08, 'sine', 0.15, null, 1200); break
      case 'stamp': this.tone(120, t, 0.25, 'sine', 0.7, null, 45); this.noise(t, 0.15, 0.35, 900, 'lowpass'); break
      case 'drum': for (let k = 0; k < 44; k++) this.noise(t + k * 0.036, 0.04, 0.05 + k * 0.004, 1800, 'bandpass', null, 0.9); break
      case 'boom': this.tone(80, t, 0.7, 'sine', 0.6, null, 30); this.noise(t, 0.6, 0.25, 1500, 'lowpass'); break
      case 'fanfare': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.38]].forEach(([n, d]) => { this.tone(this.mtof(n), t + d, d > 0.3 ? 0.7 : 0.14, 'square', 0.07); this.tone(this.mtof(n - 12), t + d, d > 0.3 ? 0.7 : 0.14, 'triangle', 0.1) }); break
      case 'wahwah': [[311, 0, 0.42], [294, 0.45, 0.42], [277, 0.9, 0.42], [262, 1.35, 1.1]].forEach(([f, d, l]) => { this.tone(f, t + d, l, 'sawtooth', 0.07, null, f * 0.96); this.tone(f / 2, t + d, l, 'triangle', 0.08) }); break
    }
  },
}

// ---------- 3D の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2))
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a2233)
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60)
const hemi = new THREE.HemisphereLight(0xfff3e0, 0x6a5a50, 1.9)
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(1.5, 4, 5)
const evLight = new THREE.PointLight(0xffffff, 0, 0, 1.2); evLight.position.set(0, 2, -1)
scene.add(hemi, sun, evLight)

const MC = {}
const M = (c, flat = true) => MC[c + ':' + flat] || (MC[c + ':' + flat] = new THREE.MeshLambertMaterial({ color: c, flatShading: flat }))
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 22, 16), lsph: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16), plane: new THREE.PlaneGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 12),
}
function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (parent) parent.add(m); return m
}
const box = (w, h, d, c, x, y, z, p) => mesh(G.box, typeof c === 'number' ? M(c) : c, x, y, z, w, h, d, p)
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  t.userData = { c, ctx }; return t
}

// ---------- エレベーターのかご（3ステージで内装だけ変える）
// 床 x:-1.3..1.3 / z:-2.0..3.3。ドアはカメラの後ろ（z=2.7）。奥の壁の鏡にドアが映る
const CAR = { x: 1.3, zb: -2.0, zf: 3.3, h: 2.6 }
const car = new THREE.Group(); scene.add(car)
const wallM = new THREE.MeshPhongMaterial({ color: 0xb6bcc8, shininess: 60, specular: 0x555555 })
const backM = new THREE.MeshPhongMaterial({ color: 0x8b919e, shininess: 40 })
const floorTex = canvasTex(256, 256, () => {}, [3, 5])
const floorM = new THREE.MeshLambertMaterial({ map: floorTex })
const railM = new THREE.MeshPhongMaterial({ color: 0xd8c48a, shininess: 80 })
const FLOORS = {
  morning: (x, w, h) => { x.fillStyle = '#5a5550'; x.fillRect(0, 0, w, h); x.fillStyle = '#625d57'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 32, j * 32, 32, 32) },
  boss: (x, w, h) => { x.fillStyle = '#7a1f2a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d8b24a'; x.lineWidth = 6; x.strokeRect(12, 12, w - 24, h - 24); x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 3, h) },
  date: (x, w, h) => { x.fillStyle = '#efe4d2'; x.fillRect(0, 0, w, h); x.fillStyle = '#e2d2b8'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64); x.fillStyle = '#d98aa6'; x.beginPath(); x.arc(128, 128, 30, 0, 7); x.fill() },
}
;(() => {
  const len = CAR.zf - CAR.zb, zc = (CAR.zf + CAR.zb) / 2
  const fl = mesh(G.plane, floorM, 0, 0, zc, CAR.x * 2, len, 1, car); fl.rotation.x = -Math.PI / 2
  for (const s of [-1, 1]) box(0.06, CAR.h, len, wallM, s * (CAR.x + 0.03), CAR.h / 2, zc, car)
  box(CAR.x * 2 + 0.1, CAR.h, 0.06, backM, 0, CAR.h / 2, CAR.zb - 0.03, car)
  box(CAR.x * 2 + 0.1, 0.06, len, M(0x6f7480), 0, CAR.h, zc, car)
  box(CAR.x * 2 + 0.1, CAR.h, 0.06, backM, 0, CAR.h / 2, CAR.zf + 0.03, car)
  // 天井の明かり
  for (const z of [-1.2, 0.2, 1.6]) box(1.2, 0.02, 0.5, new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), 0, CAR.h - 0.03, z, car)
  // 手すり
  for (const s of [-1, 1]) { box(0.05, 0.05, len - 0.6, railM, s * (CAR.x - 0.08), 0.92, zc, car); for (const z of [CAR.zb + 0.4, CAR.zf - 0.4]) box(0.03, 0.03, 0.1, railM, s * (CAR.x - 0.04), 0.92, z, car) }
  box(CAR.x * 2 - 0.3, 0.05, 0.05, railM, 0, 0.92, CAR.zb + 0.08, car)
  // 操作盤（右の壁）
  box(0.03, 0.6, 0.24, M(0x2a2d38), CAR.x - 0.02, 1.2, 0.95, car)
  for (let i = 0; i < 10; i++) mesh(G.cyl, new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }), CAR.x - 0.04, 0.96 + Math.floor(i / 2) * 0.1, 0.9 + (i % 2) * 0.1, 0.022, 0.02, 0.022, car).rotation.z = Math.PI / 2
})()
// 奥の壁の鏡（毎フレーム描く。ドアと外が映る）
const mirTex = canvasTex(512, 384, () => {})
const mirror = mesh(G.plane, new THREE.MeshBasicMaterial({ map: mirTex }), 0, 1.45, CAR.zb + 0.005, 2.1, 1.55, 1, car)
box(2.2, 0.06, 0.04, railM, 0, 2.25, CAR.zb + 0.02, car); box(2.2, 0.06, 0.04, railM, 0, 0.65, CAR.zb + 0.02, car)
// 階数表示（鏡の上）
const indTex = canvasTex(256, 80, () => {})
const indM = new THREE.MeshBasicMaterial({ map: indTex })
mesh(G.plane, indM, 0, 2.43, CAR.zb + 0.01, 0.62, 0.19, 1, car)
const lamp = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x553311 }), 0.45, 2.43, CAR.zb + 0.02, 0.05, 0.05, 0.02, car)
function drawInd(blink) {
  const { ctx: x, c } = indTex.userData, W = c.width, H = c.height
  x.fillStyle = '#111'; x.fillRect(0, 0, W, H)
  if (!blink) { x.fillStyle = '#ff9a2a'; x.font = '900 60px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(S.floor + 'F', 150, 44) }
  x.fillStyle = S.stop ? '#555' : '#ff9a2a'; x.beginPath(); x.moveTo(36, 58); x.lineTo(60, 22); x.lineTo(84, 58); x.closePath(); x.fill()
  indTex.needsUpdate = true
}
const HALL = { morning: ['#e9e3d6', '#2e7d5b'], boss: ['#7a1f2a', '#d8b24a'], date: ['#fff1c9', '#e0457b'] }
function paintMirror(c, W, H) {
  const id = cur.id, g = c.createLinearGradient(0, 0, 0, H)
  const tone = { morning: ['#8d98a6', '#c6cfd9'], boss: ['#4e3b2c', '#8a6e52'], date: ['#d8b6c0', '#f3e2e6'] }[id]
  g.addColorStop(0, tone[0]); g.addColorStop(1, tone[1]); c.fillStyle = g; c.fillRect(0, 0, W, H)
  // 映りこんだドア（開くと外が見える）
  const dw = W * 0.46, dx = (W - dw) / 2, dy = H * 0.1, o = S.door * dw * 0.5
  const [hc, ac] = HALL[id]
  c.fillStyle = hc; c.fillRect(dx, dy, dw, H - dy)
  if (S.door > 0.05) {
    c.fillStyle = ac; c.fillRect(dx + dw * 0.1, dy + H * 0.12, dw * 0.8, H * 0.1)
    c.fillStyle = '#fff'; c.font = `900 ${Math.round(H * 0.07)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.floor + 'F', W / 2, dy + H * 0.17)
    c.fillStyle = 'rgba(255,255,240,.35)'; c.fillRect(dx, dy, dw, H - dy)
  }
  c.fillStyle = '#b9bfca'; c.fillRect(dx - o, dy, dw / 2, H - dy); c.fillRect(dx + dw / 2 + o, dy, dw / 2, H - dy)
  c.fillStyle = '#8e95a2'; c.fillRect(dx - o + dw / 2 - 3, dy, 3, H - dy); c.fillRect(dx + dw / 2 + o, dy, 3, H - dy)
  c.strokeStyle = '#6b707c'; c.lineWidth = 8; c.strokeRect(dx - 4, dy - 4, dw + 8, H)
  // 鏡の光
  c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(W * 0.08, 0); c.lineTo(W * 0.2, 0); c.lineTo(W * 0.05, H); c.lineTo(0, H); c.closePath(); c.fill()
  c.beginPath(); c.moveTo(W * 0.86, 0); c.lineTo(W * 0.9, 0); c.lineTo(W * 0.78, H); c.lineTo(W * 0.74, H); c.closePath(); c.fill()
}
const STAGE_LOOK = {
  morning: { wall: 0xb6bcc8, back: 0x8b919e, rail: 0xc9ced8, bg: 0x2a2233 },
  boss: { wall: 0x6b4630, back: 0x4f3322, rail: 0xd8b24a, bg: 0x241a14 },
  date: { wall: 0xf1dfe2, back: 0xe7c9cf, rail: 0xd8c48a, bg: 0x33222a },
}

// ---------- プレイヤー（立っている主役）
const SKIN = new THREE.Color(0xf4c7a1), RED = new THREE.Color(0xff3b2c), PURPLE = new THREE.Color(0x8a6a2a), GREEN = new THREE.Color(0x9cc46a)
const P = (() => {
  const root = new THREE.Group(); scene.add(root)
  const skin = new THREE.MeshLambertMaterial({ color: SKIN.clone() })
  const dark = M(0x231a1f, false), white = M(0xffffff, false), hairM = M(0x2b1d17), pants = M(0x2f3a55), shoes = M(0x1b1620)
  const hips = new THREE.Group(); root.add(hips)
  for (const s of [-1, 1]) { mesh(new THREE.CapsuleGeometry(0.085, 0.62, 4, 10), pants, s * 0.12, 0.45, 0, 1, 1, 1, hips); box(0.13, 0.07, 0.24, shoes, s * 0.12, 0.04, 0.04, hips) }
  mesh(G.sph, pants, 0, 0.84, -0.04, 0.24, 0.15, 0.17, hips) // おしり
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.34, 6, 14), M(0x4f7fc4), 0, 1.13, 0, 1.32, 1, 0.85, root)
  box(0.06, 0.3, 0.02, M(0xd8141f), 0, 1.22, 0.22, root) // ネクタイ
  mesh(G.cyl, skin, 0, 1.42, 0, 0.075, 0.14, 0.075, root)
  const arms = []
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.36, 1.35, 0); root.add(a)
    mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 10), M(0x4f7fc4), 0, -0.27, 0, 1, 1, 1, a)
    mesh(G.sph, skin, 0, -0.56, 0.02, 0.075, 0.08, 0.075, a); a.rotation.z = s * 0.1; arms.push(a)
  }
  const pivot = new THREE.Group(); pivot.position.set(0, 1.46, 0); root.add(pivot)
  const head = new THREE.Group(); head.position.set(0, 0.24, 0); pivot.add(head)
  mesh(G.sph, skin, 0, 0, 0, 0.3, 0.32, 0.29, head)
  for (const s of [-1, 1]) mesh(G.sph, skin, s * 0.29, -0.01, -0.01, 0.055, 0.075, 0.04, head)
  const hair = mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.02, 0.318, 0.34, 0.31, head); hair.rotation.x = -0.42
  for (const [x, rz] of [[-0.14, 0.5], [-0.04, 0.15], [0.07, -0.2], [0.17, -0.55]]) { const f = mesh(new THREE.ConeGeometry(1, 1, 5), hairM, x, 0.2, 0.2, 0.06, 0.13, 0.05, head); f.rotation.set(2.6, 0, rz) }
  const ahoge = new THREE.Group(); ahoge.position.set(0.03, 0.32, 0.02); ahoge.rotation.y = 0.7; head.add(ahoge)
  const ah = mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI * 1.3), hairM, 0.035, 0.02, 0, 1, 1, 1, ahoge); ah.rotation.z = -0.3
  const eyes = [], pupils = [], squint = [], brows = [], cheeks = [], drops = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.105, 0.045, 0.252); head.add(eg)
    mesh(G.sph, white, 0, 0, 0, 0.058, 0.064, 0.035, eg)
    const pu = mesh(G.sph, dark, s * -0.006, -0.004, 0.03, 0.03, 0.033, 0.014, eg)
    mesh(G.sph, white, 0.01, 0.012, 0.012, 0.18, 0.18, 0.2, pu)
    eyes.push(eg); pupils.push(pu)
    const sq = new THREE.Group(); sq.position.set(s * 0.105, 0.045, 0.282); head.add(sq); sq.visible = false
    for (const u of [1, -1]) { const l = box(0.075, 0.016, 0.012, dark, -s * 0.004, u * 0.014, 0, sq); l.rotation.z = s * u * 0.5 }
    squint.push(sq)
    brows.push(box(0.1, 0.022, 0.02, 0x2b1d17, s * 0.105, 0.14, 0.262, head))
    const ck = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55 }), s * 0.175, -0.06, 0.226, 0.052, 0.034, 0.016, head); ck.rotation.y = s * 0.6; cheeks.push(ck)
    drops.push(mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.9 }), s * 0.262, 0.08, 0.1, 0.02, 0.03, 0.02, head))
  }
  const nose = mesh(G.sph, M(0xf2b08f, false), 0, -0.018, 0.3, 0.06, 0.055, 0.06, head)
  const mouth = mesh(G.sph, M(0x5a1424, false), 0, -0.145, 0.262, 0.06, 0.03, 0.02, head)
  const lips = box(0.11, 0.018, 0.02, 0xd8656a, 0, -0.145, 0.27, head)
  const smile = mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), dark, 0, -0.128, 0.268, 1, 1, 1, head); smile.rotation.z = Math.PI
  const vein = new THREE.Group(); vein.position.set(0.14, 0.2, 0.24); vein.rotation.y = 0.45; head.add(vein)
  for (const [x, y, r] of [[-0.018, 0.018, 0.6], [0.018, 0.018, -0.6], [-0.018, -0.018, -0.6], [0.018, -0.018, 0.6]]) { const v = box(0.03, 0.009, 0.01, 0xd8141f, x, y, 0, vein); v.rotation.z = r }
  const glasses = new THREE.Group(); glasses.position.set(0, 0.045, 0.3); head.add(glasses)
  const gm = M(0x1b1620, false)
  for (const s of [-1, 1]) {
    mesh(new THREE.TorusGeometry(0.068, 0.011, 8, 22), gm, s * 0.105, 0, 0, 1, 1, 1, glasses)
    mesh(new THREE.CircleGeometry(0.066, 20), new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.18 }), s * 0.105, 0, -0.002, 1, 1, 1, glasses)
    box(0.012, 0.012, 0.25, gm, s * 0.176, 0.01, -0.125, glasses)
  }
  box(0.07, 0.012, 0.012, gm, 0, 0.012, 0, glasses)
  return { root, hips, torso, arms, pivot, head, skin, hair, ahoge, eyes, pupils, squint, brows, cheeks, drops, nose, mouth, lips, smile, vein, glasses, glassesHome: glasses.position.clone() }
})()
const BUTT = new THREE.Vector3(0, 0.84, -0.22)

// ---------- 乗客（人の種類ごとに見た目を変える）
const exTex = (ch, col) => canvasTex(128, 128, (c, w, h) => {
  c.font = '900 110px "Dela Gothic One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.lineWidth = 16; c.strokeStyle = '#1b1620'; c.strokeText(ch, w / 2, h / 2 + 6); c.fillStyle = col; c.fillText(ch, w / 2, h / 2 + 6)
})
let TEX_EX = exTex('!', '#ff3d2e'), TEX_Q = exTex('?', '#ffd21f')
const puffTex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h) })
const stinkTex = canvasTex(64, 128, (c, w, h) => { c.strokeStyle = '#7da23a'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); for (let y = 120; y > 8; y -= 2) { const x = 32 + Math.sin(y / 14) * 14; y === 120 ? c.moveTo(x, y) : c.lineTo(x, y) } c.stroke() })
const sparkTex = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 8 : 30; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) } c.closePath(); c.fill() })
const LOOK = {
  coworker: { shirt: 0x4a78b8, collar: 0xffffff, hair: 0x2b1d17, style: 'short', tie: 0x2a4a8a },
  bucho: { shirt: 0x55585f, collar: 0xffffff, hair: 0x6a6a6a, style: 'side', glasses: true, tie: 0x8a1f2a, stache: 0x4a4a4a, scale: 1.04 },
  madam: { shirt: 0x7a3b8a, hair: 0x5a2a1a, style: 'bun', skin: 0xf5cdb0, pearls: true, aura: 0xff8ad8, scale: 1.02 },
  curry: { shirt: 0xf2efe6, hair: 0x2b1d17, style: 'short', hold: 0xf0b020, aura: 0xffd27a },
  yakiniku: { shirt: 0xc8352a, hair: 0x1a1a1a, style: 'short', band: 0xffffff, aura: 0xb0a8a0 },
  nose: { shirt: 0x8a5a2a, hair: 0x3a2a1a, style: 'short', beret: 0x2a2a3a, bigNose: true, stache: 0x3a2a1a },
  headphone: { shirt: 0x3f8f5a, hair: 0x1a1a1a, style: 'side', phones: 0xff3d2e, scale: 0.98 },
  baby: { shirt: 0xd8c4a0, hair: 0x5a3a22, style: 'long', baby: true },
  dog: { shirt: 0xff8a3a, hair: 0x2b1d17, style: 'short', cap: 0x2a5aa0, dog: true },
  jk: { shirt: 0x1f2a44, collar: 0xffffff, hair: 0x1a1a1a, style: 'long', ribbon: 0xd8141f, scale: 0.94 },
  delivery: { shirt: 0x3a5f8f, hair: 0x2b1d17, style: 'short', cap: 0x3a5f8f, cart: true },
  cleaner: { shirt: 0x6a9a6a, hair: 0x8a8a8a, style: 'bun', kerchief: 0xf2e8c0, spray: true, scale: 0.92 },
  ceo: { shirt: 0x1f1f26, collar: 0xffffff, hair: 0xb8b8b8, style: 'bald', tie: 0xd8141f, stache: 0xd8d8d8, scale: 1.08 },
  partner: { shirt: 0xf09ab0, hair: 0x6a3a22, style: 'long', scale: 0.95 },
}
function makeNPC(type) {
  const o = LOOK[type], g = new THREE.Group(), sc = o.scale || 1; g.scale.setScalar(sc)
  const seat = 1.12, skinM = M(o.skin || 0xf1c6a0, false), pants = M(type === 'jk' ? 0x1f2a44 : 0x2c2c34)
  for (const s of [-1, 1]) { mesh(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8), type === 'jk' ? skinM : pants, s * 0.1, 0.44, 0, 1, 1, 1, g); box(0.12, 0.06, 0.2, 0x1b1620, s * 0.1, 0.03, 0.03, g) }
  if (type === 'jk' || type === 'madam' || type === 'partner') mesh(G.cone, M(type === 'jk' ? 0x1f2a44 : o.shirt), 0, 0.72, 0, 0.3, 0.42, 0.24, g) // スカート
  const body = mesh(new THREE.CapsuleGeometry(0.21, 0.3, 4, 10), M(o.shirt), 0, seat, 0, 1.25, 1, 0.85, g)
  if (o.collar) box(0.3, 0.06, 0.1, o.collar, 0, seat + 0.24, 0.1, g)
  if (o.tie) box(0.05, 0.26, 0.02, o.tie, 0, seat + 0.07, 0.19, g)
  if (o.ribbon) box(0.12, 0.05, 0.03, o.ribbon, 0, seat + 0.2, 0.19, g)
  if (o.pearls) for (let i = -3; i <= 3; i++) mesh(G.sph, M(0xffffff, false), i * 0.04, seat + 0.2 - Math.abs(i) * 0.012, 0.18, 0.018, 0.018, 0.018, g)
  for (const s of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), M(o.shirt), s * 0.3, seat - 0.05, 0.02, 1, 1, 1, g); a.rotation.z = s * 0.12 }
  const pivot = new THREE.Group(); pivot.position.set(0, seat + 0.3, 0); g.add(pivot)
  const head = new THREE.Group(); head.position.set(0, 0.2, 0); pivot.add(head)
  mesh(G.sph, skinM, 0, 0, 0, 0.22, 0.235, 0.21, head)
  const hairM = M(o.hair)
  if (o.style !== 'bald') { const h = mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.01, 0.232, 0.25, 0.225, head); h.rotation.x = -0.35 }
  else for (const s of [-1, 1]) box(0.05, 0.1, 0.16, hairM, s * 0.21, 0.02, -0.04, head)
  if (o.style === 'long') box(0.4, 0.34, 0.14, hairM, 0, -0.12, -0.12, head)
  if (o.style === 'bun') mesh(G.lsph, hairM, 0, 0.22, -0.1, 0.1, 0.1, 0.1, head)
  if (o.style === 'side') box(0.44, 0.08, 0.36, hairM, 0, 0.13, 0.02, head).rotation.z = 0.12
  const eyes = [], pupils = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.075, 0.03, 0.185); head.add(eg)
    mesh(G.sph, M(0xffffff, false), 0, 0, 0, 0.04, 0.045, 0.022, eg)
    pupils.push(mesh(G.sph, M(0x231a1f, false), 0, -0.004, 0.02, 0.022, 0.024, 0.01, eg)); eyes.push(eg)
    box(0.07, 0.016, 0.016, o.style === 'bald' ? 0x8a8a8a : o.hair, s * 0.075, 0.105, 0.19, head)
  }
  if (o.glasses) for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), M(0x1b1620, false), s * 0.075, 0.03, 0.212, 1, 1, 1, head)
  const nose = mesh(G.sph, M(o.bigNose ? 0xe8907a : 0xe0a088, false), 0, -0.02, 0.21, o.bigNose ? 0.07 : 0.035, o.bigNose ? 0.06 : 0.03, o.bigNose ? 0.09 : 0.03, head)
  if (o.stache) box(0.12, 0.03, 0.03, o.stache, 0, -0.07, 0.205, head)
  const mouth = box(0.06, 0.014, 0.012, 0x6a2a2a, 0, -0.11, 0.2, head)
  if (o.beret) { const b = mesh(G.cyl, M(o.beret), 0.03, 0.2, -0.01, 0.2, 0.05, 0.2, head); b.rotation.z = 0.25 }
  if (o.cap) { mesh(G.cyl, M(o.cap), 0, 0.18, 0, 0.22, 0.1, 0.22, head); box(0.2, 0.02, 0.14, o.cap, 0, 0.14, 0.2, head) }
  if (o.band) mesh(new THREE.TorusGeometry(0.225, 0.025, 6, 20), M(o.band), 0, 0.09, 0, 1, 1, 1, head).rotation.x = Math.PI / 2
  if (o.kerchief) { const k = mesh(G.cone, M(o.kerchief), 0, 0.12, -0.03, 0.25, 0.22, 0.24, head); k.rotation.x = -0.3 }
  if (o.phones) { const p = mesh(new THREE.TorusGeometry(0.235, 0.025, 6, 20, Math.PI), M(0x1b1620), 0, 0.02, 0, 1, 1, 1, head); void p; for (const s of [-1, 1]) mesh(G.cyl, M(o.phones), s * 0.23, 0, 0, 0.07, 0.06, 0.07, head).rotation.z = Math.PI / 2 }
  const n = { type, g, body, pivot, head, eyes, pupils, mouth, nose, seat, yaw: 0, pitch: 0.05, tYaw: 0, tPitch: 0.05, eye: 1, tEye: 1, markT: -1, phase: Math.random() * 6, idlePitch: 0.05, shake: 0, bounce: 0, sniffT: 0, aura: null, talkTo: null }
  // 持ち物
  if (o.hold) { n.bento = box(0.26, 0.08, 0.18, o.hold, 0, seat - 0.12, 0.26, g); box(0.27, 0.02, 0.19, 0xd8141f, 0, seat - 0.07, 0.26, g) }
  if (o.spray) n.sprayCan = mesh(G.cyl, M(0x3a8ad8), 0.3, seat - 0.2, 0.15, 0.04, 0.2, 0.04, g)
  if (o.baby) {
    const bb = new THREE.Group(); bb.position.set(0, seat - 0.02, 0.24); g.add(bb); n.babyG = bb
    box(0.3, 0.26, 0.12, 0x6a8ac8, 0, -0.04, 0, bb)
    const bh = new THREE.Group(); bh.position.set(0, 0.16, 0.03); bb.add(bh); n.babyHead = bh
    mesh(G.sph, skinM, 0, 0, 0, 0.11, 0.11, 0.1, bh); for (const s of [-1, 1]) mesh(G.sph, M(0x231a1f, false), s * 0.04, 0.01, 0.09, 0.016, 0.018, 0.01, bh)
    mesh(G.sph, M(0xffd21f), 0, 0.1, 0, 0.06, 0.03, 0.06, bh)
  }
  if (o.dog) {
    const d = new THREE.Group(); d.position.set(0.2, 0, 0.42); g.add(d); n.dogG = d
    const fur = M(0xd8a060), furD = M(0x8a5a2a)
    box(0.18, 0.15, 0.36, fur, 0, 0.26, 0, d); for (const [x, z] of [[-0.06, -0.13], [0.06, -0.13], [-0.06, 0.13], [0.06, 0.13]]) box(0.05, 0.2, 0.05, fur, x, 0.1, z, d)
    const dh = new THREE.Group(); dh.position.set(0, 0.42, 0.2); d.add(dh); n.dogHead = dh
    mesh(G.sph, fur, 0, 0, 0, 0.11, 0.1, 0.11, dh); box(0.08, 0.06, 0.1, fur, 0, -0.03, 0.1, dh); mesh(G.sph, M(0x1b1620, false), 0, -0.01, 0.16, 0.025, 0.02, 0.02, dh)
    for (const s of [-1, 1]) { mesh(G.sph, M(0x231a1f, false), s * 0.045, 0.03, 0.09, 0.016, 0.018, 0.01, dh); const e = box(0.05, 0.1, 0.02, furD, s * 0.08, 0.06, -0.02, dh); e.rotation.z = s * 0.4 }
    n.dogTail = box(0.03, 0.03, 0.14, furD, 0, 0.34, -0.22, d); n.dogTail.rotation.x = 0.7
    const leash = mesh(G.cyl, M(0xd8141f), 0.12, 0.65, 0.22, 0.008, 0.6, 0.008, g); leash.rotation.x = -0.6
  }
  if (o.cart) {
    const c = new THREE.Group(); c.position.set(0, 0, -0.5); g.add(c); n.cartG = c
    box(0.42, 0.04, 0.5, 0x5a6a7a, 0, 0.12, 0, c); for (const [x, z] of [[-0.17, -0.2], [0.17, -0.2], [-0.17, 0.2], [0.17, 0.2]]) mesh(G.cyl, M(0x1b1620), x, 0.05, z, 0.04, 0.03, 0.04, c).rotation.z = Math.PI / 2
    box(0.03, 0.8, 0.03, 0x5a6a7a, 0, 0.5, 0.24, c)
    n.boxes = [[0.36, 0.28, 0.4, 0.28], [0.32, 0.24, 0.36, 0.54], [0.26, 0.22, 0.3, 0.77], [0.2, 0.16, 0.22, 0.96]].map(([w, h, d, y], i) => { const b = box(w, h, d, i % 2 ? 0xc89a5a : 0xb8864a, 0, y, -0.02, c); b.userData.home = b.position.clone(); return b })
  }
  if (o.aura) {
    n.aura = []; for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: o.aura === 0xff8ad8 ? sparkTex : puffTex, color: o.aura, transparent: true, opacity: 0.7, depthWrite: false })); sp.scale.setScalar(0.12); g.add(sp); n.aura.push(sp) }
  }
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_EX, depthTest: false, transparent: true }))
  mark.position.set(0.12, seat + 0.95, 0); mark.scale.setScalar(0); mark.renderOrder = 10; g.add(mark); n.mark = mark
  return n
}
const _hp = new THREE.Vector3(), _q = new THREE.Vector3()
function npcHeadPos(n, out) { return n.pivot.getWorldPosition(out).add(_q.set(0, 0.2 * n.g.scale.y, 0)) }
// なすりつけ先の頭（犬・赤ちゃんなら本人でなくそちら）
function blameHead(n, out) { if (n.dogHead) return n.dogHead.getWorldPosition(out); if (n.babyHead) return n.babyHead.getWorldPosition(out); return npcHeadPos(n, out) }
function npcLook(n, p, amt = 1) {
  npcHeadPos(n, _hp); const d = _q.copy(p).sub(_hp)
  const ry = n.g.rotation.y, c = Math.cos(-ry), s = Math.sin(-ry)
  const lx = d.x * c + d.z * s, lz = -d.x * s + d.z * c
  n.tYaw = clamp(Math.atan2(lx, lz), -1.9, 1.9) * amt
  n.tPitch = clamp(Math.atan2(-d.y, Math.hypot(lx, lz)), -0.6, 0.8) * amt + n.idlePitch * (1 - amt)
}
function npcIdle(n) { n.tYaw = 0; n.tPitch = n.idlePitch; n.tEye = 1 }
function npcMark(n, kind) { n.mark.material.map = kind === '?' ? TEX_Q : TEX_EX; n.mark.material.needsUpdate = true; n.markT = 0 }
const POOL = {}
function getNPC(type) {
  const list = POOL[type] || (POOL[type] = [])
  let n = list.find(x => !x.inUse)
  if (!n) { n = makeNPC(type); list.push(n); car.add(n.g) }
  n.inUse = true; n.g.visible = true; n.markT = -1; n.mark.scale.setScalar(0); n.yaw = 0; n.pitch = n.idlePitch; npcIdle(n); n.reacting = 0; n.reactT = undefined
  if (n.boxes) for (const b of n.boxes) { b.position.copy(b.userData.home); b.rotation.set(0, 0, 0) }
  return n
}
function freeNPC(n) { n.inUse = false; n.g.visible = false }

// ---------- ステージ（内装と主役の持ち物）
const PROPS = {}
;(() => {
  const mk = (id, list) => { const grp = new THREE.Group(); car.add(grp); PROPS[id] = { grp, items: list(grp) } }
  mk('morning', g => {
    const bag = box(0.34, 0.26, 0.09, 0x3a2a1a, 0.5, 0.62, 0.06, g); box(0.12, 0.03, 0.03, 0x8a6a3a, 0.5, 0.78, 0.06, g)
    const cup = mesh(G.cyl, M(0xf2efe6), -0.44, 0.84, 0.12, 0.045, 0.12, 0.045, g); mesh(G.cyl, M(0x6a3a1a), -0.44, 0.9, 0.12, 0.047, 0.02, 0.047, cup.parent)
    return [bag, cup]
  })
  mk('boss', g => {
    const folder = box(0.26, 0.34, 0.03, 0x2a4a8a, -0.42, 0.86, 0.16, g); folder.rotation.z = 0.2
    const pen = mesh(G.cyl, M(0xd8b24a), 0.44, 0.84, 0.12, 0.01, 0.16, 0.01, g); pen.rotation.z = 0.5
    return [folder, pen]
  })
  mk('date', g => {
    const bag = box(0.26, 0.3, 0.12, 0xe0457b, 0.48, 0.58, 0.06, g); box(0.2, 0.06, 0.02, 0xffffff, 0.48, 0.62, 0.125, g)
    const fl = new THREE.Group(); fl.position.set(-0.44, 0.86, 0.14); g.add(fl); mesh(G.cyl, M(0x3f7a3a), 0, -0.1, 0, 0.012, 0.22, 0.012, fl)
    for (let k = 0; k < 5; k++) mesh(G.lsph, M([0xff4a6a, 0xffd21f, 0xffffff][k % 3]), Math.cos(k * 1.3) * 0.05, 0.04 + (k % 2) * 0.03, Math.sin(k * 1.3) * 0.05, 0.04, 0.04, 0.04, fl)
    return [bag, fl]
  })
  for (const k in PROPS) PROPS[k].items.forEach(m => { m.userData.home = { p: m.position.clone(), r: m.rotation.clone(), parent: m.parent } })
})()
// 乗客の立ち位置（主役は原点に立つ）。f=前の列（台車の人用）
const SLOTS = [{ x: -0.95, z: 0.3, f: 1 }, { x: 0.95, z: 0.3, f: 1 }, { x: -0.62, z: -0.72 }, { x: 0.05, z: -0.9 }, { x: 0.72, z: -0.72 }, { x: -0.95, z: -1.55 }, { x: -0.3, z: -1.62 }, { x: 0.38, z: -1.62 }, { x: 0.98, z: -1.5 }]
const SLOT_PREF = { partner: [0], ceo: [4, 2], delivery: [1, 0], dog: [3, 2, 4, 6, 7] }
let cur = { id: 'morning' }

function setStage(id) {
  cur = { id }
  const lk = STAGE_LOOK[id]; wallM.color.setHex(lk.wall); backM.color.setHex(lk.back); railM.color.setHex(lk.rail); scene.background.setHex(lk.bg)
  FLOORS[id](floorTex.userData.ctx, 256, 256); floorTex.needsUpdate = true
  for (const k in PROPS) PROPS[k].grp.visible = k === id
  clearPax(); resetProps()
}
function resetProps() {
  for (const f of flyers) { if (f.m === P.glasses) continue; scene.remove(f.m) }
  for (const k in PROPS) for (const m of PROPS[k].items) { const h = m.userData.home; h.parent.add(m); m.position.copy(h.p); m.rotation.copy(h.r) }
  flyers.length = 0; reattachGlasses()
}
function reattachGlasses() { P.head.add(P.glasses); P.glasses.position.copy(P.glassesHome); P.glasses.rotation.set(0, 0, 0) }

// ---------- 乗客の出入り
const aboard = () => S.pax.filter(p => p.state === 'idle')
function clearPax() { for (const p of S.pax) freeNPC(p.n); S.pax = [] }
function freeSlots() { return SLOTS.map((s, i) => i).filter(i => !S.pax.some(p => p.slot === i)) }
function slotFor(type) {
  const free = freeSlots(); if (!free.length) return -1
  const pref = SLOT_PREF[type]
  if (pref) { for (const i of pref) if (free.includes(i)) return i; if (type === 'delivery' || type === 'dog') return -1 }
  // 前の列は最後に埋める（主役の顔を隠さない）
  const back = free.filter(i => !SLOTS[i].f)
  return (back.length ? back : free)[Math.floor(S.rand() * (back.length || free.length)) % (back.length || free.length)]
}
function placePax(p) {
  const s = SLOTS[p.slot], n = p.n
  n.g.position.set(s.x, 0, s.z); n.g.rotation.y = 0
  if (n.dogG) n.dogG.position.x = s.x > 0 ? -0.2 : 0.2
}
function addPax(type, boarding) {
  const slot = slotFor(type); if (slot < 0) return null
  const n = getNPC(type), entry = { type, exposure: 0, blamed: false }
  S.rode.push(entry)
  const p = { type, n, slot, state: boarding ? 'board' : 'idle', t: 0, entry, sprayed: false, def: D.pax[type], age: boarding ? 0 : 99 }
  S.pax.push(p); placePax(p)
  if (boarding) { const s = SLOTS[slot]; p.from = new THREE.Vector3(s.x > 0 ? 0.7 : -0.7, 0, CAR.zf - 0.25); p.to = new THREE.Vector3(s.x, 0, s.z); n.g.position.copy(p.from); n.g.rotation.y = Math.PI }
  return p
}
function spawnInitial(stg) {
  for (const t of stg.init) addPax(t, false)
  const pool = stg.pool.slice(), want = stg.rand
  if (stg.randLoud && want > 0) { const loud = pool.filter(t => D.pax[t].sound); const t = pick(loud); addPax(t, false); pool.splice(pool.indexOf(t), 1) }
  for (let i = stg.randLoud ? 1 : 0; i < want; i++) { const free = pool.filter(t => !S.pax.some(p => p.type === t)); if (!free.length) break; const t = pick(free); if (!addPax(t, false)) pool.splice(pool.indexOf(t), 1) }
}
// 1回の停止で降りる人・乗る人を決める
function doBoarding(stg) {
  const busy = new Set(S.evs.filter(e => e.src && e.ph !== 'done' && e.ph !== 'idle').map(e => e.src))
  const can = aboard().filter(p => !p.def.stay && !busy.has(p))
  const nEx = Math.min(can.length, stg.exit[0] + Math.floor(S.rand() * (stg.exit[1] - stg.exit[0] + 1)))
  const before = aboard().length
  let said = false
  for (let i = 0; i < nEx; i++) {
    const p = can.splice(Math.floor(S.rand() * can.length) % can.length, 1)[0]
    p.state = 'exit'; p.t = 0; S.smell *= 0.7
    if (!said) { said = true; later(0.15, () => fx(L2(pick(p.def.exit)), 'sb', { follow: p.n, life: 1.8 })) }
  }
  if (before) S.sniff *= (before - nEx) / before
  const nB = stg.board[0] + Math.floor(S.rand() * (stg.board[1] - stg.board[0] + 1))
  for (let i = 0; i < nB; i++) {
    const cand = stg.pool.filter(t => !S.pax.some(p => p.type === t))
    if (!cand.length) break
    const t = pick(cand), p = addPax(t, true); if (p) p.t = -0.35 * i
  }
}
function updatePax(dt) {
  for (let i = S.pax.length - 1; i >= 0; i--) {
    const p = S.pax[i], n = p.n; p.t += dt
    if (p.state === 'board') {
      if (p.t < 0) continue
      if (p.t < 1.2) { const k = ease(p.t / 1.2); n.g.position.lerpVectors(p.from, p.to, k); n.g.rotation.y = Math.PI; n.bounce = 0.5 }
      else if (p.t < 1.5) { n.g.position.copy(p.to); n.g.rotation.y = Math.PI * (1 - ease((p.t - 1.2) / 0.3)); n.bounce = 0 }
      else {
        p.state = 'idle'; n.g.rotation.y = 0; placePax(p)
        // 匂いが残っていたら、乗った人が最初に気づく
        if (S.smell > 0.22 && S.mode === 'play') { S.sniff = clamp(S.sniff + 0.12 * p.def.sniff, 0, 0.98); npcMark(n, '?'); npcLook(n, P.head.getWorldPosition(_hp), 0.6); n.reacting = 1.4; n.reactKind = '?'; fx(L2(pick(p.def.notice)), 'sb', { follow: n, life: 2.0 }); Snd.sfx('sniff') }
        else if ((S.mode === 'play' || S.mode === 'title') && !(S.stop && S.stop.spoke)) { if (S.stop) S.stop.spoke = true; fx(L2(pick(p.def.board)), 'sb', { follow: n, life: 2.0 }) }
      }
    } else if (p.state === 'exit') {
      if (p.t < 0.3) n.g.rotation.y = Math.PI * ease(p.t / 0.3)
      else if (p.t < 1.4) { const s = SLOTS[p.slot]; n.g.position.set(lerp(s.x, s.x > 0 ? 0.7 : -0.7, ease((p.t - 0.3) / 1.1)), 0, lerp(s.z, CAR.zf - 0.1, ease((p.t - 0.3) / 1.1))); n.bounce = 0.5 }
      else { freeNPC(n); S.pax.splice(i, 1) }
    }
    if (p.state === 'idle' && S.mode === 'play') { p.entry.exposure += S.smell * dt; p.age = (p.age || 0) + dt }
  }
}

// ---------- 予定（大きな音）
function buildEvents(stg) {
  const real = [], out = []
  let prev = -99
  for (const e of stg.events.filter(e => !e.fake)) {
    let at = e.at + (S.rand() - 0.5) * 2 * stg.jit
    at = clamp(at, Math.max(stg.warn + 0.6, prev + stg.gMin), prev < 0 ? 99 : prev + stg.gMax); at = Math.min(at, D.STAGE_LEN - stg.peak - 1.2)
    real.push(at); prev = at
    out.push({ type: e.type, def: e.def, at, warn: stg.warn, peak: stg.peak, ws: at - stg.warn, fake: false })
  }
  for (const e of stg.events.filter(e => e.fake)) {
    const a = real[e.after], b = real[e.after + 1], w = stg.warn * 0.8
    const at = a + stg.peak + TAIL + w + (b - stg.warn - (a + stg.peak + TAIL + w)) * (0.2 + S.rand() * 0.5)
    out.push({ type: e.type, at, warn: w, peak: 0, ws: at - w, fake: true })
  }
  out.sort((x, y) => x.at - y.at)
  for (const e of out) Object.assign(e, { started: false, peaked: false, ph: 'idle', k: 0, src: null })
  return out
}
// 「乗っている人の音」はその時に決める
function resolveEv(e) {
  if (e.type === 'roster') {
    const c = aboard().filter(p => p.def.sound)
    if (c.length) { e.src = pick(c); e.type = e.src.def.sound } else e.type = e.def
  }
  if (e.type === 'laugh') e.src = aboard().find(p => p.type === 'ceo') || null
  if (e.type === 'phone' && !e.src) { const c = aboard(); e.src = c.length ? pick(c) : null }
}
function evLevel(e, st) {
  if (st < e.ws) { e.ph = 'idle'; e.k = 0; return 0 }
  if (st < e.at) { e.ph = 'warn'; e.k = (st - e.ws) / e.warn; return 0.08 + 0.42 * e.k * e.k }
  if (e.fake) { if (st < e.at + 0.4) { e.ph = 'fizzle'; e.k = (st - e.at) / 0.4; return 0.5 * (1 - e.k) } e.ph = 'done'; e.k = 1; return 0 }
  if (st < e.at + e.peak) { e.ph = 'peak'; e.k = (st - e.at) / e.peak; return 1 - 0.45 * Math.pow(Math.abs(2 * e.k - 1), 1.3) }
  if (st < e.at + e.peak + TAIL) { e.ph = 'tail'; e.k = (st - e.at - e.peak) / TAIL; return 0.55 * (1 - e.k) }
  e.ph = 'done'; e.k = 1; return 0
}
const maskOf = L => clamp((L - 0.35) / 0.55, 0, 1)
// 小さいおならほど静か（少ない音でも隠れる）。おなかのハリと我慢で大きくなる
const quietOf = () => (1 - clamp(S.gauge * 0.7 + S.strain * 0.6, 0, 1)) * 0.4
const activeEv = type => S.evs.find(e => e.type === type && (e.ph === 'warn' || e.ph === 'peak' || e.ph === 'tail' || e.ph === 'fizzle'))
const IND_POS = new THREE.Vector3(0, 2.43, CAR.zb)
function lookAtOf(e) { if (e.src) return npcHeadPos(e.src.n, new THREE.Vector3()); return e.type === 'shake' ? new THREE.Vector3(0, 2.4, -0.8) : IND_POS.clone() }

// ---------- 飛ぶもの（メガネ・持ち物）と、ガスの煙・匂い
const flyers = []
function fling(m, v, av) {
  m.updateWorldMatrix(true, false); scene.attach(m); flyers.push({ m, v, av, floor: 0.03, t: 0 })
}
const puffM = new THREE.MeshBasicMaterial({ color: 0xb9d27a, transparent: true, opacity: 0.55, depthWrite: false })
const puffs = new THREE.InstancedMesh(G.sph, puffM, 40); puffs.count = 0; puffs.frustumCulled = false; scene.add(puffs)
const puffP = []
function doPuff(n, big) {
  for (let i = 0; i < n; i++) puffP.push({ p: BUTT.clone().add(new THREE.Vector3((S.rand() - 0.5) * 0.1, (S.rand() - 0.5) * 0.08, 0)), v: new THREE.Vector3((S.rand() - 0.5) * (big ? 1.8 : 0.8), (S.rand() - 0.1) * 0.6, -0.4 - S.rand() * (big ? 1.6 : 0.6)), s: 0.04 + S.rand() * 0.05, g: big ? 1.9 : 1.2, t: 0, life: 1.4 + S.rand() * 0.8 })
  while (puffP.length > 40) puffP.shift()
}
// 匂いのもやもや（主役のまわりに漂う）
const stinks = []
for (let i = 0; i < 10; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stinkTex, transparent: true, opacity: 0, depthWrite: false })); sp.scale.set(0.12, 0.24, 1); scene.add(sp); stinks.push({ sp, a: i / 10 * Math.PI * 2, ph: Math.random() * 3, r: 0.4 + Math.random() * 0.4 }) }
const cloud = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xa6c46a, transparent: true, opacity: 0, depthWrite: false })); cloud.position.set(0, 0.95, -0.4); scene.add(cloud)
// 風（ドアが開いた時）・スプレー
const winds = []
for (let i = 0; i < 8; i++) { const m = box(0.01, 0.01, 0.5, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }), 0, 0, 0, scene); winds.push({ m, x: (Math.random() - 0.5) * 2.2, y: 0.4 + Math.random() * 1.8, z: Math.random() * 4 }) }

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id }
const ICON = {
  hold: '<path d="M9 11V5a2 2 0 0 1 4 0v6M13 10V8a2 2 0 0 1 4 0v5c0 5-3 8-7 8s-6-3-6-6v-3a2 2 0 0 1 4 0"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M19 5a9 9 0 0 1 0 10M21.5 3a12 12 0 0 1 0 14"/>',
  go: '<path d="M12 2l2 6 6-2-4 5 5 4-6 0 1 6-4-4-4 4 1-6-6 0 5-4-4-5 6 2z"/>',
  nose: '<path d="M12 3c-1 5-4 8-4 12a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3c0-4-3-7-4-12z"/><path d="M4 8c1-1 2 0 3-1M17 7c1 1 2 0 3 1M3 13c1-1 2 0 3-1M18 12c1 1 2 0 3 1"/>',
  pax: '<circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 21v-3a5 5 0 0 1 10 0v3M11 21v-3a5 5 0 0 1 10 0v3"/>',
  trick: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15c2 2 6 2 8 0"/><path d="M15 4l2-2"/>',
  key: '<rect x="2" y="8" width="20" height="9" rx="2"/><path d="M7 13h10"/>',
  touch: '<circle cx="12" cy="8" r="3"/><path d="M12 11v10M8 4a6 6 0 0 1 8 0"/>',
  up: '<path d="M12 20V6M6 12l6-6 6 6"/><path d="M4 3h16"/>',
  chime: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  phone: '<rect x="8" y="2" width="8" height="20" rx="2"/><path d="M11 18h2M4 8a6 6 0 0 0 0 8M20 8a6 6 0 0 1 0 8"/>',
  shake: '<rect x="7" y="4" width="10" height="16" rx="1"/><path d="M3 8l2 2-2 2 2 2M21 8l-2 2 2 2-2 2"/>',
  laugh: '<circle cx="12" cy="12" r="9"/><path d="M7 13q5 6 10 0zM8 9l2 1M16 9l-2 1"/>',
  baby: '<circle cx="12" cy="10" r="6"/><path d="M9 10h.01M15 10h.01M10 13q2 2 4 0M8 20q4-3 8 0"/>',
  bark: '<path d="M5 9l2-5 3 4h4l3-4 2 5v5a7 7 0 0 1-14 0z"/><path d="M10 13h.01M14 13h.01M11 17h2"/>',
  cart: '<path d="M4 18h12M6 18V6h6v12M12 10h6v8"/><circle cx="7" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/>',
  giggle: '<path d="M4 6h10v7H8l-4 3z"/><path d="M14 9h6v7l-3-2h-3"/>',
  music: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="13" width="4" height="7" rx="1"/><rect x="17" y="13" width="4" height="7" rx="1"/>',
  air: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  cover: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  cough: '<circle cx="9" cy="11" r="6"/><path d="M15 9l5-2M15 12h6M15 15l5 2"/><path d="M7 13h4"/>',
  blame: '<path d="M2 12h10M8 8l4 4-4 4"/><circle cx="18" cy="8" r="3"/><path d="M14 20a4 4 0 0 1 8 0"/>',
  say: '<path d="M4 5h16v10H10l-5 4v-4H4z"/><path d="M10 8a2 2 0 1 1 2 2v1M12 13h.01"/>',
  exit: '<path d="M4 3h10v18H4z"/><path d="M11 12h10M17 8l4 4-4 4"/>',
}
const svg = (k, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}">${ICON[k] || ''}</svg>`
const MC_FACE = '<circle cx="24" cy="24" r="19" fill="#ffd9b3" stroke="#1b1620" stroke-width="2.5"/><path d="M6 20c1-12 35-12 36 0-6-4-30-4-36 0z" fill="#3a2a22" stroke="#1b1620" stroke-width="2"/><circle cx="17" cy="24" r="2.6" fill="#1b1620"/><circle cx="31" cy="24" r="2.6" fill="#1b1620"/><path d="M18 31q6 7 12 0z" fill="#a8170d" stroke="#1b1620" stroke-width="1.5"/><circle cx="24" cy="27" r="3" fill="#f2a07a"/><rect x="36" y="31" width="6" height="13" rx="3" fill="#1b1620"/><circle cx="39" cy="30" r="5" fill="#9a9aa6" stroke="#1b1620" stroke-width="2"/>'
const RUSES = ['cough', 'blame', 'say', 'exit']

function applyLang() {
  const T = TT(); document.documentElement.lang = S.lang
  for (const el of document.querySelectorAll('[data-t]')) { const v = T[el.dataset.t]; if (typeof v === 'string') el.innerHTML = v }
  for (const el of document.querySelectorAll('[data-face]')) el.innerHTML = MC_FACE
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JP'
  const H = isTouch ? T.holdSP : T.holdPC, R = isTouch ? T.relSP : T.relPC, TP = isTouch ? T.tapSP : T.tapPC
  $('#howSteps').innerHTML = T.howSteps.map(([ic, s]) => `<div class="step">${svg(ic)}<span>${s.replace('{HOLD}', H).replace('{REL}', R).replace('{TAP}', TP)}</span></div>`).join('')
  const evs = new Set(); for (const st of D.stages) for (const e of st.events.filter(e => !e.fake)) { if (e.type === 'roster') { for (const t of st.pool) if (D.pax[t].sound) evs.add(D.pax[t].sound) } else evs.add(e.type) }
  $('#evList').innerHTML = [...evs].map(k => `<span>${D.ev[k][S.lang]}</span>`).join('')
  $('#gItch .mark').dataset.l = S.lang === 'ja' ? 'ぷ' : 'pf'
  $('#holdLab').textContent = S.holding ? T.holdOn : T.holdOff
  for (const k of RUSES) { const b = $('#r_' + k); b.querySelector('.rl').textContent = T.ruse[k]; b.setAttribute('aria-label', T.ruse[k]) }
  if (S.mode === 'intro') fillIntro()
  if (S.mode === 'result' && S.result) fillResult(true)
}
function syncRuses() {
  for (const k of RUSES) { const b = $('#r_' + k), n = S.ruseLeft[k] ?? 0; b.querySelector('.rn').textContent = n; b.disabled = n <= 0 || S.mode !== 'play' || S.exiting }
}

// ---------- 擬音・吹き出し（3Dの上に重ねる HTML）
const FX = []
const _w = new THREE.Vector3()
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight } }
function fx(text, cls, o = {}) {
  const el = document.createElement('div'); el.className = cls; el.textContent = text; $('#fx').appendChild(el)
  const f = { el, t: 0, life: o.life || 1.3, world: o.world, x: o.x, y: o.y, rot: o.rot || 0, shake: o.shake || 0, size: o.size, dy: o.dy || 0, follow: o.follow, head: o.head }
  if (o.size) el.style.fontSize = o.size + 'px'
  // 吹き出しは同時に3つまで（古いものから消す）
  if (cls.startsWith('sb')) { const sbs = FX.filter(g => g.el.className.startsWith('sb')); if (sbs.length >= 3) sbs[0].t = Math.max(sbs[0].t, sbs[0].life - 0.05) }
  FX.push(f); return f
}
function clearFx() { for (const f of FX) f.el.remove(); FX.length = 0 }
function updateFx(dt) {
  const top = (document.querySelector('.hudTop') && !$('#vPlay').hidden) ? $('.hudTop').getBoundingClientRect().bottom + 6 : 50
  const bot = (!$('#vPlay').hidden) ? $('.hudBot').getBoundingClientRect().top - 6 : innerHeight - 6
  const placed = []
  for (let i = 0; i < FX.length; i++) {
    const f = FX[i]; f.t += dt
    if (f.t > f.life) { f.el.remove(); FX.splice(i, 1); i--; continue }
    let x = f.x, y = f.y
    if (f.head) { f.head(_hp); _hp.y += 0.3; const s = toScreen(_hp); x = s.x; y = s.y }
    else if (f.follow) { npcHeadPos(f.follow, _hp); _hp.y += 0.38 * f.follow.g.scale.y; const s = toScreen(_hp); x = s.x; y = s.y }
    else if (f.world) { const s = toScreen(f.world); x = s.x; y = s.y }
    const w = f.el.offsetWidth, h = f.el.offsetHeight
    x = clamp(x, w / 2 + 6, innerWidth - w / 2 - 6); y = clamp(y + f.dy * f.t, top + h / 2, Math.max(top + h / 2, bot - h / 2))
    // 吹き出し同士・擬音とは重ねない（先に出たものの下にずらす）
    if (/^(ono yel|verdict)/.test(f.el.className)) placed.push({ x, y, w: w * 1.1, h: h * 1.1 })
    else if (f.el.className.startsWith('sb')) {
      for (let k = 0; k < 6; k++) { const hit = placed.find(b => Math.abs(b.x - x) < (b.w + w) / 2 + 4 && Math.abs(b.y - y) < (b.h + h) / 2 + 4); if (!hit) break; y = hit.y + (hit.h + h) / 2 + 6 }
      placed.push({ x, y, w, h })
    }
    const t = f.t, s = t < 0.1 ? t / 0.1 * 1.25 : t < 0.18 ? 1.25 - (t - 0.1) / 0.08 * 0.25 : 1
    const jx = f.shake ? (Math.sin(t * 90) * f.shake) : 0
    f.el.style.transform = `translate(${x + jx}px,${y}px) translate(-50%,-50%) rotate(${f.rot}deg) scale(${s})`
    f.el.style.opacity = String(clamp((f.life - t) / 0.3, 0, 1))
  }
}
const vmin = () => Math.min(innerWidth, innerHeight)
const say = (n, text, life = 1.8) => fx(text, 'sb', { follow: n, life })

// ---------- 進行
function startRun() {
  Snd.init(); S.rec = []; S.maxDb = 0; S.photo = false; S.result = null; S.smellBusts = 0; S.rode = []; S.ruseLog = []
  S.ruseLeft = { ...D.ruses }
  const pc = $('#rPhoto').getContext('2d'); pc.clearRect(0, 0, 256, 256)
  startStage(0)
}
function startStage(i) {
  S.stageIdx = i; const stg = D.stages[i]
  setStage(stg.id); S.evs = buildEvents(stg); S.st = 0; S.gauge = stg.start; S.strain = 0; S.flush = 0; S.snz = null; S.react = 0; S.relief = 0; S.shame = 0; S.haStep = 0
  S.holding = false; S.toggled = false; S.ignoreUp = false; S.punch = -1; S.level = 0; S.hop = 0
  S.smell = 0; S.sniff = 0; S.sniffStep = 0; S.floor = stg.floor0; S.floorT = 0; S.door = 0; S.stop = null; S.coughT = 0; S.coughN = 0; S.lastBad = null; S.exiting = false; S.exitT = 0
  P.root.position.set(0, 0, 0); P.root.rotation.y = 0
  S.capT = -1; S.doCap = false; S.later = []
  spawnInitial(stg)
  clearFx(); S.mode = 'intro'; S.modeT = 0; show('vPlay'); fillIntro(); $('#introCard').hidden = false; $('#endCard').hidden = true; $('#count').hidden = true; $('#hint').hidden = true
  Snd.setTrack('quiet'); syncRuses(); updateHud()
}
function fillIntro() {
  const T = TT(), stg = D.stages[S.stageIdx], [nm, sub] = T.stages[stg.id]
  $('#iNo').textContent = `${T.stage} ${S.stageIdx + 1} / 3`; $('#iName').textContent = nm; $('#iSub').textContent = sub
  const ctrl = isTouch ? T.ctrlSP : T.ctrlPC
  $('#iCtrl').innerHTML = S.stageIdx === 0 ? ctrl.map(([ic, s]) => `<div>${svg(ic)}<span>${s}</span></div>`).join('') : ''
  $('#iCtrl').hidden = S.stageIdx !== 0
  $("#hStage").textContent = `${T.stage} ${S.stageIdx + 1}${S.lang === "ja" ? "・" : " · "}${T.left}`
}
function beginCount() {
  if (S.mode !== 'intro') return
  Snd.init(); Snd.sfx('tap'); $('#introCard').hidden = true; S.mode = 'count'; S.modeT = 0; S.cIdx = -1
}
function stageRecs(i) { return S.rec.filter(r => r.stage === i) }
function endStage() {
  S.mode = 'stageEnd'; S.modeT = 0; S.holding = false; S.toggled = false
  const T = TT(), nxt = D.stages[S.stageIdx + 1]
  $('#eName').textContent = T.stages[D.stages[S.stageIdx].id][0]
  const c = stageCount(S.stageIdx)
  $('#eTally').textContent = T.tally.replace('{A}', c.n).replace('{B}', c.bad) + (c.smell ? T.tallySmell.replace('{C}', c.smell) : '')
  $('#eSub').textContent = nxt ? T.next.replace('{N}', T.stages[nxt.id][0]) : T.last
  $('#endCard').hidden = false; $('#hint').hidden = true; syncRuses()
}

// 押す・離す（長押しでもタップ切り替えでも遊べる）
function press() {
  if (S.mode === 'intro') { if (S.stageIdx > 0) beginCount(); return }
  if (S.mode !== 'play' && S.mode !== 'count') return
  Snd.init()
  if (S.holding) { S.ignoreUp = true; doRelease(); return }
  S.holding = true; S.toggled = false; S.downAt = performance.now(); S.everHeld = true
}
function release() {
  if (S.ignoreUp) { S.ignoreUp = false; return }
  if (!S.holding) return
  if (performance.now() - S.downAt < 260 && !S.toggled) { S.toggled = true; return }
  doRelease()
}
function doRelease() {
  S.holding = false; S.toggled = false
  if (S.mode === 'play' && S.gauge >= TH && !S.snz && S.st < D.STAGE_LEN && !S.exiting) triggerFart('release')
}
function triggerFart(kind) {
  S.snz = { t: 0, kind, impact: false }
  Snd.growl(kind === 'explode' ? 1.3 : 0.8)
  if (kind === 'explode') fx(TT().rate.explode, 'ono red', { world: headTop(), size: vmin() * 0.1, life: 0.6, shake: 4, rot: -6 })
}
const _ht = new THREE.Vector3()
function headTop() { return P.head.getWorldPosition(_ht).clone().add(new THREE.Vector3(0.25, 0.35, 0)) }
function buttPos() { return P.root.localToWorld(BUTT.clone()) }
function stageShout() { return TT().shout[D.stages[S.stageIdx].id] }
function verdict(rating) {
  const land = innerWidth > innerHeight * 1.2
  fx(TT().rate[rating], 'verdict ' + rating, land ? { x: innerWidth * 0.73, y: innerHeight * 0.55, life: 1.3 } : { x: innerWidth / 2, y: innerHeight * 0.56, life: 1.3 })
}
// 全員がこっちを向く（ヘッドホンの若者は音に気づかない）
function allTurn(kind, sound) {
  aboard().forEach((p, i) => { if (sound && p.type === 'headphone') return; p.n.reactT = 0.05 + i * 0.03; p.n.reactKind = kind; p.n.reactUntil = 2.6; p.n.lookP = null })
}
function fartImpact() {
  const s = S.snz; s.impact = true
  let L = S.level; if (s.kind === 'cough') L = Math.max(L, 0.8)
  const q = s.kind === 'explode' || s.kind === 'auto' ? 0 : quietOf()
  let m = maskOf(L + q); if (s.kind === 'explode') m = Math.max(0, m - 0.5)
  let rating = D.rateOf(m); if (s.kind === 'explode' && (rating === 'busted' || rating === 'sus')) rating = 'explode'
  const db = 50 + S.gauge * 16 + S.strain * 30 + (s.kind === 'explode' ? 26 : s.kind === 'auto' ? 6 : 0) + S.rand() * 4
  s.rating = rating; s.m = m; s.db = Math.round(db * 10) / 10
  const rec = { stage: S.stageIdx, t: Math.round(S.st * 100) / 100, L: Math.round(L * 100) / 100, q: Math.round(q * 100) / 100, m, rating, db: s.db, kind: s.kind, slot: true }
  S.rec.push(rec)
  if (s.db > S.maxDb) { S.maxDb = s.db; S.capT = 0 }
  // 匂い（大きいほど・我慢した後ほど・暴発ほど強い。かき消しても匂いは出る）
  const amt = s.kind === 'explode' ? 0.85 : 0.12 + 0.3 * S.gauge + 0.42 * S.strain + (s.kind === 'auto' ? 0.1 : 0)
  S.smell = Math.min(1.4, S.smell + amt); rec.smell = Math.round(amt * 100) / 100
  S.gauge = 0; S.flush = Math.max(S.flush, S.strain); S.strain = 0; S.haStep = 0
  S.lastBad = (rating === 'sus' || rating === 'busted' || rating === 'explode') ? { rec, t: S.st } : null
  const T = TT(), big = rating === 'busted' || rating === 'explode', bp = buttPos()
  doPuff(big ? 26 : 12, big); S.hop = big ? 1 : 0.4
  if (big) {
    Snd.fart(1.1, true, true); Snd.duck(2.2)
    later(0.38, () => Snd.sfx('scratch')); later(0.65, () => Snd.sfx('gasp'))
    fx(s.kind === 'explode' ? T.fartBig : T.fart, 'ono red', { world: bp.clone().add(new THREE.Vector3(0.45, 0.1, 0.3)), size: vmin() * (s.kind === 'explode' ? 0.12 : 0.11), life: 1.6, shake: 5, rot: -8, dy: -10 })
    S.react = 1.2; S.shame = 2.2; S.punch = 0; S.shake = 0.06
    allTurn('!', true)
    const ab = aboard().filter(p => p.type !== 'headphone'), withBust = ab.filter(p => p.def.bust)
    const a1 = withBust.length ? pick(withBust) : ab[0]
    if (a1) { const line = a1.def.bust ? L2(pick(a1.def.bust)) : stageShout()[0]; later(0.7, () => say(a1.n, line)) }
    const others = ab.filter(p => p !== a1)
    if (others.length) { const o2 = pick(others), line2 = pick(stageShout()); later(1.1, () => say(o2.n, line2, 1.5)) }
    if (P.glasses.parent === P.head) { fling(P.glasses, new THREE.Vector3(0.6 + S.rand() * 0.4, 2.3, 1.3), new THREE.Vector3(9, 4, 12)); later(0.6, () => Snd.sfx('clink')) }
    const pr = PROPS[cur.id].items.find(m => m.parent !== scene); if (pr) { fling(pr, new THREE.Vector3(-0.6 - S.rand(), 1.6, 0.9), new THREE.Vector3(6, 2, 8)); later(0.52, () => Snd.sfx('thud')) }
    later(1.5, () => { if (S.mode === 'play') fx(S.lang === 'ja' ? 'シーン…' : 'silence...', 'ono small', { x: innerWidth * 0.78, y: innerHeight * 0.32, size: vmin() * 0.07, life: 1.4, rot: 6 }) })
  } else {
    Snd.fart(m >= 0.9 ? 0.35 : 0.6, false, false, true)
    fx(T.fartSmall, 'ono small', { world: bp.clone().add(new THREE.Vector3(0.35, 0, 0.2)), size: vmin() * 0.045, life: 1.1, rot: -4, dy: -14 })
    if (rating === 'sus') {
      Snd.sfx('sus')
      const near = aboard().filter(p => p.type !== 'headphone').sort((a, b) => Math.hypot(SLOTS[a.slot].x, SLOTS[a.slot].z) - Math.hypot(SLOTS[b.slot].x, SLOTS[b.slot].z)).slice(0, 2)
      near.forEach(p => { p.n.reactT = 0.15; p.n.reactKind = '?'; p.n.reactUntil = 1.6 })
      if (near[0]) say(near[0].n, T.glance, 1.3)
    } else { S.relief = 1.6; Snd.sfx(rating === 'perfect' ? 'perfect' : 'safe') }
  }
  verdict(rating)
}
// 匂いでバレる
function smellBust(why) {
  const T = TT(), rec = { stage: S.stageIdx, t: Math.round(S.st * 100) / 100, m: 0, rating: 'smell', kind: 'smell', slot: false, why }
  S.rec.push(rec); S.smellBusts++; S.lastBad = { rec, t: S.st }
  allTurn('!', false); S.shame = 2.4; S.punch = 0; S.shake = 0.05
  for (const p of aboard()) p.entry.exposure += 1.5
  fx(T.smellOut, 'ono red', { world: headTop().add(new THREE.Vector3(-0.2, 0.15, 0)), size: vmin() * 0.1, life: 1.8, shake: 4, rot: -6 })
  Snd.sfx('gasp'); Snd.duck(1.6)
  const sn = aboard().sort((a, b) => b.def.sniff - a.def.sniff)[0]
  if (sn && why !== 'say') later(0.8, () => say(sn.n, L2(pick(sn.def.notice))))
  S.sniff = 0; S.smell *= 0.5; S.sniffStep = 0
  verdict('smell')
}
// 匂いとくんくん度（毎フレーム）
function sniffMult() { const ab = aboard(); if (!ab.length) return 0; return Math.max(...ab.map(p => p.def.sniff)) * (0.75 + 0.07 * ab.length) }
function coverNow() { const c = aboard().reduce((a, p) => a + (p.def.cover || 0) * (p.age < 4 ? 1 : 0.3), 0); return { pax: Math.min(1, c), door: S.door > 0.5 ? 1 : 0, who: aboard().find(p => p.def.cover && p.age < 4) } }
function updateSmell(dt) {
  const stg = D.stages[S.stageIdx], cv = coverNow()
  S.smell = Math.max(0, S.smell - S.smell * (0.045 + 0.55 * cv.pax + 1.6 * cv.door) * dt)
  const rate = stg.sniff * sniffMult()
  S.sniff += rate * S.smell * dt - (0.03 + 0.25 * cv.pax + 0.5 * cv.door) * dt
  S.sniff = clamp(S.sniff, 0, 1)
  if (S.sniff >= 1) { smellBust('sniff'); return }
  const ab = aboard()
  // 清掃員のおばちゃんは、黙って消臭する
  const cl = ab.find(p => p.def.spray && !p.sprayed)
  if (cl && S.sniff >= 0.55) { cl.sprayed = true; S.smell = 0; S.sniff = Math.max(0, S.sniff - 0.35); Snd.sfx('spray'); say(cl.n, L2(pick(cl.def.notice)), 2.2); cl.n.reactT = 0.1; cl.n.reactKind = '?'; cl.n.reactUntil = 2.2 }
  if (S.sniffStep === 0 && S.sniff > 0.35 && ab.length) { S.sniffStep = 1; const p = pick(ab); say(p.n, TT().sniffing, 1.4); Snd.sfx('sniff'); p.n.sniffT = 1.6 }
  if (S.sniffStep === 1 && S.sniff > 0.68 && ab.length) { S.sniffStep = 2; const p = ab.sort((a, b) => b.def.sniff - a.def.sniff)[0]; say(p.n, S.rand() < 0.5 ? TT().sniffQ : L2(pick(p.def.notice)), 2.0); npcMark(p.n, '?'); Snd.sfx('sniff') }
  if (S.sniff < 0.25) S.sniffStep = 0
}

// ---------- 誤魔化し（回数制限つき）
function canRuse(k) { return S.mode === 'play' && (S.ruseLeft[k] || 0) > 0 && !S.exiting && !(S.snz && !S.snz.impact) && S.st < D.STAGE_LEN }
function useRuse(k) {
  if (!canRuse(k)) return 'no'
  S.ruseLeft[k]--; Snd.init(); const T = TT(), log = { k, stage: S.stageIdx, ok: true, t: S.st }; S.ruseLog.push(log)
  let out = 'ok'
  if (k === 'cough') {
    // 自分で音を出して、その音にかぶせる
    S.coughT = 0.7; S.coughN++; Snd.cough(); S.hop = 0.3
    fx(T.coughFx, 'ono yel', { world: headTop(), size: vmin() * 0.08, life: 0.9, rot: -6, shake: 2 })
    if (S.gauge >= TH && !S.snz) { S.holding = false; S.toggled = false; S.ignoreUp = ptrDown || keyDown; S.snz = { t: PRE, kind: 'cough', impact: false }; fartImpact(); out = 'fart' } else out = 'cough'
    if (S.coughN >= 2) { S.sniff = clamp(S.sniff + 0.18, 0, 0.98); const p = aboard()[0]; if (p) later(0.6, () => say(p.n, pick(T.coughSus))); log.ok = false; out += '+sus' }
  } else if (k === 'blame') {
    const c = aboard().filter(p => p.def.blame >= 0)
    if (!c.length) { fx(T.blameNone, 'ono small', { world: headTop(), size: vmin() * 0.05, life: 1.4 }); S.ruseLeft[k]++; S.ruseLog.pop(); return 'none' }
    const tgt = c.sort((a, b) => b.def.blame - a.def.blame)[0], who = tgt.def.who ? L2([tgt.def.who.ja, tgt.def.who.en]) : (S.lang === 'ja' ? tgt.def.ja : tgt.def.en)
    log.who = tgt.type
    fx(T.blameWho.replace('{N}', who), 'ono small', { world: headTop(), size: vmin() * 0.045, life: 1.4, rot: -3 }); Snd.sfx('stare')
    const recent = S.lastBad && S.st - S.lastBad.t < 3.5 && !S.lastBad.rec.blamed
    const sus = recent || S.sniff >= 0.3
    // 全員の視線がなすりつけ先へ
    const hp = new THREE.Vector3(); blameHead(tgt.n, hp)
    aboard().forEach(p => { if (p !== tgt) { p.n.lookP = hp.clone(); p.n.reacting = 1.8; p.n.reactKind = '?' } })
    if (!sus) { later(0.6, () => verdict('blameMiss')); log.ok = false; return 'miss' }
    if (S.rand() < tgt.def.blame) {
      if (recent) { const r = S.lastBad.rec; r.blamed = true; r.m = Math.max(r.m, 0.7); r.rating = 'blamed' }
      S.sniff = 0; S.smell *= 0.5; S.sniffStep = 0; tgt.entry.blamed = true; tgt.entry.exposure += 2
      later(0.5, () => { npcMark(tgt.n, '!'); fx(L2(pick(tgt.def.blamed)), 'sb', { head: o => blameHead(tgt.n, o), life: 2.0 }); Snd.sfx('sus') })
      later(0.9, () => verdict('blamed')); out = 'success'
    } else {
      S.rec.push({ stage: S.stageIdx, t: Math.round(S.st * 100) / 100, m: 0, rating: 'blameFail', kind: 'blameFail', slot: false })
      log.ok = false; S.lastBad = null
      later(0.6, () => { allTurn('!', false); S.shame = 2; say(tgt.n, pick(T.blameFail)); Snd.sfx('gasp') })
      later(0.9, () => verdict('blameFail')); out = 'fail'
    }
  } else if (k === 'say') {
    const ab = aboard()
    fx(T.sayLine, 'sb mine', { head: o => P.head.getWorldPosition(o), life: 1.6 })
    if (!ab.length) { log.ok = false; return 'alone' }
    if (S.rand() < 0.12 + 0.3 * S.sniff) {
      log.ok = false; const p = pick(ab), line = pick(T.sayFail)
      later(0.8, () => { say(p.n, line, 2.0); smellBust('say') }); out = 'fail'
    } else {
      S.sniff = 0; S.smell *= 0.6; S.sniffStep = 0
      later(0.8, () => { const p = pick(aboard().length ? aboard() : ab); say(p.n, pick(T.sayOk), 1.8); for (const q of aboard()) { q.n.sniffT = 1.2 } verdict('sayOk') }); out = 'success'
    }
  } else if (k === 'exit') {
    // 次の階で降りる（ボタン連打）
    S.exiting = true; S.exitT = 0; S.holding = false; Snd.sfx('mash')
    fx(T.exitFx, 'ono yel', { x: innerWidth * 0.8, y: innerHeight * 0.45, size: vmin() * 0.06, life: 1.2, rot: 8, shake: 2 })
    later(1.0, () => { if (S.mode === 'play') { S.stop = { t: 0, exitPlayer: true }; Snd.sfx('ding') } })
    out = 'exit'
  }
  syncRuses(); return out
}
// 途中で降りた分は、残りの音を半分の点で数える（少し下がる）
function exitFill() {
  const stg = D.stages[S.stageIdx], ev = stg.events.filter(e => !e.fake).length, rs = stageRecs(S.stageIdx).filter(r => r.slot)
  const n = 0; void ev; void rs
  for (let i = 0; i < n; i++) S.rec.push({ stage: S.stageIdx, t: Math.round(S.st * 100) / 100, m: 0.5, rating: 'exit', kind: 'exitFill', slot: true })
}

function later(sec, fn) { S.later.push({ t: sec, fn }) }
function updateStop(dt) {
  const s = S.stop; if (!s) { S.door = Math.max(0, S.door - dt * 2.4); return }
  s.t += dt
  if (s.t < 0.45) S.door = Math.min(1, S.door + dt / 0.45)
  else if (s.t < 2.2) S.door = 1
  else S.door = Math.max(0, S.door - dt / 0.4)
  if (!s.did && s.t >= 0.25) {
    s.did = true; Snd.sfx('door')
    if (s.exitPlayer) {
      const T = TT(), ab = aboard()
      if (ab.length) later(0.4, () => say(pick(ab).n, pick(T.exitLine).replace('{F}', S.floor), 2.0))
    } else if (S.mode === 'play') doBoarding(D.stages[S.stageIdx])
  }
  if (s.exitPlayer && s.t > 0.5) {
    S.exitT += dt; P.root.rotation.y = Math.PI * ease(S.exitT / 0.3); P.root.position.z = 1.1 * ease((S.exitT - 0.3) / 1.0); P.root.position.x = 0.5 * ease((S.exitT - 0.3) / 1.0)
    if (S.exitT > 1.3 && S.mode === 'play') { exitFill(); log1Exit(); endStage() }
  }
  if (s.t > 2.7) S.stop = null
}
function log1Exit() { const T = TT(); verdict('exit'); void T }
function updateGame(dt) {
  S.time += dt; S.modeT += dt
  for (let i = S.later.length - 1; i >= 0; i--) { const l = S.later[i]; l.t -= dt; if (l.t <= 0) { S.later.splice(i, 1); l.fn() } }
  const stg = D.stages[S.stageIdx]
  if (S.mode === 'title' || S.mode === 'how') {
    const c = (S.time % 7) / 7
    S.gauge = c < 0.75 ? c / 0.75 * 0.9 : c < 0.8 ? 0.9 : 0.05; S.strain = 0; S.holding = false
    if (c > 0.8 && c < 0.83 && !S.snz) { S.snz = { t: 0, kind: 'demo', impact: true, demo: true }; doPuff(10, false); S.hop = 0.4; S.smell = 0.8 }
    S.smell = Math.max(0, S.smell - dt * 0.25)
  } else if (S.mode === 'count') {
    const idx = Math.floor(S.modeT / 0.6)
    if (idx !== S.cIdx && idx < 4) { S.cIdx = idx; const el = $('#count'); el.hidden = false; el.textContent = TT().count[idx]; Snd.sfx(idx < 3 ? 'count' : 'go') }
    if (S.modeT >= 2.4) { $('#count').hidden = true; S.mode = 'play'; S.modeT = 0; syncRuses(); if (S.stageIdx === 0 && !S.everHeld) showHint(isTouch ? TT().hintSP : TT().hintPC) }
  } else if (S.mode === 'play') {
    S.st += dt
    if (!S.stop) { S.floorT += dt; S.floor = stg.floor0 + Math.floor(S.floorT * stg.fpS) }
    let L = 0
    for (const e of S.evs) {
      if (!e.started && S.st >= e.ws) {
        e.started = true; resolveEv(e); Snd.event(e.type, Math.max(0.05, e.at - S.st), e.peak, e.fake)
        const w = D.ev[e.type].w; if (w && e.src && !e.fake) say(e.src.n, w[S.lang], Math.min(2.2, e.warn))
      }
      L = Math.max(L, evLevel(e, S.st))
      if (!e.peaked && S.st >= e.at) { e.peaked = true; if (e.fake) onFizzle(e); else onPeak(e) }
    }
    if (S.coughT > 0) { S.coughT -= dt; L = Math.max(L, 0.8) }
    const hp = aboard().find(p => p.def.noise); if (hp) L = Math.max(L, hp.def.noise)
    S.level = L
    if (S.st < D.STAGE_LEN && !S.exiting) {
      if (S.snz && !S.snz.impact) { /* 鳴っている間はゲージ止め */ }
      else if (S.react > 0) S.react -= dt
      else if (S.holding) { S.gauge += stg.slow * dt; S.strain += stg.strainUp * dt }
      else { S.gauge += stg.fast * dt; S.strain -= stg.strainDown * dt }
      S.strain = clamp(S.strain, 0, 1); S.gauge = clamp(S.gauge, 0, 1)
      if (!S.snz) { if (S.strain >= 1) triggerFart('explode'); else if (S.gauge >= 1) triggerFart('auto') }
      if (!S.holding && !S.snz) { const steps = [0.45, 0.65, 0.85]; if (S.haStep < 3 && S.gauge >= steps[S.haStep]) { fx(TT().ha[S.haStep], 'ono small yel', { world: headTop(), size: vmin() * (0.04 + S.haStep * 0.01), life: 0.9, rot: 6, dy: -10 }); Snd.growl(0.35 + S.haStep * 0.2); S.haStep++ } }
      if (S.holding) { S.haStep = S.gauge >= 0.85 ? 2 : S.gauge >= 0.65 ? 1 : 0; S.humT -= dt; if (S.strain > 0.55 && S.humT <= 0) { S.humT = 1.3; fx(TT().hum, 'ono small', { world: headTop(), size: vmin() * 0.04, life: 1.0, rot: -5, shake: 2 }); Snd.sfx('hum') } }
      updateSmell(dt)
    }
    if (S.stageIdx === 0) {
      if (S.everHeld && $('#hint').dataset.k === 'hold') $('#hint').hidden = true
      const e = S.evs.find(e => e.ph === 'peak' || (e.ph === 'warn' && e.k > 0.85))
      if (e && S.holding && S.gauge >= TH && !S.snz) showHint(TT().hintRel, 'rel')
      else if (S.door > 0.5 && S.holding && S.gauge >= TH && !S.snz) showHint(TT().hintCov, 'rel')
      else if ($('#hint').dataset.k === 'rel') $('#hint').hidden = true
    }
    if (S.st >= D.STAGE_LEN && (!S.snz || S.snz.t > 1.0) && !S.exiting) endStage()
  } else if (S.mode === 'stageEnd') {
    S.level = 0; S.st += dt; for (const e of S.evs) evLevel(e, S.st); S.gauge = Math.max(0, S.gauge - dt * 0.6)
    if (S.modeT > 2.3) { $('#endCard').hidden = true; if (S.stageIdx < 2) startStage(S.stageIdx + 1); else toResult() }
  } else if (S.mode === 'result') updateReveal(dt)
  updateStop(dt); updatePax(dt)
  if (S.snz) {
    S.snz.t += dt
    if (!S.snz.impact && S.snz.t >= PRE) fartImpact()
    if (S.snz.t > 1.2) S.snz = null
  }
  if (S.capT >= 0) { S.capT -= dt; if (S.capT < 0) S.doCap = true }
  S.flush = Math.max(S.strain, S.flush - dt * 0.5)
  S.relief = Math.max(0, S.relief - dt); S.shame = Math.max(0, S.shame - dt)
  S.shake = Math.max(0, S.shake - dt * 0.12); S.hop = Math.max(0, S.hop - dt * 2.2)
}
function showHint(txt, k = 'hold') { const h = $('#hint'); h.textContent = txt; h.dataset.k = k; h.hidden = false }
function onPeak(e) {
  const lab = D.ev[e.type][S.lang === 'ja' ? 'sj' : 'se'].replace('{F}', S.floor)
  const s = toScreen(lookAtOf(e))
  fx(lab, 'ono yel', { x: clamp(s.x, innerWidth * 0.22, innerWidth * 0.78), y: clamp(s.y, innerHeight * 0.3, innerHeight * 0.42), size: vmin() * (lab.length > 10 ? 0.06 : 0.085), life: e.peak + 0.5, rot: (S.rand() - 0.5) * 16, shake: 3 })
  S.shake = Math.max(S.shake, e.type === 'shake' ? 0.05 : 0.025)
  if (e.type === 'chime') S.stop = { t: 0 }
  if (e.type === 'cart' && e.src) e.src.n.topple = 0
}
function onFizzle(e) {
  const s = toScreen(lookAtOf(e)), f = TT().fizzle[e.type] || (S.lang === 'ja' ? '…あれ？' : '...huh?')
  fx(f, 'ono small', { x: clamp(s.x, innerWidth * 0.22, innerWidth * 0.78), y: clamp(s.y, innerHeight * 0.3, innerHeight * 0.42), size: vmin() * 0.055, life: 1.1, rot: 5 })
}

// ---------- 結果
// バレずに出せた回数。音でバレた・暴発は数えない。匂いバレ・なすりつけ失敗はその回を失う（1減らす）
function stageCount(i) {
  const rs = stageRecs(i), got = rs.filter(r => r.slot && r.kind !== 'exitFill' && r.m >= 0.5).length
  const lost = rs.filter(r => (r.kind === 'smell' && !r.blamed) || r.kind === 'blameFail').length
  const bad = rs.filter(r => r.slot && r.kind !== 'exitFill' && r.m < 0.5).length + lost
  return { n: Math.max(0, got - lost), got, lost, bad, smell: rs.filter(r => r.kind === 'smell').length }
}
function calcResult() {
  const per = [0, 1, 2].map(stageCount), n = per.reduce((a, p) => a + p.n, 0)
  const rank = D.ranks.find(r => n >= r.min), db = S.maxDb || 0
  const seen = []; for (const e of S.rode) if (!seen.includes(e.type)) seen.push(e.type)
  const vic = S.rode.slice().sort((a, b) => b.exposure - a.exposure)[0]
  const used = S.ruseLog.length, ok = S.ruseLog.filter(l => l.ok).length
  const cnt = {}; for (const l of S.ruseLog) cnt[l.k] = (cnt[l.k] || 0) + 1
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]
  return { n, rank, db, per, cmp: D.dbCmp.find(c => db < c.max) || D.dbCmp[D.dbCmp.length - 1], smell: S.smellBusts, used, ok, top, riders: seen, nRiders: S.rode.length, victim: vic && vic.exposure > 0.3 ? vic.type : null }
}
function toResult() {
  S.mode = 'result'; S.resT = 0; S.revealStep = 0; clearFx(); S.later = []; S.stop = null; S.door = 0
  S.result = calcResult()
  S.mood = S.result.n >= D.ranks[2].min ? 'proud' : 'shame'
  setStage('date'); P.root.position.set(0, 0, 0); P.root.rotation.y = 0
  for (const t of ['partner', 'dog', 'nose']) addPax(t, false)
  show('vResult'); fillResult(false); syncRuses()
  Snd.setTrack(null); Snd.sfx('drum')
}
function reachText(db) { const m = Math.pow(10, (db - 50) / 20); return m >= 1000 ? (Math.round(m / 100) / 10) + 'km' : Math.max(1, Math.round(m)) + 'm' }
const paxName = t => D.pax[t][S.lang]
function sxText(r) { const T = TT(); return [`${T.smellN} ${T.times.replace('{N}', r.smell)}`, `${T.ruseN} ${T.times.replace('{N}', r.used)}${r.used ? ' / ' + T.ruseOk.replace('{N}', r.ok) : ''}`] }
function paxText(r) {
  const T = TT(), sep = S.lang === 'ja' ? '・' : ', ', names = r.riders.slice(0, 4).map(paxName).join(sep) + (r.riders.length > 4 ? (S.lang === 'ja' ? 'ほか' : ' +more') : '')
  return [`${T.paxT}（${T.paxN.replace('{N}', r.nRiders)}）${names}`.replace('（', S.lang === 'ja' ? '（' : ' (').replace('）', S.lang === 'ja' ? '）' : ') '), `${T.victim}: ${r.victim ? paxName(r.victim) : T.victimNone}`]
}
function fillResult(keep) {
  const T = TT(), r = S.result, L = S.lang
  $('#rRank').textContent = r.rank.t[L]; $('#rRank').style.color = r.rank.col
  $('#rStamp').textContent = r.rank.st[L]; $('#rStamp').style.whiteSpace = 'pre'
  $('#rDbN').textContent = r.db ? r.db.toFixed(1) + ' dB' : '-'
  $('#rDbC').textContent = r.db ? `${r.cmp.t[L]} / ${T.reach.replace('{R}', reachText(r.db))}` : ''
  $('#rStages').innerHTML = r.per.map((p, i) => `<div>${T.stCol[i]}<b>${T.unitN.replace('{N}', p.n)}</b>${T.badOf.replace('{B}', p.bad)}</div>`).join('')
  const [a, b] = sxText(r); $('#rSx').innerHTML = `<span class="${r.smell ? 'bad' : ''}">${svg('nose')}${a}</span><span>${svg('trick')}${b}</span>`
  const [c, d] = paxText(r); $('#rPax').innerHTML = `<span>${c}</span><b>${d}</b>`
  $('#rCmt').textContent = r.rank.c[L] + (r.top ? ' ' + T.extra[r.top] : '')
  if (!keep) { $('#rPct').textContent = '0'; for (const el of document.querySelectorAll('#vResult .reveal')) el.classList.remove('on'); $('#rStamp').classList.remove('on') }
  if (!S.photo) drawNoPhoto()
}
function drawNoPhoto() { const c = $('#rPhoto').getContext('2d'); c.fillStyle = '#ffd9b3'; c.fillRect(0, 0, 256, 256) }
function updateReveal(dt) {
  S.resT += dt; const r = S.result, t = S.resT
  if (t < 1.6) $('#rPct').textContent = String(Math.floor(S.rand() * 30))
  else if (t < 2.6) $('#rPct').textContent = String(Math.round(r.n * ease((t - 1.6) / 1.0)))
  else $('#rPct').textContent = String(r.n)
  const step = (n, at, fn) => { if (S.revealStep < n && t >= at) { S.revealStep = n; fn() } }
  step(1, 2.6, () => { $('#rStamp').classList.add('on'); $('#rRank').classList.add('on'); Snd.sfx('stamp'); Snd.sfx(S.mood === 'proud' ? 'fanfare' : 'wahwah'); Snd.setTrack(S.mood === 'proud' ? 'happy' : 'sad'); S.shake = 0.03 })
  step(2, 3.2, () => { $('#rDb').classList.add('on'); $('#rSx').classList.add('on'); Snd.sfx('boom') })
  step(3, 3.7, () => { $('#rStages').classList.add('on'); $('#rPax').classList.add('on'); Snd.sfx('tap') })
  step(4, 4.1, () => { for (const id of ['#rMc', '#rBtns1', '#rBtns2']) $(id).classList.add('on') })
}
function finishReveal() { if (S.mode !== 'result') return; S.resT = Math.max(S.resT, 4.2); updateReveal(0) }

// ---------- 結果カード画像
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function fitText(c, s, maxW, size, font) { let f = size; c.font = `${f}px ${font}`; while (c.measureText(s).width > maxW && f > 14) { f -= 2; c.font = `${f}px ${font}` } return f }
function drawCard() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')
  const T = TT(), r = S.result, L = S.lang, disp = '"Dela Gothic One", "Hiragino Sans", sans-serif', round = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif'
  x.fillStyle = r.rank.col; x.fillRect(0, 0, W, H)
  x.fillStyle = 'rgba(255,255,255,.08)'; for (let i = -H; i < W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 30, 0); x.lineTo(i + 30 + H, H); x.lineTo(i + H, H); x.fill() }
  roundRect(x, 50, 50, W - 100, H - 100, 44); x.fillStyle = '#fff8ec'; x.fill(); x.lineWidth = 10; x.strokeStyle = '#1b1620'; x.stroke()
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#1b1620'
  fitText(x, T.cardTitle, W - 200, 70, disp); x.fillText(T.cardTitle, W / 2, 155)
  x.font = `30px ${disp}`; x.fillStyle = r.rank.col; x.fillText(T.cardSub, W / 2, 198)
  const ph = $('#rPhoto'), px = 110, py = 232, ps = 400
  x.save(); roundRect(x, px, py, ps, ps, 30); x.clip(); x.drawImage(ph, px, py, ps, ps); x.restore()
  roundRect(x, px, py, ps, ps, 30); x.lineWidth = 8; x.strokeStyle = '#1b1620'; x.stroke()
  x.save(); x.translate(px + 18, py + 78); x.rotate(-0.1); x.textAlign = 'left'; x.font = `60px ${disp}`; x.lineWidth = 14; x.strokeStyle = '#1b1620'; x.lineJoin = 'round'; x.strokeText(T.cardFx, 0, 0); x.fillStyle = '#ff3d2e'; x.fillText(T.cardFx, 0, 0); x.restore()
  x.fillStyle = '#1b1620'; x.font = `900 34px ${round}`; x.fillText(T.ninja, 760, 300)
  { let f = 180, nw, pw; const num = String(r.n)
    for (;;) { x.font = `${f}px ${disp}`; nw = x.measureText(num).width; x.font = `${f * 0.37}px ${disp}`; pw = x.measureText(T.unit).width; if (nw + pw + 8 <= 400 || f <= 80) break; f -= 6 }
    const sx = 765 - (nw + pw + 8) / 2; x.textAlign = 'left'; x.fillStyle = '#ff3d2e'; x.font = `${f}px ${disp}`; x.fillText(num, sx, 480); x.font = `${f * 0.37}px ${disp}`; x.fillText(T.unit, sx + nw + 8, 480); x.textAlign = 'center' }
  x.save(); x.translate(868, 575); x.rotate(-0.25); x.beginPath(); x.arc(0, 0, 86, 0, 7); x.fillStyle = 'rgba(255,248,236,.9)'; x.fill(); x.lineWidth = 10; x.strokeStyle = '#ff3d2e'; x.stroke(); x.fillStyle = '#ff3d2e'; x.textBaseline = 'middle'
  const sl = r.rank.st[L].split('\n'); x.font = `${sl.length > 1 ? 44 : 58}px ${disp}`; sl.forEach((s, i) => x.fillText(s, 0, (i - (sl.length - 1) / 2) * 48)); x.restore(); x.textBaseline = 'alphabetic'
  x.fillStyle = r.rank.col; fitText(x, r.rank.t[L], W - 200, 62, disp); x.fillText(r.rank.t[L], W / 2, 705)
  roundRect(x, 110, 735, W - 220, 190, 26); x.fillStyle = '#1b1620'; x.fill()
  x.fillStyle = '#ffd21f'; x.font = `900 30px ${round}`; x.fillText(T.maxDb, W / 2, 782)
  x.fillStyle = '#fff8ec'; x.font = `96px ${disp}`; x.fillText(r.db ? r.db.toFixed(1) + ' dB' : '-', W / 2, 874)
  const cmp = r.db ? `${r.cmp.t[L]} / ${T.reach.replace('{R}', reachText(r.db))}` : ''; fitText(x, cmp, W - 280, 28, round); x.font = x.font.replace(/^(\d+px)/, '900 $1'); x.fillText(cmp, W / 2, 912)
  // 匂いバレ・誤魔化し
  const sx = sxText(r)
  sx.forEach((s, i) => { const bw = (W - 240) / 2, bx = 110 + i * (bw + 20); roundRect(x, bx, 945, bw, 74, 18); x.fillStyle = i === 0 && r.smell ? '#ffe1dc' : '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1b1620'; x.stroke(); x.fillStyle = '#1b1620'; fitText(x, s, bw - 30, 32, round); x.font = x.font.replace(/^(\d+px)/, '900 $1'); x.fillText(s, bx + bw / 2, 993) })
  // 今日の乗客・被害者
  const [pa, pb] = paxText(r)
  x.fillStyle = '#1b1620'; fitText(x, pa, W - 240, 28, round); x.font = x.font.replace(/^(\d+px)/, '900 $1'); x.fillText(pa, W / 2, 1060)
  x.fillStyle = '#a8170d'; fitText(x, pb, W - 240, 32, disp); x.fillText(pb, W / 2, 1102)
  r.per.forEach((p, i) => {
    const bw = (W - 260) / 3, bx = 110 + i * (bw + 20), by = 1125
    roundRect(x, bx, by, bw, 100, 20); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1b1620'; x.stroke()
    x.fillStyle = '#1b1620'; x.font = `900 26px ${round}`; x.fillText(T.stCol[i], bx + bw / 2, by + 34); x.font = `44px ${disp}`; x.fillText(T.unitN.replace('{N}', p.n), bx + bw / 2, by + 84)
  })
  x.fillStyle = '#1b1620'; x.font = `900 28px ${round}`; x.fillText(T.cardFoot, W / 2, 1262)
  return c
}
function loadFonts(text) { if (!document.fonts || !document.fonts.load) return Promise.resolve(); return Promise.all(['"Dela Gothic One"', '900 10px "Zen Maru Gothic"'].map(f => document.fonts.load((f.includes('10px') ? f : '40px ' + f), text).catch(() => {}))) }
function cardText() { const T = TT(), r = S.result, L = S.lang; return [T.cardTitle, T.cardSub, T.cardFx, T.ninja, r.rank.t[L], r.rank.st[L], T.maxDb, r.cmp.t[L], T.reach, T.stCol.join(''), T.cardFoot, T.unit, T.unitN, ...sxText(r), ...paxText(r), '0123456789.%dBkm'].join('') }
async function cardURL() { await loadFonts(cardText()); return drawCard().toDataURL('image/png') }
const PUBLIC_URL = 'https://tom3games.github.io/sneeze-quiet/'
function shareText() { const r = S.result, T = TT(); return T.share.replace('{N}', r.n).replace('{R}', r.rank.t[S.lang]).replace('{D}', r.db.toFixed(1)).replace('{S}', r.smell).replace('{U}', r.used) }
function xPost() { const text = shareText(); return { text, url: PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PUBLIC_URL)}` } }
function openX() { if (!S.result) return; Snd.sfx('tap'); window.open(xPost().href, '_blank', 'noopener') }
async function saveCard() {
  Snd.sfx('tap'); await loadFonts(cardText())
  const c = drawCard(), blob = await new Promise(r => c.toBlob(r, 'image/png'))
  if (!blob) return
  try {
    const file = new File([blob], 'elevator-fart.png', { type: 'image/png' })
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: shareText() + ' ' + PUBLIC_URL }); return }
  } catch (e) { if (e && e.name === 'AbortError') return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'elevator-fart.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// ---------- 見た目の更新（毎フレーム）
const _c = new THREE.Color()
function updatePlayer(dt) {
  const t = S.time, sn = S.snz, hold = S.holding && S.mode === 'play'
  const itch = S.gauge, strain = hold ? S.strain : S.strain * 0.6, flush = S.flush
  let pitch = 0.12 * itch * (hold ? 0.5 : 1) + Math.sin(t * (3 + 6 * itch)) * 0.03 * itch
  let eyeOpen = (1 - 0.4 * itch) * (hold ? 1 - 0.85 * strain : 1), squeeze = hold && strain > 0.5
  let mx = 0.7 + 0.2 * itch, my = 0.3 + 0.6 * itch, lips = hold, smile = false, pupilS = 1
  let browA = hold ? strain * 0.45 : 0.25 * itch, browY = 0.02 * itch
  if (sn) {
    if (!sn.impact || sn.t < PRE) { pitch = lerp(pitch, 0.2, ease(sn.t / PRE)); squeeze = true; lips = true }
    else { const k = sn.t - PRE; squeeze = k < 0.35; eyeOpen = k < 0.35 ? 1 : 1.25; mx = 0.9; my = k < 0.5 ? 1.2 : 0.6; lips = false; pitch = k < 0.1 ? -0.15 : lerp(-0.15, 0, ease((k - 0.1) / 0.6)) }
  }
  if (!sn && S.relief > 0) { eyeOpen = 0.12; smile = true; browA = -0.1; my = 0 }
  if (!sn && S.shame > 0) { eyeOpen = 1.3; pupilS = 0.5; squeeze = false; mx = 0.5; my = 0.55; browA = -0.4; browY = 0.04 }
  if (S.mode === 'result') {
    if (S.mood === 'proud') { eyeOpen = 0.15; smile = true; browA = 0.15; pitch = -0.12; my = 0 } else { eyeOpen = 1.25; pupilS = 0.5; mx = 0.5; my = 0.5; browA = -0.4 }
    squeeze = false; lips = false
  }
  P.pivot.rotation.x = lerp(P.pivot.rotation.x, pitch, sn ? 0.6 : 0.2)
  // おならの瞬間に体がはねる・おしりが震える
  const hop = S.hop, hk = Math.sin(hop * Math.PI)
  if (!S.exiting) P.root.position.y = Math.max(0, hk * 0.09 * (hop > 0 ? 1 : 0))
  P.hips.position.x = Math.sin(t * 60) * 0.012 * hop
  P.torso.rotation.z = Math.sin(t * 40) * 0.05 * hop
  const knock = hold ? strain * 0.25 : 0
  P.hips.children[0].rotation.z = knock; P.hips.children[2].rotation.z = -knock // 内股で耐える
  const trem = hold ? strain * strain * 0.012 : 0
  P.head.position.set((Math.random() - 0.5) * trem, 0.24 + (Math.random() - 0.5) * trem, 0)
  P.head.rotation.z = Math.sin(t * 2.1) * 0.03 + (S.mode === 'result' && S.mood === 'proud' ? 0.12 : 0)
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1
    P.eyes[i].visible = !squeeze; P.squint[i].visible = squeeze
    P.eyes[i].scale.set(1, clamp(eyeOpen, 0.08, 1.4), 1)
    P.pupils[i].scale.set(0.03 * pupilS, 0.033 * pupilS, 0.014)
    P.brows[i].rotation.z = s * browA; P.brows[i].position.y = 0.14 + browY
    const puff = 1 + (hold ? 0.9 * strain : 0)
    P.cheeks[i].scale.set(0.052 * puff, 0.034 * puff, 0.016 * puff)
    P.cheeks[i].material.color.setHex(flush > 0.3 || S.shame > 0 ? 0xff4a4a : 0xff9a9a); P.cheeks[i].material.opacity = 0.45 + 0.5 * Math.max(flush, S.shame > 0 ? 0.8 : 0)
    P.drops[i].visible = flush > 0.45 || S.shame > 0; P.drops[i].position.y = 0.1 - ((t * 0.5 + i * 0.5) % 1) * 0.16
    P.arms[i].rotation.x = hold ? -0.35 * strain : 0 // 我慢中はおなかを押さえる
    P.arms[i].rotation.z = s * (hold ? 0.1 + 0.25 * strain : 0.1)
  }
  P.mouth.visible = !lips && !smile && my > 0.05; P.lips.visible = lips; P.smile.visible = smile
  P.mouth.scale.set(0.06 * mx, 0.03 * my, 0.02)
  P.lips.scale.set(0.11 * (1 + 0.25 * strain), 0.018, 0.02)
  const fk = Math.pow(flush, 1.2)
  _c.lerpColors(SKIN, RED, fk); if (flush > 0.85) _c.lerp(GREEN, (flush - 0.85) / 0.15 * (0.5 + 0.5 * Math.sin(t * 20)) * 0.5)
  P.skin.color.copy(_c)
  P.vein.visible = flush > 0.7; P.vein.scale.setScalar(1 + 0.3 * Math.sin(t * 16))
  P.ahoge.rotation.z = Math.sin(t * 9) * 0.25 * (0.3 + itch)
}
function updateNPCs(dt) {
  const hp = P.head.getWorldPosition(new THREE.Vector3())
  const act = S.evs.find(e => (e.ph === 'warn' && e.k > 0.55) || e.ph === 'peak' || (e.ph === 'tail' && e.k < 0.6))
  for (const p of S.pax) {
    const n = p.n; n.phase += dt
    if (n.reactT !== undefined && n.reactT >= 0) {
      n.reactT -= dt
      if (n.reactT < 0) { n.reacting = n.reactUntil; npcMark(n, n.reactKind); n.reactT = undefined; n.tEye = n.reactKind === '!' ? 1.6 : 1.2 }
    }
    if (p.state !== 'idle') { npcIdle(n) }
    else if (n.reacting > 0) { n.reacting -= dt; if (n.lookP) npcLook(n, n.lookP, 1); else npcLook(n, hp, n.reactKind === '!' ? 1 : 0.6); if (n.reacting <= 0) { n.lookP = null; npcIdle(n) } }
    else if (n.sniffT > 0) { n.sniffT -= dt; n.tYaw = Math.sin(n.phase * 2.2) * 0.7; n.tPitch = -0.25 + Math.sin(n.phase * 18) * 0.06; n.tEye = 0.8 }
    else if (act && S.mode === 'play' && act.src !== p) { npcLook(n, lookAtOf(act), 0.9); n.tEye = act.ph === 'peak' ? 1.25 : 1 }
    else if (S.mode === 'play' && S.sniff > 0.4 && Math.sin(n.phase * 0.9 + p.slot) > 0.4) { n.tYaw = Math.sin(n.phase * 1.7) * 0.8; n.tPitch = -0.1; n.tEye = 1 } // キョロキョロ
    else npcIdle(n)
    if (S.mode === 'result' && S.mood === 'shame') { npcLook(n, hp, 0.8); n.tEye = 1.3 }
    const sp = n.reacting > 0 ? 14 : 6
    n.yaw += (n.tYaw - n.yaw) * Math.min(1, dt * sp); n.pitch += (n.tPitch - n.pitch) * Math.min(1, dt * sp); n.eye += (n.tEye - n.eye) * Math.min(1, dt * 10)
    // 音の主の動き
    const ev = S.evs.find(e => e.src === p && (e.ph === 'warn' || e.ph === 'peak' || e.ph === 'tail'))
    let roll = 0, extraPitch = 0, bounce = n.bounce ? Math.abs(Math.sin(S.time * 12 + n.phase)) * 0.04 * n.bounce : 0
    if (ev) {
      const pk = ev.ph === 'peak' ? 1 : ev.ph === 'warn' ? ev.k * 0.4 : 0.3
      if (ev.type === 'laugh') { extraPitch = ev.ph === 'peak' ? -0.45 + Math.sin(S.time * 30) * 0.08 : 0; roll = 0 }
      if (ev.type === 'giggle' || ev.type === 'phone') roll = Math.sin(S.time * 40) * 0.08 * pk
      if (ev.type === 'music') { extraPitch = Math.sin(S.time * 16) * 0.2 * (0.3 + pk); bounce += Math.abs(Math.sin(S.time * 16)) * 0.04 * pk }
      if (ev.type === 'baby' && n.babyHead) n.babyHead.rotation.z = Math.sin(S.time * 30) * 0.3 * pk
      if (ev.type === 'bark' && n.dogG) { n.dogG.position.y = Math.abs(Math.sin(S.time * 18)) * 0.06 * pk; n.dogHead.rotation.x = -0.3 * pk }
    } else { if (n.babyHead) n.babyHead.rotation.z = Math.sin(n.phase) * 0.1; if (n.dogG) { n.dogG.position.y = 0; n.dogHead.rotation.x = 0 } }
    if (n.type === 'headphone' && !ev) extraPitch = Math.sin(S.time * 9) * 0.08
    if (n.dogTail) n.dogTail.rotation.y = Math.sin(S.time * 14) * 0.6
    if (n.boxes) { const fall = ev && ev.type === 'cart' && ev.ph !== 'warn'; n.boxes.forEach((b, i) => { if (fall) { b.rotation.z = lerp(b.rotation.z, (i % 2 ? 1 : -1) * (0.4 + i * 0.3), 0.2); b.position.x = lerp(b.position.x, (i % 2 ? 1 : -1) * 0.12 * i, 0.2) } else if (ev && ev.ph === 'warn') b.rotation.z = Math.sin(S.time * 10 + i) * 0.08 * ev.k * i; else { b.rotation.z *= 0.9; b.position.x *= 0.9 } }) }
    if (n.aura) n.aura.forEach((sp, i) => { const a = n.phase * 0.8 + i; sp.position.set(Math.cos(a) * 0.32, n.seat + 0.2 + ((n.phase * 0.3 + i / 6) % 1) * 0.7, Math.sin(a) * 0.25); sp.material.opacity = 0.6 * Math.sin(((n.phase * 0.3 + i / 6) % 1) * Math.PI) })
    n.pivot.rotation.set(n.pitch + extraPitch + Math.sin(n.phase * 1.3) * 0.02, n.yaw * 0.75, roll); n.body.rotation.y = n.yaw * 0.25
    n.g.position.y = bounce
    for (const e of n.eyes) e.scale.setScalar(n.eye)
    for (const q of n.pupils) q.scale.set(0.022 / Math.max(1, n.eye * 0.9), 0.024 / Math.max(1, n.eye * 0.9), 0.01)
    n.mouth.scale.set(0.06 * (n.eye > 1.3 ? 0.5 : 1), 0.014 * (n.eye > 1.3 ? 3 : ev && ev.ph === 'peak' ? 4 : 1), 0.012)
    if (n.markT >= 0) { n.markT += dt; const k = n.markT, s = k < 0.12 ? k / 0.12 * 0.42 : k < 0.2 ? 0.42 - (k - 0.12) * 1.2 : k < 1.6 ? 0.32 : Math.max(0, 0.32 - (k - 1.6) * 1.5); n.mark.scale.setScalar(s / n.g.scale.x); if (s <= 0 && k > 1.6) n.markT = -1 }
  }
}
function updateFlyers(dt) {
  for (const f of flyers) {
    f.t += dt; if (f.rest) continue
    f.v.y -= 9.8 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.av.x * dt; f.m.rotation.y += f.av.y * dt; f.m.rotation.z += f.av.z * dt
    if (f.m.position.z > CAR.zf - 0.2) { f.m.position.z = CAR.zf - 0.2; f.v.z *= -0.4 }
    if (Math.abs(f.m.position.x) > CAR.x - 0.1) { f.m.position.x = Math.sign(f.m.position.x) * (CAR.x - 0.1); f.v.x *= -0.4 }
    if (f.m.position.y < f.floor) { f.m.position.y = f.floor; f.v.y *= -0.35; f.v.x *= 0.6; f.v.z *= 0.6; f.av.multiplyScalar(0.5); if (Math.abs(f.v.y) < 0.4) f.rest = true }
  }
  if (P.glasses.parent !== P.head && S.shame <= 0.15 && S.mode !== 'result') { const i = flyers.findIndex(f => f.m === P.glasses); if (i >= 0) flyers.splice(i, 1); reattachGlasses(); if (S.mode === 'play') Snd.sfx('pop') }
  // ガスの煙
  const m4 = new THREE.Matrix4(); let n = 0
  for (let i = puffP.length - 1; i >= 0; i--) {
    const p = puffP[i]; p.t += dt; if (p.t > p.life) { puffP.splice(i, 1); continue }
    p.v.multiplyScalar(1 - 1.6 * dt); p.v.y += 0.25 * dt; p.p.addScaledVector(p.v, dt); p.s *= 1 + p.g * dt
    const sc = p.s * Math.min(1, (p.life - p.t) / 0.5); m4.makeScale(sc, sc, sc); m4.setPosition(p.p); puffs.setMatrixAt(n++, m4)
  }
  puffs.count = n; puffs.instanceMatrix.needsUpdate = true
  // 匂いのもやもや
  const sm = Math.min(1, S.smell)
  for (const s of stinks) {
    const a = s.a + S.time * 0.3, r = (s.r + 0.6 * sm), y = 0.6 + ((S.time * 0.25 + s.ph) % 1) * 1.3
    s.sp.position.set(P.root.position.x + Math.cos(a) * r, y, P.root.position.z + Math.sin(a) * r * 0.8 - 0.3)
    s.sp.material.opacity = clamp(sm * 1.1 - 0.1, 0, 0.85) * Math.sin(((S.time * 0.25 + s.ph) % 1) * Math.PI)
  }
  cloud.scale.setScalar(0.5 + 0.9 * sm); cloud.material.opacity = 0.16 * sm; cloud.position.x = P.root.position.x
  // ドアからの風
  for (const w of winds) { w.z -= dt * 6; if (w.z < CAR.zb + 0.3) w.z = CAR.zf - 0.1; w.m.position.set(w.x, w.y, w.z); w.m.material.opacity = 0.5 * S.door }
}
// カメラ（縦画面と横画面で寄り方を変える）
const camBase = { d: 1.7, fov: 46, ly: 0.12, lx: 0, h: 0.12, x: 0.32 }
function frameCamera() {
  const a = innerWidth / innerHeight
  if (a < 0.62) Object.assign(camBase, { d: 3.1, fov: 60, ly: -0.28, lx: -0.05, h: 0.32, x: 0.45 })
  else if (a < 1) Object.assign(camBase, { d: 3.0, fov: 54, ly: -0.22, lx: -0.04, h: 0.3, x: 0.45 })
  else if (a < 1.9) Object.assign(camBase, { d: 2.9, fov: 48, ly: -0.1, lx: 0.35, h: 0.18, x: 0.45 })
  else Object.assign(camBase, { d: 2.8, fov: 46, ly: -0.1, lx: 0.45, h: 0.16, x: 0.5 })
  camera.fov = camBase.fov; camera.aspect = a; camera.updateProjectionMatrix()
}
const _hc = new THREE.Vector3(), _look = new THREE.Vector3()
function updateCamera(dt) {
  const hy = 1.62
  let d = camBase.d, ox = camBase.x, oy = camBase.h, lx = camBase.lx, ly = camBase.ly
  if (S.mode === 'title' || S.mode === 'how') { ox += Math.sin(S.time * 0.3) * 0.12; d += 0.1 }
  if (S.mode === 'result') { d *= S.mood === 'shame' ? 1.1 : 0.85; lx -= 0.05; ly += innerWidth / innerHeight < 1 ? 0.2 : 0.05 }
  if (S.punch >= 0) {
    S.punch += dt; const k = S.punch
    const z = k < 0.2 ? lerp(1, 0.72, ease(k / 0.2)) : k < 0.55 ? 0.72 : k < 0.95 ? lerp(0.72, 1.1, ease((k - 0.55) / 0.4)) : k < 2.0 ? 1.1 : lerp(1.1, 1, ease((k - 2.0) / 0.6))
    d *= z; oy += (z - 1) * 0.3
    if (k > 2.6) S.punch = -1
  }
  d = Math.min(d, CAR.zf - 0.15)
  const sh = S.shake + (S.level > 0.9 ? 0.008 : 0) + (S.flicker || 0) * 0.01
  _hc.set(ox + (Math.random() - 0.5) * sh, hy + oy + (Math.random() - 0.5) * sh, d)
  camera.position.lerp(_hc, S.punch >= 0 ? 0.35 : Math.min(1, dt * 6))
  _look.set(lx, hy + ly - 0.05, 0); camera.lookAt(_look)
}
let winT = 0, indT = 0
function updateScene(dt) {
  // 揺れの予告で明かりがちらつく・チャイムの前に到着ランプ
  const sk = activeEv('shake'); S.flicker = sk && sk.ph === 'warn' ? (Math.sin(S.time * 37) > 0.6 ? sk.k : 0) : sk && sk.ph === 'peak' ? 1 : 0
  hemi.intensity = 1.9 - 0.9 * (S.flicker || 0); sun.intensity = 1.3 - 0.6 * (S.flicker || 0)
  evLight.color.setHex(0xfff2c0); evLight.position.set(0, 1.6, CAR.zf - 0.3); evLight.intensity = S.door * 2.2
  const ch = activeEv('chime'), blink = ch && ch.ph === 'warn' && ch.k > 0.25 && Math.floor(S.time * 6) % 2 === 0
  lamp.material.color.setHex(ch && (ch.ph === 'warn' || ch.ph === 'peak') ? 0xffa020 : 0x553311)
  car.rotation.z = sk && sk.ph === 'peak' ? Math.sin(S.time * 50) * 0.01 : 0
  winT += dt; indT += dt
  if (winT > 1 / 30) { winT = 0; const { ctx, c } = mirTex.userData; paintMirror(ctx, c.width, c.height); mirTex.needsUpdate = true }
  if (indT > 1 / 12) { indT = 0; drawInd(blink) }
  updatePlayer(dt); updateNPCs(dt); updateFlyers(dt); updateCamera(dt)
}

// ---------- HUD
const hud = { z1: $('#nBar .zone'), z2: $('#nBar .zone2'), time: $('#hTime'), nBar: $('#nBar'), nI: $('#nBar i'), ev: $('#hEv'), cov: $('#hCov'), gI: $('#gItch i'), gS: $('#gStrain i'), gSb: $('#gStrain'), gM: $('#gSmell i'), gN: $('#gSniff i'), gNb: $('#gSniff'), hold: $('#bHold'), holdLab: $('#holdLab') }
let lastEvKey = '', lastCov = ''
function updateHud() {
  if (S.mode !== 'play' && S.mode !== 'count' && S.mode !== 'intro' && S.mode !== 'stageEnd') return
  hud.time.textContent = Math.max(0, Math.ceil(D.STAGE_LEN - S.st)) + (S.lang === 'ja' ? '秒' : 's')
  const q = quietOf(); hud.nI.style.width = (S.level * 100).toFixed(1) + '%'; hud.nBar.classList.toggle('mask', S.level + q >= 0.625)
  hud.z1.style.left = (clamp(0.625 - q, 0, 1) * 100).toFixed(1) + '%'; hud.z2.style.left = (clamp(0.845 - q, 0, 1) * 100).toFixed(1) + '%'
  const e = S.evs.find(e => e.ph === 'warn' || e.ph === 'peak' || e.ph === 'tail'), key = e ? e.type + e.ph : ''
  if (key !== lastEvKey) { lastEvKey = key; hud.ev.innerHTML = e && e.type !== 'roster' ? svg(e.type) + `<span>${D.ev[e.type][S.lang]}</span>` : ''; hud.ev.classList.toggle('hot', !!e && e.ph === 'peak') }
  const T = TT(), cv = coverNow(), cs = S.mode !== 'play' ? '' : cv.door ? `air|${T.covAir}` : cv.who ? `cover|${T.covPax.replace('{N}', paxName(cv.who.type))}` : !aboard().length && S.pax.length === 0 ? `pax|${T.alone}` : ''
  if (cs !== lastCov) { lastCov = cs; const [ic, tx] = cs.split('|'); hud.cov.innerHTML = cs ? `${svg(ic)}<span>${tx}</span>` : ''; hud.cov.classList.toggle('on', !!cs) }
  hud.gI.style.width = (S.gauge * 100).toFixed(1) + '%'; hud.gS.style.width = (S.strain * 100).toFixed(1) + '%'; hud.gSb.classList.toggle('danger', S.strain > 0.8)
  hud.gM.style.width = (Math.min(1, S.smell) * 100).toFixed(1) + '%'; hud.gN.style.width = (S.sniff * 100).toFixed(1) + '%'; hud.gNb.classList.toggle('danger', S.sniff > 0.7)
  hud.hold.classList.toggle('on', S.holding); const hl = S.holding ? T.holdOn : T.holdOff; if (hud.holdLab.textContent !== hl) hud.holdLab.textContent = hl
  for (const k of RUSES) { const b = $('#r_' + k), dis = !canRuse(k); if (b.disabled !== dis) b.disabled = dis }
}

// ---------- ループ（固定60Hz。performance.now で数える）
let acc = 0, last = performance.now(), frames = 0, fpsT = last
function step() { updateGame(STEP); updateScene(STEP); updateFx(STEP); if (S.doCap) render() }
function render() {
  renderer.render(scene, camera)
  if (S.doCap) { S.doCap = false; capture() }
}
function capture() {
  const p = P.head.getWorldPosition(new THREE.Vector3()); p.y -= 0.04
  const s = toScreen(p), top = toScreen(p.clone().add(new THREE.Vector3(0, 0.36, 0)))
  const r = Math.abs(s.y - top.y) * 1.25, sx = canvas.width / innerWidth
  const pc = $('#rPhoto').getContext('2d')
  try { pc.fillStyle = '#2a2233'; pc.fillRect(0, 0, 256, 256); pc.drawImage(canvas, (s.x - r) * sx, (s.y - r) * sx, 2 * r * sx, 2 * r * sx, 0, 0, 256, 256); S.photo = true } catch (e) {}
}
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now(); let dt = (now - last) / 1000; last = now
  if (dt > 0.25) dt = 0.25
  if (!S.dbgPause) { acc += dt; let n = 0; while (acc >= STEP && n < 8) { step(); acc -= STEP; n++ } if (n >= 8) acc = 0 }
  updateHud(); render(); Snd.tick()
  frames++; if (now - fpsT >= 1000) { S.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now }
}

// ---------- 入力（長押しの指と、誤魔化しボタンの指を分ける）
const vPlay = $('#vPlay')
let ptrDown = null, keyDown = false
vPlay.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.preventDefault(); if (ptrDown !== null) return; ptrDown = e.pointerId; press() })
const ptrUp = e => { if (ptrDown === null || e.pointerId !== ptrDown) return; ptrDown = null; release() }
window.addEventListener('pointerup', ptrUp); window.addEventListener('pointercancel', ptrUp)
window.addEventListener('keydown', e => {
  if (e.repeat) return
  if (e.code === 'Space' || e.code === 'Enter') {
    if (S.mode === 'play' || S.mode === 'count' || (S.mode === 'intro')) { e.preventDefault(); if (S.mode === 'intro') beginCount(); else { keyDown = true; press() } }
  }
  const map = { Digit1: 'cough', Digit2: 'blame', Digit3: 'say', Digit4: 'exit' }; if (map[e.code] && S.mode === 'play') useRuse(map[e.code])
})
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { keyDown = false; if (S.mode === 'play' || S.mode === 'count') { e.preventDefault(); release() } } })
for (const k of RUSES) $('#r_' + k).addEventListener('click', e => { e.stopPropagation(); useRuse(k) })
$('#bStart').onclick = () => { Snd.init(); Snd.sfx('tap'); startRun() }
$('#bHow').onclick = () => { Snd.init(); Snd.sfx('tap'); S.mode = 'how'; show('vHow') }
$('#bHowBack').onclick = () => { Snd.sfx('tap'); S.mode = 'title'; show('vTitle') }
$('#bGo').onclick = () => beginCount()
$('#bAgain').onclick = () => { Snd.sfx('tap'); startRun() }
$('#bSave').onclick = () => saveCard()
$('#bX').onclick = () => openX()
$('#bTitle').onclick = () => toTitle()
$('#vResult').addEventListener('pointerdown', e => { if (!e.target.closest('button')) finishReveal() })
$('#bLang').onclick = () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('hs.lang', S.lang); applyLang(); Snd.sfx('tap') }
$('#bMute').onclick = () => { Snd.init(); Snd.setMute(!Snd.muted); syncMute() }
function syncMute() { $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted }
function titleScene() { setStage('morning'); for (const t of ['coworker', 'madam', 'dog', 'headphone', 'bucho', 'nose']) addPax(t, false); P.root.position.set(0, 0, 0); P.root.rotation.y = 0 }
function toTitle() { Snd.sfx('tap'); S.mode = 'title'; S.later = []; clearFx(); S.evs = []; S.level = 0; S.stop = null; S.door = 0; S.exiting = false; titleScene(); show('vTitle'); Snd.setTrack('title'); syncRuses() }
document.addEventListener('visibilitychange', () => { if (!Snd.ctx) return; if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume() })
document.addEventListener('pointerdown', () => { if (!Snd.ctx) { Snd.init(); if (S.mode === 'title' || S.mode === 'how') Snd.setTrack('title') } }, { capture: true })
function resize() { renderer.setSize(innerWidth, innerHeight, false); frameCamera() }
window.addEventListener('resize', resize)

// ---------- 起動
resize(); applyLang(); syncMute(); titleScene(); syncRuses(); Snd.want = 'title'
for (let i = 0; i < 30; i++) step()
camera.position.copy(_hc)
loop()
loadFonts('!?').then(() => { TEX_EX = exTex('!', '#ff3d2e'); TEX_Q = exTex('?', '#ffd21f') })

window.hs = {
  S, D, Snd, P, camera, renderer, SLOTS, CAR,
  start: startRun, startStage, beginCount, press, release, toResult, finishReveal, toTitle, drawCard, xPost, openX, useRuse, smellBust, calcResult,
  level: () => S.level, mask: maskOf, quiet: quietOf, aboard, sniffMult, coverNow,
  cardDataURL: cardURL,
  setLang(l) { S.lang = l; applyLang() },
  dbg: {
    pause(b = true) { S.dbgPause = b; acc = 0; last = performance.now() },
    step(n = 1) { for (let i = 0; i < n; i++) step(); updateHud() },
    render() { updateHud(); render() },
    seed(n) { S.seed = n; S.rand = mulberry(n) },
    set(o) { Object.assign(S, o) },
    toPeak(i, off = 0.15) { const e = S.evs[i]; while (S.mode === 'play' && S.st < e.at + off) step(); updateHud() },
    addPax: (t, b) => addPax(t, b), clearPax,
    // 乗客の立ち位置（ワールド座標）。犬・台車も含める
    layout() {
      const v = new THREE.Vector3(), out = [{ k: 'player', x: P.root.position.x, z: P.root.position.z, r: 0.28 }]
      for (const p of S.pax) { if (p.state !== 'idle') continue; p.n.g.getWorldPosition(v); out.push({ k: p.type, x: v.x, z: v.z, r: 0.27 }); if (p.n.dogG) { p.n.dogG.getWorldPosition(v); out.push({ k: 'dog-animal', x: v.x, z: v.z, r: 0.15 }) } if (p.n.cartG) { p.n.cartG.getWorldPosition(v); out.push({ k: 'cart', x: v.x, z: v.z, r: 0.2 }) } }
      return out
    },
  },
}
window.__hsReady = true
