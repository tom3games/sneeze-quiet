// SNS用サムネ og.png（1200x630）。node og.mjs
// 満員エレベーターで暴発し、全員が振り向いて「くさっ！！誰！？」の瞬間を左に、右にタイトルと一言
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
  hs.dbg.pause(); hs.dbg.seed(21); hs.start(); hs.beginCount(); hs.dbg.step(150); hs.S.evs = []
  hs.dbg.clearPax(); for (const t of ['madam', 'nose', 'bucho', 'dog', 'cleaner', 'coworker', 'jk']) hs.dbg.addPax(t)
  hs.press(); hs.dbg.step(60); hs.S.gauge = 0.9; hs.S.strain = 0.99; hs.S.flush = 0.9; hs.dbg.step(30)
  hs.dbg.step(14); hs.S.smell = 1.3
  for (const p of hs.aboard()) p.n.reactT = 0
  hs.dbg.step(1); hs.S.punch = -1; hs.dbg.step(12); hs.dbg.render()
  document.querySelectorAll('#fx > *').forEach(e => e.remove())
})
await p.addStyleTag({ content: `#corner,.hudTop,.hudBot,.hint{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 52%;background:linear-gradient(90deg,rgba(27,22,32,0),rgba(27,22,32,.92) 24%);z-index:30}` })
await p.evaluate(() => {
  const ono = (t, x, y, size, rot, col) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20;font-family:'Dela Gothic One';font-size:${size}px;color:${col};-webkit-text-stroke:4px #1b1620;paint-order:stroke fill;text-shadow:0 6px 0 #1b1620;transform:rotate(${rot}deg);white-space:nowrap`; document.body.appendChild(d) }
  ono('ブボボボッ！！', 250, 400, 74, -8, '#ff3d2e')
  ono('くさっ！！誰！？', 40, 40, 56, -5, '#ffd21f')
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:30px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:28px;letter-spacing:.12em;color:#1b1620;background:#ffd21f;padding:6px 16px 5px;border:4px solid #1b1620;transform:rotate(-3deg);box-shadow:4px 4px 0 #1b1620">ELEVATOR FART</div>
  <div style="font-family:'Dela Gothic One';font-size:84px;line-height:1.1;white-space:nowrap;-webkit-text-stroke:3px #1b1620;paint-order:stroke fill;text-shadow:0 7px 0 #1b1620">密室<span style="color:#ff3d2e">おなら</span><br>選手権</div>
  <div style="font-weight:900;font-size:29px;line-height:1.5;font-family:'Zen Maru Gothic'">バレずに<span style="color:#ffd21f">何発</span>出せるか。<br>音にかぶせて小出しに。<br>でも<span style="color:#b9f07a">匂い</span>でバレる。</div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
