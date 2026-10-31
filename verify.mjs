// くしゃみ我慢選手権の検証。node verify.mjs（FPS=1 で GPU 描画の fps も測る）。ボットは bot.js
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = +process.env.PORT || 5741
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
const BOTSRC = readFileSync(ROOT + '/bot.js', 'utf8')
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
  await p.addScriptTag({ content: BOTSRC })
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
  for (const el of document.querySelectorAll('main:not([hidden]) .stat,main:not([hidden]) .place:not([hidden]),main:not([hidden]) .logo .main,main:not([hidden]) .resCard,main:not([hidden]) .panel,main:not([hidden]) .card:not([hidden])')) { if (el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.width && r.right > c.left + 2 && r.left < c.right && r.top < c.bottom - 2 && r.bottom > c.top) over.push('corner-overlap:' + (el.id || el.className)) }
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
// HUD にバー・メーターが無い（ボタン自体の溜まり直しは除く）
const noBars = q => q.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll('#vPlay *')) {
    if (el.closest('.snz')) continue
    const cls = typeof el.className === 'string' ? el.className : ''
    if (/progress|meter/i.test(el.tagName) || el.getAttribute('role') === 'progressbar' || /bar|gauge|meter|noise/i.test(cls + ' ' + el.id)) bad.push(el.tagName + '.' + cls + '#' + el.id)
    const r = el.getBoundingClientRect()
    if (el.offsetParent && r.width > 60 && r.height > 0 && r.height < 26 && r.width > r.height * 5 && !el.textContent.trim()) bad.push('thin:' + (el.id || cls || el.tagName))
  }
  return bad
})
// 中身のある画面で、ゲーム固有の通しを始める
const playTo = (q, fn) => q.evaluate(fn)

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
    return { title: g('og:title'), desc: g('og:description'), image: g('og:image'), url: g('og:url'), type: g('og:type'), card: g('twitter:card'), w: img.naturalWidth, h: img.naturalHeight, v: [...document.scripts].map(s => s.src).filter(Boolean).map(s => s.split('?v=')[1]) }
  })
  expect(r.title && /特大/.test(r.desc) && r.image === 'https://tom3games.github.io/sneeze-quiet/og.png?v=7' && r.url === 'https://tom3games.github.io/sneeze-quiet/' && r.type === 'website' && r.card === 'summary_large_image' && r.w === 1200 && r.h === 630 && r.v.join() === '7,7', JSON.stringify(r)); return { w: r.w, h: r.h, v: r.v }
})
await t('3D が描けている（画面の色が散らばっている）', async () => {
  const buf = await p.screenshot(); const r = await p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 17) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2)
  }, buf.toString('base64'))
  expect(r > 400, 'variance ' + r); return { variance: r }
})
await t('判定の境界（まわりの音 - 要る音）と、種類ごとの要る音', async () => {
  const r = await p.evaluate(() => ({ r: [0.2, 0.12, 0.05, 0, -0.1, -0.15, -0.16, -0.5].map(m => hs.D.rateOf(m)), n0: [hs.needOf(0, 0), hs.needOf(0, 1)], n2: [hs.needOf(2, 0), hs.needOf(2, 1)], pts: hs.D.kinds.map(k => k.pts) }))
  expect(r.r.join() === 'perfect,perfect,safe,safe,sus,sus,busted,busted' && r.n0[0] < 0 && r.n0[1] > 0.15 && r.n2[0] >= 0.75 && r.pts.join() === '1,3,10', JSON.stringify(r)); return r
})
await t('プレイ画面の HUD にバー・メーターが無い（ハートと点だけ）', async () => {
  await p.click('#bStart')
  const r = await p.evaluate(() => { hs.dbg.pause(); hs.dbg.step(60); hs.dbg.render(); return { hearts: document.querySelectorAll('#hLives i.on').length, pts: document.querySelector('#hPts').textContent, btns: document.querySelectorAll('#vPlay .snz').length } })
  const bad = await noBars(p)
  expect(!bad.length && r.hearts === 3 && r.pts === '0' && r.btns === 3, JSON.stringify({ bad, r })); return r
})
await t('最初の1回だけ操作の案内が出て、押すと消える', async () => {
  const a = await p.evaluate(() => ({ shown: !document.querySelector('#hint').hidden, txt: document.querySelector('#hint').textContent }))
  const b = await p.evaluate(() => { hs.sneeze(0); hs.dbg.step(5); return !document.querySelector('#hint').hidden })
  const c = await p.evaluate(() => { hs.start(); hs.dbg.step(5); return !document.querySelector('#hint').hidden })
  expect(a.shown && /ボタン/.test(a.txt) && !b && !c, JSON.stringify({ a, b, c })); return a.txt
})
await t('ボタンは押したら溜まり直す（連打できない・見た目で分かる・数字は出さない）', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(12); hs.start(); hs.dbg.step(30)
    const b = document.querySelectorAll('.snz')[1]
    const first = hs.sneeze(1); hs.dbg.step(20); const second = hs.sneeze(1)
    const cd = +b.style.getPropertyValue('--cd'), ready = b.classList.contains('ready'), digits = /\d+\.\d|\ds/.test(b.textContent.replace(/^\d|\+\d+/g, ''))
    hs.dbg.step(Math.ceil(hs.D.kinds[1].cd * 60)); const again = b.classList.contains('ready') && hs.S.cd[1] === 0
    return { first, second, cd, ready, digits, again, text: b.textContent }
  })
  expect(r.first && !r.second && r.cd > 0.5 && !r.ready && !r.digits && r.again, JSON.stringify(r)); return r
})
await t('キー 1・2・3 でもくしゃみが出る', async () => {
  await p.evaluate(() => { hs.dbg.seed(13); hs.start(); hs.dbg.step(10) })
  await p.keyboard.press('Digit1'); await p.evaluate(() => hs.dbg.step(200)); await p.keyboard.press('Digit2'); await p.evaluate(() => hs.dbg.step(250)); await p.keyboard.press('Digit3'); await p.evaluate(() => hs.dbg.step(30))
  const r = await p.evaluate(() => hs.S.rec.map(x => x.k).join())
  expect(r === '0,1,2', r); return r
})
await t('序盤の静かな所の「くしゅん」はセーフで1点、特大は静かな所だとバレてハートが減る', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(14); hs.start(); hs.dbg.step(30); hs.sneeze(0); hs.dbg.step(30); const a = hs.S.rec[0]
    hs.sneeze(2); hs.dbg.step(40); const b = hs.S.rec[1]
    return { a: a.rating, ap: a.pts, b: b.rating, bp: b.pts, lives: hs.S.lives, hearts: document.querySelectorAll('#hLives i.on').length, pts: hs.S.pts }
  })
  expect(/safe|perfect/.test(r.a) && r.ap === 1 && r.b === 'busted' && r.bp === 0 && r.lives === 2 && r.hearts === 2 && r.pts === 1, JSON.stringify(r)); return r
})
await t('バレると全員が振り向き、メガネが飛ぶ', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.step(30)
    const st = hs.STG.library, turned = st.npcs.filter(n => Math.abs(n.yaw) > 0.15 || Math.abs(n.pitch - n.idlePitch) > 0.1).length, marks = st.npcs.filter(n => n.mark.scale.x > 0.05).length
    return { turned, marks, total: st.npcs.length, glassesOff: hs.P.glasses.parent !== hs.P.head }
  })
  expect(r.turned >= r.total - 2 && r.marks >= r.total - 2 && r.glassesOff, JSON.stringify(r))
  await p.evaluate(() => hs.dbg.render()); await p.screenshot({ path: ROOT + '/shots/busted.png' }); return r
})
await t('特大を山のまん中に合わせるとセーフで10点、メガネと机の物は飛ぶが誰も振り向かない', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(15); hs.start(); const e = hs.S.evs[0]
    while (hs.S.st < e.at + e.peak / 2 - hs.D.kinds[2].pre) hs.dbg.step(1)
    hs.sneeze(2); hs.dbg.step(40)
    const st = hs.STG.library, marks = st.npcs.filter(n => n.mark.scale.x > 0.05).length, flying = st.props.filter(m => m.parent !== st.grp).length
    return { rating: hs.S.rec[0].rating, pts: hs.S.pts, marks, flying, glassesOff: hs.P.glasses.parent !== hs.P.head, lives: hs.S.lives }
  })
  expect(r.rating === 'perfect' && r.pts === 10 && r.marks === 0 && r.flying >= 1 && r.glassesOff && r.lives === 3, JSON.stringify(r))
  await p.evaluate(() => hs.dbg.render()); await p.screenshot({ path: ROOT + '/shots/big-safe.png' }); return r
})
await t('前触れは長く分かりやすい・ひっかけは序盤（図書館）に入らない', async () => {
  const r = await p.evaluate(() => {
    let minWarn = 9, fake0 = 0, fakeLater = 0, n = 0, minGap = 99
    for (let s = 1; s <= 40; s++) { hs.dbg.seed(s * 13); for (let leg = 0; leg < 3; leg++) { hs.S.leg = leg; const ev = (() => { hs.enterLeg(leg); return hs.S.evs })(); n += ev.length
      for (const e of ev) { if (!e.fake) minWarn = Math.min(minWarn, e.warn); if (e.fake) { if (leg === 0 && hs.dAt(0, e.at) < hs.D.run.fakeFrom) fake0++; else fakeLater++ } }
      for (let i = 1; i < ev.length; i++) minGap = Math.min(minGap, ev[i].ws - (ev[i - 1].at + ev[i - 1].peak))
      if (ev.some(e => e.at + e.peak > hs.D.run.legLen)) minGap = -1 } }
    return { minWarn: +minWarn.toFixed(2), fake0, fakeLater, n, minGap: +minGap.toFixed(2) }
  })
  expect(r.minWarn >= 2.3 && r.fake0 === 0 && r.fakeLater >= 20 && r.minGap > 0, JSON.stringify(r)); return r
})
let skilled
await t('通しで遊べる: 図書館 → 法事 → 試験会場を区切りの画面なしで進み、完走して結果へ', async () => {
  skilled = await p.evaluate(() => { hs.dbg.seed(2); hs.start(); return __BOT('skilled', 7) })
  expect(skilled.done && skilled.legs.join() === '0,1,2' && !skilled.sawCard && skilled.pts >= 150 && skilled.rec.length >= 40, JSON.stringify({ ...skilled, rec: skilled.rec.length })); return { pts: skilled.pts, rank: skilled.rank, kinds: skilled.kinds, n: skilled.rec.length }
})
await t('擬音・吹き出しは同時に2つまで', async () => { expect(skilled.fxMax <= 2 && skilled.fxMax >= 1, skilled.fxMax); return skilled.fxMax })
await t('結果画面: 最後まで発表すると点数・到達・ボタンが出る', async () => {
  const r = await p.evaluate(() => { hs.finishReveal(); return { pts: document.querySelector('#rPts').textContent, unit: document.querySelector('#rUnit').textContent, reach: document.querySelector('#rReach').textContent, stamp: document.querySelector('#rStamp').classList.contains('on'), rank: document.querySelector('#rRank').textContent, kinds: document.querySelector('#rKinds').textContent } })
  await p.waitForTimeout(400)
  expect(r.pts === String(skilled.pts) && r.unit === '点' && r.reach === '全会場を完走' && r.stamp && r.rank && /×/.test(r.kinds), JSON.stringify(r)); await p.screenshot({ path: ROOT + '/shots/result-skilled.png' }); return r
})
await t('結果画面: 判定は発表まで見せない', async () => {
  const r = await p.evaluate(() => { hs.toResult(); hs.dbg.step(30); return { stamp: document.querySelector('#rStamp').classList.contains('on'), rank: document.querySelector('#rRank').classList.contains('on') } })
  expect(!r.stamp && !r.rank, JSON.stringify(r)); return r
})
await t('3回バレたら退場して結果へ（どこで退場したかが出る）', async () => {
  const r = await p.evaluate(() => {
    hs.dbg.seed(16); hs.start(); hs.dbg.step(20)
    for (let i = 0; i < 3; i++) { hs.S.cd = [0, 0, 0]; hs.sneeze(2); hs.dbg.step(30) }
    const mode = hs.S.mode; let n = 0; while (hs.S.mode !== 'result' && n++ < 600) hs.dbg.step(1)
    hs.finishReveal(); return { mode, after: hs.S.mode, done: hs.S.result.done, reach: document.querySelector('#rReach').textContent, hearts: hs.S.lives }
  })
  expect(r.mode === 'out' && r.after === 'result' && !r.done && r.reach === '図書館で退場' && r.hearts === 0, JSON.stringify(r)); return r
})
await t('結果カード画像: 1080x1350 で中身が描けている・顔写真が撮れている', async () => {
  const r = await p.evaluate(async () => {
    hs.dbg.seed(2); hs.start(); __BOT('skilled', 7); hs.finishReveal(); const url = await hs.cardDataURL(); const img = new Image(); img.src = url; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 31) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
    const ph = document.querySelector('#rPhoto').getContext('2d').getImageData(0, 0, 256, 256).data; let a = 0, a2 = 0, m = 0; for (let i = 0; i < ph.length; i += 4 * 7) { const v = ph[i] * .3 + ph[i + 1] * .59 + ph[i + 2] * .11; a += v; a2 += v * v; m++ }
    return { w: img.width, h: img.height, v: Math.round(s2 / n - (s / n) ** 2), photo: hs.S.photo, pv: Math.round(a2 / m - (a / m) ** 2), url }
  })
  const b64 = r.url.split(',')[1]; const { writeFileSync } = await import('node:fs'); writeFileSync(ROOT + '/shots/card.png', Buffer.from(b64, 'base64'))
  expect(r.w === 1080 && r.h === 1350 && r.v > 1500 && r.photo && r.pv > 200, JSON.stringify({ ...r, url: 0 })); return { w: r.w, h: r.h, v: r.v, pv: r.pv }
})
await t('画像を保存ボタンでダウンロードされる（PC）', async () => {
  await p.waitForTimeout(300)
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#bSave')])
  expect(dl.suggestedFilename() === 'sneeze-quiet.png', dl.suggestedFilename()); return dl.suggestedFilename()
})
await t('Xでポスト: 点数・称号・到達入りの x.com/intent/post が新しいタブで開く', async () => {
  const w = await p.evaluate(() => { const r = hs.S.result; return [r.pts + '点', r.rank.t.ja, '全会場を完走'] })
  const r = await xCheck(p, 'hs', w, '#くしゃみ我慢選手権', 'https://tom3games.github.io/sneeze-quiet/'); expect(r.label === 'Xでポスト', r.label); return r
})
await t('同じ種と同じ操作なら同じ結果（再現性）', async () => {
  const a = await p.evaluate(() => { hs.dbg.seed(42); hs.start(); return JSON.stringify(__BOT('skilled', 3).rec) })
  const b = await p.evaluate(() => { hs.dbg.seed(42); hs.start(); return JSON.stringify(__BOT('skilled', 3).rec) })
  expect(a === b && JSON.parse(a).length >= 30, a.slice(0, 80) + ' vs ' + b.slice(0, 80)); return { n: JSON.parse(a).length }
})
await t('点数の分布: 上手いボット40回で最高ランクは2〜4割／特大だけ・連打・くしゅんだけ・何もしない は低い', async () => {
  const r = await p.evaluate(() => {
    const run = (m, n, base) => { const o = []; for (let i = 0; i < n; i++) { hs.dbg.seed(base + i * 7); hs.start(); o.push(__BOT(m, base * 31 + i)) } return o }
    const top = hs.D.ranks[0].min, st = o => { const a = o.map(x => x.pts).sort((x, y) => x - y); return { min: a[0], med: a[a.length >> 1], max: a[a.length - 1], done: o.filter(x => x.done).length, ranks: hs.D.ranks.map(rk => o.filter(x => x.rank === rk.t.ja).length).join('/') } }
    const sk = run('skilled', 40, 100)
    return { skilled: { ...st(sk), topN: sk.filter(x => x.pts >= top).length }, big: st(run('big', 10, 300)), spam: st(run('spam', 10, 500)), small: st(run('small', 10, 700)), never: st(run('never', 5, 900)) }
  })
  const k = r.skilled
  expect(k.topN >= 8 && k.topN <= 16 && r.big.med < k.med && r.spam.max < 40 && r.spam.done === 0 && r.small.max < 60 && r.small.done === 0 && r.never.max === 0, JSON.stringify(r)); return r
})
await t('英語に切り替えると全部の文言が英語になる', async () => {
  const r = await p.evaluate(() => {
    hs.toTitle(); hs.setLang('en')
    const title = document.querySelector('.logo').textContent, start = document.querySelector('#bStart').textContent
    hs.start(); hs.dbg.step(5); const play = document.querySelector('#vPlay').innerText
    hs.toResult(); hs.finishReveal(); const rank = document.querySelector('#rRank').textContent, save = document.querySelector('#bSave').textContent
    const ja = /[぀-ヿ一-鿿]/.test(document.querySelector('#vResult').innerText + title + start + play)
    return { title, start, play: play.replace(/\s+/g, ' ').slice(0, 120), rank, save, ja }
  })
  await p.screenshot({ path: ROOT + '/shots/result-en.png' })
  await p.evaluate(() => hs.setLang('ja'))
  expect(/SNEEZE/.test(r.title) && r.start === 'Enter' && /KA-CHOOO/.test(r.play) && r.rank && !r.ja, JSON.stringify(r)); return r
})
await t('英語: Post on X も英語の結果とハッシュタグで開く', async () => {
  await p.evaluate(() => { hs.setLang('en'); hs.toResult(); hs.finishReveal() })
  const w = await p.evaluate(() => { const r = hs.S.result; return [r.pts + ' pts', r.rank.t.en] })
  const r = await xCheck(p, 'hs', w, '#HoldThatSneeze', 'https://tom3games.github.io/sneeze-quiet/'); await p.evaluate(() => hs.setLang('ja')); expect(r.label === 'Post on X', r.label); return r
})
await t('音: 鳴らしてもエラーが出ず、出来事の音・前触れ・くしゃみの声が鳴る', async () => {
  await p.evaluate(() => hs.toTitle()); await p.click('#bStart')
  const r = await p.evaluate(() => { hs.dbg.pause(); const e = hs.S.evs[0]; while (hs.S.st < e.at + e.peak / 2 - 0.12) hs.dbg.step(1); hs.sneeze(2); hs.dbg.step(40); return { state: hs.Snd.ctx && hs.Snd.ctx.state, played: Object.keys(hs.Snd.played) } })
  await p.waitForTimeout(500)
  const lv = await p.evaluate(() => hs.Snd.level())
  await p.evaluate(() => { hs.Snd.setMute(true) }); await p.waitForTimeout(150)
  const muted = await p.evaluate(() => hs.Snd.master.gain.value)
  await p.evaluate(() => hs.Snd.setMute(false))
  expect(r.played.some(k => k.startsWith('ev:')) && r.played.includes('sneeze') && r.played.includes('ha') && lv > 0.001 && muted === 0 && !p.errs.length, JSON.stringify({ ...r, lv, muted, errs: p.errs })); return { played: r.played.length, level: +lv.toFixed(3) }
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
  await q.click('#bStart'); await q.evaluate(() => { hs.dbg.pause(); hs.dbg.seed(1); hs.start(); hs.dbg.step(40); hs.dbg.render() }); views.start = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-start.png` })
  const bars = await noBars(q)
  await q.evaluate(() => { const e = hs.S.evs[0]; while (hs.S.st < e.at - 0.9) hs.dbg.step(1); hs.dbg.render() }); views.warn = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-warn.png` })
  await q.evaluate(() => { const e = hs.S.evs[0]; while (hs.S.st < e.at + e.peak / 2 - 0.12) hs.dbg.step(1); hs.sneeze(2); hs.dbg.step(20); hs.dbg.render() }); views.big = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-big.png` })
  await q.evaluate(() => { hs.dbg.step(120); hs.S.cd = [0, 0, 0]; hs.sneeze(1); hs.dbg.step(40); hs.dbg.render() }); views.busted = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-busted.png` })
  const btn = await q.evaluate(() => [...document.querySelectorAll('.snz')].map(b => { const r = b.getBoundingClientRect(), bad = [...b.children].filter(c => c.offsetParent).some(c => { const s = c.getBoundingClientRect(); return s.right > r.right + 1 || s.left < r.left - 1 || s.bottom > r.bottom + 1 || s.top < r.top - 1 || c.scrollWidth > c.clientWidth + 1 }); return { h: Math.round(r.height), w: Math.round(r.width), bad } }))
  await q.evaluate(() => { hs.toResult(); hs.finishReveal(); hs.dbg.step(30); hs.dbg.render() }); await q.waitForTimeout(450); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  const ol = await oneLine(q); await t(`${name}: 保存・Xボタンの文字が1行`, async () => { expect(!ol.length, ol.join(',')) })
  await t(`${name}: HUD にバーが無い・くしゃみボタンの中身が収まり押しやすい大きさ`, async () => { expect(!bars.length && btn.every(b => !b.bad && b.h >= 56 && b.w >= 80), JSON.stringify({ bars, btn })) })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await t(`${name}: もう一回ですぐ遊べる`, async () => { await q.click('#bAgain'); const m = await q.evaluate(() => hs.S.mode); expect(m === 'play', m); return m })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始めて、ボタンをタップするとくしゃみが出る（スマホの文言・キー表示なし）', async () => {
  await wp.tap('#bStart')
  const hint = await wp.evaluate(() => { hs.dbg.pause(); hs.dbg.step(20); return document.querySelector('#hint').textContent })
  await wp.tap('.snz.k0'); await wp.evaluate(() => { hs.dbg.step(30); hs.dbg.render() })
  const r = await wp.evaluate(() => ({ rec: hs.S.rec.map(x => x.rating), kbd: getComputedStyle(document.querySelector('.snz kbd')).display }))
  await wp.screenshot({ path: ROOT + '/shots/webkit-play.png' })
  expect(/タップ/.test(hint) && r.rec.length === 1 && /safe|perfect/.test(r.rec[0]) && r.kbd === 'none', hint + ' ' + JSON.stringify(r)); return { hint, r }
})
await t('WebKit: 結果まで通してエラーなし', async () => {
  const r = await wp.evaluate(() => { hs.dbg.seed(8); hs.start(); return __BOT('skilled', 8).pts })
  await wp.evaluate(() => { hs.finishReveal(); hs.dbg.render() }); await wp.waitForTimeout(400); await wp.screenshot({ path: ROOT + '/shots/webkit-result.png' })
  expect(r >= 150 && wp.errs.length === 0, r + ' ' + wp.errs.join('|')); return { pts: r }
})
await wb.close()

// ---- fps（GPU 描画で実時間に遊ばせて測る）
if (process.env.FPS) {
  const gb = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const g = await open(gb, { viewport: { width: w, height: h } })
    await g.evaluate(() => { hs.start() }); await g.waitForTimeout(6000)
    results.push(`info fps ${w}x${h}: game=${await g.evaluate(() => hs.S.fps)}`)
    await g.close()
  }
  await gb.close()
}
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
