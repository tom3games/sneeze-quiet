// くしゃみ我慢選手権 / HOLD THAT SNEEZE
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

// ---------- 状態
const S = {
  lang: store.get('hs.lang') || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  mode: 'title', time: 0, seed: (Date.now() & 0xffffff) || 1, rand: null,
  stageIdx: 0, st: 0, modeT: 0, evs: [], level: 0,
  gauge: 0, strain: 0, flush: 0, holding: false, downAt: 0, toggled: false, ignoreUp: false, everHeld: false,
  snz: null, react: 0, relief: 0, shame: 0, haStep: 0, humT: 0, shake: 0, punch: -1,
  later: [], rec: [], maxDb: 0, photo: false, capT: -1, doCap: false,
  dbgPause: false, fps: 0, resT: 0, result: null, mood: '',
}
S.rand = mulberry(S.seed)
const TT = () => D.T[S.lang]

// ---------- 音（WebAudio だけで鳴らす）
const Snd = {
  ctx: null, muted: store.get('hs.mute') === '1', next: 0, step: 0, track: null, want: null, switchAt: 0, played: {},
  TEMPO: { title: 116, quiet: 60, happy: 132, sad: 70 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8
      this.an = c.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(c.destination)
      this.bgm = c.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      this.bgmDuck = 1
      // 静寂に響くエコー
      this.echo = c.createGain(); const dl = c.createDelay(1); dl.delayTime.value = 0.24; const fb = c.createGain(); fb.gain.value = 0.45
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; const wet = c.createGain(); wet.gain.value = 0.55
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
  // 予告→最大→余韻の形で大きくなる音（ノイズ）
  swell(t0, w, p, tail, vol, f1, f2, type = 'lowpass', q = 1) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q
    f.frequency.setValueAtTime(f1, t0); f.frequency.exponentialRampToValueAtTime(f2, t0 + w + 0.05)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.28, t0 + w); g.gain.exponentialRampToValueAtTime(vol, t0 + w + 0.06)
    g.gain.setValueAtTime(vol, t0 + w + p); g.gain.exponentialRampToValueAtTime(0.0001, t0 + w + p + tail)
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + w + p + tail + 0.05)
  },
  swellTone(fa, fb, t0, w, p, tail, vol, type = 'sine') {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(fa, t0); o.frequency.exponentialRampToValueAtTime(fb, t0 + w + p)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.3, t0 + w); g.gain.exponentialRampToValueAtTime(vol, t0 + w + 0.06)
    g.gain.setValueAtTime(vol, t0 + w + p); g.gain.exponentialRampToValueAtTime(0.0001, t0 + w + p + tail)
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + w + p + tail + 0.05)
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
  vol() { return this.track === 'quiet' ? 0.5 : 0.26 },
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
  // プレイ: 静けさ（時計の音と低い持続音だけ）
  p_quiet(i, t) {
    const s = i % 16
    if (s % 4 === 0) this.tone(s % 8 ? 2600 : 3100, t, 0.02, 'square', 0.035, this.bgm)
    if (s === 0 && (Math.floor(i / 16) % 2 === 0)) { this.tone(this.mtof(36), t, 4, 'sine', 0.05, this.bgm); this.tone(this.mtof(43), t, 4, 'sine', 0.025, this.bgm) }
  },
  // 結果（よい）: はずむ
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
  // くしゃみ（声）
  sneezeHa(v = 1) { if (!this.ctx) return; const t = this.now(); this.mark('ha'); this.noise(t, 0.2, 0.3 * v, 1300, 'bandpass', null, 2); this.tone(260, t, 0.2, 'sawtooth', 0.05 * v, null, 380) },
  sneezeShon(v, echo, big) {
    if (!this.ctx) return; const t = this.now(); this.mark('sneeze'); if (echo) this.mark('echo')
    const outs = echo ? [this.master, this.echo] : [this.master]
    for (const o of outs) {
      this.noise(t, 0.05, 0.5 * v, 3200, 'bandpass', o, 3)
      this.noise(t + 0.03, 0.3, 0.6 * v, 4200, 'highpass', o)
      this.tone(big ? 165 : 205, t + 0.12, 0.55, 'sawtooth', 0.16 * v, o, big ? 105 : 140)
      this.tone(big ? 330 : 410, t + 0.12, 0.5, 'square', 0.045 * v, o, big ? 190 : 250)
      if (big) this.tone(620, t + 0.5, 0.4, 'triangle', 0.08 * v, o, 300)
    }
    this.noise(t + 1.0, 0.16, 0.07 * v, 2600, 'bandpass', null, 2)
  },
  event(type, w, p, fake) {
    if (!this.ctx) return; const t = this.now() + 0.01; this.mark('ev:' + type)
    const R = Math.random
    if (fake) { this.mark('fake:' + type); return this.fakeEvent(type, t, w) }
    switch (type) {
      case 'train':
        this.swell(t, w, p, TAIL + 0.3, 0.75, 180, 900, 'lowpass', 0.8)
        for (let k = t + w; k < t + w + p + 0.4; k += 0.21) { this.noise(k, 0.05, 0.3, 1600, 'bandpass', null, 2); this.noise(k + 0.08, 0.05, 0.25, 1300, 'bandpass', null, 2) }
        this.tone(440, t + w - 0.25, 0.9, 'sawtooth', 0.07, null, 430); this.tone(554, t + w - 0.25, 0.9, 'sawtooth', 0.06, null, 545)
        break
      case 'phone': case 'proctor': {
        const n = Math.floor(w / 0.42)
        for (let k = 0; k < n; k++) this.tone(110, t + k * 0.42, 0.24, 'square', 0.015 + 0.05 * k / n)
        const mel = type === 'phone' ? [84, 88, 91, 96, 91, 88] : [79, 83, 86, 91, 86, 83, 79, 74]
        const dt = type === 'phone' ? 0.075 : 0.11
        for (let k = 0; t + w + k * dt < t + w + p + 0.25; k++) this.tone(this.mtof(mel[k % mel.length]), t + w + k * dt, dt * 0.9, 'square', 0.13)
        break
      }
      case 'applause': {
        for (let k = 0; k < 14; k++) { const q = Math.sqrt(R()); this.noise(t + q * w, 0.03, 0.03 + 0.08 * q, 1600 + R() * 1800, 'bandpass', null, 0.8) }
        for (let k = 0; k < 150; k++) this.noise(t + w + R() * (p + 0.5), 0.03, 0.14, 1400 + R() * 2400, 'bandpass', null, 0.8)
        this.swell(t + w * 0.6, w * 0.4, p, TAIL, 0.25, 900, 1300, 'bandpass', 0.7)
        break
      }
      case 'gong': {
        this.swell(t, w, 0.02, 0.1, 0.12, 700, 2400, 'bandpass', 1.5)
        const s = t + w
        for (const [r, a] of [[1, 0.5], [2.76, 0.22], [5.4, 0.1], [8.93, 0.05]]) this.tone(185 * r, s, 3.6 / Math.sqrt(r), 'sine', a)
        this.noise(s, 0.08, 0.3, 2000, 'bandpass', null, 1)
        break
      }
      case 'thunder': {
        this.swell(t, w, 0.01, 0.2, 0.14, 90, 160, 'lowpass', 0.7)
        const s = t + w
        this.noise(s, 0.45, 0.8, 1400, 'highpass'); this.noise(s + 0.05, p + 1.8, 0.9, 220, 'lowpass')
        this.tone(55, s, p + 1.4, 'sine', 0.6, null, 32)
        break
      }
      case 'siren': {
        const end = t + w + p + TAIL
        for (let k = 0; t + k * 0.5 < end; k++) {
          const tk = t + k * 0.5, rel = tk - t
          const L = rel < w ? 0.1 + 0.4 * (rel / w) ** 2 : rel < w + p ? 1 : Math.max(0.05, 1 - (rel - w - p) / TAIL)
          const dop = rel < w + p * 0.6 ? 1.04 : 0.93
          this.tone((k % 2 ? 770 : 960) * dop, tk, 0.48, 'square', 0.015 + 0.11 * L)
        }
        break
      }
      case 'plane':
        this.swell(t, w, p, TAIL + 0.4, 0.7, 300, 1400, 'bandpass', 0.6)
        this.swellTone(2300, 3300, t, w, p, TAIL + 0.3, 0.035)
        break
      case 'cheer': {
        this.swell(t, w, 0.01, 0.1, 0.12, 400, 700, 'bandpass', 0.6)
        const s = t + w
        this.tone(2200, s, 0.5, 'sine', 0.4); this.tone(3350, s, 0.35, 'sine', 0.2); this.noise(s, 0.04, 0.5, 3000, 'bandpass', null, 2)
        this.swell(s + 0.05, 0.1, p, TAIL + 0.4, 0.55, 800, 1200, 'bandpass', 0.6)
        for (let k = 0; k < 90; k++) this.noise(s + 0.2 + R() * (p + 0.4), 0.03, 0.1, 1500 + R() * 2000, 'bandpass', null, 0.8)
        break
      }
    }
  },
  // 予告だけして来ない音
  fakeEvent(type, t, w) {
    switch (type) {
      case 'thunder': this.swell(t, w, 0.01, 0.5, 0.14, 90, 160, 'lowpass', 0.7); break
      case 'siren': for (let k = 0; t + k * 0.5 < t + w + 0.8; k++) { const rel = k * 0.5, L = rel < w ? 0.1 + 0.35 * (rel / w) ** 2 : 0.3 * (1 - (rel - w) / 0.8); this.tone((k % 2 ? 770 : 960) * (rel < w ? 1.03 : 0.9), t + rel, 0.48, 'square', 0.01 + 0.1 * Math.max(0, L)) } break
      case 'phone': case 'proctor': { const n = Math.floor(w / 0.42); for (let k = 0; k < n; k++) this.tone(110, t + k * 0.42, 0.24, 'square', 0.015 + 0.05 * k / n); this.tone(this.mtof(type === 'phone' ? 84 : 79), t + w, 0.09, 'square', 0.1); break }
      case 'cheer': this.swell(t, w, 0.01, 0.4, 0.14, 400, 700, 'bandpass', 0.6); break
      case 'train': this.swell(t, w, 0.01, 0.6, 0.3, 180, 500, 'lowpass', 0.8); this.tone(900, t + w, 0.5, 'sawtooth', 0.04, null, 700); break
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
      case 'shh': this.noise(t, 1.1, 0.22, 3600, 'highpass'); break
      case 'thud': this.tone(95, t, 0.22, 'sine', 0.5, null, 45); this.noise(t, 0.12, 0.25, 500, 'lowpass'); break
      case 'clink': this.tone(2600, t, 0.18, 'triangle', 0.1); this.tone(3900, t + 0.02, 0.12, 'sine', 0.06); break
      case 'whoosh': this.noise(t, 0.3, 0.08, 1100, 'bandpass', null, 2); break
      case 'safe': this.tone(1046, t, 0.12, 'triangle', 0.13); this.tone(1568, t + 0.08, 0.2, 'triangle', 0.12); break
      case 'perfect': this.noise(t, 0.25, 0.06, 1400, 'bandpass', null, 2); this.tone(1318, t + 0.05, 0.1, 'triangle', 0.12); this.tone(1760, t + 0.12, 0.1, 'triangle', 0.12); this.tone(2637, t + 0.19, 0.25, 'triangle', 0.1); break
      case 'sus': this.tone(500, t, 0.2, 'triangle', 0.1, null, 700); this.tone(700, t + 0.2, 0.25, 'triangle', 0.08, null, 560); break
      case 'pop': this.tone(500, t, 0.08, 'sine', 0.15, null, 1200); break
      case 'page': this.noise(t, 0.12, 0.03, 3500, 'bandpass', null, 1.2); break
      case 'pok': this.tone(780, t, 0.07, 'sine', 0.09, null, 620); this.noise(t, 0.02, 0.05, 2000, 'bandpass', null, 2); break
      case 'pencil': this.noise(t, 0.09, 0.02, 4500, 'bandpass', null, 2); break
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
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2.5, 4, 5)
const evLight = new THREE.PointLight(0xffffff, 0, 0, 1.2); evLight.position.set(0, 2, -4)
scene.add(hemi, sun, evLight)

const MC = {}
const M = (c, flat = true) => MC[c + ':' + flat] || (MC[c + ':' + flat] = new THREE.MeshLambertMaterial({ color: c, flatShading: flat }))
const MB = c => MC['b' + c] || (MC['b' + c] = new THREE.MeshBasicMaterial({ color: c }))
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 22, 16), lsph: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16), plane: new THREE.PlaneGeometry(1, 1),
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

