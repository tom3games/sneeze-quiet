// 密室おなら選手権の検証。node verify.mjs（FPS=1 で GPU 描画の fps も測る）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = +process.env.PORT || 5617
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__hsReady, null, { timeout: 15000 })
  await p.evaluate(() => document.fonts && document.fonts.ready)
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = innerWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas,main:not([hidden]) .card,main:not([hidden]) .resCard,main:not([hidden]) .panel,#corner button')) {
    if (!el.offsetParent || el.closest('[hidden]')) continue; const r = el.getBoundingClientRect()
    if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  // 右上の小ボタンと HUD が重ならない
  const c = document.querySelector('#corner').getBoundingClientRect()
  for (const el of document.querySelectorAll('main:not([hidden]) .noise,main:not([hidden]) .logo .main,main:not([hidden]) .resCard,main:not([hidden]) .panel,main:not([hidden]) .card:not([hidden])')) { if (el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.width && r.right > c.left + 2 && r.left < c.right && r.top < c.bottom - 2 && r.bottom > c.top) over.push('corner-overlap:' + (el.id || el.className)) }
  // プレイ画面の HUD 同士が重ならない（誤魔化しボタン・ゲージ・我慢ボタン・上の帯）
  const hud = ['.ruses', '.gauges', '#bHold', '.hudTop .noise', '.stChip', '#corner'].map(q => [q, document.querySelector(q)]).filter(([q, e]) => e && e.offsetParent && !e.closest('[hidden]')).map(([q, e]) => [q, e.getBoundingClientRect()])
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) { const [qa, a] = hud[i], [qb, b] = hud[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('hud:' + qa + '/' + qb) }
  return { H, over: over.slice(0, 6) }
})
// Xでポスト: window.open を差し替えて、開かれるURLを取る
const xCheck = async (p, ns, want, tag, pub) => {
  await p.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null } })
  const vis = await p.isVisible('#bX'); expect(vis, 'Xボタンが見えない')
  await p.click('#bX')
  const r = await p.evaluate(ns => ({ o: window.__opened, api: window[ns].xPost(), label: document.querySelector('#bX').textContent.trim(), bg: getComputedStyle(document.querySelector('#bX')).backgroundColor, svg: !!document.querySelector('#bX svg path') }), ns)
  expect(r.o.length === 1, 'open回数 ' + r.o.length)
  const [href, target, feat] = r.o[0], u = new URL(href), text = u.searchParams.get('text')
  expect(href.startsWith('https://x.com/intent/post?') && target === '_blank' && /noopener/.test(feat), href + ' ' + target + ' ' + feat)
  expect(u.searchParams.get('url') === pub && !/https?:/.test(text), 'url ' + href)
  expect(text.includes(tag) && want.every(w => text.includes(String(w))), 'text ' + text + ' want ' + want.join(','))
  expect(text === r.api.text && r.svg && r.bg === 'rgb(0, 0, 0)', JSON.stringify(r))
  return { label: r.label, text }
}
// 保存・Xボタンの文字が1行に収まっている（折り返しなし）
const oneLine = p => p.evaluate(() => {
  const bad = []
  for (const id of ['#bSave', '#bX']) { const b = document.querySelector(id); if (!b) { bad.push(id + ':none'); continue }
    const sp = [...b.querySelectorAll('span')].pop() || b, rg = document.createRange(); rg.selectNodeContents(sp)
    const tops = new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)))
    const br = b.getBoundingClientRect(), sr = sp.getBoundingClientRect()
    if (tops.size > 1 || sr.left < br.left - 1 || sr.right > br.right + 1) bad.push(id + ':' + tops.size + 'lines') }
  return bad
})
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

// ページの中で動かすボット。perfect=山のまん中を狙う人（0.09秒ぶれる・ひっかけに3割かかる）、greedy=音と小出しで回数を稼ぐ上手い人、R付き=誤魔化しも使う
const BOT = (mode, bseed = 1) => {
  hs.dbg.pause(); const S = hs.S; let guard = 0
  let a = bseed >>> 0; const R = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R())
  const ruse = mode.endsWith('R'), greedy = mode.startsWith('greedy'), aim = mode.startsWith('perfect') || greedy || mode === 'early'
  let thr = 0.6 + gauss() * 0.08, wait = 0
  while (S.mode !== 'result' && guard++ < 60 * 150) {
    if (S.mode === 'intro') hs.beginCount()
    if (S.mode === 'count' && mode !== 'never' && !S.holding) hs.press()
    if (S.mode === 'play') {
      if (aim) {
        for (const e of S.evs) if (e.off === undefined) e.off = mode === 'early' ? -0.9 : (e.fake && R() > 0.3) ? 99 : e.peak / 2 - 0.22 + gauss() * 0.09
        const e = S.evs.find(e => !e.botDone && S.st >= e.at + e.off && S.st < e.at + e.off + 0.3)
        if (ruse) {
          const soon = S.evs.some(x => !x.fake && x.at > S.st && x.at - S.st < 1.2)
          if (S.lastBad && S.st - S.lastBad.t < 1.2 && S.lastBad.t > 0 && !S.lastBad.rec.blamed && S.ruseLeft.blame > 0) hs.useRuse('blame')
          else if (S.sniff > 0.72 && S.ruseLeft.say > 0) hs.useRuse('say')
          else if (S.strain > 0.9 && S.gauge >= 0.25 && !soon && S.ruseLeft.cough > 0 && !S.snz) hs.useRuse('cough')
        }
        // 上手い人: 音のバーが緑に入ったら小出しにする（見た目で判断するので少しぶれる・反応が遅れる）
        let g = false
        if (greedy && S.holding && S.gauge >= 0.25 && !S.snz) {
          const eff = hs.mask(S.level + hs.quiet()), smelly = S.sniff > 0.6 && S.door < 0.5
          if (eff >= thr && !smelly) { wait += 1 / 60; if (wait > 0.15) g = true } else wait = 0
        }
        if ((e || g) && S.holding && S.gauge >= 0.25) { if (e) e.botDone = true; S.downAt = -1e9; hs.release(); thr = 0.6 + gauss() * 0.08; wait = 0 }
        else if (!S.holding && (!S.snz || S.snz.impact)) hs.press()
      } else if (mode === 'hold') { if (!S.holding) hs.press() }
    }
    hs.dbg.step(1)
  }
  const r = S.result
  return { rec: S.rec, n: r && r.n, rank: r && r.rank.t.ja, db: r && r.db, per: r && r.per.map(p => p.n), smell: r && r.smell, used: r && r.used, ok: r && r.ok, steps: guard }
}

