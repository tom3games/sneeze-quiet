// くしゃみ我慢選手権の検証。node verify.mjs（FPS=1 で GPU 描画の fps も測る）
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

// ページの中で動かすボット。mode: perfect=上手い人（山のまん中を狙うが0.09秒ぶれる・ひっかけに3割かかる） / never=何もしない / hold=押しっぱなし / early=予告の途中で離す
const BOT = (mode, bseed = 1) => {
  hs.dbg.pause(); const S = hs.S; let guard = 0
  let a = bseed >>> 0; const R = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R())
  while (S.mode !== 'result' && guard++ < 60 * 150) {
    if (S.mode === 'intro') hs.beginCount()
    if (S.mode === 'count' && mode !== 'never' && !S.holding) hs.press()
    if (S.mode === 'play') {
      if (mode === 'perfect' || mode === 'early') {
        for (const e of S.evs) if (e.off === undefined) e.off = mode === 'early' ? -0.9 : (e.fake && R() > 0.3) ? 99 : e.peak / 2 - 0.22 + gauss() * 0.09
        const e = S.evs.find(e => !e.botDone && S.st >= e.at + e.off && S.st < e.at + e.off + 0.3)
        if (e && S.holding && S.gauge >= 0.25) { e.botDone = true; S.downAt = -1e9; hs.release() }
        else if (!S.holding && (!S.snz || S.snz.impact)) hs.press()
      } else if (mode === 'hold') { if (!S.holding) hs.press() }
    }
    hs.dbg.step(1)
  }
  const r = S.result
  return { rec: S.rec, pct: r && r.pct, rank: r && r.rank.t.ja, db: r && r.db, per: r && r.per.map(p => p.pct), steps: guard }
}

