// Cockle: a wet sheet buckles. Cotton paper takes up water and swells by about a percent; held at its edges (taped,
// or by the dry paper round a wash) it cannot grow flat, so it rises into soft hills and troughs a few millimetres to a
// couple of centimetres across. A wash stands on that shape: its water levels to one surface, so it stands deeper in
// the troughs and thinner on the hills, and the pigment that settles out of it is heavier where the water pooled and
// lighter where it drained. That, more than the tooth, is why a real flat wash is never flat at the scale of a
// millimetre or two (the tooth gives the pepper, the cockle the blotches).
//
// The field is in millimetres of height, smooth value noise at two wavelengths (the sheet's broad buckles and the
// smaller ones a wash raises under itself), mean zero, scaled to `rmsMm`. It is a pure function of the size, the cell
// and the seed, so a sheet at any cell size buckles the same way. Only the water reads it (paper.mjs `surface`): the
// brush and the pen meet the paper as before.

/** The cockle's height in mm for a w x h sheet of mmPerCell cells: { rmsMm, waveMm: [broad, fine], fineShare }. */
export function cockleField(w, h, mmPerCell, { seed = 1, rmsMm = 0, waveMm = [14, 4], fineShare = 0.35 } = {}) {
  const n = w * h, out = new Float32Array(n);
  if (!(rmsMm > 0) || !(mmPerCell > 0)) return out;
  const hash = (x, y, s) => { const q = Math.sin(x * 127.1 + y * 311.7 + s * 74.7 + seed * 19.9) * 43758.5453; return q - Math.floor(q); };
  const vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const [broad, fine] = waveMm;
  let mean = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = (x + 0.5) * mmPerCell, Y = (y + 0.5) * mmPerCell;
    const v = (1 - fineShare) * vn(X / broad, Y / broad, 1) + fineShare * vn(X / fine + 7.3, Y / fine + 2.9, 2);
    out[y * w + x] = v; mean += v;
  }
  mean /= n;
  let ss = 0; for (let i = 0; i < n; i++) { out[i] -= mean; ss += out[i] * out[i]; }
  const k = ss > 0 ? rmsMm / Math.sqrt(ss / n) : 0;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}
