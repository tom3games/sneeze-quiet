// SNS用サムネ og.png（1200x630）。node og.mjs
// 図書館でくしゃみが外れて全員が振り向いた瞬間を左に、右にタイトルと一言
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5419' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto('http://localhost:5419/'); await p.waitForFunction(() => window.__hsReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  hs.dbg.pause(); hs.dbg.seed(21); hs.start(); hs.beginCount(); hs.dbg.step(150); hs.press(); hs.dbg.step(60 * 2.6)
  hs.S.gauge = 0.85; hs.S.strain = 0.75; hs.S.flush = 0.75; hs.dbg.step(2)
  hs.S.downAt = -1e9; hs.release(); hs.dbg.step(14)
  for (const n of hs.STG.library.npcs) n.reactT = 0
  hs.dbg.step(1); hs.S.punch = -1; hs.dbg.step(9); hs.dbg.render()
  const o = document.querySelector('.ono.red'); if (o) { o.style.transform = 'translate(330px,150px) translate(-50%,-50%) rotate(-9deg) scale(1.1)'; o.style.opacity = '1' }
})
await p.addStyleTag({ content: `#corner,.hudTop,.hudBot,.hint,.verdict,.sb,.ono.small{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(27,22,32,0),rgba(27,22,32,.9) 22%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:26px;letter-spacing:.12em;color:#1b1620;background:#ffd21f;padding:6px 16px 5px;border:4px solid #1b1620;transform:rotate(-3deg);box-shadow:4px 4px 0 #1b1620">HOLD THAT SNEEZE</div>
  <div style="font-family:'Dela Gothic One';font-size:80px;line-height:1.1;white-space:nowrap;-webkit-text-stroke:3px #1b1620;paint-order:stroke fill;text-shadow:0 7px 0 #1b1620">くしゃみ<span style="color:#ff3d2e">我慢</span><br>選手権</div>
  <div style="font-weight:900;font-size:29px;line-height:1.5;font-family:'Zen Maru Gothic'">静かすぎる場所で、くしゃみは<br><span style="color:#ffd21f">大きな音にかぶせて</span>出せ。</div>`
  document.body.appendChild(d)
  for (const el of document.querySelectorAll('.ono')) { el.style.transition = 'none' }
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
