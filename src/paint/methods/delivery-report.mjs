// Pigment delivered over booked, by how much paint the ledger booked in a cell (--deliveryreport 1). The whole-sheet
// ratio ("pigment delivered over planned") hides where paint goes missing; this splits the cells that hold paint into
// bands by their booked total, so a shortfall in the darks shows apart from the lights. Ledger and sheet only.

/** Band edges as shares of the painted cells, lightest first: the lightest half, then 30%, 15% and the darkest 5%. */
const BAND_SHARES = Object.freeze([0.5, 0.8, 0.95, 1]);

/**
 * @param {{ expected: Float32Array, held: Float32Array[], n: number, P: number, SC?: number, w: number, W2?: number,
 *   shares?: number[] }} o expected: booked mass per cell and pigment (n x P); held: per pigment, the sheet's mass on the
 *   fine grid (W2 wide, SC fine cells per cell side)
 * @returns {{ bands: { share: number, cells: number, booked: number, held: number, ratio: number|null, perPigment: (number|null)[] }[] }}
 */
export function deliveryByBand({ expected, held, n, P, SC = 1, w, W2 = w * SC, shares = BAND_SHARES }) {
  const total = new Float32Array(n), cells = [];
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < P; j++) t += expected[i * P + j]; total[i] = t; if (t > 1e-6) cells.push(i); }
  cells.sort((a, b) => total[a] - total[b]);
  const heldAt = (i, j) => {
    const x = i % w, y = (i - x) / w;
    let s = 0;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) s += held[j][(y * SC + dy) * W2 + x * SC + dx];
    return s / (SC * SC);
  };
  const bands = [];
  let from = 0;
  for (const share of shares) {
    const to = Math.round(share * cells.length), booked = new Float64Array(P), got = new Float64Array(P);
    for (let q = from; q < to; q++) { const i = cells[q]; for (let j = 0; j < P; j++) { booked[j] += expected[i * P + j]; got[j] += heldAt(i, j); } }
    const b = booked.reduce((a, v) => a + v, 0), g = got.reduce((a, v) => a + v, 0);
    bands.push({ share, cells: to - from, booked: +b.toFixed(4), held: +g.toFixed(4), ratio: b > 1e-9 ? +(g / b).toFixed(3) : null,
      perPigment: Array.from(booked, (v, j) => (v > 1e-6 ? +(got[j] / v).toFixed(3) : null)) });
    from = to;
  }
  return { bands };
}

/** One log line: each band's held over booked. */
export function deliveryNote({ bands }) {
  let lo = 0;
  return 'pigment delivered over booked, by booked amount: ' + bands.map(b => { const s = `${Math.round(lo * 100)}-${Math.round(b.share * 100)}% ${b.ratio ?? '-'}`; lo = b.share; return s; }).join(', ');
}