const PUB = 'https://tom3games.github.io/sneeze-quiet/'
const browser = await chromium.launch()
const p = await open(browser)
const run = (fn, arg) => p.evaluate(fn, arg)
const botRun = (mode, seed, bseed) => p.evaluate(([b, m, s, bs]) => { hs.dbg.pause(); hs.dbg.seed(s); hs.start(); return eval('(' + b + ')')(m, bs) }, [BOT.toString(), mode, seed, bseed])
// 1ステージ目を始めて、カウントを終えたところまで進める
const begin = (seed, stage = 0) => p.evaluate(([s, st]) => { hs.dbg.pause(); hs.dbg.seed(s); hs.start(); if (st) hs.startStage(st); hs.beginCount(); hs.dbg.step(150) }, [seed, stage])

await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある（og:image は公開URL・1200x630 の og.png・新しい題名）', async () => {
  const r = await p.evaluate(async () => {
    const g = k => (document.querySelector(`meta[property="${k}"]`) || document.querySelector(`meta[name="${k}"]`) || {}).content
    const img = new Image(); img.src = 'og.png'; await img.decode().catch(() => {})
    return { title: g('og:title'), desc: g('og:description'), image: g('og:image'), url: g('og:url'), type: g('og:type'), card: g('twitter:card'), w: img.naturalWidth, h: img.naturalHeight, dt: document.title }
  })
  expect(/おなら/.test(r.title) && /おなら/.test(r.dt) && r.desc && r.image === PUB + 'og.png?v=2' && r.url === PUB && r.type === 'website' && r.card === 'summary_large_image' && r.w === 1200 && r.h === 630, JSON.stringify(r)); return { title: r.title, w: r.w, h: r.h }
})
await t('くしゃみの文言が残っていない（画面・データ・メタ。URLの sneeze-quiet だけは可）', async () => {
  const r = await p.evaluate(() => {
    const txt = (JSON.stringify(hs.D) + document.head.innerHTML + document.body.innerText).replace(/sneeze-quiet/g, '')
    return (txt.match(/くしゃみ|クシャミ|ハックション|sneez|achoo|鼻忍|鼻田|nosely/ig) || []).slice(0, 5)
  })
  expect(!r.length, r.join(',')); return true
})
await t('3D が描けている（画面の色が散らばっている）', async () => {
  const buf = await p.screenshot(); const r = await p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 17) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2)
  }, buf.toString('base64'))
  expect(r > 400, 'variance ' + r); return { variance: r }
})
await t('判定の境界（かき消し度と判定名）', async () => {
  const r = await run(() => ({ m0: hs.mask(0.35), m1: hs.mask(0.9), mh: hs.mask(0.625), r: [0.95, 0.9, 0.6, 0.5, 0.3, 0.12, 0].map(m => hs.D.rateOf(m)) }))
  expect(r.m0 === 0 && r.m1 === 1 && Math.abs(r.mh - 0.5) < 1e-9 && r.r.join() === 'perfect,perfect,safe,safe,sus,busted,busted', JSON.stringify(r)); return r
})
let perfect
await t('通しで遊べる: 山で離すとほぼバレず、回数が数えられる', async () => {
  perfect = await botRun('perfect', 2, 1)
  const bad = perfect.rec.filter(r => r.slot && r.m < 0.5)
  expect(perfect.n >= 7 && bad.length <= 3 && perfect.rec.filter(r => r.slot).length >= 9, JSON.stringify({ n: perfect.n, bad, len: perfect.rec.length })); return { n: perfect.n, rank: perfect.rank, db: perfect.db, smell: perfect.smell }
})
await t('結果画面: 最後まで発表するとボタンが押せる位置に出る', async () => {
  const r = await run(() => { hs.finishReveal(); return { pct: document.querySelector('#rPct').textContent, stamp: document.querySelector('#rStamp').classList.contains('on'), rank: document.querySelector('#rRank').textContent, sx: document.querySelector('#rSx').textContent, pax: document.querySelector('#rPax').textContent } })
  await p.waitForTimeout(400)
  expect(r.pct === String(perfect.n) && r.stamp && r.rank && /匂いでバレた/.test(r.sx) && /今日の乗客/.test(r.pax) && /一番の被害者/.test(r.pax), JSON.stringify(r)); await p.screenshot({ path: ROOT + '/shots/result-perfect.png' }); return r
})
await t('結果画面: 判定は発表まで見せない（最初は数字がまだ出ていない）', async () => {
  const r = await run(() => { hs.toResult(); hs.dbg.step(30); return { stamp: document.querySelector('#rStamp').classList.contains('on'), rank: document.querySelector('#rRank').classList.contains('on') } })
  expect(!r.stamp && !r.rank, JSON.stringify(r)); return r
})
await t('結果カード画像: 1080x1350 で中身が描けている・顔写真が撮れている', async () => {
  const r = await run(async () => {
    hs.finishReveal(); const url = await hs.cardDataURL(); const img = new Image(); img.src = url; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 31) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
    const ph = document.querySelector('#rPhoto').getContext('2d').getImageData(0, 0, 256, 256).data; let a = 0, a2 = 0, m = 0; for (let i = 0; i < ph.length; i += 4 * 7) { const v = ph[i] * .3 + ph[i + 1] * .59 + ph[i + 2] * .11; a += v; a2 += v * v; m++ }
    return { w: img.width, h: img.height, v: Math.round(s2 / n - (s / n) ** 2), photo: hs.S.photo, pv: Math.round(a2 / m - (a / m) ** 2), url }
  })
  const { writeFileSync } = await import('node:fs'); writeFileSync(ROOT + '/shots/card.png', Buffer.from(r.url.split(',')[1], 'base64'))
  expect(r.w === 1080 && r.h === 1350 && r.v > 1500 && r.photo && r.pv > 200, JSON.stringify({ ...r, url: 0 })); return { w: r.w, h: r.h, v: r.v, pv: r.pv }
})
await t('画像を保存ボタンでダウンロードされる（PC）', async () => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#bSave')])
  expect(dl.suggestedFilename() === 'elevator-fart.png', dl.suggestedFilename()); return dl.suggestedFilename()
})
await t('Xでポスト: 結果・匂いバレ回数入りの x.com/intent/post が新しいタブで開く', async () => {
  const w = await run(() => { const r = hs.S.result; return ['エレベーターで' + r.n + '発バレずに出した', r.rank.t.ja, r.db.toFixed(1) + 'dB', '匂いバレ' + r.smell + '回', '誤魔化し' + r.used + '回'] })
  const r = await xCheck(p, 'hs', w, '#密室おなら選手権', PUB); expect(r.label === 'Xでポスト', r.label); return r
})
await t('同じ種と同じ操作なら同じ結果（再現性・乗客の顔ぶれも同じ）', async () => {
  const a = JSON.stringify(await botRun('perfectR', 42, 5)), b = JSON.stringify(await botRun('perfectR', 42, 5))
  expect(a === b, a.slice(0, 80) + ' vs ' + b.slice(0, 80)); return { n: JSON.parse(a).rec.length }
})
await t('難しさの分布（回数）: 上手いボット40回ずつ（誤魔化しなし・あり）で最高ランクは2〜4割／狙うだけの人・何もしない・押しっぱなしは低い', async () => {
  const r = await p.evaluate(b => {
    const bot = eval('(' + b + ')'), run = (m, n, base) => { const o = []; for (let i = 0; i < n; i++) { hs.dbg.seed(base + i * 7); hs.start(); o.push(bot(m, base * 31 + i)) } return o }
    const TOP = hs.D.ranks[0].min
    const st = a => { const pc = a.map(x => x.n).sort((x, y) => x - y); return { min: pc[0], med: pc[pc.length >> 1], max: pc[pc.length - 1], top: pc.filter(x => x >= TOP).length, n: pc.length, smell: +(a.reduce((x, y) => x + y.smell, 0) / a.length).toFixed(2), ruse: +(a.reduce((x, y) => x + y.used, 0) / a.length).toFixed(1), ranks: Object.entries(a.reduce((o, x) => (o[x.rank] = (o[x.rank] || 0) + 1, o), {})).map(e => e.join(':')).join(' ') } }
    return { skilled: st(run('greedy', 40, 100)), skilledRuse: st(run('greedyR', 40, 100)), aimOnly: st(run('perfect', 20, 100)), never: st(run('never', 10, 300)), hold: st(run('hold', 10, 500)) }
  }, BOT.toString())
  expect(r.skilled.top >= 8 && r.skilled.top <= 16 && r.skilledRuse.top >= 8 && r.skilledRuse.top <= 16 && r.skilledRuse.ruse > 1 && r.aimOnly.med < r.skilled.med && r.never.max <= 2 && r.hold.max <= 2, JSON.stringify(r)); return r
})
await t('何もしないと、音のない所で勝手に出て低い評価・匂いでもバレる', async () => {
  const r = await botRun('never', 5, 1)
  const bad = r.rec.filter(x => x.slot && x.m < 0.5).length
  expect(r.n <= 2 && bad >= 5 && r.rec.filter(x => x.slot).every(x => x.kind === 'auto') && r.smell >= 1, JSON.stringify({ n: r.n, bad, smell: r.smell })); return { n: r.n, bad, smell: r.smell, rank: r.rank }
})
await t('押しっぱなしだと顔が限界で暴発する（デシベルが大きい）', async () => {
  const r = await botRun('hold', 9, 1), ex = r.rec.filter(x => x.kind === 'explode')
  expect(ex.length >= 3 && ex.every(x => x.db >= 110), JSON.stringify(ex.slice(0, 3))); return { explode: ex.length, maxDb: r.db, n: r.n }
})
await t('予告の途中（山の0.9秒前）で離すとバレる', async () => {
  const r = await botRun('early', 11, 1), rel = r.rec.filter(x => x.kind === 'release')
  expect(rel.length >= 6 && rel.filter(x => x.m >= 0.5).length <= 2 && r.n <= 3, JSON.stringify(rel.slice(0, 4))); return { n: r.n, ratings: rel.map(x => x.rating).join(',') }
})
await t('境界: おなかのハリが少ない時に離してもおならは出ない', async () => {
  await begin(3)
  const r = await run(() => { hs.press(); hs.S.gauge = 0.1; hs.S.downAt = -1e9; hs.release(); return { n: hs.S.rec.length, snz: !!hs.S.snz, holding: hs.S.holding } })
  expect(r.n === 0 && !r.snz && !r.holding, JSON.stringify(r)); return r
})
await t('タップで切り替え: 短く押して離すと我慢が続き、もう一度タップでブッ', async () => {
  const r = await run(() => { hs.press(); hs.release(); const held = hs.S.holding; hs.dbg.step(30); hs.S.gauge = 0.6; hs.press(); const snz = !!hs.S.snz; hs.release(); hs.dbg.step(20); return { held, snz, n: hs.S.rec.length, holding: hs.S.holding } })
  expect(r.held && r.snz && r.n === 1 && !r.holding, JSON.stringify(r)); return r
})
await t('長押し中に、別の指で誤魔化しボタンや右上を押しても我慢は切れない', async () => {
  await begin(6)
  const r = await run(() => {
    const el = document.querySelector('#vPlay'), o = (id, x, y) => ({ bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y })
    el.dispatchEvent(new PointerEvent('pointerdown', o(1, 200, 300))); hs.S.downAt = -1e9; const held = hs.S.holding
    hs.S.gauge = 0.1; const b = document.querySelector('#r_say'); b.dispatchEvent(new PointerEvent('pointerdown', o(2, 10, 10))); window.dispatchEvent(new PointerEvent('pointerup', o(2, 10, 10)))
    document.querySelector('#bMute').dispatchEvent(new PointerEvent('pointerdown', o(3, 10, 10))); window.dispatchEvent(new PointerEvent('pointerup', o(3, 10, 10)))
    const still = hs.S.holding; hs.S.gauge = 0.6; window.dispatchEvent(new PointerEvent('pointerup', o(1, 200, 300))); hs.dbg.step(20)
    return { held, still, after: hs.S.holding, n: hs.S.rec.length }
  })
  expect(r.held && r.still && !r.after && r.n === 1, JSON.stringify(r)); return r
})
await t('ヘッドホンの若者がいると、大きいのでも「あやしい」止まり（本人は気づかない）', async () => {
  await begin(4)
  const r = await run(() => {
    hs.dbg.clearPax(); for (const t of ['coworker', 'bucho', 'nose', 'headphone']) hs.dbg.addPax(t); hs.S.evs = []
    hs.press(); hs.dbg.step(30); hs.S.gauge = 1; hs.S.strain = 0.6; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(40)
    const hp = hs.aboard().find(p => p.type === 'headphone'), rec = hs.S.rec[0]
    return { rating: rec.rating, L: rec.L, q: rec.q, hpMark: hp.n.mark.scale.x, glassesOff: hs.P.glasses.parent !== hs.P.head }
  })
  expect(r.rating === 'sus' && r.L >= 0.47 && r.hpMark < 0.05 && !r.glassesOff, JSON.stringify(r)); return r
})
await t('音でバレると全員が振り向く（無音の箱）', async () => {
  await begin(4)
  const r = await run(() => {
    hs.dbg.clearPax(); for (const t of ['coworker', 'bucho', 'nose']) hs.dbg.addPax(t); hs.S.evs = []
    hs.press(); hs.dbg.step(30); hs.S.gauge = 0.9; hs.S.strain = 0.5; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(60)
    const ab = hs.aboard(), turned = ab.filter(p => Math.abs(p.n.yaw) > 0.1 || Math.abs(p.n.pitch - p.n.idlePitch) > 0.08).length
    return { rating: hs.S.rec[0].rating, turned, total: ab.length, glassesOff: hs.P.glasses.parent !== hs.P.head }
  })
  expect(r.rating === 'busted' && r.turned === r.total && r.glassesOff, JSON.stringify(r))
  await run(() => hs.dbg.render()); await p.screenshot({ path: ROOT + '/shots/busted.png' }); return r
})
await t('音でバレる（無音の箱）: 判定はバレた、メガネが飛ぶ→あとで掛け直す', async () => {
  await begin(4)
  const r = await run(() => { hs.dbg.clearPax(); for (const t of ['coworker', 'bucho']) hs.dbg.addPax(t); hs.S.evs = []; hs.press(); hs.dbg.step(30); hs.S.gauge = 0.9; hs.S.strain = 0.5; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(30); const off = hs.P.glasses.parent !== hs.P.head; hs.press(); hs.dbg.step(200); return { rating: hs.S.rec[0].rating, off, back: hs.P.glasses.parent === hs.P.head } })
  expect(r.rating === 'busted' && r.off && r.back, JSON.stringify(r)); return r
})

