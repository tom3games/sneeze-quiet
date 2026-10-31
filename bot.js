// 検証用ボット（ページの中で動かす）。mode: skilled=上手い人 / big=特大だけ狙う / spam=見ずに連打 / never=何もしない / small=くしゅんだけ
// skilled: 前触れを見て、山のまん中で特大（0.09秒ぶれる・ひっかけに3割かかる）、山の端や余韻でハックション、静かな時はくしゅん（安全な間だけ）
window.__BOT = (mode, bseed = 1) => {
  hs.dbg.pause(); const S = hs.S, D = hs.D; let guard = 0
  let a = bseed >>> 0; const R = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R())
  const jit = mode === 'skilled' ? 0.09 : 0.14
  let fxMax = 0, legs = new Set(), sawCard = false
  while (S.mode !== 'result' && guard++ < 60 * 400) {
    if (S.mode === 'play') {
      const d = hs.dAt(S.leg, S.st)
      for (const e of S.evs) if (e.off === undefined) { e.off = e.peak / 2 - D.kinds[2].pre + gauss() * jit; e.bit = e.fake ? R() < 0.3 : true; e.moff = e.peak + 0.1 + gauss() * 0.12 }
      if (mode === 'skilled' || mode === 'big') {
        const e = S.evs.find(e => !e.bigDone && e.bit && S.st >= e.at + e.off - 1 / 60 && S.st < e.at + e.off + 0.2)
        if (e && S.cd[2] <= 0) { e.bigDone = true; hs.sneeze(2) }
        if (mode === 'skilled') {
          // ハックション: 山の終わりぎわ（端でもかき消せる）
          const m = S.evs.find(e => !e.fake && !e.midDone && S.st >= e.at + e.moff - 0.3 && S.st < e.at + e.moff)
          if (m && S.cd[1] <= 0 && (!S.snz || S.snz.impact)) { m.midDone = true; hs.sneeze(1) }
          // くしゅん: 静かでも平気な序盤にときどき、または前触れが盛り上がってきた所で（見て反応するので確率でしか押さない）
          const w = S.evs.find(e => e.ph === 'warn' && e.k > 0.6)
          if (S.cd[0] <= 0 && (!S.snz || S.snz.impact) && ((hs.needOf(0, d) < -0.02 && S.level < 0.05 && R() < 0.02) || (w && R() < 0.04))) hs.sneeze(0)
        }
      } else if (mode === 'spam') { for (const k of [2, 1, 0]) if (S.cd[k] <= 0 && (!S.snz || S.snz.impact) && R() < 0.02) hs.sneeze(k) }
      else if (mode === 'small') { if (S.cd[0] <= 0 && (!S.snz || S.snz.impact)) hs.sneeze(0) }
    }
    hs.dbg.step(1)
    fxMax = Math.max(fxMax, document.querySelectorAll('#fx > *').length); legs.add(S.leg)
    if (guard % 30 === 0 && [...document.querySelectorAll('#vPlay .card, #vPlay [class*=clear]')].some(e => e.offsetParent)) sawCard = true
  }
  const r = S.result
  return { rec: S.rec, pts: r && r.pts, rank: r && r.rank.t.ja, done: r && r.done, leg: r && r.leg, kinds: r && r.kinds, caught: r && r.caught, steps: guard, fxMax, legs: [...legs], sawCard }
}