// ---------- プレイヤー（主役の顔）
const SKIN = new THREE.Color(0xf4c7a1), RED = new THREE.Color(0xff3b2c), PURPLE = new THREE.Color(0xd2246a), NOSE = new THREE.Color(0xf2b08f), NOSE_R = new THREE.Color(0xff5f52)
const P = (() => {
  const root = new THREE.Group(); scene.add(root)
  const skin = new THREE.MeshLambertMaterial({ color: SKIN.clone() })
  const noseM = new THREE.MeshLambertMaterial({ color: NOSE.clone() })
  const dark = M(0x231a1f, false), white = M(0xffffff, false), hairM = M(0x2b1d17)
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.34, 6, 14), M(0x4f7fc4), 0, 0.84, 0, 1.32, 1, 0.85, root)
  mesh(G.cyl, skin, 0, 1.12, 0, 0.075, 0.14, 0.075, root)
  // 腕（机の上に手）
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), M(0x4f7fc4), s * 0.36, 0.86, 0.12, 1, 1, 1, root); arm.rotation.x = -0.9; arm.rotation.z = s * 0.15
    mesh(G.sph, skin, s * 0.3, 0.78, 0.38, 0.075, 0.06, 0.09, root)
  }
  const pivot = new THREE.Group(); pivot.position.set(0, 1.16, 0); root.add(pivot)
  const head = new THREE.Group(); head.position.set(0, 0.24, 0); pivot.add(head)
  mesh(G.sph, skin, 0, 0, 0, 0.3, 0.32, 0.29, head)
  for (const s of [-1, 1]) mesh(G.sph, skin, s * 0.29, -0.01, -0.01, 0.055, 0.075, 0.04, head)
  const hair = mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.02, 0.318, 0.34, 0.31, head); hair.rotation.x = -0.42
  for (const [x, rz] of [[-0.14, 0.5], [-0.04, 0.15], [0.07, -0.2], [0.17, -0.55]]) { const f = mesh(new THREE.ConeGeometry(1, 1, 5), hairM, x, 0.2, 0.2, 0.06, 0.13, 0.05, head); f.rotation.set(2.6, 0, rz) }
  const ahoge = new THREE.Group(); ahoge.position.set(0.03, 0.32, 0.02); ahoge.rotation.y = 0.7; head.add(ahoge)
  const ah = mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI * 1.3), hairM, 0.035, 0.02, 0, 1, 1, 1, ahoge); ah.rotation.z = -0.3
  const eyes = [], pupils = [], squint = [], brows = [], nostrils = [], cheeks = [], drops = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.105, 0.045, 0.252); head.add(eg)
    mesh(G.sph, white, 0, 0, 0, 0.058, 0.064, 0.035, eg)
    const pu = mesh(G.sph, dark, s * -0.006, -0.004, 0.03, 0.03, 0.033, 0.014, eg)
    mesh(G.sph, white, 0.01, 0.012, 0.012, 0.18, 0.18, 0.2, pu)
    eyes.push(eg); pupils.push(pu)
    const sq = new THREE.Group(); sq.position.set(s * 0.105, 0.045, 0.282); head.add(sq); sq.visible = false
    for (const u of [1, -1]) { const l = box(0.075, 0.016, 0.012, dark, -s * 0.004, u * 0.014, 0, sq); l.rotation.z = s * u * 0.5 }
    squint.push(sq)
    const b = box(0.1, 0.022, 0.02, 0x2b1d17, s * 0.105, 0.14, 0.262, head); brows.push(b)
    nostrils.push(mesh(G.sph, M(0x6a2a2a, false), s * 0.026, -0.058, 0.352, 0.018, 0.013, 0.012, head))
    const ckM = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55 })
    const ck = mesh(G.sph, ckM, s * 0.175, -0.06, 0.226, 0.052, 0.034, 0.016, head); ck.rotation.y = s * 0.6; cheeks.push(ck)
    const dr = mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.9 }), s * 0.262, 0.08, 0.1, 0.02, 0.03, 0.02, head); drops.push(dr)
  }
  const nose = mesh(G.sph, noseM, 0, -0.018, 0.3, 0.072, 0.064, 0.066, head)
  const mouth = mesh(G.sph, M(0x5a1424, false), 0, -0.145, 0.262, 0.06, 0.03, 0.02, head)
  mesh(G.sph, M(0xe46a7a, false), 0, -0.5, 0.3, 0.6, 0.4, 0.5, mouth) // 舌
  const lips = box(0.11, 0.018, 0.02, 0xd8656a, 0, -0.145, 0.27, head)
  const smile = mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), dark, 0, -0.128, 0.268, 1, 1, 1, head); smile.rotation.z = Math.PI
  const vein = new THREE.Group(); vein.position.set(0.14, 0.2, 0.24); vein.rotation.y = 0.45; head.add(vein)
  for (const [x, y, r] of [[-0.018, 0.018, 0.6], [0.018, 0.018, -0.6], [-0.018, -0.018, -0.6], [0.018, -0.018, 0.6]]) { const v = box(0.03, 0.009, 0.01, 0xd8141f, x, y, 0, vein); v.rotation.z = r }
  // メガネ（失敗すると飛ぶ）
  const glasses = new THREE.Group(); glasses.position.set(0, 0.045, 0.3); head.add(glasses)
  const gm = M(0x1b1620, false)
  for (const s of [-1, 1]) {
    mesh(new THREE.TorusGeometry(0.068, 0.011, 8, 22), gm, s * 0.105, 0, 0, 1, 1, 1, glasses)
    const lens = mesh(new THREE.CircleGeometry(0.066, 20), new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.18 }), s * 0.105, 0, -0.002, 1, 1, 1, glasses)
    box(0.012, 0.012, 0.25, gm, s * 0.176, 0.01, -0.125, glasses)
    void lens
  }
  box(0.07, 0.012, 0.012, gm, 0, 0.012, 0, glasses)
  return { root, torso, pivot, head, skin, noseM, hair, ahoge, eyes, pupils, squint, brows, nostrils, cheeks, drops, nose, mouth, lips, smile, vein, glasses, glassesHome: glasses.position.clone() }
})()

// ---------- まわりの人
const exTex = (ch, col) => canvasTex(128, 128, (c, w, h) => {
  c.font = '900 110px "Dela Gothic One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.lineWidth = 16; c.strokeStyle = '#1b1620'; c.strokeText(ch, w / 2, h / 2 + 6); c.fillStyle = col; c.fillText(ch, w / 2, h / 2 + 6)
})
let TEX_EX = exTex('!', '#ff3d2e'), TEX_Q = exTex('?', '#ffd21f')
function makeNPC(o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.ry || 0
  const sc = o.scale || 1; g.scale.setScalar(sc)
  const seat = o.seiza ? 0.42 : 0.78
  const skinM = M(o.skin || 0xf1c6a0, false)
  const body = mesh(new THREE.CapsuleGeometry(0.21, 0.28, 4, 10), M(o.shirt), 0, seat, 0, 1.25, 1, 0.85, g)
  if (o.collar) box(0.3, 0.05, 0.08, o.collar, 0, seat + 0.24, 0.1, g)
  const pivot = new THREE.Group(); pivot.position.set(0, seat + 0.3, 0); g.add(pivot)
  const head = new THREE.Group(); head.position.set(0, 0.2, 0); pivot.add(head)
  mesh(G.sph, skinM, 0, 0, 0, 0.22, 0.235, 0.21, head)
  const hairM = M(o.hair || 0x2b1d17)
  if (o.style !== 'bald') { const h = mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.01, 0.232, 0.25, 0.225, head); h.rotation.x = -0.35 }
  if (o.style === 'long') box(0.4, 0.3, 0.14, hairM, 0, -0.1, -0.12, head)
  if (o.style === 'bun') mesh(G.lsph, hairM, 0, 0.2, -0.12, 0.09, 0.09, 0.09, head)
  if (o.style === 'side') box(0.44, 0.08, 0.36, hairM, 0, 0.13, 0.02, head).rotation.z = 0.12
  const eyes = [], pupils = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.075, 0.03, 0.185); head.add(eg)
    mesh(G.sph, M(0xffffff, false), 0, 0, 0, 0.04, 0.045, 0.022, eg)
    pupils.push(mesh(G.sph, M(0x231a1f, false), 0, -0.004, 0.02, 0.022, 0.024, 0.01, eg)); eyes.push(eg)
    box(0.07, 0.016, 0.016, o.hair || 0x2b1d17, s * 0.075, 0.105, 0.19, head)
  }
  if (o.glasses) for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), M(0x1b1620, false), s * 0.075, 0.03, 0.212, 1, 1, 1, head)
  mesh(G.sph, M(0xe0a088, false), 0, -0.02, 0.21, 0.035, 0.03, 0.03, head)
  const mouth = box(0.06, 0.014, 0.012, 0x6a2a2a, 0, -0.1, 0.2, head)
  const mat = new THREE.SpriteMaterial({ map: TEX_EX, depthTest: false, transparent: true })
  const mark = new THREE.Sprite(mat); mark.position.set(0.12, seat + 0.95, 0); mark.scale.setScalar(0); mark.renderOrder = 10; g.add(mark)
  const n = { g, body, pivot, head, eyes, pupils, mouth, mark, seat, yaw: 0, pitch: 0.3, tYaw: 0, tPitch: 0.3, eye: 1, tEye: 1, markT: -1, base: { x: o.x, y: o.y || 0, z: o.z }, phase: Math.random() * 6, idlePitch: o.idlePitch ?? 0.3, shake: 0, bounce: 0, role: o.role || '', kid: !!o.kid }
  return n
}
const _hp = new THREE.Vector3(), _q = new THREE.Vector3()
function npcHeadPos(n, out) { return n.pivot.getWorldPosition(out).add(_q.set(0, 0.2 * n.g.scale.y, 0)) }
function npcLook(n, p, amt = 1) {
  npcHeadPos(n, _hp); const d = _q.copy(p).sub(_hp)
  const ry = n.g.rotation.y, c = Math.cos(-ry), s = Math.sin(-ry)
  const lx = d.x * c + d.z * s, lz = -d.x * s + d.z * c
  n.tYaw = clamp(Math.atan2(lx, lz), -1.7, 1.7) * amt
  n.tPitch = clamp(Math.atan2(-d.y, Math.hypot(lx, lz)), -0.6, 0.8) * amt + n.idlePitch * (1 - amt)
}
function npcIdle(n) { n.tYaw = 0; n.tPitch = n.idlePitch; n.tEye = 1 }
function npcMark(n, kind) { n.mark.material.map = kind === '?' ? TEX_Q : TEX_EX; n.mark.material.needsUpdate = true; n.markT = 0 }

// ---------- 床と壁の模様
const texWood = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#8a5a3a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#94633f' : '#7f5335'; c.fillRect(0, i * 32, w, 31); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, i * 32 + 31, w, 1); c.fillRect((i * 97) % w, i * 32, 2, 32) } }, [4, 4])
const texTatami = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#c8c38a'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { c.fillStyle = y % 8 ? 'rgba(90,100,40,.12)' : 'rgba(255,255,220,.1)'; c.fillRect(0, y, w, 2) } c.fillStyle = '#2f3b2a'; c.fillRect(0, 0, w, 10); c.fillRect(0, 0, 10, h) }, [5, 5])
const texTile = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#9aa39a'; c.fillRect(0, 0, w, h); c.fillStyle = '#8c958c'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64); c.strokeStyle = 'rgba(0,0,0,.18)'; c.strokeRect(0, 0, w, h) }, [10, 10])
function signTex(lines, opts = {}) {
  return canvasTex(opts.w || 512, opts.h || 192, (c, w, h) => {
    c.fillStyle = opts.bg || '#fffaf0'; c.fillRect(0, 0, w, h); c.strokeStyle = opts.fg || '#1b1620'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10)
    c.fillStyle = opts.fg || '#1b1620'; c.textAlign = 'center'; c.textBaseline = 'middle'
    lines.forEach((l, i) => { const fs = l[1]; c.font = `${fs}px "Dela Gothic One", "Hiragino Sans", sans-serif`; let f = fs; while (c.measureText(l[0]).width > w - 40 && f > 10) { f -= 4; c.font = `${f}px "Dela Gothic One", sans-serif` } c.fillText(l[0], w / 2, h * l[2]) })
  })
}

// ---------- 窓の外（毎フレーム描き直す）
const winTex = canvasTex(512, 256, () => {})
winTex.colorSpace = THREE.SRGBColorSpace
const winMat = new THREE.MeshBasicMaterial({ map: winTex })
function winGeo(u0, u1) { const g = new THREE.PlaneGeometry(1, 1), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); return g }
function addWindow(grp, x, y, w, h, frameCol = 0xf2ece0, u0 = 0, u1 = 1) {
  mesh(winGeo(u0, u1), winMat, x, y, -5.47, w, h, 1, grp)
  for (const [px, py, sw, sh] of [[x, y + h / 2, w + 0.16, 0.1], [x, y - h / 2, w + 0.2, 0.12], [x - w / 2, y, 0.1, h], [x + w / 2, y, 0.1, h], [x, y, 0.05, h], [x, y + h * 0.1, w, 0.05]]) box(sw, sh, 0.08, frameCol, px, py, -5.44, grp)
}
function room(grp, floorTex, wallCol, ceilCol) {
  const fm = new THREE.MeshLambertMaterial({ map: floorTex })
  const f = mesh(G.plane, fm, 0, 0, -1.5, 12, 11, 1, grp); f.rotation.x = -Math.PI / 2
  box(12, 5, 0.2, wallCol, 0, 2.3, -5.6, grp)
  for (const s of [-1, 1]) box(0.2, 5, 11, wallCol, s * 4.4, 2.3, -1.5, grp)
  box(12, 0.2, 11, ceilCol, 0, 3.6, -1.5, grp)
}