// ---- 匂い
await t('匂い: 出すたびに増える（我慢した後・暴発ほど強い。かき消しても出る）', async () => {
  await begin(7)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker')
    const shot = (strain, kind) => { hs.S.smell = 0; hs.S.gauge = 0.6; hs.S.strain = strain; hs.S.snz = null; if (kind === 'explode') { hs.S.strain = 1; hs.dbg.step(2) } else { hs.press(); hs.S.strain = strain; hs.S.downAt = -1e9; hs.release() } hs.dbg.step(16); const r = hs.S.rec[hs.S.rec.length - 1]; hs.dbg.step(60); return r.smell }
    return { light: shot(0), held: shot(0.8), burst: shot(1, 'explode') }
  })
  expect(r.light > 0.2 && r.held > r.light + 0.25 && r.burst >= 0.8, JSON.stringify(r)); return r
})
await t('匂い: かき消し（完全）でも匂いは出る', async () => {
  await begin(2)
  const r = await run(() => { hs.press(); hs.dbg.toPeak(0, 0.12); hs.S.downAt = -1e9; const s0 = hs.S.smell; hs.release(); hs.dbg.step(15); const rec = hs.S.rec[0]; return { rating: rec.rating, add: rec.smell, s0 } })
  expect(r.rating === 'perfect' && r.add > 0.2, JSON.stringify(r)); return r
})
await t('匂い隠し: ドアが開いている間は匂いがすぐ消え、くんくん度も下がる', async () => {
  await begin(8)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker')
    const meas = door => { hs.S.smell = 1; hs.S.sniff = 0.5; hs.S.door = door; hs.S.stop = door ? { t: 1, did: true } : null; hs.S.gauge = 0; for (let i = 0; i < 60; i++) { hs.S.gauge = 0; if (door) { hs.S.stop.t = 1; hs.S.door = 1 } hs.dbg.step(1) } return { smell: +hs.S.smell.toFixed(3), sniff: +hs.S.sniff.toFixed(3) } }
    const closed = meas(0), open = meas(1); hs.S.stop = null; hs.S.door = 0
    return { closed, open }
  })
  expect(r.open.smell < r.closed.smell * 0.4 && r.open.sniff < r.closed.sniff, JSON.stringify(r)); return r
})
await t('匂い隠し: カレー弁当・香水の人が乗ってきた直後は匂いが消えやすい', async () => {
  await begin(8)
  const r = await run(() => {
    const meas = types => { hs.dbg.clearPax(); for (const t of types) { const p = hs.dbg.addPax(t); p.age = 0 } hs.S.smell = 1; hs.S.sniff = 0.3; for (let i = 0; i < 60; i++) { hs.S.gauge = 0; hs.dbg.step(1) } return +hs.S.smell.toFixed(3) }
    return { plain: meas(['coworker']), curry: meas(['coworker', 'curry']), madam: meas(['coworker', 'madam']) }
  })
  expect(r.curry < r.plain * 0.75 && r.madam < r.plain * 0.75, JSON.stringify(r)); return r
})
await t('匂い: 放っておくと、くんくん度が満タン→「くさっ！！誰！？」で匂いバレが1回記録される', async () => {
  await begin(9)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.S.evs = []; for (const t of ['coworker', 'nose']) hs.dbg.addPax(t)
    hs.S.smell = 1.2; let n = 0, maxS = 0; while (hs.S.smellBusts === 0 && n++ < 900) { hs.S.gauge = 0; hs.dbg.step(1); maxS = Math.max(maxS, hs.S.sniff) }
    hs.dbg.step(20); hs.dbg.render()
    const rec = hs.S.rec.filter(r => r.kind === 'smell'), ab = hs.aboard(), turned = ab.filter(p => Math.abs(p.n.yaw) > 0.1 || Math.abs(p.n.pitch - p.n.idlePitch) > 0.08).length
    const txt = [...document.querySelectorAll('#fx .ono')].map(e => e.textContent).join('|')
    return { sec: +(n / 60).toFixed(1), busts: hs.S.smellBusts, rec: rec.length, m: rec[0] && rec[0].m, turned, total: ab.length, txt, sniffAfter: hs.S.sniff }
  })
  await p.screenshot({ path: ROOT + '/shots/smell-bust.png' })
  expect(r.busts === 1 && r.rec === 1 && r.m === 0 && r.turned === r.total && /くさっ/.test(r.txt) && r.sniffAfter < 0.2, JSON.stringify(r)); return r
})
await t('匂い: だれも乗っていなければ、くんくん度は上がらない', async () => {
  await begin(9)
  const r = await run(() => { hs.dbg.clearPax(); hs.S.smell = 1; for (let i = 0; i < 180; i++) { hs.S.gauge = 0; hs.dbg.step(1) } return { sniff: hs.S.sniff, busts: hs.S.smellBusts } })
  expect(r.sniff === 0 && r.busts === 0, JSON.stringify(r)); return r
})
await t('回数: バレずに出せた分だけ数える（音でバレた分は入らない・匂いバレとなすりつけ失敗は1回失う）', async () => {
  const r = await run(() => {
    hs.S.rec = []; hs.S.smellBusts = 0
    for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++) hs.S.rec.push({ stage: s, m: 1, slot: true, kind: 'release' })
    const a = hs.calcResult().n
    hs.S.rec.push({ stage: 0, m: 0.2, slot: true, kind: 'release' }); const b = hs.calcResult().n
    hs.S.rec.push({ stage: 1, m: 0, slot: false, kind: 'smell' }); hs.S.smellBusts = 1; const c = hs.calcResult()
    hs.S.rec.push({ stage: 2, m: 0, slot: false, kind: 'blameFail' }); const d = hs.calcResult()
    return { a, b, c: c.n, per: d.per.map(p => p.n), d: d.n, rank: d.rank.t.ja }
  })
  expect(r.a === 12 && r.b === 12 && r.c === 11 && r.d === 10 && r.per.join() === '4,3,3', JSON.stringify(r)); return r
})
await t('回数: 小さいおならほど静か（同じ音でも、ハリが小さいとバレない）', async () => {
  await begin(18)
  const r = await run(() => {
    // ヘッドホンの若者の音もれ（いつも同じ大きさの音）の中で、小さいのと大きいのを出しくらべる
    hs.dbg.clearPax(); hs.dbg.addPax('headphone'); hs.S.evs = []
    const shot = g => { hs.S.snz = null; hs.S.holding = false; hs.press(); hs.S.downAt = -1e9; hs.S.gauge = g; hs.S.strain = 0; hs.release(); hs.dbg.step(20); const rec = hs.S.rec[hs.S.rec.length - 1]; hs.dbg.step(80); return rec }
    const small = shot(0.3), big = shot(0.95)
    return { small: [small.rating, small.q, small.smell], big: [big.rating, big.q, big.smell] }
  })
  expect(r.small[1] > r.big[1] && /safe|perfect/.test(r.small[0]) && /sus|busted/.test(r.big[0]) && r.small[2] < r.big[2], JSON.stringify(r)); return r
})
// ---- 乗客
await t('乗客: 鼻が利く人がいると、くんくん度の上がり方が速い（同僚の2倍以上）', async () => {
  await begin(10)
  const r = await run(() => {
    const meas = t => { hs.dbg.clearPax(); hs.dbg.addPax(t); hs.S.smell = 0.6; hs.S.sniff = 0; hs.S.smellBusts = 0; for (let i = 0; i < 60; i++) { hs.S.gauge = 0; hs.dbg.step(1) } return +hs.S.sniff.toFixed(3) }
    return { coworker: meas('coworker'), nose: meas('nose'), dog: meas('dog'), headphoneKid: meas('headphone') }
  })
  expect(r.nose > r.coworker * 2 && r.dog > r.coworker && r.headphoneKid < r.coworker, JSON.stringify(r)); return r
})
await t('乗客: ヘッドホンの若者の音もれで、いつでも少し音が隠れる', async () => {
  await begin(10)
  const r = await run(() => { hs.dbg.clearPax(); hs.dbg.addPax('coworker'); hs.dbg.step(2); const a = hs.S.level; hs.dbg.addPax('headphone'); hs.dbg.step(2); return { without: a, with: hs.S.level } })
  expect(r.without < 0.3 && r.with >= 0.47, JSON.stringify(r)); return r
})
await t('乗客: 清掃員のおばちゃんは、くんくん度が上がると1回だけ黙って消臭する', async () => {
  await begin(10)
  const r = await run(() => { hs.dbg.clearPax(); const c = hs.dbg.addPax('cleaner'); hs.S.smell = 1; hs.S.sniff = 0.56; hs.dbg.step(1); const a = { smell: hs.S.smell, sniff: hs.S.sniff, sprayed: c.sprayed }; hs.S.smell = 1; hs.S.sniff = 0.56; hs.dbg.step(1); return { a, again: hs.S.smell > 0.9, played: !!hs.Snd.played.spray || !hs.Snd.ctx } })
  expect(r.a.smell === 0 && r.a.sniff < 0.3 && r.a.sprayed && r.again, JSON.stringify(r)); return r
})
await t('乗り降り: 止まるたびに人が入れ替わり、降りる人は匂いを持って行く', async () => {
  await begin(12)
  const r = await run(() => {
    const before = hs.aboard().map(p => p.type).join(','); hs.S.smell = 0.8
    const e = hs.S.evs.find(e => e.type === 'chime'); while (hs.S.st < e.at + 0.4) { hs.S.gauge = 0; hs.dbg.step(1) }
    const exits = hs.S.pax.filter(p => p.state === 'exit').length, boards = hs.S.pax.filter(p => p.state === 'board').length, smellAfter = hs.S.smell
    for (let i = 0; i < 150; i++) { hs.S.gauge = 0; hs.dbg.step(1) }
    hs.dbg.render(); return { before, after: hs.aboard().map(p => p.type).join(','), exits, boards, smellAfter, door: hs.S.door }
  })
  await p.screenshot({ path: ROOT + '/shots/boarding.png' })
  expect(r.before !== r.after && r.exits >= 1 && r.boards >= 1 && r.smellAfter < 0.8 * 0.75, JSON.stringify(r)); return r
})
await t('乗り降り: 匂いが残る箱に乗ってきた人が最初に「…ん？」と気づく', async () => {
  await begin(12)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker'); hs.S.smell = 1.0; hs.S.sniff = 0.1
    const p = hs.dbg.addPax('nose', true); for (let i = 0; i < 100; i++) { hs.S.gauge = 0; hs.S.smell = Math.max(hs.S.smell, 0.6); hs.dbg.step(1) }
    return { state: p.state, mark: p.n.markT >= 0, sniff: hs.S.sniff, said: [...document.querySelectorAll('#fx .sb')].map(e => e.textContent).join('|') }
  })
  expect(r.state === 'idle' && r.mark && r.sniff > 0.3 && r.said.length > 0, JSON.stringify(r)); return r
})
await t('乗客: 乗っている人の出す大きな音が、その時の顔ぶれで決まる（赤ちゃん→泣き声・犬→ほえる）', async () => {
  const r = await run(() => {
    const out = {}
    for (const t of ['baby', 'dog', 'delivery', 'jk', 'headphone']) { hs.dbg.seed(20); hs.start(); hs.startStage(2); hs.dbg.clearPax(); hs.dbg.addPax('partner'); hs.dbg.addPax(t); hs.beginCount(); hs.dbg.step(150); const e = hs.S.evs[0]; while (hs.S.st < e.ws + 0.05) { hs.S.gauge = 0; hs.dbg.step(1) } out[t] = e.type + ':' + (e.src && e.src.type) }
    hs.dbg.seed(21); hs.start(); hs.startStage(2); hs.dbg.clearPax(); hs.dbg.addPax('partner'); hs.beginCount(); hs.dbg.step(150); const e = hs.S.evs[0]; while (hs.S.st < e.ws + 0.05) { hs.S.gauge = 0; hs.dbg.step(1) } out.none = e.type
    return out
  })
  expect(r.baby === 'baby:baby' && r.dog === 'bark:dog' && r.delivery === 'cart:delivery' && r.jk === 'giggle:jk' && r.headphone === 'music:headphone' && r.none === 'phone', JSON.stringify(r)); return r
})
await t('乗客: 毎回ちがう顔ぶれ（5回の通しで8種類以上・14種類のどれもエラーなく出せる）', async () => {
  const r = await p.evaluate(b => {
    const bot = eval('(' + b + ')'), seen = new Set()
    for (let i = 0; i < 5; i++) { hs.dbg.seed(700 + i * 13); hs.start(); bot('perfect', i); for (const e of hs.S.rode) seen.add(e.type) }
    hs.dbg.seed(1); hs.start(); hs.beginCount(); hs.dbg.step(150)
    const all = Object.keys(hs.D.pax); let made = 0; for (const t of all) { hs.dbg.clearPax(); if (hs.dbg.addPax(t)) made++ }
    return { kinds: seen.size, list: [...seen], made, all: all.length }
  }, BOT.toString())
  expect(r.kinds >= 8 && r.made === r.all, JSON.stringify(r)); return r
})
await t('乗客: 箱からはみ出さない・重ならない（全員乗せた満員・犬と台車も込み）', async () => {
  const r = await run(() => {
    const bad = [], seeds = []
    const combos = [['coworker', 'bucho', 'madam', 'curry', 'nose', 'headphone', 'baby', 'dog', 'delivery'], ['partner', 'dog', 'jk', 'yakiniku', 'cleaner', 'baby', 'ceo', 'delivery', 'madam'], ['ceo', 'dog', 'nose', 'cleaner', 'bucho', 'curry', 'headphone', 'jk']]
    for (const c of combos) {
      hs.dbg.clearPax(); for (const t of c) hs.dbg.addPax(t); hs.dbg.step(2)
      const L = hs.dbg.layout(), C = hs.CAR; seeds.push(L.length)
      for (const a of L) if (Math.abs(a.x) > C.x - a.r + 0.02 || a.z < C.zb + a.r - 0.02 || a.z > C.zf - a.r) bad.push('out:' + a.k)
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j], d = Math.hypot(a.x - b.x, a.z - b.z), need = a.k.match(/dog-animal|cart/) || b.k.match(/dog-animal|cart/) ? 0.36 : 0.52; if (d < need) bad.push(`${a.k}-${b.k}:${d.toFixed(2)}`) }
    }
    return { bad, seeds }
  })
  expect(!r.bad.length, JSON.stringify(r)); return r
})