const browser = await chromium.launch()
const p = await open(browser)
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
await t('OGP 一式がある（og:image は公開URL・1200x630 の og.png）', async () => {
  const r = await p.evaluate(async () => {
    const g = k => (document.querySelector(`meta[property="${k}"]`) || document.querySelector(`meta[name="${k}"]`) || {}).content
    const img = new Image(); img.src = 'og.png'; await img.decode().catch(() => {})
    return { title: g('og:title'), desc: g('og:description'), image: g('og:image'), url: g('og:url'), type: g('og:type'), card: g('twitter:card'), w: img.naturalWidth, h: img.naturalHeight }
  })
  expect(r.title && r.desc && r.image === 'https://tom3games.github.io/sneeze-quiet/og.png?v=1' && r.url === 'https://tom3games.github.io/sneeze-quiet/' && r.type === 'website' && r.card === 'summary_large_image' && r.w === 1200 && r.h === 630, JSON.stringify(r)); return { w: r.w, h: r.h }
})
await t('3D が描けている（画面の色が散らばっている）', async () => {
  const buf = await p.screenshot(); const r = await p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 17) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2)
  }, buf.toString('base64'))
  expect(r > 400, 'variance ' + r); return { variance: r }
})
await t('判定の境界（かき消し度と判定名）', async () => {
  const r = await p.evaluate(() => ({ m0: hs.mask(0.35), m1: hs.mask(0.9), mh: hs.mask(0.625), r: [0.95, 0.9, 0.6, 0.5, 0.3, 0.12, 0].map(m => hs.D.rateOf(m)) }))
  expect(r.m0 === 0 && r.m1 === 1 && Math.abs(r.mh - 0.5) < 1e-9 && r.r.join() === 'perfect,perfect,safe,safe,sus,busted,busted', JSON.stringify(r)); return r
})
let perfect
await t('通しで遊べる: 山で離すと全部セーフで忍者度が高い', async () => {
  perfect = await p.evaluate(b => { hs.dbg.pause(); hs.dbg.seed(2); hs.start(); return eval('(' + b + ')')('perfect') }, BOT.toString())
  const bad = perfect.rec.filter(r => r.m < 0.5)
  expect(perfect.pct >= 75 && bad.length <= 3 && perfect.rec.length >= 9, JSON.stringify({ pct: perfect.pct, bad, n: perfect.rec.length })); return { pct: perfect.pct, rank: perfect.rank, db: perfect.db, n: perfect.rec.length }
})
await t('結果画面: 最後まで発表するとボタンが押せる位置に出る', async () => {
  const r = await p.evaluate(() => { hs.finishReveal(); return { pct: document.querySelector('#rPct').textContent, stamp: document.querySelector('#rStamp').classList.contains('on'), btn: getComputedStyle(document.querySelector('#rBtns1')).opacity, rank: document.querySelector('#rRank').textContent } })
  await p.waitForTimeout(400)
  expect(r.pct === String(perfect.pct) && r.stamp && r.rank, JSON.stringify(r)); await p.screenshot({ path: ROOT + '/shots/result-perfect.png' }); return r
})
await t('結果画面: 判定は発表まで見せない（最初は数字がまだ出ていない）', async () => {
  const r = await p.evaluate(() => { hs.toResult(); hs.dbg.step(30); return { pct: document.querySelector('#rPct').textContent, real: hs.S.result.pct, stamp: document.querySelector('#rStamp').classList.contains('on'), rank: document.querySelector('#rRank').classList.contains('on') } })
  expect(!r.stamp && !r.rank, JSON.stringify(r)); return r
})
await t('結果カード画像: 1080x1350 で中身が描けている・顔写真が撮れている', async () => {
  const r = await p.evaluate(async () => {
    hs.finishReveal(); const url = await hs.cardDataURL(); const img = new Image(); img.src = url; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 31) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
    const ph = document.querySelector('#rPhoto').getContext('2d').getImageData(0, 0, 256, 256).data; let a = 0, a2 = 0, m = 0; for (let i = 0; i < ph.length; i += 4 * 7) { const v = ph[i] * .3 + ph[i + 1] * .59 + ph[i + 2] * .11; a += v; a2 += v * v; m++ }
    return { w: img.width, h: img.height, v: Math.round(s2 / n - (s / n) ** 2), photo: hs.S.photo, pv: Math.round(a2 / m - (a / m) ** 2), url }
  })
  const b64 = r.url.split(',')[1]; const { writeFileSync } = await import('node:fs'); writeFileSync(ROOT + '/shots/card.png', Buffer.from(b64, 'base64'))
  expect(r.w === 1080 && r.h === 1350 && r.v > 1500 && r.photo && r.pv > 200, JSON.stringify({ ...r, url: 0 })); return { w: r.w, h: r.h, v: r.v, pv: r.pv }
})
await t('画像を保存ボタンでダウンロードされる（PC）', async () => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#bSave')])
  expect(dl.suggestedFilename() === 'sneeze-quiet.png', dl.suggestedFilename()); return dl.suggestedFilename()
})
await t('Xでポスト: 押すと結果入りの x.com/intent/post が新しいタブで開く', async () => {
  const w = await p.evaluate(() => { const r = hs.S.result; return [r.pct + '%', r.rank.t.ja, r.db.toFixed(1) + 'dB'] })
  const r = await xCheck(p, 'hs', w, '#くしゃみ我慢選手権', 'https://tom3games.github.io/sneeze-quiet/'); expect(r.label === 'Xでポスト', r.label); return r
})
await t('同じ種と同じ操作なら同じ結果（再現性）', async () => {
  const a = await p.evaluate(b => { hs.dbg.seed(42); hs.start(); return JSON.stringify(eval('(' + b + ')')('perfect').rec) }, BOT.toString())
  const b = await p.evaluate(b => { hs.dbg.seed(42); hs.start(); return JSON.stringify(eval('(' + b + ')')('perfect').rec) }, BOT.toString())
  expect(a === b && JSON.parse(a).length >= 9, a.slice(0, 80) + ' vs ' + b.slice(0, 80)); return { n: JSON.parse(a).length }
})
await t('難しさの分布: 上手いボット40回は90%台中心・100%はたまに／何もしない・押しっぱなしは低い', async () => {
  const r = await p.evaluate(b => {
    const bot = eval('(' + b + ')'), run = (m, n, base) => { const o = []; for (let i = 0; i < n; i++) { hs.dbg.seed(base + i * 7); hs.start(); o.push(bot(m, base * 31 + i).pct) } return o.sort((x, y) => x - y) }
    const sk = run('perfect', 40, 100), nv = run('never', 10, 300), hd = run('hold', 10, 500)
    const st = a => ({ min: a[0], med: a[a.length >> 1], mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length), max: a[a.length - 1] })
    return { skilled: { ...st(sk), n100: sk.filter(x => x === 100).length, n90s: sk.filter(x => x >= 90 && x < 100).length, n80s: sk.filter(x => x >= 80 && x < 90).length, below80: sk.filter(x => x < 80).length }, never: st(nv), hold: st(hd) }
  }, BOT.toString())
  const k = r.skilled
  expect(k.med >= 88 && k.med <= 98 && k.n100 >= 1 && k.n100 <= 12 && r.never.max < 40 && r.hold.max < 40, JSON.stringify(r)); return r
})
await t('何もしないと、音のない所で勝手に出て低い評価になる', async () => {
  const r = await p.evaluate(b => { hs.dbg.seed(5); hs.start(); return eval('(' + b + ')')('never') }, BOT.toString())
  const busted = r.rec.filter(x => x.rating === 'busted').length
  expect(r.pct < 40 && r.rec.length >= 9 && busted >= 5 && r.rec.every(x => x.kind === 'auto'), JSON.stringify({ pct: r.pct, n: r.rec.length, busted })); return { pct: r.pct, n: r.rec.length, busted, rank: r.rank }
})
await t('押しっぱなしだと顔が限界で暴発する（デシベルが大きい）', async () => {
  const r = await p.evaluate(b => { hs.dbg.seed(9); hs.start(); return eval('(' + b + ')')('hold') }, BOT.toString())
  const ex = r.rec.filter(x => x.kind === 'explode')
  expect(ex.length >= 3 && ex.every(x => x.db >= 130), JSON.stringify(ex.slice(0, 3))); return { explode: ex.length, maxDb: r.db, pct: r.pct }
})
await t('予告の途中（山の0.9秒前）で離すとバレる', async () => {
  const r = await p.evaluate(b => { hs.dbg.seed(11); hs.start(); return eval('(' + b + ')')('early') }, BOT.toString())
  const rel = r.rec.filter(x => x.kind === 'release')
  expect(rel.length >= 6 && rel.every(x => x.m < 0.5) && r.pct < 50, JSON.stringify(rel.slice(0, 4))); return { pct: r.pct, ratings: rel.map(x => x.rating).join(',') }
})
await t('境界: ムズムズが少ない時に離してもくしゃみは出ない', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(3); hs.start(); hs.beginCount(); hs.dbg.step(150)
    hs.press(); hs.S.gauge = 0.1; hs.S.downAt = -1e9; hs.release(); const n = hs.S.rec.length, snz = !!hs.S.snz
    return { n, snz, holding: hs.S.holding }
  })
  expect(r.n === 0 && !r.snz && !r.holding, JSON.stringify(r)); return r
})
await t('タップで切り替え: 短く押して離すと我慢が続き、もう一度タップでハックション', async () => {
  const r = await p.evaluate(() => {
    hs.press(); hs.release(); const held = hs.S.holding
    hs.dbg.step(30); hs.S.gauge = 0.6; hs.press(); const snz = !!hs.S.snz; hs.release(); hs.dbg.step(20)
    return { held, snz, n: hs.S.rec.length, holding: hs.S.holding }
  })
  expect(r.held && r.snz && r.n === 1 && !r.holding, JSON.stringify(r)); return r
})
await t('タップ切り替え中に右上のボタンを押しても、くしゃみは出ない', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(6); hs.start(); hs.beginCount(); hs.dbg.step(150)
    const el = document.querySelector('#vPlay'), o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 400 }
    el.dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o)); const toggled = hs.S.holding
    hs.dbg.step(40); hs.S.gauge = 0.6; hs.S.downAt = -1e9
    document.querySelector('#bMute').dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o))
    return { toggled, still: hs.S.holding, n: hs.S.rec.length }
  })
  expect(r.toggled && r.still && r.n === 0, JSON.stringify(r)); return r
})
await t('失敗すると全員が振り向き、メガネが飛ぶ', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(4); hs.start(); hs.beginCount(); hs.dbg.step(150); hs.press(); hs.dbg.step(30); hs.S.gauge = 0.7; hs.S.downAt = -1e9; hs.release(); hs.dbg.step(60)
    const st = hs.STG.library, turned = st.npcs.filter(n => Math.abs(n.yaw) > 0.15 || Math.abs(n.pitch - n.idlePitch) > 0.1).length, marks = st.npcs.filter(n => n.mark.scale.x > 0.05).length
    return { rating: hs.S.rec[0] && hs.S.rec[0].rating, turned, marks, total: st.npcs.length, glassesOff: hs.P.glasses.parent !== hs.P.head }
  })
  expect(r.rating === 'busted' && r.turned >= r.total - 2 && r.marks >= r.total - 2 && r.glassesOff, JSON.stringify(r))
  await p.evaluate(() => hs.dbg.render()); await p.screenshot({ path: ROOT + '/shots/busted.png' }); return r
})
await t('失敗のあとメガネを掛け直す', async () => {
  const r = await p.evaluate(() => { hs.press(); hs.dbg.step(180); return hs.P.glasses.parent === hs.P.head })
  expect(r, r)
})
await t('英語に切り替えると全部の文言が英語になる', async () => {
  const r = await p.evaluate(() => {
    hs.toTitle(); hs.setLang('en')
    const title = document.querySelector('.logo').textContent, start = document.querySelector('#bStart').textContent
    hs.start(); const intro = document.querySelector('#iName').textContent
    hs.toResult(); hs.finishReveal(); const rank = document.querySelector('#rRank').textContent, save = document.querySelector('#bSave').textContent
    const ja = /[぀-ヿ一-鿿]/.test(document.querySelector('#vResult').innerText + title + start + intro)
    return { title, start, intro, rank, save, ja }
  })
  await p.screenshot({ path: ROOT + '/shots/result-en.png' })
  await p.evaluate(() => hs.setLang('ja'))
  expect(/SNEEZE/.test(r.title) && r.start === 'Enter' && r.intro === 'Library' && r.rank && !r.ja, JSON.stringify(r)); return r
})
await t('英語: Post on X も英語の結果とハッシュタグで開く', async () => {
  await p.evaluate(() => { hs.setLang('en'); hs.toResult(); hs.finishReveal() })
  const w = await p.evaluate(() => { const r = hs.S.result; return [r.pct + '%', r.rank.t.en, r.db.toFixed(1) + 'dB'] })
  const r = await xCheck(p, 'hs', w, '#HoldThatSneeze', 'https://tom3games.github.io/sneeze-quiet/'); await p.evaluate(() => hs.setLang('ja')); expect(r.label === 'Post on X', r.label); return r
})
await t('音: 鳴らしてもエラーが出ず、出来事の音とくしゃみの声が鳴る', async () => {
  await p.evaluate(() => hs.toTitle()); await p.click('#bStart'); await p.click('#bGo')
  const r = await p.evaluate(() => { hs.dbg.pause(); hs.dbg.step(150); hs.press(); hs.dbg.toPeak(0, 0.15); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(40); return { state: hs.Snd.ctx && hs.Snd.ctx.state, played: Object.keys(hs.Snd.played) } })
  await p.waitForTimeout(500)
  const lv = await p.evaluate(() => hs.Snd.level())
  await p.evaluate(() => { hs.Snd.setMute(true) }); await p.waitForTimeout(150)
  const muted = await p.evaluate(() => hs.Snd.master.gain.value)
  await p.evaluate(() => hs.Snd.setMute(false))
  expect(r.played.includes('ev:train') && r.played.includes('sneeze') && r.played.includes('ha') && lv > 0.001 && muted === 0 && !p.errs.length, JSON.stringify({ ...r, lv, muted, errs: p.errs })); return { played: r.played.length, level: +lv.toFixed(3) }
})
await t('全部の出来事の音が鳴る（9種）', async () => {
  const r = await p.evaluate(() => { for (const e of ['train', 'phone', 'applause', 'gong', 'thunder', 'siren', 'plane', 'proctor', 'cheer']) hs.Snd.event(e, 1, 0.5); return Object.keys(hs.Snd.played).filter(k => k.startsWith('ev:')).length })
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
  await q.evaluate(() => { hs.dbg.toPeak(0, 0.12); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(16); hs.dbg.render() }); views.sneeze = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-sneeze.png` })
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
await t('WebKit: タップで始めてくしゃみまで通る（スマホの文言）', async () => {
  await wp.tap('#bStart'); const ctrl = await wp.evaluate(() => document.querySelector('#iCtrl').textContent); await wp.tap('#bGo')
  const r = await wp.evaluate(() => { hs.dbg.pause(); hs.dbg.step(150); hs.press(); hs.dbg.toPeak(0, 0.15); hs.S.downAt = -1e9; hs.release(); hs.dbg.step(20); hs.dbg.render(); return hs.S.rec.map(x => x.rating) })
  await wp.screenshot({ path: ROOT + '/shots/webkit-sneeze.png' })
  expect(/長押し/.test(ctrl) && r.length === 1 && r[0] === 'perfect', ctrl + ' ' + JSON.stringify(r)); return { ctrl, r }
})
await t('WebKit: 画面を押すと我慢、離すと解除（タッチ）', async () => {
  const r = await wp.evaluate(() => {
    hs.dbg.step(120); const el = document.querySelector('#vPlay'), o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 400 }
    el.dispatchEvent(new PointerEvent('pointerdown', o)); const a = hs.S.holding; hs.S.downAt = -1e9; window.dispatchEvent(new PointerEvent('pointerup', o)); return { a, b: hs.S.holding }
  })
  expect(r.a && !r.b, JSON.stringify(r)); return r
})
await t('WebKit: 結果まで通してエラーなし', async () => {
  const r = await wp.evaluate(b => { hs.dbg.seed(8); hs.start(); return eval('(' + b + ')')('perfect').pct }, BOT.toString())
  await wp.evaluate(() => { hs.finishReveal(); hs.dbg.render() }); await wp.waitForTimeout(400); await wp.screenshot({ path: ROOT + '/shots/webkit-result.png' })
  expect(r >= 75 && wp.errs.length === 0, r + ' ' + wp.errs.join('|')); return { pct: r }
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
