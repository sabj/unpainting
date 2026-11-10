// The value plan as booked paint, and the value statistics a plan is checked by before any paint is laid.
//
// The painter's ledger books every passage flat: its mix in every cell of its mask (tools/paint-plate.mjs). planLedger
// is that ledger for a plan that has not been painted yet, so the plan can be rendered through the sheet's optics and
// its values compared with the target's at plan time. valueStats are the quality gate's value measures (CIE L*, dark
// share under L* 35, paper share within 4 L* of the lightest tenth). Plan time only.

/** Per cell and pigment, the paint every passage of `plan` books: `mix[j]` over the passage's mask. n*k, interleaved. */
export function planLedger(plan, n, k) {
  const ledger = new Float32Array(n * k);
  for (const layer of plan.layers) for (const sh of layer.shapes) {
    const mask = sh.mask, mix = sh.mix;
    if (!mask || !mix) throw new Error('plan ledger: a passage has no mask or mix');
    for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < k; j++) ledger[i * k + j] += mix[j] ?? 0;
  }
  return ledger;
}

const linear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** CIE L* of an sRGB colour. */
export function lightness(r, g, b) {
  const y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

const DARK_L = 35, PAPER_TOLERANCE_L = 4;
/** Value statistics of an RGB picture of n pixels: mean L*, quantiles, the share under L* 35 and the paper share. */
export function valueStats(rgb, n) {
  if (!(n > 0) || rgb.length < n * 3) throw new Error('value stats: empty or short picture');
  const L = new Float32Array(n);
  let sum = 0, dark = 0;
  for (let i = 0; i < n; i++) { L[i] = lightness(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); sum += L[i]; if (L[i] < DARK_L) dark++; }
  const sorted = Float32Array.from(L).sort(), at = f => sorted[Math.floor(f * (n - 1))];
  let paperL = 0; const from = Math.floor(0.9 * n); for (let i = from; i < n; i++) paperL += sorted[i]; paperL /= n - from;
  let paper = 0; for (let i = 0; i < n; i++) if (L[i] >= paperL - PAPER_TOLERANCE_L) paper++;
  const r = (v, d) => +v.toFixed(d);
  return { darkShare: r(dark / n, 3), paperShare: r(paper / n, 3), meanL: r(sum / n, 1), L5: r(at(0.05), 1), L25: r(at(0.25), 1), L50: r(at(0.5), 1), L75: r(at(0.75), 1), L95: r(at(0.95), 1) };
}