// ---- 誤魔化し
await t('誤魔化し: 回数に限りがある（咳払い3・なすりつけ2・臭くない？2・降りる1）', async () => {
  await begin(13)
  const r = await run(() => {
    const out = []; for (let i = 0; i < 4; i++) { hs.S.gauge = 0; hs.S.snz = null; out.push(hs.useRuse('cough')); hs.dbg.step(30) }
    const btn = document.querySelector('#r_cough'); hs.dbg.render()
    return { out, left: { ...hs.S.ruseLeft }, disabled: btn.disabled, num: btn.querySelector('.rn').textContent }
  })
  expect(r.out[3] === 'no' && r.left.cough === 0 && r.left.blame === 2 && r.left.say === 2 && r.left.exit === 1 && r.disabled && r.num === '0', JSON.stringify(r)); return r
})
await t('誤魔化し: 咳払いで自分の音にかぶせて出せる（無音でもセーフ）。2回目からあやしまれる', async () => {
  await begin(14)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker'); hs.S.gauge = 0.6; hs.press()
    const a = hs.useRuse('cough'); hs.dbg.step(30); const rec = hs.S.rec[0], s1 = hs.S.sniff
    hs.S.gauge = 0.1; const b = hs.useRuse('cough'); hs.dbg.step(5)
    return { a, b, rating: rec && rec.rating, m: rec && rec.m, kind: rec && rec.kind, holding: hs.S.holding, sniffUp: hs.S.sniff > s1 }
  })
  expect(r.a === 'fart' && r.kind === 'cough' && r.m >= 0.5 && !r.holding && /sus/.test(r.b) && r.sniffUp, JSON.stringify(r)); return r
})
await t('誤魔化し: なすりつけ成功→直前のバレが救われる（点数に反映）・相手が「え、オレ！？」', async () => {
  await begin(15)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker'); hs.dbg.addPax('dog')
    hs.press(); hs.dbg.step(20); hs.S.gauge = 0.6; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(20)
    const before = hs.S.rec[0].m, rt = hs.S.rand; hs.dbg.set({ rand: () => 0.01 }); const out = hs.useRuse('blame'); hs.dbg.set({ rand: rt }); hs.dbg.step(60)
    const log = hs.S.ruseLog[0]
    return { out, before, after: hs.S.rec[0].m, rating: hs.S.rec[0].rating, who: log.who, sniff: hs.S.sniff, bubble: [...document.querySelectorAll('#fx .sb')].map(e => e.textContent).join('|') }
  })
  expect(r.out === 'success' && r.before < 0.5 && r.after >= 0.7 && r.rating === 'blamed' && r.who === 'dog' && r.sniff === 0 && r.bubble.length, JSON.stringify(r)); return r
})
await t('誤魔化し: なすりつけ失敗→バレが倍（0点の記録が1つ増える）', async () => {
  await begin(15)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('cleaner')
    hs.press(); hs.dbg.step(20); hs.S.gauge = 0.6; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(20)
    const n0 = hs.S.rec.length, out = hs.useRuse('blame'); hs.dbg.step(60)
    const extra = hs.S.rec.slice(n0)
    return { out, extra: extra.map(r => r.kind + ':' + r.m) }
  })
  expect(r.out === 'fail' && r.extra.join() === 'blameFail:0', JSON.stringify(r)); return r
})
await t('誤魔化し: 「なんか臭くない？」成功でくんくん度リセット／失敗で言い出しっぺが匂いバレ', async () => {
  await begin(16)
  const r = await run(() => {
    hs.dbg.clearPax(); hs.dbg.addPax('coworker'); hs.dbg.addPax('bucho'); const rt = hs.S.rand
    hs.S.smell = 0.8; hs.S.sniff = 0.7; hs.dbg.set({ rand: () => 0.99 }); const a = hs.useRuse('say'); hs.dbg.step(60); const okSniff = hs.S.sniff
    hs.S.sniff = 0.7; hs.dbg.set({ rand: () => 0.0 }); const b = hs.useRuse('say'); hs.dbg.step(60); hs.dbg.set({ rand: rt })
    return { a, okSniff, b, busts: hs.S.smellBusts, why: (hs.S.rec.find(r => r.kind === 'smell') || {}).why }
  })
  expect(r.a === 'success' && r.okSniff < 0.1 && r.b === 'fail' && r.busts === 1 && r.why === 'say', JSON.stringify(r)); return r
})
await t('誤魔化し: 次で降りる→次の階で降りてステージ終了（残り時間は稼げない）', async () => {
  await begin(17)
  const r = await run(() => {
    hs.dbg.addPax('coworker'); const out = hs.useRuse('exit'); let n = 0; while (hs.S.mode === 'play' && n++ < 400) { hs.S.gauge = 0; hs.dbg.step(1) }
    const fill = hs.S.rec.filter(r => r.kind === 'exitFill')
    return { out, mode: hs.S.mode, sec: +(n / 60).toFixed(1), fill: fill.map(r => r.m), st: +hs.S.st.toFixed(1), tally: document.querySelector('#eTally').textContent }
  })
  expect(r.out === 'exit' && r.mode === 'stageEnd' && r.sec < 4 && r.fill.length === 0 && r.st < 10, JSON.stringify(r)); return r
})
await t('誤魔化し: 結果とカード・X本文に使った回数が出る', async () => {
  const r = await run(() => { hs.toResult(); hs.finishReveal(); const res = hs.S.result; return { used: res.used, sx: document.querySelector('#rSx').textContent, x: hs.xPost().text } })
  expect(r.used >= 1 && r.sx.includes('誤魔化し ' + r.used + '回') && r.x.includes('誤魔化し' + r.used + '回'), JSON.stringify(r)); return r
})
await t('英語に切り替えると全部の文言が英語になる（誤魔化しボタン・乗客・結果）', async () => {
  const r = await run(() => {
    hs.toTitle(); hs.setLang('en')
    const title = document.querySelector('.logo').textContent, start = document.querySelector('#bStart').textContent
    hs.dbg.seed(3); hs.start(); const intro = document.querySelector('#iName').textContent, ruse = [...document.querySelectorAll('.ruse .rl')].map(e => e.textContent).join(','), play = document.querySelector('#vPlay').innerText
    hs.toResult(); hs.finishReveal(); const rank = document.querySelector('#rRank').textContent
    const ja = /[぀-ヿ一-鿿]/.test(document.querySelector('#vResult').innerText + title + start + intro + ruse + play)
    return { title, start, intro, ruse, rank, ja, pax: document.querySelector('#rPax').textContent }
  })
  await p.screenshot({ path: ROOT + '/shots/result-en.png' })
  await run(() => hs.setLang('ja'))
  expect(/FART/.test(r.title) && r.start === 'Get on' && r.intro === 'Morning Rush' && /Cough/.test(r.ruse) && r.rank && !r.ja && /riders/.test(r.pax), JSON.stringify(r)); return r
})
await t('英語: Post on X も英語の結果・匂いバレ回数とハッシュタグで開く', async () => {
  await run(() => { hs.setLang('en'); hs.toResult(); hs.finishReveal() })
  const w = await run(() => { const r = hs.S.result; return ['Snuck out ' + r.n + ' farts', r.rank.t.en, r.db.toFixed(1) + 'dB', 'smelled out ' + r.smell + 'x'] })
  const r = await xCheck(p, 'hs', w, '#ElevatorFart', PUB); await run(() => hs.setLang('ja')); expect(r.label === 'Post on X', r.label); return r
})
await t('一言: 乗客14種類すべてに 乗る・降りる・気づく・なすりつけられた の一言が日英そろっている', async () => {
  const r = await run(() => { const bad = []; for (const [k, v] of Object.entries(hs.D.pax)) for (const f of ['board', 'exit', 'notice', 'blamed']) { if (!v[f] || !v[f].length) bad.push(k + '.' + f); else for (const pr of v[f]) if (!pr[0] || !pr[1] || /[぀-ヿ一-鿿]/.test(pr[1])) bad.push(k + '.' + f) } return { bad, n: Object.keys(hs.D.pax).length } })
  expect(!r.bad.length && r.n === 14, JSON.stringify(r)); return r
})
await t('音: 鳴らしてもエラーが出ず、出来事の音・おなら・おなかの音が鳴る', async () => {
  await run(() => hs.toTitle()); await p.click('#bStart'); await p.click('#bGo')
  const r = await run(() => { hs.dbg.pause(); hs.dbg.step(150); hs.press(); hs.dbg.toPeak(0, 0.15); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(40); return { state: hs.Snd.ctx && hs.Snd.ctx.state, played: Object.keys(hs.Snd.played) } })
  await p.waitForTimeout(500)
  const lv = await run(() => hs.Snd.level())
  await run(() => hs.Snd.setMute(true)); await p.waitForTimeout(150)
  const muted = await run(() => hs.Snd.master.gain.value)
  await run(() => hs.Snd.setMute(false))
  expect(r.played.includes('ev:chime') && r.played.includes('fart') && r.played.includes('growl') && lv > 0.001 && muted === 0 && !p.errs.length, JSON.stringify({ ...r, lv, muted, errs: p.errs })); return { played: r.played.length, level: +lv.toFixed(3) }
})
await t('全部の出来事の音が鳴る（9種）＋咳払い・消臭・ボタン連打', async () => {
  const r = await run(() => { for (const e of ['chime', 'phone', 'shake', 'laugh', 'baby', 'bark', 'cart', 'giggle', 'music']) hs.Snd.event(e, 1, 0.5); hs.Snd.cough(); hs.Snd.sfx('spray'); hs.Snd.sfx('mash'); return Object.keys(hs.Snd.played).filter(k => k.startsWith('ev:')).length })
  expect(r === 9 && !p.errs.length, r + ' ' + p.errs.join('|')); return r
})
await t('通しの最後までコンソールエラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- 6サイズ × 全画面で一画面に収まる
for (const [w, h, name0, en] of [...SIZES, [360, 640, 'small', 1], [667, 375, 'land-se', 1]]) {
  const name = name0 + (en ? '-en' : '')
  const q = await open(browser, { viewport: { width: w, height: h } })
  if (en) await q.evaluate(() => hs.setLang('en'))
  const views = {}
  await q.waitForTimeout(300)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#bHowBack')
  await q.click('#bStart'); await q.evaluate(() => { hs.dbg.pause(); hs.dbg.render() }); views.intro = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-intro.png` })
  await q.click('#bGo')
  await q.evaluate(() => { hs.dbg.seed(1); hs.dbg.step(150); hs.press(); hs.dbg.toPeak(0, -0.6); hs.dbg.render() }); views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { hs.dbg.toPeak(0, 0.12); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(16); hs.dbg.render() }); views.fart = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-fart.png` })
  await q.evaluate(() => { hs.dbg.step(120); hs.S.smell = 1.1; hs.S.sniff = 0.72; hs.dbg.step(40); hs.dbg.render() }); views.smell = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-smell.png` })
  await q.evaluate(() => { hs.smellBust('sniff'); hs.dbg.step(25); hs.dbg.render() }); views.smellBust = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-smellbust.png` })
  await q.evaluate(() => { while (hs.S.mode === 'play') hs.dbg.step(1); hs.dbg.step(10); hs.dbg.render() }); views.stageEnd = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-stageend.png` })
  await q.evaluate(() => { hs.toResult(); hs.finishReveal(); hs.dbg.step(30); hs.dbg.render() }); await q.waitForTimeout(450); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  const ol = await oneLine(q); await t(`${name}: 保存・Xボタンの文字が1行`, async () => { expect(!ol.length, ol.join(',')) })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await t(`${name}: もう一回ですぐ遊べる`, async () => { await q.click('#bAgain'); const m = await q.evaluate(() => hs.S.mode); expect(m === 'intro', m); return m })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始めておならまで通る（スマホの文言）', async () => {
  await wp.tap('#bStart'); const ctrl = await wp.evaluate(() => document.querySelector('#iCtrl').textContent); await wp.tap('#bGo')
  const r = await wp.evaluate(() => { hs.dbg.pause(); hs.dbg.step(150); hs.press(); hs.dbg.toPeak(0, 0.15); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(20); hs.dbg.render(); return hs.S.rec.map(x => x.rating) })
  await wp.screenshot({ path: ROOT + '/shots/webkit-fart.png' })
  expect(/長押し/.test(ctrl) && r.length === 1 && r[0] === 'perfect', ctrl + ' ' + JSON.stringify(r)); return { ctrl, r }
})
await t('WebKit: 画面を押すと我慢、離すと解除（タッチ）', async () => {
  const r = await wp.evaluate(() => {
    hs.dbg.step(120); const el = document.querySelector('#vPlay'), o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 400 }
    el.dispatchEvent(new PointerEvent('pointerdown', o)); const a = hs.S.holding; hs.S.downAt = -1e9; window.dispatchEvent(new PointerEvent('pointerup', o)); return { a, b: hs.S.holding }
  })
  expect(r.a && !r.b, JSON.stringify(r)); return r
})
await t('WebKit: 長押ししたまま誤魔化しボタンをタップできる（2本指）', async () => {
  const r = await wp.evaluate(() => {
    const el = document.querySelector('#vPlay'), o = { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', clientX: 200, clientY: 300 }
    el.dispatchEvent(new PointerEvent('pointerdown', o)); hs.S.downAt = -1e9; hs.S.gauge = 0.6; hs.S.snz = null
    const n0 = hs.S.rec.length; hs.dbg.render(); document.querySelector('#r_cough').click(); hs.dbg.step(20)
    window.dispatchEvent(new PointerEvent('pointerup', o)); hs.dbg.step(5)
    return { added: hs.S.rec.length - n0, kind: hs.S.rec[hs.S.rec.length - 1].kind, holding: hs.S.holding }
  })
  expect(r.added === 1 && r.kind === 'cough' && !r.holding, JSON.stringify(r)); return r
})
await t('WebKit: 結果まで通してエラーなし', async () => {
  const r = await wp.evaluate(b => { hs.dbg.seed(8); hs.start(); return eval('(' + b + ')')('greedyR').n }, BOT.toString())
  await wp.evaluate(() => { hs.finishReveal(); hs.dbg.render() }); await wp.waitForTimeout(400); await wp.screenshot({ path: ROOT + '/shots/webkit-result.png' })
  expect(r >= 6 && wp.errs.length === 0, r + ' ' + wp.errs.join('|')); return { n: r }
})
await wb.close()

// ---- fps（GPU 描画で実時間に遊ばせて測る）
if (process.env.FPS) {
  const gb = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const g = await open(gb, { viewport: { width: w, height: h } })
    await g.evaluate(() => { hs.start(); hs.beginCount() }); await g.waitForTimeout(3000); await g.evaluate(() => hs.press()); await g.waitForTimeout(3000)
    const f = await g.evaluate(() => hs.S.fps)
    const blank = await g.evaluate(() => new Promise(r => { const w2 = window.open ? 0 : 0; void w2; let n = 0, t0 = performance.now(); (function l() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else r(n) })() }))
    results.push(`info fps ${w}x${h}: game=${f} (rAF base ${blank})`)
    await g.close()
  }
  await gb.close()
}
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
