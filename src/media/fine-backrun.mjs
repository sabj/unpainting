// Keep the back-run's read-before-write pigment exchanges separate from ordinary film advection.
// A coarse exchange carries the same share of each fine position to the corresponding position in its neighbour.
// This retains the existing back-run model; it does not invent a bloom texture on the fine paper.
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

export function recordFineBackrun(F, { box, q, s, dW, on, push, floor }) {
  const { sheet, L } = F, { w, W, M } = sheet, [x0, y0, x1, y1] = box;
  const head = Math.fround(Math.max(floor, F.o.puddle ?? floor));
  const from = [], to = [], suspended = [], deposit = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x;
    if (!on[i]) continue;
    let Q = 0; for (let e = 0; e < 4; e++) Q += q[4 * i + e];
    for (let e = 0; e < 4; e++) {
      const v = q[4 * i + e]; if (!(v > 0)) continue;
      const j = (y + DY[e]) * w + x + DX[e];
      from.push(j); to.push(i); suspended.push(v / W[j]); deposit.push(push * v / W[j]);
      const xx = x - DX[e], yy = y - DY[e];
      if (xx < x0 || yy < y0 || xx > x1 || yy > y1) continue;
      const dest = yy * w + xx;
      // Match the coarse pass's exposed-tooth fraction at the receiving cell,
      // including its puddle head. A merely damp neighbour takes only that share.
      if (!M[dest] || !(W[dest] > 0) || W[dest] >= head || sheet.resist?.[dest]) continue;
      const share = s[i] * v / Q * ((head - W[dest]) / head);
      from.push(i); to.push(dest); suspended.push(share); deposit.push(share);
    }
  }
  const afterW = Float32Array.from(W);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (dW[i]) afterW[i] = Math.max(0, W[i] + dW[i]);
  }
  const event = {
    beforeW: Float32Array.from(W), afterW, mask: Uint8Array.from(M),
    fx: L.film.recorded ? null : Float64Array.from(L.fx), fy: L.film.recorded ? null : Float64Array.from(L.fy),
    from: Uint32Array.from(from), to: Uint32Array.from(to),
    suspended: Float64Array.from(suspended), deposit: Float64Array.from(deposit),
  };
  L.backruns.push(event);
  L.film.backrun(event);
  // Chronological records already own the prefix; legacy manual ledgers keep
  // their aggregate with the back-run. Later flow starts a new phase.
  L.fx.fill(0); L.fy.fill(0);
}

export function applyFineBackrun(F, event) {
  const { G, D, dg, out, blockCells, N, activeCells, M, blockMaskCount } = F, nn = N * N;
  for (let k = 0; k < F.K; k++) {
    for (const f of activeCells) { dg[f] = 0; out[f] = 0; }
    for (let e = 0; e < event.from.length; e++) {
      const srcC = event.from[e], dstC = event.to[e];
      const src = srcC * nn, dst = dstC * nn;
      const srcCnt = blockMaskCount[srcC], dstCnt = blockMaskCount[dstC];
      const srcPartial = srcCnt > 0 && srcCnt < nn, dstPartial = dstCnt > 0 && dstCnt < nn;
      let overflow = 0;
      for (let a = 0; a < nn; a++) {
        const i = blockCells[src + a], j = blockCells[dst + a];
        if (srcPartial && !M[i]) continue;
        const g = G[k][i] * event.suspended[e], d = D[k][i] * event.deposit[e];
        dg[i] -= g; out[i] -= d;
        if (!dstPartial || M[j]) dg[j] += g + d;
        else overflow += g + d;
      }
      if (overflow > 0) {
        const share = overflow / dstCnt;
        for (let a = 0; a < nn; a++) {
          const j = blockCells[dst + a];
          if (M[j]) dg[j] += share;
        }
      }
    }
    for (const f of activeCells) {
      if (dg[f]) G[k][f] = Math.max(0, G[k][f] + dg[f]);
      if (out[f]) D[k][f] = Math.max(0, D[k][f] + out[f]);
    }
  }
}
