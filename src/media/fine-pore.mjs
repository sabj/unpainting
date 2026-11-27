// Keep each capillary pass and its face's filtration before the next pass changes the donor.
// Cropped water/flux records bound ledger storage by the worked boxes, rather than the full sheet per box.
export function poreLedger(sheet) {
  const events = [], touched = new Uint8Array(sheet.n);
  let pending = null;
  const copy = (out, input, e) => {
    for (let y = 0; y < e.h; y++) out.set(input.subarray((e.y + y) * sheet.w + e.x, (e.y + y) * sheet.w + e.x + e.w), y * e.w);
  };
  const ledger = {
    events, touched,
    reset() { events.length = 0; touched.fill(0); pending = null; },
    begin([x, y, x1, y1], water) {
      if (pending) throw new Error('two grids: unfinished pore pass');
      const w = x1 - x + 1, h = y1 - y + 1, n = w * h;
      pending = { x, y, w, h, before: new Float32Array(n), after: new Float32Array(n),
        fx: new Float64Array(n), fy: new Float64Array(n), cx: new Float32Array(n), cy: new Float32Array(n), moves: 0 };
      copy(pending.before, water, pending);
    },
    face(i, j, amount, caught) {
      const e = pending;
      if (!e) throw new Error('two grids: pore face outside a pass');
      const c = Math.min(i, j), at = (Math.floor(c / sheet.w) - e.y) * e.w + c % sheet.w - e.x;
      const vertical = Math.abs(i - j) === sheet.w;
      (vertical ? e.fy : e.fx)[at] += i < j ? amount : -amount;
      (vertical ? e.cy : e.cx)[at] = caught;
      touched[i] = 1; touched[j] = 1; e.moves++;
    },
    end(water) {
      if (!pending) throw new Error('two grids: no pore pass to finish');
      if (pending.moves) { copy(pending.after, water, pending); events.push(pending); }
      pending = null;
    },
  };
  return ledger;
}

// Reconstruct one saved pore depth on the fine capacities, preserving every coarse block's mean.
// On partially covered boundary blocks (0 < blockEverCount < N^2), keep pore water inside the fine wash footprint.
function waterOf(F, e, source, out, blocks) {
  const { N, blockCells, paper, ever, blockEverCount } = F, nn = N * N, capacity = paper.capacity, coarse = F.sheet.paper.capacity;
  for (let b = 0; b < blocks.length; b++) {
    const c = blocks[b], start = c * nn;
    const cnt = blockEverCount[c], partial = cnt > 0 && cnt < nn;
    let sum = 0;
    for (let a = 0; a < nn; a++) {
      const f = blockCells[start + a];
      const s = (!partial || ever[f]) ? source[b] * capacity[f] / coarse[c] : 0;
      out[f] = s; sum += s;
    }
    const target = partial ? source[b] * cnt : source[b] * nn;
    const scale = sum > 0 ? target / sum : 0;
    for (let a = 0; a < nn; a++) out[blockCells[start + a]] *= scale;
  }
}

export function* replayPores(F) {
  const { sheet, L, N, sb, sa, wetCells } = F, original = F.activeCells, nn = N * N;
  try {
    for (const e of L.pores.events) {
      const blocks = new Uint32Array(e.w * e.h);
      // Reuse the aggregate coarse flux planes and the now-consumed wet-cell list. No fine-sized
      // scratch is added. Fine advection sees this pass alone, before pore drying and the next pass.
      L.px.fill(0); L.py.fill(0); L.catchX.fill(0); L.catchY.fill(0);
      let n = 0;
      for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
        const b = y * e.w + x, c = (e.y + y) * sheet.w + e.x + x; blocks[b] = c;
        L.px[c] = e.fx[b]; L.py[c] = e.fy[b]; L.catchX[c] = e.cx[b]; L.catchY[c] = e.cy[b];
        for (let a = 0; a < nn; a++) wetCells[n++] = F.blockCells[c * nn + a];
      }
      F.activeCells = wetCells.subarray(0, n);
      waterOf(F, e, e.before, sb, blocks); waterOf(F, e, e.after, sa, blocks);
      yield { kind: 'flux', args: [L.px, L.py, sb, sa, blocks, 'ever'] };
      yield { kind: 'carry', args: [F.P, sb, sa, { x: L.catchX, y: L.catchY }, F.D] };
    }
  } finally { F.activeCells = original; }
}