// ---------- 3つの会場
const STG = {}
function evOf(type) { return S.evs.find(e => e.type === type && e.ph !== 'idle' && e.ph !== 'done' && e.ph !== 'fizzle') }
const stageDefs = {
  library() {
    const grp = new THREE.Group(), npcs = []
    room(grp, texWood, 0xe8dcc0, 0xcfc1a4)
    box(12, 0.9, 0.1, 0x6e4a30, 0, 0.45, -5.45, grp)
    addWindow(grp, -1.9, 2.1, 1.5, 1.7, 0xf2ece0, 0, 0.5); addWindow(grp, 1.9, 2.1, 1.5, 1.7, 0xf2ece0, 0.5, 1)
    // 本棚（本は1回の描画でまとめる）
    const books = new THREE.InstancedMesh(G.box, new THREE.MeshLambertMaterial(), 240); let bi = 0
    const bcol = [0xb23a3a, 0x2f5e8f, 0x3d8a5a, 0xd9a43a, 0x6b4a8f, 0xe8e0cc, 0x8f3f6b, 0x2b2b2b], m4 = new THREE.Matrix4(), col = new THREE.Color()
    for (const sx of [-3.6, 0, 3.6]) {
      const sw = sx === 0 ? 1.7 : 1.3
      box(sw, 3.0, 0.45, 0x5e3d26, sx, 1.5, -5.25, grp)
      for (let lv = 0; lv < 5; lv++) {
        const y = 0.35 + lv * 0.58; box(sw - 0.08, 0.04, 0.4, 0x7a5236, sx, y - 0.02, -5.2, grp)
        for (let x = sx - sw / 2 + 0.1; x < sx + sw / 2 - 0.1 && bi < 240;) {
          const bw = 0.05 + ((bi * 37) % 7) * 0.012, bh = 0.34 + ((bi * 53) % 5) * 0.035
          m4.makeScale(bw, bh, 0.3); m4.setPosition(x + bw / 2, y + bh / 2, -5.12); books.setMatrixAt(bi, m4); books.setColorAt(bi, col.setHex(bcol[(bi * 7 + lv) % bcol.length])); bi++; x += bw + 0.008
        }
      }
    }
    books.count = bi; grp.add(books)
    // 中央の本棚の上は「お静かに」
    const sign = mesh(G.plane, new THREE.MeshBasicMaterial({ map: null }), 0, 3.25, -5.0, 1.5, 0.56, 1, grp); STG.signLib = sign
    // 机（長机）
    const desk = (z, w) => { box(w, 0.06, 0.62, 0x9b6b43, 0, 0.74, z, grp); for (const s of [-1, 1]) box(0.06, 0.72, 0.5, 0x6e4a30, s * (w / 2 - 0.1), 0.37, z, grp) }
    desk(0.52, 4.2); desk(-1.25, 4.2); desk(-2.85, 4.6)
    for (const [x, z] of [[-1.2, -1.25], [1.3, -1.25], [-1.6, -2.85], [1.5, -2.85]]) { // 緑のランプ
      mesh(G.cyl, M(0x8a7a3a), x, 0.95, z, 0.012, 0.36, 0.012, grp); const sh = mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f7a4a, emissive: 0x0c3a22 }), x, 1.12, z, 0.14, 0.09, 0.1, grp); void sh
    }
    const cl = [0xc9a227, 0x2f8f83, 0xb5523b, 0x3b4f8f, 0x8f8f8f, 0x6b8f3b, 0xd07aa0, 0x5a5a6e]
    const hairs = [0x2b1d17, 0x5a3a22, 0x1a1a1a, 0x8a5a2a, 0x3a2a1a]
    const row = (z, xs, base) => xs.forEach((x, i) => npcs.push(makeNPC({ x, z, shirt: cl[(base + i) % cl.length], hair: hairs[(base + i * 2) % hairs.length], style: ['short', 'long', 'bun', 'side'][(base + i) % 4], glasses: (base + i) % 3 === 0 })))
    row(0.12, [-1.55, 1.55], 0); row(-1.62, [-1.5, -0.5, 0.55, 1.55], 2); row(-3.2, [-1.95, -0.7, 0.6, 1.85], 5)
    // 司書さん
    const lib = makeNPC({ x: -2.75, z: -2.0, ry: 0.5, shirt: 0x7a3b52, hair: 0x4a4a4a, style: 'bun', glasses: true, idlePitch: 0.05, role: 'auth' }); lib.g.position.y = 0.32; npcs.push(lib)
    // 読み聞かせコーナー
    const teller = makeNPC({ x: 3.05, z: -3.2, ry: -0.9, shirt: 0xe07b3c, hair: 0x5a3a22, style: 'long', idlePitch: 0.0, role: 'teller' }); teller.g.position.y = 0.3; npcs.push(teller)
    const kids = []
    for (const [x, z] of [[2.4, -2.6], [2.75, -2.25], [2.15, -3.2]]) { const k = makeNPC({ x, z, ry: 1.9, shirt: [0xffd21f, 0x6ac1ff, 0xff7aa8][kids.length], hair: 0x2b1d17, style: 'short', scale: 0.62, seiza: true, idlePitch: -0.1, kid: true }); kids.push(k); npcs.push(k) }
    const phoneOwner = npcs[3]
    const phone = mesh(G.box, new THREE.MeshBasicMaterial({ color: 0x222222 }), phoneOwner.base.x + 0.18, 0.78, -1.3, 0.08, 0.015, 0.15, grp)
    // プレイヤーの机の上
    const props = []
    const stack = [[0xb23a3a, 0.82], [0x2f5e8f, 0.87], [0xd9a43a, 0.92]]
    stack.forEach(([c, y], i) => props.push(box(0.28, 0.05, 0.36, c, -0.52 + i * 0.01, y - 0.05, 0.5, grp)))
    const open = new THREE.Group(); open.position.set(0.12, 0.78, 0.52); grp.add(open)
    for (const s of [-1, 1]) { const pg = box(0.2, 0.012, 0.28, 0xf7f2e4, s * 0.1, 0.01, 0, open); pg.rotation.z = -s * 0.08 }
    return {
      grp, npcs, props, py: 0, src: { window: new THREE.Vector3(0, 2.1, -5.4), phone: phone.position, applause: teller.g.position, kids },
      paint(c, W, H, st) {
        const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fcaf5'); g.addColorStop(1, '#e3f3ff'); c.fillStyle = g; c.fillRect(0, 0, W, H)
        c.fillStyle = '#bccada'; for (let i = 0; i < 15; i++) c.fillRect(i * 36 - 6, H * 0.34 + (i * 37 % 28), 30, H)
        c.fillStyle = '#d6e0ea'; for (let i = 0; i < 15; i++) for (let j = 0; j < 5; j++) c.fillRect(i * 36, H * 0.4 + (i * 37 % 28) + j * 16, 6, 8)
        c.fillStyle = '#7d8794'; c.fillRect(0, H * 0.86, W, H * 0.05); c.fillStyle = '#5d6672'; for (let x = 0; x < W; x += 40) c.fillRect(x, H * 0.9, 8, H * 0.1)
        const e = evOf('train')
        if (e && e.ph === 'warn') { const r = c.createRadialGradient(W, H * 0.66, 2, W, H * 0.66, H * (0.2 + 0.7 * e.k)); r.addColorStop(0, `rgba(255,250,200,${0.95 * e.k})`); r.addColorStop(1, 'rgba(255,250,200,0)'); c.fillStyle = r; c.fillRect(0, 0, W, H) }
        if (e && (e.ph === 'peak' || e.ph === 'tail')) {
          const tt = st - e.at, sp = W * 3.4, len = (e.peak + TAIL) * sp - W * 0.6, front = W - tt * sp
          for (let x = front; x < Math.min(W, front + len); x += 120) {
            if (x + 116 < 0) continue
            c.fillStyle = '#ece6d6'; c.fillRect(x, H * 0.44, 116, H * 0.42); c.fillStyle = '#2e9a5e'; c.fillRect(x, H * 0.7, 116, H * 0.05)
            c.fillStyle = '#2a3a52'; for (let k = 0; k < 4; k++) c.fillRect(x + 8 + k * 27, H * 0.5, 20, H * 0.14)
          }
        }
      },
      tick(st, dt) {
        const e = evOf('phone'), on = e && e.ph !== 'tail'
        phone.material.color.setHex(on ? (Math.floor(S.time * 10) % 2 ? 0x8ff7ff : 0xffffff) : 0x222222)
        phone.position.x = phoneOwner.base.x + 0.18 + (on ? Math.sin(S.time * 90) * 0.006 : 0)
        phoneOwner.shake = on && e.ph === 'peak' ? 1 : 0
        const a = evOf('applause')
        for (const k of kids) k.bounce = a && a.ph !== 'warn' ? 1 : 0
        teller.bounce = a && a.ph === 'warn' ? 0.4 : 0
        evLight.color.setHex(0xfff2c0)
        const tr = evOf('train'); evLight.position.set(0, 2.2, -4.6)
        evLight.intensity = tr ? (tr.ph === 'warn' ? tr.k * 4 : tr.ph === 'peak' ? 5 + Math.sin(S.time * 60) * 2 : 4 * (1 - tr.k)) : on ? 0 : 0
        if (on) { evLight.color.setHex(0x8ff7ff); evLight.position.set(phone.position.x, 1.0, phone.position.z + 0.2); evLight.intensity = 1.5 }
      },
      srcOf(type) { return type === 'phone' ? phoneOwner : type === 'applause' ? teller : null },
      lookAt(type) { return type === 'phone' ? phone.position : type === 'applause' ? teller.g.position.clone().setY(1.2) : this.src.window },
    }
  },
  temple() {
    const grp = new THREE.Group(), npcs = []
    room(grp, texTatami, 0xd9cdb0, 0x3a2a20)
    // 障子（窓の代わり。外の光が映る）
    for (const [i, x] of [-2.6, 0, 2.6].entries()) {
      mesh(winGeo(i / 3, (i + 1) / 3), winMat, x, 1.55, -5.47, 2.3, 2.5, 1, grp)
      box(2.4, 0.1, 0.1, 0x4a3020, x, 2.82, -5.42, grp); box(2.4, 0.1, 0.1, 0x4a3020, x, 0.28, -5.42, grp)
    }
    for (const x of [-3.9, -1.3, 1.3, 3.9]) box(0.18, 3.6, 0.18, 0x4a3020, x, 1.8, -5.35, grp)
    box(12, 0.25, 0.2, 0x4a3020, 0, 3.05, -5.4, grp)
    const scroll = mesh(G.plane, new THREE.MeshBasicMaterial({ map: null }), 0, 3.32, -5.25, 0.9, 0.42, 1, grp); STG.signTemple = scroll
    // 提灯
    for (const x of [-1.8, 1.8]) { mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0xfff1d0, emissive: 0x806030 }), x, 2.9, -3.5, 0.17, 0.24, 0.17, grp); box(0.2, 0.04, 0.2, 0x2a1a10, x, 3.14, -3.5, grp); box(0.2, 0.04, 0.2, 0x2a1a10, x, 2.66, -3.5, grp) }
    // 花
    for (const x of [-3.2, 3.2]) { mesh(G.cyl, M(0x3a3a3a), x, 0.35, -4.6, 0.18, 0.7, 0.18, grp); for (let k = 0; k < 5; k++) mesh(G.lsph, M(k % 2 ? 0xffffff : 0xf5e6a8), x + Math.cos(k) * 0.15, 0.85 + (k % 3) * 0.1, -4.6 + Math.sin(k) * 0.12, 0.09, 0.09, 0.09, grp); mesh(G.lsph, M(0x3f7a3a), x, 0.78, -4.6, 0.22, 0.14, 0.18, grp) }
    const black = 0x24232a, hairs = [0x1a1a1a, 0x4a4a4a, 0x2b1d17, 0x8a8a8a]
    const cush = (x, z) => box(0.62, 0.08, 0.6, 0x5a2a6a, x, 0.04, z, grp)
    const row = (z, xs, base) => xs.forEach((x, i) => { cush(x, z); npcs.push(makeNPC({ x, z, shirt: black, collar: 0xf2f2f2, hair: hairs[(base + i) % hairs.length], style: ['short', 'bun', 'side', 'long'][(base + i) % 4], glasses: (base + i) % 3 === 1, seiza: true, idlePitch: 0.35 })) })
    row(0.05, [-1.5, 1.5], 0); row(-1.35, [-1.45, -0.5, 0.5, 1.45], 1); row(-2.75, [-1.9, -0.65, 0.65, 1.9], 3)
    npcs[1].role = 'auth'
    cush(0, 0.05)
    // お坊さんと鐘
    const monk = makeNPC({ x: -2.35, z: -0.9, ry: Math.PI / 2 - 0.25, shirt: 0x6a2a8a, collar: 0xd9b24a, style: 'bald', skin: 0xeab896, seiza: true, idlePitch: 0.2, role: 'monk' }); npcs.push(monk)
    cush(-2.35, -0.9)
    const bellPts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; bellPts.push(new THREE.Vector2(0.05 + Math.sin(a) * 0.26, -Math.cos(a) * 0.26 + 0.26)) }
    const bell = mesh(new THREE.LatheGeometry(bellPts, 18), new THREE.MeshLambertMaterial({ color: 0xd9a63a, side: THREE.DoubleSide }), -1.75, 0.16, -0.75, 1, 1, 1, grp)
    mesh(G.cyl, M(0x8a2a2a), -1.75, 0.08, -0.75, 0.3, 0.12, 0.3, grp)
    const arm = new THREE.Group(); arm.position.set(0.2, monk.seat + 0.18, 0.05); monk.g.add(arm)
    box(0.09, 0.09, 0.42, 0x6a2a8a, 0, 0, 0.2, arm); mesh(G.cyl, M(0x8a5a2a), 0, 0, 0.5, 0.018, 0.3, 0.018, arm).rotation.x = Math.PI / 2
    mesh(G.sph, M(0xe8dcc0), 0, 0, 0.66, 0.05, 0.05, 0.05, arm)
    // プレイヤーの前のお膳
    box(0.9, 0.05, 0.45, 0x1b1214, 0, 0.42, 0.62, grp); for (const s of [-1, 1]) for (const z of [0.45, 0.8]) box(0.05, 0.4, 0.05, 0x1b1214, s * 0.4, 0.2, z, grp)
    const props = []
    props.push(mesh(G.cyl, M(0x5a7a5a), -0.25, 0.5, 0.6, 0.06, 0.1, 0.06, grp))
    props.push(box(0.26, 0.04, 0.12, 0xe8d9a8, 0.15, 0.47, 0.62, grp))
    props.push(mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 16), M(0x6a3a2a), 0.05, 0.46, 0.75, 1, 1, 1, grp))
    props[2].rotation.x = Math.PI / 2
    return {
      grp, npcs, props, py: -0.34, src: { window: new THREE.Vector3(0, 1.6, -5.4) }, monk, bell, arm,
      paint(c, W, H, st) {
        c.fillStyle = '#e7e0cd'; c.fillRect(0, 0, W, H)
        let f = 0
        const th = evOf('thunder')
        if (th) { if (th.ph === 'warn') f = (th.k > 0.22 && th.k < 0.3 ? 0.55 : 0) + (th.k > 0.62 && th.k < 0.7 ? 0.75 : 0); else if (th.ph === 'peak') f = Math.max(0, 1 - (st - th.at) * 2.2) + (Math.floor(S.time * 14) % 5 === 0 ? 0.3 : 0) }
        S.flash = f
        c.fillStyle = 'rgba(70,80,100,.18)'; c.fillRect(0, 0, W, H)
        if (f > 0) {
          c.fillStyle = `rgba(240,248,255,${f})`; c.fillRect(0, 0, W, H)
          c.strokeStyle = `rgba(40,40,50,${0.55 * f})`; c.lineWidth = 7; c.beginPath(); c.moveTo(0, H * 0.3); c.lineTo(W * 0.4, H * 0.42); c.lineTo(W * 0.7, H * 0.2); c.moveTo(W * 0.4, H * 0.42); c.lineTo(W * 0.5, H * 0.7); c.stroke()
        }
        const si = evOf('siren')
        if (si) { const a = si.ph === 'warn' ? 0.15 + 0.45 * si.k : si.ph === 'peak' ? 0.85 : 0.85 * (1 - si.k); const x = ((S.time * 1.7) % 1) * W * 1.6 - W * 0.3, gr = c.createLinearGradient(x - 70, 0, x + 70, 0); gr.addColorStop(0, 'rgba(255,40,30,0)'); gr.addColorStop(0.5, `rgba(255,40,30,${a})`); gr.addColorStop(1, 'rgba(255,40,30,0)'); c.fillStyle = gr; c.fillRect(0, 0, W, H) }
        c.strokeStyle = '#4a3020'; const sw = W / 3
        for (let j = 0; j < 3; j++) { const x0 = j * sw; c.lineWidth = 5; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x0 + k * sw / 4, 0); c.lineTo(x0 + k * sw / 4, H); c.stroke() } for (let y = H / 6; y < H; y += H / 6) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + sw, y); c.stroke() } c.lineWidth = 10; c.strokeRect(x0 + 2, 2, sw - 4, H - 4) }
      },
      tick(st) {
        const g = evOf('gong')
        let ang = 0.2
        if (g) ang = g.ph === 'warn' ? 0.2 - 1.9 * ease(g.k) : g.ph === 'peak' ? (st - g.at < 0.1 ? 0.2 : 0.35) : 0.2
        this.arm.rotation.x = ang
        const ring = g && g.ph !== 'warn' ? Math.max(0, 1 - (st - g.at) / 1.5) : 0
        this.bell.scale.set(1 + Math.sin(S.time * 50) * 0.03 * ring, 1, 1 + Math.cos(S.time * 50) * 0.03 * ring)
        const si = evOf('siren')
        evLight.color.setHex(0xff3020); evLight.position.set(Math.sin(S.time * 10) * 2.5, 1.8, -4.4)
        evLight.intensity = si ? (si.ph === 'warn' ? si.k * 3 : si.ph === 'peak' ? 4 : 4 * (1 - si.k)) * (0.5 + 0.5 * Math.sin(S.time * 12)) : 0
      },
      srcOf(type) { return type === 'gong' ? this.monk : null },
      lookAt(type) { return type === 'gong' ? this.bell.position.clone().setY(0.5) : this.src.window },
    }
  },
  exam() {
    const grp = new THREE.Group(), npcs = []
    room(grp, texTile, 0xeae6da, 0xdedbd0)
    addWindow(grp, -2.3, 2.15, 1.7, 1.6, 0xb8bcc0, 0, 1 / 3); addWindow(grp, 0.0, 2.15, 1.7, 1.6, 0xb8bcc0, 1 / 3, 2 / 3); addWindow(grp, 2.3, 2.15, 1.7, 1.6, 0xb8bcc0, 2 / 3, 1)
    for (let i = 0; i < 9; i++) { box(0.86, 1.0, 0.4, 0x8a96a0, -3.6 + i * 0.9, 0.5, -5.3, grp); box(0.5, 0.04, 0.02, 0x5a666e, -3.6 + i * 0.9, 0.85, -5.09, grp) }
    const clock = new THREE.Group(); clock.position.set(3.4, 3.0, -5.45); grp.add(clock)
    mesh(G.cyl, M(0xffffff, false), 0, 0, 0, 0.26, 0.05, 0.26, clock).rotation.x = Math.PI / 2
    mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 20), M(0x1b1620, false), 0, 0, 0.02, 1, 1, 1, clock)
    const hh = box(0.02, 0.14, 0.01, 0x1b1620, 0, 0.06, 0.04, clock), mh = new THREE.Group(); mh.position.z = 0.05; clock.add(mh); box(0.012, 0.2, 0.01, 0xd8141f, 0, 0.09, 0, mh); hh.rotation.z = -0.6
    const sign = mesh(G.plane, new THREE.MeshBasicMaterial({ map: null }), -3.3, 3.0, -5.45, 1.2, 0.45, 1, grp); STG.signExam = sign
    const desk = (x, z) => { box(0.62, 0.04, 0.45, 0xc8a46e, x, 0.72, z + 0.32, grp); box(0.5, 0.3, 0.02, 0x7a7f86, x, 0.55, z + 0.52, grp); for (const s of [-1, 1]) box(0.03, 0.7, 0.03, 0x7a7f86, x + s * 0.27, 0.35, z + 0.32, grp); box(0.42, 0.005, 0.3, 0xffffff, x, 0.745, z + 0.32, grp) }
    const uni = [0x1f2a44, 0x24304a, 0x1a2238], hairs = [0x1a1a1a, 0x2b1d17, 0x3a2a1a]
    const row = (z, xs, base) => xs.forEach((x, i) => { desk(x, z); const girl = (base + i) % 2; npcs.push(makeNPC({ x, z, shirt: uni[(base + i) % 3], collar: girl ? 0xffffff : 0x1b1620, hair: hairs[(base + i) % 3], style: girl ? ['long', 'bun'][(base + i) % 2] : 'short', glasses: (base + i) % 3 === 2, idlePitch: 0.5 })) })
    row(0.0, [-1.55, 1.55], 0); row(-1.55, [-1.5, -0.5, 0.5, 1.5], 1); row(-3.0, [-1.95, -0.65, 0.65, 1.95], 3)
    const proctor = makeNPC({ x: 2.75, z: -1.7, ry: -0.6, shirt: 0x5a5a62, collar: 0xffffff, hair: 0x6a6a6a, style: 'side', glasses: true, idlePitch: 0.05, role: 'auth' }); proctor.g.position.y = 0.32; npcs.push(proctor)
    const pphone = mesh(G.box, new THREE.MeshBasicMaterial({ color: 0x222222 }), 0.22, 0.75, 0.25, 0.07, 0.13, 0.02, proctor.g); pphone.visible = false
    // プレイヤーの机
    box(0.9, 0.04, 0.5, 0xc8a46e, 0, 0.74, 0.55, grp); for (const s of [-1, 1]) box(0.03, 0.72, 0.03, 0x7a7f86, s * 0.4, 0.37, 0.55, grp)
    box(0.42, 0.005, 0.3, 0xffffff, 0.08, 0.765, 0.55, grp)
    const props = []
    props.push(box(0.32, 0.06, 0.09, 0x3a6ad8, -0.28, 0.79, 0.45, grp))
    props.push(box(0.06, 0.03, 0.04, 0xffffff, -0.25, 0.775, 0.65, grp))
    const pen = mesh(G.cyl, M(0xf0c02a), 0.18, 0.775, 0.6, 0.008, 0.18, 0.008, grp); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; props.push(pen)
    return {
      grp, npcs, props, py: 0, src: { window: new THREE.Vector3(0, 2.1, -5.4) }, proctor, pphone, mh, hh,
      paint(c, W, H, st) {
        const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6fb6f0'); g.addColorStop(1, '#cfe9ff'); c.fillStyle = g; c.fillRect(0, 0, W, H)
        c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 7; i++) { const x = ((i * 95 + S.time * 5) % (W + 120)) - 60; c.beginPath(); c.ellipse(x, 30 + (i % 4) * 18, 34, 12, 0, 0, 7); c.fill() }
        c.fillStyle = '#c99f68'; c.fillRect(0, H * 0.68, W, H); c.strokeStyle = '#f5f0e0'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.1, H); c.lineTo(W * 0.5, H * 0.72); c.lineTo(W * 0.9, H); c.stroke()
        c.strokeStyle = '#6a6a6a'; c.lineWidth = 2; for (let x = 0; x < W * 0.3; x += 10) { c.beginPath(); c.moveTo(x, H * 0.45); c.lineTo(x, H * 0.7); c.stroke() }
        const pl = evOf('plane')
        if (pl) {
          const k = pl.ph === 'warn' ? pl.k : 1, x = pl.ph === 'warn' ? W * (1.05 - 0.4 * k) : W * 0.65 - (st - pl.at) * W * 1.6, s = pl.ph === 'warn' ? 0.25 + 0.5 * k : 1.6
          if (pl.ph !== 'warn') { c.fillStyle = `rgba(20,30,50,${pl.ph === 'peak' ? 0.4 : 0.4 * (1 - pl.k)})`; c.fillRect(0, 0, W, H) }
          c.save(); c.translate(x, H * 0.2); c.scale(s, s); c.fillStyle = '#e8ecf0'; c.beginPath(); c.ellipse(0, 0, 70, 12, 0, 0, 7); c.fill(); c.fillStyle = '#c8ced6'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(30, -50); c.lineTo(40, -50); c.lineTo(20, 0); c.lineTo(40, 50); c.lineTo(30, 50); c.closePath(); c.fill(); c.beginPath(); c.moveTo(55, 0); c.lineTo(72, -22); c.lineTo(78, -22); c.lineTo(70, 0); c.fill(); c.restore()
        }
        const ch = evOf('cheer')
        if (ch) {
          c.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) c.fillRect(W * 0.35 + i * 18, H * 0.8 + (i % 2) * 6 - (ch.ph !== 'warn' ? Math.abs(Math.sin(S.time * 12 + i)) * 8 : 0), 6, 10)
          if (ch.ph !== 'warn') { const tt = st - ch.at, bx = W * 0.5 + tt * 120, by = H * 0.75 - tt * 260 + tt * tt * 120; c.beginPath(); c.arc(bx, by, 5, 0, 7); c.fill(); if (tt < 0.15) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, 0, W, H) } }
        }
      },
      tick(st) {
        const e = evOf('proctor'), on = e && e.ph !== 'tail'
        this.pphone.visible = !!on; this.pphone.material.color.setHex(on && Math.floor(S.time * 10) % 2 ? 0x8ff7ff : 0xffffff)
        this.proctor.shake = on && e.ph === 'peak' ? 1 : 0
        this.mh.rotation.z = -Math.floor(S.time) * 0.105
        const pl = evOf('plane'); S.dim = pl && pl.ph !== 'warn' ? (pl.ph === 'peak' ? 0.45 : 0.45 * (1 - pl.k)) : 0
        evLight.color.setHex(0x8ff7ff); evLight.intensity = on ? 1.2 : 0
        if (on) this.pphone.getWorldPosition(evLight.position)
      },
      srcOf(type) { return type === 'proctor' ? this.proctor : null },
      lookAt(type) { return type === 'proctor' ? this.proctor.g.position.clone().setY(1.4) : this.src.window },
    }
  },
}
for (const k of Object.keys(stageDefs)) { STG[k] = stageDefs[k](); STG[k].grp.visible = false; scene.add(STG[k].grp); for (const n of STG[k].npcs) STG[k].grp.add(n.g); STG[k].props.forEach(m => { m.userData.home = { p: m.position.clone(), r: m.rotation.clone() } }) }
let cur = STG.library

