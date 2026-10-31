// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// sneeze-quiet hs を置き換え、「遊びの通し」をゲームに合わせて書く
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/sneeze-quiet/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__hsReady, null, { timeout: 15000 })
  // 遊びの通し（タイトル → 遊ぶ → 山で特大くしゃみ → 結果）
  if (opts.hasTouch) await p.tap('#bStart'); else await p.click('#bStart')
  const r = await p.evaluate(() => { hs.dbg.pause(); const e = hs.S.evs[0]; while (hs.S.st < e.at + e.peak / 2 - 0.12) hs.dbg.step(1); hs.sneeze(2); hs.dbg.step(30); const v = document.querySelector('#hPts').textContent; hs.toResult(); hs.finishReveal(); hs.dbg.render(); return hs.S.rec.map(x => x.rating).join(',') + ' pts=' + v + ' bars=' + document.querySelectorAll('#vPlay [class*=bar],#vPlay [class*=gauge]').length + ' v=' + [...document.scripts].map(s => s.src.split('?v=')[1]).filter(Boolean).join('/') })
  await p.waitForTimeout(500)
  out.push(`${name}: play=${r}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/sneeze-quiet', 'https://github.com/tom3games/sneeze-quiet/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${new RegExp(['tmk', '4men'].join(''), 'i').test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
