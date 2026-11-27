// Local settling and conservative grain slide, shared CPU oracle for the split grid.
import { settleSpeed, settleDiffusion, settleShare } from './settling.mjs';
import { grainSlide, grainMobility, grainDrag } from './grain-water.mjs';
import { slideRate, reposeStep } from './grain-field.mjs';

export function materialFine(F, wa, blocks) {
  const s = F.sheet, L = F.L, o = F.o, dt = L.dt, N = F.N, FW = F.FW, K = F.K, pigments = s.pigments;
  const { G, D } = F, fp = F.paper, hollow = fp.hollow, height = fp.surface || fp.valley || fp.height, fibreH = fp.grainH, tooth = fp.tooth;
  const cellsOf = c => F.blockCells.subarray(c * N * N, (c + 1) * N * N);
  // 3. settling, lift and scour, stranding (sheet.mjs phase 3), per fine cell at its own film depth and hollow
  const gran = o.gran ?? 1, liftDepth = o.liftDepth ?? 0.15, scour = o.scour ?? 0, holdCap = o.hold ?? Infinity, holdDepth = o.holdDepth ?? o.film, coSettle = o.coSettle ?? 0;
  const granFill = o.granFill ?? 0, topLayer = F.layers.at(-1), rewetLift = o.rewetLift;
  const vOf = pigments.map(settleSpeed), dfOf = pigments.map(settleDiffusion), gg = pigments.map(p => p.gamma * gran), liftOf = pigments.map(p => (p.rho / p.omega) * o.lift * o.looseLift), scourOf = pigments.map(p => scour / p.omega);
  const wetBlocks = blocks.filter(c => s.M[c]), nn = N * N, Fm = F.M, counts = F.blockMaskCount;
  for (const c of wetBlocks) {
    const turnover = L.turn[c], partial = counts[c] > 0 && counts[c] < nn;
    for (const f of cellsOf(c)) {
      if (partial && !Fm[f]) continue;
      const Wi = wa[f], hh = height[f], ld = Wi / liftDepth, wetting = ld >= 1 ? 1 : ld * ld;
      const rewet = topLayer && Wi > o.film;
      // Use the loose bed before any pigment settles, as in sheet.mjs. Filling a hollow reduces
      // its remaining collection bias; it does not remove Stokes landing or Brownian deposition.
      let hol = hollow[f];
      if (granFill > 0) { let settled = 0; for (let k = 0; k < K; k++) settled += D[k][f]; hol *= Math.max(0, 1 - settled * granFill); }
      let vMix = 0; if (coSettle > 0) { let gm = 0; for (let k = 0; k < K; k++) { vMix += G[k][f] * vOf[k]; gm += G[k][f]; } vMix = gm > 0 ? vMix / gm : 0; }
      for (let k = 0; k < K; k++) {
        if (G[k][f] === 0 && D[k][f] === 0 && !(rewet && topLayer[k][f] !== 0)) continue;
        const down = G[k][f] * settleShare((coSettle > 0 ? (1 - coSettle) * vOf[k] + coSettle * vMix : vOf[k]) * o.settle, dfOf[k] * o.settle, gg[k], hol, dt, Wi);
        const shape = Math.max(0, 1 + (hh - 1) * gg[k]);
        const up = D[k][f] * shape * (liftOf[k] * wetting * dt + scourOf[k] * turnover * grainMobility(Wi));
        const dn = Math.min(G[k][f], Math.max(0, down)), u = Math.min(D[k][f], Math.max(0, up));
        D[k][f] += dn - u; G[k][f] += u - dn;
        if (rewet) {
          const top = topLayer[k], r = Math.min(top[f], (top[f] * rewetLift * dt) / pigments[k].omega);
          top[f] -= r; G[k][f] += r;
        }
      }
      let gs = 0; for (let k = 0; k < K; k++) gs += G[k][f];
      const hold = holdCap * Wi;
      if (Wi < holdDepth && gs > hold) { const fr = 1 - hold / gs; for (let k = 0; k < K; k++) { const q = G[k][f] * fr; G[k][f] -= q; D[k][f] += q; } }
    }
  }
  // the slide of settled grains down the fine relief (sheet.mjs, after phase 3), lengths at the fine cell
  const mm = fp.mmPerCell, slide = slideRate(o.slide ?? 0, mm), repose = reposeStep(o.repose ?? 0, mm), slideCap = o.slideCap ?? 0;
  if (slide > 0 && wetBlocks.length) {
    let fill = o.slideFill ?? 1;
    const ref = o.fillRef ?? 0;
    if (ref > 0) { let sum = 0, count = 0; for (const f of F.activeWetCells) { let d = 0; for (let k = 0; k < K; k++) { d += D[k][f]; if (o.fixedBed > 0) for (const l of F.layers) d += l[k][f]; } sum += d; count++; } const mean = count ? sum / count : 0; if (mean > ref) fill *= (ref / mean) ** 2; }
    const cells = F.activeWetCells;
    const dep = F.r, dd = F.dg;
    for (const f of cells) { let d = 0; for (let k = 0; k < K; k++) { d += D[k][f]; if (o.fixedBed > 0) for (const l of F.layers) d += l[k][f]; } dep[f] = fill * d; }
    // The pre-step film has been consumed. Reuse its plane for neighbour wetness so the slide's four
    // neighbour tests do not keep dividing fine coordinates back into coarse ones.
    const wet = F.wb, surface = F.out;
    wet.fill(0); for (const f of cells) wet[f] = 1;
    const ex = new Float64Array(4), nb = [1, -1, FW, -FW];
    for (let k = 0; k < K; k++) {
      if (gg[k] <= 0) continue;
      const fl = pigments[k].floc ?? 0, rep = repose / gg[k], Dk = D[k];
      // Paper and the bed are fixed during one pigment's slide pass. Reuse the outgoing-budget plane
      // for the exact surface expression instead of recomputing it at every neighbouring face.
      for (const f of cells) { dd[f] = 0; surface[f] = (1 - fl) * fibreH[f] + fl * tooth[f] + dep[f]; }
      for (const f of cells) {
        const Wi = wa[f]; if (Wi <= 0 || Dk[f] <= 0) continue;
        const x = f % FW, here = surface[f]; let sum = 0;
        for (let e = 0; e < 4; e++) {
          const j = f + nb[e]; ex[e] = 0;
          if ((e === 0 && x === FW - 1) || (e === 1 && x === 0) || j < 0 || j >= F.fn || !wet[j]) continue;
          ex[e] = Math.max(0, here - surface[j] - rep); sum += ex[e];
        }
        if (sum <= 0) continue;
        let moved = Dk[f] * Math.min(0.2, slide * grainDrag(vOf[k]) * gg[k] * grainSlide(Wi) * sum * dt);
        if (slideCap > 0 && fill > 0) { let lim = Infinity; for (let e = 0; e < 4; e++) if (ex[e] > 0) lim = Math.min(lim, slideCap * ex[e] / (fill * (1 + ex[e] / sum))); if (moved > lim) moved = lim; }
        dd[f] -= moved; for (let e = 0; e < 4; e++) if (ex[e] > 0) dd[f + nb[e]] += moved * ex[e] / sum;
      }
      for (const f of cells) if (dd[f]) Dk[f] = Math.max(0, Dk[f] + dd[f]);
    }
  }
}