function refreshSigns() {
  const L = S.lang === 'ja'
  const set = (m, t) => { if (m.material.map) m.material.map.dispose(); m.material.map = t; m.material.needsUpdate = true }
  set(STG.signLib, signTex(L ? [['お静かに', 110, 0.52]] : [['QUIET PLEASE', 90, 0.52]]))
  set(STG.signTemple, signTex([[L ? '静' : 'Silence', L ? 150 : 90, 0.53]], { w: 384, h: 192, bg: '#f2e8cf', fg: '#2a1a10' }))
  set(STG.signExam, signTex(L ? [['試験中', 80, 0.36], ['私語厳禁', 56, 0.74]] : [['EXAM IN PROGRESS', 50, 0.36], ['NO TALKING', 50, 0.74]]))
}

// ---------- 飛ぶもの（メガネ・机の上の物）と、くしゃみの飛沫
const flyers = []
function fling(m, v, av) {
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(); m.updateWorldMatrix(true, false); m.matrixWorld.decompose(wp, wq, ws)
  scene.attach(m); flyers.push({ m, v, av, floor: cur.py > -0.1 ? 0.02 : 0.02, t: 0 })
}
const spray = new THREE.InstancedMesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.85 }), 36); spray.count = 0; spray.frustumCulled = false; scene.add(spray)
const sprayP = []
function doSpray(n) {
  sprayP.length = 0; const o = new THREE.Vector3(); P.mouth.getWorldPosition(o)
  for (let i = 0; i < n; i++) sprayP.push({ p: o.clone(), v: new THREE.Vector3((S.rand() - 0.5) * 1.6, (S.rand() - 0.2) * 1.2, 1.4 + S.rand() * 2.2), s: 0.006 + S.rand() * 0.012 })
}

