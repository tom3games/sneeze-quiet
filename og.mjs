// SNS用サムネ og.png（1200x630）。node og.mjs
// 電車の通過にかぶせた特大くしゃみ（メガネと本が飛ぶ）を左に、右にタイトルと一言
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5742' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto('http://localhost:5742/'); await p.waitForFunction(() => window.__hsReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  // 電車の通過にかぶせて特大くしゃみ。メガネと本が飛ぶ瞬間
  hs.dbg.pause(); hs.dbg.seed(21); hs.start(); let e = hs.S.evs.find(e => e.type === 'train' && !e.fake)
  for (let s = 22; !e && s < 80; s++) { hs.dbg.seed(s); hs.start(); e = hs.S.evs.find(e => e.type === 'train' && !e.fake) }
  while (hs.S.st < e.at + e.peak / 2 - 0.12) hs.dbg.step(1)
  hs.sneeze(2); hs.dbg.step(26); hs.dbg.render()
  document.querySelector('#hint').hidden = true
  const o = [...document.querySelectorAll('.ono.red')].pop(); if (o) { o.style.fontSize = '58px'; o.style.transform = 'translate(320px,515px) translate(-50%,-50%) rotate(-7deg)'; o.style.opacity = '1' }
  const y = document.querySelector('.ono.yel'); if (y) { y.style.fontSize = '48px'; y.style.transform = 'translate(270px,70px) translate(-50%,-50%) rotate(5deg)'; y.style.opacity = '1' }
})
await p.addStyleTag({ content: `#corner,.hudTop,.snzRow,.hint,.place,.sb,.ono.small{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(27,22,32,0),rgba(27,22,32,.9) 22%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:26px;letter-spacing:.12em;color:#1b1620;background:#ffd21f;padding:6px 16px 5px;border:4px solid #1b1620;transform:rotate(-3deg);box-shadow:4px 4px 0 #1b1620">HOLD THAT SNEEZE</div>
  <div style="font-family:'Dela Gothic One';font-size:80px;line-height:1.1;white-space:nowrap;-webkit-text-stroke:3px #1b1620;paint-order:stroke fill;text-shadow:0 7px 0 #1b1620">くしゃみ<span style="color:#ff3d2e">我慢</span><br>選手権</div>
  <div style="font-weight:900;font-size:29px;line-height:1.5;font-family:'Zen Maru Gothic'">くしゃみは<span style="color:#ffd21f">大きな音に<br>かぶせて</span>出せ。<br>特大ほど高得点。</div>`
  document.body.appendChild(d)
  for (const el of document.querySelectorAll('.ono')) { el.style.transition = 'none' }
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