// ---------- 予定（ステージの音）
// 本物の音は間隔を揺らす（後のステージほど不規則）。ひっかけ（予告だけで来ない音）は本物の間に置く
function buildEvents(stg) {
  const real = [], out = []
  let prev = -99
  for (const e of stg.events.filter(e => !e.fake)) {
    let at = e.at + (S.rand() - 0.5) * 2 * stg.jit
    at = clamp(at, Math.max(stg.warn + 0.6, prev + stg.gMin), prev < 0 ? 99 : prev + stg.gMax); at = Math.min(at, D.STAGE_LEN - stg.peak - 1.2)
    real.push(at); prev = at
    out.push({ type: e.type, at, warn: stg.warn, peak: stg.peak, ws: at - stg.warn, fake: false })
  }
  for (const e of stg.events.filter(e => e.fake)) {
    const a = real[e.after], b = real[e.after + 1], w = stg.warn * 0.8
    const at = a + stg.peak + TAIL + w + (b - stg.warn - (a + stg.peak + TAIL + w)) * (0.2 + S.rand() * 0.5)
    out.push({ type: e.type, at, warn: w, peak: 0, ws: at - w, fake: true })
  }
  out.sort((x, y) => x.at - y.at)
  for (const e of out) Object.assign(e, { started: false, peaked: false, ph: 'idle', k: 0, lvl: 0 })
  return out
}
function evLevel(e, st) {
  if (st < e.ws) { e.ph = 'idle'; e.k = 0; return 0 }
  if (st < e.at) { e.ph = 'warn'; e.k = (st - e.ws) / e.warn; return 0.08 + 0.42 * e.k * e.k }
  if (e.fake) { if (st < e.at + 0.4) { e.ph = 'fizzle'; e.k = (st - e.at) / 0.4; return 0.5 * (1 - e.k) } e.ph = 'done'; e.k = 1; return 0 }
  // 山はまん中だけが一番うるさい（端はかき消しきれない）
  if (st < e.at + e.peak) { e.ph = 'peak'; e.k = (st - e.at) / e.peak; return 1 - 0.45 * Math.pow(Math.abs(2 * e.k - 1), 1.3) }
  if (st < e.at + e.peak + TAIL) { e.ph = 'tail'; e.k = (st - e.at - e.peak) / TAIL; return 0.55 * (1 - e.k) }
  e.ph = 'done'; e.k = 1; return 0
}
const maskOf = L => clamp((L - 0.35) / 0.55, 0, 1)

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id }
const ICON = {
  hold: '<path d="M9 11V5a2 2 0 0 1 4 0v6M13 10V8a2 2 0 0 1 4 0v5c0 5-3 8-7 8s-6-3-6-6v-3a2 2 0 0 1 4 0"/>',
  red: '<circle cx="12" cy="13" r="8"/><path d="M8 12l2 1-2 1M16 12l-2 1 2 1M10 17h4M7 3l1 2M12 2v2M17 3l-1 2"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M19 5a9 9 0 0 1 0 10M21.5 3a12 12 0 0 1 0 14"/>',
  go: '<path d="M12 2l2 6 6-2-4 5 5 4-6 0 1 6-4-4-4 4 1-6-6 0 5-4-4-5 6 2z"/>',
  key: '<rect x="2" y="8" width="20" height="9" rx="2"/><path d="M7 13h10"/>',
  touch: '<circle cx="12" cy="8" r="3"/><path d="M12 11v10M8 4a6 6 0 0 1 8 0"/>',
  up: '<path d="M12 20V6M6 12l6-6 6 6"/><path d="M4 3h16"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01"/>',
  phone: '<rect x="8" y="2" width="8" height="20" rx="2"/><path d="M11 18h2M4 8a6 6 0 0 0 0 8M20 8a6 6 0 0 1 0 8"/>',
  applause: '<path d="M8 13l-3-3a1.5 1.5 0 0 1 2-2l4 4M10 9l-2-3a1.5 1.5 0 0 1 2.5-1.5L14 9M14 9l-1-3a1.5 1.5 0 0 1 3-.5l1 6c1 4-1 8-5 8-2 0-4-1-5-3l-2-3"/><path d="M19 3l1-1M21 6h1"/>',
  gong: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M12 3v4M8 5l-2-2M16 5l2-2"/>',
  thunder: '<path d="M13 2L5 14h6l-2 8 10-13h-6z"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M4 18h16v3H4zM12 3v2M4 7l1.5 1M20 7l-1.5 1"/>',
  plane: '<path d="M2 14l20-7-5 13-4-5-6 2 2-4z"/>',
  proctor: '<rect x="8" y="2" width="8" height="20" rx="2"/><path d="M11 18h2M4 8a6 6 0 0 0 0 8M20 8a6 6 0 0 1 0 8"/>',
  cheer: '<path d="M4 20l9-9 3 3-9 9zM13 11l6-6a2 2 0 0 1 3 3l-6 6"/><circle cx="19" cy="19" r="2"/>',
}
const svg = (k, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}">${ICON[k]}</svg>`
const MC_FACE = '<circle cx="24" cy="24" r="19" fill="#ffd9b3" stroke="#1b1620" stroke-width="2.5"/><path d="M6 20c1-12 35-12 36 0-6-4-30-4-36 0z" fill="#3a2a22" stroke="#1b1620" stroke-width="2"/><circle cx="17" cy="24" r="2.6" fill="#1b1620"/><circle cx="31" cy="24" r="2.6" fill="#1b1620"/><path d="M18 31q6 7 12 0z" fill="#a8170d" stroke="#1b1620" stroke-width="1.5"/><circle cx="24" cy="27" r="3" fill="#f2a07a"/><rect x="36" y="31" width="6" height="13" rx="3" fill="#1b1620"/><circle cx="39" cy="30" r="5" fill="#9a9aa6" stroke="#1b1620" stroke-width="2"/>'

function applyLang() {
  const T = TT(); document.documentElement.lang = S.lang
  for (const el of document.querySelectorAll('[data-t]')) { const v = T[el.dataset.t]; if (typeof v === 'string') el.innerHTML = v }
  for (const el of document.querySelectorAll('[data-face]')) el.innerHTML = MC_FACE
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JP'
  const H = isTouch ? T.holdSP : T.holdPC, R = isTouch ? T.relSP : T.relPC
  $('#howSteps').innerHTML = T.howSteps.map(([ic, s]) => `<div class="step">${svg(ic)}<span>${s.replace('{HOLD}', H).replace('{REL}', R)}</span></div>`).join('')
  const evs = []; for (const st of D.stages) for (const e of st.events.filter(e => !e.fake)) evs.push(D.ev[e.type][S.lang])
  $('#evList').innerHTML = evs.map(s => `<span>${s}</span>`).join('')
  $('#gItch .mark').dataset.l = S.lang === 'ja' ? 'ハ…' : 'Ah...'
  $('#holdLab').textContent = S.holding ? T.holdOn : T.holdOff
  refreshSigns()
  if (S.mode === 'intro') fillIntro()
  if (S.mode === 'result' && S.result) fillResult(true)
}

// ---------- 擬音・吹き出し（3Dの上に重ねる HTML）
const FX = []
const _w = new THREE.Vector3()
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight } }
function fx(text, cls, o = {}) {
  const el = document.createElement('div'); el.className = cls; el.textContent = text; $('#fx').appendChild(el)
  const f = { el, t: 0, life: o.life || 1.3, world: o.world, x: o.x, y: o.y, rot: o.rot || 0, shake: o.shake || 0, size: o.size, dy: o.dy || 0, follow: o.follow }
  if (o.size) el.style.fontSize = o.size + 'px'
  FX.push(f); return f
}
function clearFx() { for (const f of FX) f.el.remove(); FX.length = 0 }
function updateFx(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i]; f.t += dt
    if (f.t > f.life) { f.el.remove(); FX.splice(i, 1); continue }
    let x = f.x, y = f.y
    if (f.follow) { npcHeadPos(f.follow, _hp); _hp.y += 0.38 * f.follow.g.scale.y; const s = toScreen(_hp); x = s.x; y = s.y }
    else if (f.world) { const s = toScreen(f.world); x = s.x; y = s.y }
    const w = f.el.offsetWidth, h = f.el.offsetHeight
    x = clamp(x, w / 2 + 6, innerWidth - w / 2 - 6); y = clamp(y + f.dy * f.t, h / 2 + 50, innerHeight - h / 2 - 6)
    const t = f.t, s = t < 0.1 ? t / 0.1 * 1.25 : t < 0.18 ? 1.25 - (t - 0.1) / 0.08 * 0.25 : 1
    const jx = f.shake ? (Math.sin(t * 90) * f.shake) : 0
    f.el.style.transform = `translate(${x + jx}px,${y}px) translate(-50%,-50%) rotate(${f.rot}deg) scale(${s})`
    f.el.style.opacity = String(clamp((f.life - t) / 0.3, 0, 1))
  }
}
const vmin = () => Math.min(innerWidth, innerHeight)

// ---------- 進行
function startRun() {
  Snd.init(); S.rec = []; S.maxDb = 0; S.photo = false; S.result = null
  const pc = $('#rPhoto').getContext('2d'); pc.clearRect(0, 0, 256, 256)
  startStage(0)
}
function setStage(id) {
  for (const k of ['library', 'temple', 'exam']) STG[k].grp.visible = k === id
  cur = STG[id]; P.root.position.y = cur.py
  scene.background.setHex(id === 'temple' ? 0x2a2030 : 0x2a2233)
  for (const n of cur.npcs) { npcIdle(n); n.yaw = 0; n.pitch = n.idlePitch; n.markT = -1; n.mark.scale.setScalar(0); n.eye = 1 }
  resetProps()
}
function resetProps() {
  for (const f of flyers) { if (f.m === P.glasses) continue; scene.remove(f.m) }
  for (const st of [STG.library, STG.temple, STG.exam]) for (const m of st.props) { st.grp.add(m); m.position.copy(m.userData.home.p); m.rotation.copy(m.userData.home.r) }
  flyers.length = 0; reattachGlasses()
}
function reattachGlasses() { P.head.add(P.glasses); P.glasses.position.copy(P.glassesHome); P.glasses.rotation.set(0, 0, 0) }
function startStage(i) {
  S.stageIdx = i; const stg = D.stages[i]
  setStage(stg.id); S.evs = buildEvents(stg); S.st = 0; S.gauge = stg.start; S.strain = 0; S.flush = 0; S.snz = null; S.react = 0; S.relief = 0; S.shame = 0; S.haStep = 0
  S.holding = false; S.toggled = false; S.ignoreUp = false; S.punch = -1; S.level = 0
  ambT = 0; S.capT = -1; S.doCap = false; S.later = []
  clearFx(); S.mode = 'intro'; S.modeT = 0; show('vPlay'); fillIntro(); $('#introCard').hidden = false; $('#endCard').hidden = true; $('#count').hidden = true; $('#hint').hidden = true
  Snd.setTrack('quiet'); updateHud()
}
function fillIntro() {
  const T = TT(), stg = D.stages[S.stageIdx], [nm, sub] = T.stages[stg.id]
  $('#iNo').textContent = `${T.stage} ${S.stageIdx + 1} / 3`; $('#iName').textContent = nm; $('#iSub').textContent = sub
  const ctrl = isTouch ? T.ctrlSP : T.ctrlPC
  $('#iCtrl').innerHTML = S.stageIdx === 0 ? ctrl.map(([ic, s]) => `<div>${svg(ic)}<span>${s}</span></div>`).join('') : ''
  $('#iCtrl').hidden = S.stageIdx !== 0
  $('#hStage').textContent = `${T.stage} ${S.stageIdx + 1}`
}
function beginCount() {
  if (S.mode !== 'intro') return
  Snd.init(); Snd.sfx('tap'); $('#introCard').hidden = true; S.mode = 'count'; S.modeT = 0; S.cIdx = -1
}
function endStage() {
  S.mode = 'stageEnd'; S.modeT = 0; S.holding = false; S.toggled = false
  const T = TT(), nxt = D.stages[S.stageIdx + 1]
  $('#eName').textContent = T.stages[D.stages[S.stageIdx].id][0]
  const rs = S.rec.filter(r => r.stage === S.stageIdx)
  $('#eTally').textContent = T.tally.replace('{A}', rs.filter(r => r.m >= 0.5).length).replace('{B}', rs.filter(r => r.m < 0.5).length)
  $('#eSub').textContent = nxt ? T.next.replace('{N}', T.stages[nxt.id][0]) : T.last
  $('#endCard').hidden = false; $('#hint').hidden = true
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
  if (S.mode === 'play' && S.gauge >= TH && !S.snz && S.st < D.STAGE_LEN) triggerSneeze('release')
}
function triggerSneeze(kind) {
  S.snz = { t: 0, kind, impact: false }
  Snd.sneezeHa(kind === 'explode' ? 1.3 : 1)
  const T = TT()
  if (kind === 'explode') fx(T.rate.explode, 'ono red', { world: headTop(), size: vmin() * 0.1, life: 0.6, shake: 4, rot: -6 })
}
const _ht = new THREE.Vector3()
function headTop() { return P.head.getWorldPosition(_ht).clone().add(new THREE.Vector3(0.25, 0.35, 0)) }
function mouthPos() { const v = new THREE.Vector3(); P.mouth.getWorldPosition(v); return v }
function sneezeImpact() {
  const s = S.snz; s.impact = true
  const L = S.level, stg = D.stages[S.stageIdx]
  let m = maskOf(L); if (s.kind === 'explode') m = Math.max(0, m - 0.5)
  let rating = D.rateOf(m); if (s.kind === 'explode' && (rating === 'busted' || rating === 'sus')) rating = 'explode'
  const db = 84 + S.gauge * 18 + S.strain * 28 + (s.kind === 'explode' ? 22 : s.kind === 'auto' ? 7 : 0) + S.rand() * 4
  s.rating = rating; s.m = m; s.db = Math.round(db * 10) / 10
  S.rec.push({ stage: S.stageIdx, t: Math.round(S.st * 100) / 100, L: Math.round(L * 100) / 100, m, rating, db: s.db, kind: s.kind })
  if (s.db > S.maxDb) { S.maxDb = s.db; S.capT = 0 }
  S.gauge = 0; S.flush = Math.max(S.flush, S.strain); S.strain = 0; S.haStep = 0
  const T = TT(), big = rating === 'busted' || rating === 'explode', mp = mouthPos()
  doSpray(big ? 36 : 18)
  if (big) {
    Snd.sneezeShon(1.15, true, true); Snd.duck(2.2)
    later(0.38, () => Snd.sfx('scratch')); later(0.65, () => Snd.sfx('gasp'))
    fx(s.kind === 'explode' ? T.sneezeBig : T.sneeze, 'ono red', { world: mp.clone().add(new THREE.Vector3(0.3, 0.22, 0)), size: vmin() * (s.kind === 'explode' ? 0.12 : 0.11), life: 1.6, shake: 5, rot: -8, dy: -10 })
    S.react = 1.2; S.shame = 2.2; S.punch = 0; S.shake = 0.06
    // 全員が振り向く
    const hp = P.head.getWorldPosition(new THREE.Vector3())
    cur.npcs.forEach((n, i) => { n.reactT = 0.05 + i * 0.03; n.reactKind = '!'; n.reactUntil = 2.6 })
    const auth = cur.npcs.find(n => n.role === 'auth') || cur.npcs[1], others = cur.npcs.filter(n => n !== auth && !n.kid)
    const sh = T.shout[D.stages[S.stageIdx].id]
    later(0.7, () => { fx(sh[0], 'sb', { follow: auth, life: 1.8 }); if (D.stages[S.stageIdx].id === 'library') Snd.sfx('shh') })
    const o2 = others[Math.floor(S.rand() * others.length)]
    const line2 = sh[1 + Math.floor(S.rand() * 2)]; later(1.1, () => fx(line2, 'sb', { follow: o2, life: 1.5 }))
    // メガネが飛ぶ・机の物が落ちる
    if (P.glasses.parent === P.head) { fling(P.glasses, new THREE.Vector3(0.6 + S.rand() * 0.4, 2.3, 1.3), new THREE.Vector3(9, 4, 12)); later(0.6, () => Snd.sfx('clink')) }
    const pr = cur.props.find(m => m.parent === cur.grp); if (pr) { fling(pr, new THREE.Vector3(-0.8 - S.rand(), 1.4, 0.8), new THREE.Vector3(6, 2, 8)); later(0.52, () => Snd.sfx('thud')) }
    later(1.5, () => { if (S.mode === 'play') fx(S.lang === 'ja' ? 'シーン…' : 'silence...', 'ono small', { x: innerWidth * 0.78, y: innerHeight * 0.3, size: vmin() * 0.07, life: 1.4, rot: 6 }) })
    void hp
  } else {
    Snd.sneezeShon(m >= 0.9 ? 0.3 : 0.5, false, false)
    fx(T.sneezeSmall, 'ono small', { world: mp, size: vmin() * 0.045, life: 1.1, rot: -4, dy: -14 })
    if (rating === 'sus') {
      Snd.sfx('sus')
      const near = [...cur.npcs].filter(n => !n.kid).sort((a, b) => Math.abs(a.base.z) + Math.abs(a.base.x) - Math.abs(b.base.z) - Math.abs(b.base.x)).slice(0, 2)
      near.forEach(n => { n.reactT = 0.15; n.reactKind = '?'; n.reactUntil = 1.6 })
      fx(T.glance, 'sb', { follow: near[0], life: 1.3 })
    } else { S.relief = 1.6; Snd.sfx(rating === 'perfect' ? 'perfect' : 'safe') }
  }
  const land = innerWidth > innerHeight * 1.2
  fx(T.rate[rating], 'verdict ' + rating, land ? { x: innerWidth * 0.73, y: innerHeight * 0.55, life: 1.3 } : { x: innerWidth / 2, y: Math.max(104, innerHeight * 0.17), life: 1.3 })
}

function later(sec, fn) { S.later.push({ t: sec, fn }) }
function updateGame(dt) {
  S.time += dt; S.modeT += dt
  for (let i = S.later.length - 1; i >= 0; i--) { const l = S.later[i]; l.t -= dt; if (l.t <= 0) { S.later.splice(i, 1); l.fn() } }
  const stg = D.stages[S.stageIdx]
  if (S.mode === 'title' || S.mode === 'how') {
    const c = (S.time % 7) / 7
    S.gauge = c < 0.75 ? c / 0.75 * 0.9 : c < 0.8 ? 0.9 : 0.05; S.strain = 0; S.holding = false
    if (c > 0.8 && c < 0.83 && !S.snz) S.snz = { t: 0, kind: 'demo', impact: true, demo: true }
  } else if (S.mode === 'count') {
    const idx = Math.floor(S.modeT / 0.6)
    if (idx !== S.cIdx && idx < 4) { S.cIdx = idx; const el = $('#count'); el.hidden = false; el.textContent = TT().count[idx]; Snd.sfx(idx < 3 ? 'count' : 'go') }
    if (S.modeT >= 2.4) { $('#count').hidden = true; S.mode = 'play'; S.modeT = 0; if (S.stageIdx === 0 && !S.everHeld) showHint(isTouch ? TT().hintSP : TT().hintPC) }
  } else if (S.mode === 'play') {
    S.st += dt
    let L = 0
    for (const e of S.evs) {
      L = Math.max(L, evLevel(e, S.st))
      if (!e.started && S.st >= e.ws) { e.started = true; Snd.event(e.type, Math.max(0.05, e.at - S.st), e.peak, e.fake) }
      if (!e.peaked && S.st >= e.at) { e.peaked = true; if (e.fake) onFizzle(e); else onPeak(e) }
    }
    S.level = L
    if (S.st < D.STAGE_LEN) {
      if (S.snz && !S.snz.impact) { /* 「ハッ」の間はゲージ止め */ }
      else if (S.react > 0) S.react -= dt
      else if (S.holding) { S.gauge += stg.slow * dt; S.strain += stg.strainUp * dt }
      else { S.gauge += stg.fast * dt; S.strain -= stg.strainDown * dt }
      S.strain = clamp(S.strain, 0, 1); S.gauge = clamp(S.gauge, 0, 1)
      if (!S.snz) { if (S.strain >= 1) triggerSneeze('explode'); else if (S.gauge >= 1) triggerSneeze('auto') }
      // ハッ…ハッ…（離している時）と、んぐぐ…（我慢中）
      if (!S.holding && !S.snz) { const steps = [0.45, 0.65, 0.85]; if (S.haStep < 3 && S.gauge >= steps[S.haStep]) { const T = TT(); fx(T.ha[S.haStep], 'ono small yel', { world: headTop(), size: vmin() * (0.04 + S.haStep * 0.01), life: 0.9, rot: 6, dy: -10 }); Snd.sneezeHa(0.35 + S.haStep * 0.15); S.haStep++ } }
      if (S.holding) { S.haStep = S.gauge >= 0.85 ? 2 : S.gauge >= 0.65 ? 1 : S.gauge >= 0.45 ? 0 : 0; S.humT -= dt; if (S.strain > 0.55 && S.humT <= 0) { S.humT = 1.3; fx(TT().hum, 'ono small', { world: headTop(), size: vmin() * 0.04, life: 1.0, rot: -5, shake: 2 }); Snd.sfx('hum') } }
      ambient(dt)
    }
    // 1ステージ目だけの助言
    if (S.stageIdx === 0) {
      if (S.everHeld && $('#hint').dataset.k === 'hold') $('#hint').hidden = true
      const e = S.evs.find(e => e.ph === 'peak' || (e.ph === 'warn' && e.k > 0.85))
      if (e && S.holding && S.gauge >= TH && !S.snz) showHint(TT().hintRel, 'rel'); else if ($('#hint').dataset.k === 'rel') $('#hint').hidden = true
    }
    if (S.st >= D.STAGE_LEN && (!S.snz || S.snz.t > 1.0)) endStage()
  } else if (S.mode === 'stageEnd') {
    S.level = 0; S.st += dt; for (const e of S.evs) evLevel(e, S.st); S.gauge = Math.max(0, S.gauge - dt * 0.6)
    if (S.modeT > 2.3) { $('#endCard').hidden = true; if (S.stageIdx < 2) startStage(S.stageIdx + 1); else toResult() }
  } else if (S.mode === 'result') updateReveal(dt)
  // くしゃみの経過
  if (S.snz) {
    S.snz.t += dt
    if (!S.snz.impact && S.snz.t >= PRE) sneezeImpact()
    if (S.snz.t > 1.2) S.snz = null
  }
  if (S.capT >= 0) { S.capT -= dt; if (S.capT < 0) S.doCap = true }
  S.flush = Math.max(S.strain, S.flush - dt * 0.5)
  S.relief = Math.max(0, S.relief - dt); S.shame = Math.max(0, S.shame - dt)
  S.shake = Math.max(0, S.shake - dt * 0.12)
}
function showHint(txt, k = 'hold') { const h = $('#hint'); h.textContent = txt; h.dataset.k = k; h.hidden = false }
function onPeak(e) {
  const T = TT(), lab = D.ev[e.type][S.lang === 'ja' ? 'sj' : 'se']
  const src = cur.lookAt(e.type), s = toScreen(src)
  fx(lab, 'ono yel', { x: clamp(s.x, innerWidth * 0.2, innerWidth * 0.8), y: clamp(s.y, innerHeight * 0.32, innerHeight * 0.44), size: vmin() * 0.085, life: e.peak + 0.5, rot: (S.rand() - 0.5) * 16, shake: 3 })
  S.shake = Math.max(S.shake, 0.025); void T
}
function onFizzle(e) {
  const s = toScreen(cur.lookAt(e.type))
  fx(S.lang === 'ja' ? '…あれ？' : '...huh?', 'ono small', { x: clamp(s.x, innerWidth * 0.2, innerWidth * 0.8), y: clamp(s.y, innerHeight * 0.32, innerHeight * 0.44), size: vmin() * 0.055, life: 1.1, rot: 5 })
}
let ambT = 0
function ambient(dt) {
  ambT -= dt; if (ambT > 0) return
  const id = D.stages[S.stageIdx].id
  if (id === 'library') { Snd.sfx('page'); ambT = 1.5 + S.rand() * 2 }
  else if (id === 'temple') { Snd.sfx('pok'); ambT = 0.8 }
  else { Snd.sfx('pencil'); ambT = 0.25 + S.rand() * 0.6 }
}

// ---------- 結果
function toResult() {
  S.mode = 'result'; S.resT = 0; S.revealStep = 0; clearFx(); S.later = []
  let sumM = 0, den = 0; const per = []
  for (let i = 0; i < 3; i++) {
    const rs = S.rec.filter(r => r.stage === i), ev = D.stages[i].events.filter(e => !e.fake).length, m = rs.reduce((a, r) => a + r.m, 0)
    sumM += m; den += Math.max(rs.length, ev)
    per.push({ safe: rs.filter(r => r.m >= 0.5).length, n: rs.length, ev, pct: Math.round(100 * m / Math.max(rs.length, ev)) })
  }
  const pct = Math.round(100 * sumM / Math.max(1, den))
  const rank = D.ranks.find(r => pct >= r.min)
  const db = S.maxDb || 0
  S.result = { pct, rank, db, per, cmp: D.dbCmp.find(c => db < c.max) || D.dbCmp[D.dbCmp.length - 1] }
  S.mood = pct >= 60 ? 'proud' : 'shame'
  setStage(D.stages[2].id)
  show('vResult'); fillResult(false)
  Snd.setTrack(null); Snd.sfx('drum')
}
function reachText(db) { const m = Math.pow(10, (db - 60) / 20); return m >= 1000 ? (Math.round(m / 100) / 10) + 'km' : Math.round(m) + 'm' }
function fillResult(keep) {
  const T = TT(), r = S.result, L = S.lang
  $('#rRank').textContent = r.rank.t[L]; $('#rRank').style.color = r.rank.col
  $('#rStamp').textContent = r.rank.st[L]; $('#rStamp').style.whiteSpace = 'pre'
  $('#rDbN').textContent = r.db ? r.db.toFixed(1) + ' dB' : '-'
  $('#rDbC').textContent = r.db ? `${r.cmp.t[L]} / ${T.reach.replace('{R}', reachText(r.db))}` : ''
  $('#rStages').innerHTML = r.per.map((p, i) => `<div>${T.stCol[i]}<b>${p.pct}%</b>${T.safeOf.replace('{A}', p.safe).replace('{B}', p.ev)}</div>`).join('')
  $('#rCmt').textContent = r.rank.c[L]
  if (!keep) { $('#rPct').textContent = '0'; for (const el of document.querySelectorAll('#vResult .reveal')) el.classList.remove('on'); $('#rStamp').classList.remove('on') }
  if (!S.photo) drawNoPhoto()
}
function drawNoPhoto() { const c = $('#rPhoto').getContext('2d'); c.fillStyle = '#ffd9b3'; c.fillRect(0, 0, 256, 256) }
function updateReveal(dt) {
  S.resT += dt; const r = S.result, t = S.resT
  if (t < 1.6) $('#rPct').textContent = String(Math.floor(S.rand() * 100))
  else if (t < 2.6) $('#rPct').textContent = String(Math.round(r.pct * ease((t - 1.6) / 1.0)))
  else $('#rPct').textContent = String(r.pct)
  const step = (n, at, fn) => { if (S.revealStep < n && t >= at) { S.revealStep = n; fn() } }
  step(1, 2.6, () => { $('#rStamp').classList.add('on'); $('#rRank').classList.add('on'); Snd.sfx('stamp'); Snd.sfx(r.pct >= 60 ? 'fanfare' : 'wahwah'); Snd.setTrack(r.pct >= 60 ? 'happy' : 'sad'); S.shake = 0.03 })
  step(2, 3.2, () => { $('#rDb').classList.add('on'); Snd.sfx('boom') })
  step(3, 3.7, () => { $('#rStages').classList.add('on'); Snd.sfx('tap') })
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
  fitText(x, T.cardTitle, W - 200, 70, disp); x.fillText(T.cardTitle, W / 2, 160)
  x.font = `30px ${disp}`; x.fillStyle = r.rank.col; x.fillText(L === 'ja' ? 'HOLD THAT SNEEZE' : 'SNEEZE NINJA CERTIFICATE', W / 2, 205)
  // 写真
  const ph = $('#rPhoto'), px = 110, py = 250, ps = 440
  x.save(); roundRect(x, px, py, ps, ps, 30); x.clip(); x.drawImage(ph, px, py, ps, ps); x.restore()
  roundRect(x, px, py, ps, ps, 30); x.lineWidth = 8; x.strokeStyle = '#1b1620'; x.stroke()
  x.save(); x.translate(px + 18, py + 78); x.rotate(-0.1); x.textAlign = 'left'; x.font = `56px ${disp}`; x.lineWidth = 14; x.strokeStyle = '#1b1620'; x.lineJoin = 'round'; const sz = L === 'ja' ? 'ハックション!!' : 'ACHOO!!'; x.strokeText(sz, 0, 0); x.fillStyle = '#ff3d2e'; x.fillText(sz, 0, 0); x.restore()
  // 数字
  x.fillStyle = '#1b1620'; x.font = `34px ${round}`; x.font = `900 34px ${round}`; x.fillText(T.ninja, 760, 330)
  { let f = 190, nw, pw; const num = String(r.pct)
    for (;;) { x.font = `${f}px ${disp}`; nw = x.measureText(num).width; x.font = `${f * 0.37}px ${disp}`; pw = x.measureText('%').width; if (nw + pw + 8 <= 400 || f <= 80) break; f -= 6 }
    const sx = 765 - (nw + pw + 8) / 2; x.textAlign = 'left'; x.fillStyle = '#ff3d2e'; x.font = `${f}px ${disp}`; x.fillText(num, sx, 520); x.font = `${f * 0.37}px ${disp}`; x.fillText('%', sx + nw + 8, 520); x.textAlign = 'center' }
  // ハンコ
  x.save(); x.translate(868, 612); x.rotate(-0.25); x.beginPath(); x.arc(0, 0, 92, 0, 7); x.fillStyle = 'rgba(255,248,236,.9)'; x.fill(); x.lineWidth = 10; x.strokeStyle = '#ff3d2e'; x.stroke(); x.fillStyle = '#ff3d2e'; x.textBaseline = 'middle'
  const sl = r.rank.st[L].split('\n'); x.font = `${sl.length > 1 ? 46 : 60}px ${disp}`; sl.forEach((s, i) => x.fillText(s, 0, (i - (sl.length - 1) / 2) * 50)); x.restore(); x.textBaseline = 'alphabetic'
  // 称号
  x.fillStyle = r.rank.col; const fs = fitText(x, r.rank.t[L], W - 200, 64, disp); void fs; x.fillText(r.rank.t[L], W / 2, 780)
  // デシベル
  roundRect(x, 110, 820, W - 220, 230, 26); x.fillStyle = '#1b1620'; x.fill()
  x.fillStyle = '#ffd21f'; x.font = `900 32px ${round}`; x.fillText(T.maxDb, W / 2, 875)
  x.fillStyle = '#fff8ec'; x.font = `110px ${disp}`; x.fillText(r.db ? r.db.toFixed(1) + ' dB' : '-', W / 2, 985)
  x.font = `900 30px ${round}`; const cmp = r.db ? `${r.cmp.t[L]} / ${T.reach.replace('{R}', reachText(r.db))}` : ''; fitText(x, cmp, W - 280, 30, round); x.font = x.font.replace(/^(\d+px)/, '900 $1'); x.fillText(cmp, W / 2, 1030)
  // ステージ
  r.per.forEach((p, i) => {
    const bw = (W - 260) / 3, bx = 110 + i * (bw + 20), by = 1075
    roundRect(x, bx, by, bw, 110, 20); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1b1620'; x.stroke()
    x.fillStyle = '#1b1620'; x.font = `900 26px ${round}`; x.fillText(T.stCol[i], bx + bw / 2, by + 36); x.font = `46px ${disp}`; x.fillText(p.pct + '%', bx + bw / 2, by + 90)
  })
  x.fillStyle = '#1b1620'; x.font = `900 28px ${round}`; x.fillText(T.cardFoot, W / 2, 1255)
  return c
}
function loadFonts(text) { if (!document.fonts || !document.fonts.load) return Promise.resolve(); return Promise.all(['"Dela Gothic One"', '900 10px "Zen Maru Gothic"'].map(f => document.fonts.load((f.includes('10px') ? f : '40px ' + f), text).catch(() => {}))) }
function cardText() { const T = TT(), r = S.result, L = S.lang; return [T.cardTitle, T.ninja, r.rank.t[L], r.rank.st[L], T.maxDb, r.cmp.t[L], T.reach, T.stCol.join(''), T.cardFoot, 'ハックション!!ACHOO0123456789.%dBkm HOLD THAT SNEEZE CERTIFICATE'].join('') }
async function cardURL() { await loadFonts(cardText()); return drawCard().toDataURL('image/png') }
const PUBLIC_URL = 'https://tom3games.github.io/sneeze-quiet/'
function xPost() {
  const r = S.result, T = TT(), text = T.share.replace('{P}', r.pct).replace('{R}', r.rank.t[S.lang]).replace('{D}', r.db.toFixed(1))
  return { text, url: PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PUBLIC_URL)}` }
}
function openX() { if (!S.result) return; Snd.sfx('tap'); window.open(xPost().href, '_blank', 'noopener') }
async function saveCard() {
  Snd.sfx('tap'); await loadFonts(cardText())
  const c = drawCard(), blob = await new Promise(r => c.toBlob(r, 'image/png'))
  if (!blob) return
  const r = S.result, T = TT(), text = T.share.replace('{P}', r.pct).replace('{R}', r.rank.t[S.lang]).replace('{D}', r.db.toFixed(1))
  try {
    const file = new File([blob], 'sneeze-quiet.png', { type: 'image/png' })
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + ' https://tom3games.github.io/sneeze-quiet/' }); return }
  } catch (e) { if (e && e.name === 'AbortError') return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sneeze-quiet.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// ---------- 見た目の更新（毎フレーム）
const _c = new THREE.Color()
function updatePlayer(dt) {
  const t = S.time, sn = S.snz, hold = S.holding && S.mode === 'play'
  const itch = S.gauge, strain = hold ? S.strain : S.strain * 0.6, flush = S.flush
  let pitch = -0.3 * itch * (hold ? 0.35 : 1) + Math.sin(t * (3 + 6 * itch)) * 0.035 * itch
  let eyeOpen = (1 - 0.55 * itch) * (hold ? 1 - 0.85 * strain : 1), squeeze = hold && strain > 0.5
  let mx = 0.8 + 0.25 * itch, my = 0.25 + 1.3 * itch, lips = hold, smile = false, lean = 0, pupilS = 1
  let browA = hold ? strain * 0.45 : -0.3 * itch, browY = 0.03 * itch
  if (sn) {
    if (!sn.impact || sn.t < PRE) { const k = ease(sn.t / PRE); pitch = lerp(pitch, -0.5, k); squeeze = true; mx = 1.1; my = 1.7; lips = false }
    else {
      const k = sn.t - PRE
      pitch = k < 0.06 ? lerp(-0.5, 0.3, k / 0.06) : lerp(0.3, 0, ease((k - 0.06) / 0.7)); lean = k < 0.5 ? 0.22 * (1 - k / 0.5) : 0
      squeeze = k < 0.45; mx = k < 0.3 ? 1.5 : lerp(1.5, 0.6, ease((k - 0.3) / 0.4)); my = k < 0.3 ? 1.6 : lerp(1.6, 0.3, ease((k - 0.3) / 0.4)); lips = false
    }
  }
  if (!sn && S.relief > 0) { eyeOpen = 0.12; smile = true; browA = -0.1; my = 0 }
  if (!sn && S.shame > 0) { eyeOpen = 1.3; pupilS = 0.5; squeeze = false; mx = 0.5; my = 0.55; browA = -0.4; browY = 0.04 }
  if (S.mode === 'result') {
    if (S.mood === 'proud') { eyeOpen = 0.15; smile = true; browA = 0.15; pitch = -0.12; my = 0 } else { eyeOpen = 1.25; pupilS = 0.5; mx = 0.5; my = 0.5; browA = -0.4 }
    squeeze = false; lips = false
  }
  P.pivot.rotation.x = lerp(P.pivot.rotation.x, pitch, sn ? 0.6 : 0.2)
  P.torso.rotation.x = lerp(P.torso.rotation.x, lean, 0.3)
  const trem = hold ? strain * strain * 0.012 : 0
  P.head.position.set((Math.random() - 0.5) * trem, 0.24 + (Math.random() - 0.5) * trem, 0)
  P.head.rotation.z = Math.sin(t * 2.1) * 0.03 + (S.mode === 'result' && S.mood === 'proud' ? 0.12 : 0)
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1
    P.eyes[i].visible = !squeeze; P.squint[i].visible = squeeze
    P.eyes[i].scale.set(1, clamp(eyeOpen, 0.08, 1.4), 1)
    P.pupils[i].scale.set(0.03 * pupilS, 0.033 * pupilS, 0.014)
    P.brows[i].rotation.z = s * browA; P.brows[i].position.y = 0.14 + browY
    P.nostrils[i].scale.set(0.018 * (1 + 1.3 * itch), 0.013 * (1 + 1.6 * itch), 0.012)
    const puff = 1 + (hold ? 0.9 * strain : 0)
    P.cheeks[i].scale.set(0.052 * puff, 0.034 * puff, 0.016 * puff)
    P.cheeks[i].material.color.setHex(flush > 0.3 || S.shame > 0 ? 0xff4a4a : 0xff9a9a); P.cheeks[i].material.opacity = 0.45 + 0.5 * Math.max(flush, S.shame > 0 ? 0.8 : 0)
    P.drops[i].visible = flush > 0.45 || S.shame > 0; P.drops[i].position.y = 0.1 - ((t * 0.5 + i * 0.5) % 1) * 0.16
  }
  const tw = Math.sin(t * 38) * 0.08 * itch * (hold ? 0.5 : 1) + Math.sin(t * 13) * 0.04 * itch
  P.nose.scale.set(0.072 * (1 + tw + 0.1 * itch), 0.064 * (1 - tw * 0.5 + 0.1 * itch), 0.066 * (1 + 0.1 * itch))
  P.noseM.color.lerpColors(NOSE, NOSE_R, clamp(itch * 0.8 + flush * 0.3, 0, 1))
  P.mouth.visible = !lips && !smile && my > 0.05; P.lips.visible = lips; P.smile.visible = smile
  P.mouth.scale.set(0.06 * mx, 0.03 * my, 0.02)
  P.lips.scale.set(0.11 * (1 + 0.25 * strain), 0.018, 0.02)
  const fk = Math.pow(flush, 1.2)
  _c.lerpColors(SKIN, RED, fk); if (flush > 0.85) _c.lerp(PURPLE, (flush - 0.85) / 0.15 * (0.5 + 0.5 * Math.sin(t * 20)) * 0.6)
  P.skin.color.copy(_c)
  P.vein.visible = flush > 0.7; P.vein.scale.setScalar(1 + 0.3 * Math.sin(t * 16))
  P.ahoge.rotation.z = Math.sin(t * 9) * 0.25 * (0.3 + itch)
}
function updateNPCs(dt) {
  const hp = P.head.getWorldPosition(new THREE.Vector3())
  const act = S.evs.find(e => (e.ph === 'warn' && e.k > 0.55) || e.ph === 'peak' || (e.ph === 'tail' && e.k < 0.6))
  for (const n of cur.npcs) {
    n.phase += dt
    if (n.reactT !== undefined && n.reactT >= 0) {
      n.reactT -= dt
      if (n.reactT < 0) { n.reacting = n.reactUntil; npcMark(n, n.reactKind); n.reactT = undefined; if (n.reactKind === '!') n.tEye = 1.6; else n.tEye = 1.2 }
    }
    if (n.reacting > 0) { n.reacting -= dt; npcLook(n, hp, n.reactKind === '!' ? 1 : 0.6); if (n.reacting <= 0) npcIdle(n) }
    else if (act && S.mode === 'play' && cur.srcOf(act.type) !== n) { npcLook(n, cur.lookAt(act.type), 0.9); n.tEye = act.ph === 'peak' ? 1.25 : 1 }
    else npcIdle(n)
    if (S.mode === 'result' && S.mood === 'shame') { npcLook(n, hp, 0.8); n.tEye = 1.3 }
    const sp = n.reacting > 0 ? 14 : 6
    n.yaw += (n.tYaw - n.yaw) * Math.min(1, dt * sp); n.pitch += (n.tPitch - n.pitch) * Math.min(1, dt * sp); n.eye += (n.tEye - n.eye) * Math.min(1, dt * 10)
    n.pivot.rotation.set(n.pitch + Math.sin(n.phase * 1.3) * 0.02, n.yaw * 0.75, 0); n.body.rotation.y = n.yaw * 0.25
    for (const e of n.eyes) e.scale.setScalar(n.eye)
    for (const p of n.pupils) p.scale.set(0.022 / Math.max(1, n.eye * 0.9), 0.024 / Math.max(1, n.eye * 0.9), 0.01)
    n.mouth.scale.set(0.06 * (n.eye > 1.3 ? 0.5 : 1), 0.014 * (n.eye > 1.3 ? 3 : 1), 0.012)
    const shake = n.shake ? Math.sin(S.time * 40) * 0.03 : 0, bounce = n.bounce ? Math.abs(Math.sin(S.time * 14 + n.phase)) * 0.06 * n.bounce : 0
    n.g.position.x = n.base.x + shake; n.g.position.y = n.base.y + (n.role === 'auth' || n.role === 'teller' ? 0.32 : 0) + bounce
    if (n.role === 'auth' || n.role === 'teller') n.g.position.y = 0.32 + bounce
    if (n.markT >= 0) { n.markT += dt; const k = n.markT, s = k < 0.12 ? k / 0.12 * 0.42 : k < 0.2 ? 0.42 - (k - 0.12) * 1.2 : k < 1.6 ? 0.32 : Math.max(0, 0.32 - (k - 1.6) * 1.5); n.mark.scale.setScalar(s * (1 / n.g.scale.x) * (n.kid ? 0.8 : 1)); if (s <= 0 && k > 1.6) n.markT = -1 }
  }
}
function updateFlyers(dt) {
  for (const f of flyers) {
    f.t += dt; if (f.rest) continue
    f.v.y -= 9.8 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.av.x * dt; f.m.rotation.y += f.av.y * dt; f.m.rotation.z += f.av.z * dt
    if (f.m.position.y < f.floor) { f.m.position.y = f.floor; f.v.y *= -0.35; f.v.x *= 0.6; f.v.z *= 0.6; f.av.multiplyScalar(0.5); if (Math.abs(f.v.y) < 0.4) f.rest = true }
  }
  // メガネは反応が終わったら掛け直す
  if (P.glasses.parent !== P.head && S.shame <= 0.15 && S.mode !== 'result') { const i = flyers.findIndex(f => f.m === P.glasses); if (i >= 0) flyers.splice(i, 1); reattachGlasses(); if (S.mode === 'play') Snd.sfx('pop') }
  if (sprayP.length) {
    const m4 = new THREE.Matrix4(); let n = 0
    for (const p of sprayP) { p.v.y -= 3 * dt; p.p.addScaledVector(p.v, dt); p.s *= 0.985; if (p.s > 0.002) { m4.makeScale(p.s, p.s, p.s); m4.setPosition(p.p); spray.setMatrixAt(n++, m4) } }
    spray.count = n; spray.instanceMatrix.needsUpdate = true; if (!n) sprayP.length = 0
  } else spray.count = 0
}
// カメラ（縦画面と横画面で寄り方を変える）
const camBase = { d: 1.7, fov: 46, ly: 0.12, lx: 0, h: 0.12, x: 0.32 }
function frameCamera() {
  const a = innerWidth / innerHeight
  if (a < 0.62) Object.assign(camBase, { d: 2.5, fov: 50, ly: 0.28, lx: -0.08, h: 0.68, x: 0.55 })
  else if (a < 1) Object.assign(camBase, { d: 2.4, fov: 46, ly: 0.22, lx: -0.04, h: 0.55, x: 0.5 })
  else if (a < 1.9) Object.assign(camBase, { d: 2.2, fov: 40, ly: 0.12, lx: 0.3, h: 0.2, x: 0.45 })
  else Object.assign(camBase, { d: 2.1, fov: 38, ly: 0.1, lx: 0.4, h: 0.18, x: 0.5 })
  camera.fov = camBase.fov; camera.aspect = a; camera.updateProjectionMatrix()
}
const _hc = new THREE.Vector3(), _look = new THREE.Vector3()
function updateCamera(dt) {
  const hy = 1.4 + cur.py
  let d = camBase.d, ox = camBase.x, oy = camBase.h, lx = camBase.lx, ly = camBase.ly
  if (S.mode === 'title' || S.mode === 'how') { ox += Math.sin(S.time * 0.3) * 0.12; d += 0.15 }
  if (S.mode === 'result') { d *= S.mood === 'shame' ? 1.25 : 0.9; lx -= 0.05; ly += innerWidth / innerHeight < 1 ? 0.18 : 0.05 }
  if (S.punch >= 0) {
    S.punch += dt; const k = S.punch
    const z = k < 0.2 ? lerp(1, 0.72, ease(k / 0.2)) : k < 0.55 ? 0.72 : k < 0.95 ? lerp(0.72, 1.75, ease((k - 0.55) / 0.4)) : k < 2.0 ? 1.75 : lerp(1.75, 1, ease((k - 2.0) / 0.6))
    d *= z; oy += (z - 1) * 0.3
    if (k > 2.6) S.punch = -1
  }
  const sh = S.shake + (S.level > 0.9 ? 0.008 : 0)
  _hc.set(ox + (Math.random() - 0.5) * sh, hy + oy + (Math.random() - 0.5) * sh, d)
  camera.position.lerp(_hc, S.punch >= 0 ? 0.35 : Math.min(1, dt * 6))
  _look.set(lx, hy + ly - 0.05, 0); camera.lookAt(_look)
}
function updateLights() {
  const f = S.flash || 0, dim = S.dim || 0
  hemi.intensity = 1.9 * (1 - dim) + f * 2.2; sun.intensity = 1.5 * (1 - dim) + f * 1.5
}
let winT = 0
function updateScene(dt) {
  S.flash = 0; S.dim = 0
  cur.tick(S.st, dt)
  winT += dt
  if (winT > 1 / 30) { winT = 0; const { ctx, c } = winTex.userData; cur.paint(ctx, c.width, c.height, S.st); winTex.needsUpdate = true }
  updateLights(); updatePlayer(dt); updateNPCs(dt); updateFlyers(dt); updateCamera(dt)
}

// ---------- HUD
const hud = { time: $('#hTime'), nBar: $('#nBar'), nI: $('#nBar i'), ev: $('#hEv'), gI: $('#gItch i'), gS: $('#gStrain i'), gSb: $('#gStrain'), hold: $('#bHold'), holdLab: $('#holdLab') }
let lastEvKey = ''
function updateHud() {
  if (S.mode !== 'play' && S.mode !== 'count' && S.mode !== 'intro' && S.mode !== 'stageEnd') return
  hud.time.textContent = String(Math.max(0, Math.ceil(D.STAGE_LEN - S.st)))
  hud.nI.style.width = (S.level * 100).toFixed(1) + '%'; hud.nBar.classList.toggle('mask', S.level >= 0.62)
  const e = S.evs.find(e => e.ph === 'warn' || e.ph === 'peak' || e.ph === 'tail'), key = e ? e.type + e.ph : ''
  if (key !== lastEvKey) { lastEvKey = key; hud.ev.innerHTML = e ? svg(e.type) + `<span>${D.ev[e.type][S.lang]}</span>` : ''; hud.ev.classList.toggle('hot', !!e && e.ph === 'peak') }
  hud.gI.style.width = (S.gauge * 100).toFixed(1) + '%'; hud.gS.style.width = (S.strain * 100).toFixed(1) + '%'; hud.gSb.classList.toggle('danger', S.strain > 0.8)
  hud.hold.classList.toggle('on', S.holding); const hl = S.holding ? TT().holdOn : TT().holdOff; if (hud.holdLab.textContent !== hl) hud.holdLab.textContent = hl
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

// ---------- 入力
const vPlay = $('#vPlay')
let ptrDown = false
vPlay.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.preventDefault(); ptrDown = true; press() })
const ptrUp = () => { if (!ptrDown) return; ptrDown = false; release() }
window.addEventListener('pointerup', ptrUp); window.addEventListener('pointercancel', ptrUp)
window.addEventListener('keydown', e => {
  if (e.repeat) return
  if (e.code === 'Space' || e.code === 'Enter') {
    if (S.mode === 'play' || S.mode === 'count' || (S.mode === 'intro')) { e.preventDefault(); if (S.mode === 'intro') beginCount(); else press() }
  }
})
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { if (S.mode === 'play' || S.mode === 'count') { e.preventDefault(); release() } } })
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
function toTitle() { Snd.sfx('tap'); S.mode = 'title'; S.later = []; clearFx(); setStage('library'); S.evs = []; S.level = 0; show('vTitle'); Snd.setTrack('title') }
document.addEventListener('visibilitychange', () => { if (!Snd.ctx) return; if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume() })
document.addEventListener('pointerdown', () => { if (!Snd.ctx) { Snd.init(); if (S.mode === 'title' || S.mode === 'how') Snd.setTrack('title') } }, { capture: true })
function resize() { renderer.setSize(innerWidth, innerHeight, false); frameCamera() }
window.addEventListener('resize', resize)

// ---------- 起動
resize(); applyLang(); syncMute(); setStage('library'); Snd.want = 'title'
for (let i = 0; i < 30; i++) step()
camera.position.copy(_hc)
loop()
loadFonts('!?お静かに静試験中私語厳禁QUIET PLEASE Silence EXAM IN PROGRESS NO TALKING').then(() => { TEX_EX = exTex('!', '#ff3d2e'); TEX_Q = exTex('?', '#ffd21f'); refreshSigns() })

window.hs = {
  S, D, Snd, STG, P, camera, renderer,
  start: startRun, startStage, beginCount, press, release, toResult, finishReveal, toTitle, drawCard, xPost, openX,
  level: () => S.level, mask: maskOf,
  cardDataURL: cardURL,
  setLang(l) { S.lang = l; applyLang() },
  dbg: {
    pause(b = true) { S.dbgPause = b; acc = 0; last = performance.now() },
    step(n = 1) { for (let i = 0; i < n; i++) step(); updateHud() },
    render() { updateHud(); render() },
    seed(n) { S.seed = n; S.rand = mulberry(n) },
    set(o) { Object.assign(S, o) },
    // 次のイベントの山まで進める（押したまま）
    toPeak(i, off = 0.15) { const e = S.evs[i]; while (S.mode === 'play' && S.st < e.at + off) step(); updateHud() },
  },
}
window.__hsReady = true
