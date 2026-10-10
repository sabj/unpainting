// --softmask <rim cells>: masking fluid laid thin at a light's rim, so the light is paper with a soft, broken edge.
// Fluid strength (sheet.mjs liftResist) rises from --softfloor at the rim to 1 at --softmask cells in. The paper's
// relief shifts it by --softrough relief standard deviations: high tooth keeps the fluid, hollows let paint through.
import { distanceToZero } from '../../raster.js';

export function softMask(mask, { w, h, n, paper, SC = 1, gaussian, num }) {
  const rim = num('softmask', 0);
  if (!(rim > 0) || !mask) return null;
  const floor = num('softfloor', 0.2), rough = num('softrough', 0.25);
  const d = distanceToZero(mask, w, h), W2 = w * SC, ht = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i % w, y = (i / w) | 0; ht[i] = paper.height[(y * SC) * W2 + x * SC]; }
  const H = gaussian(ht, w, h, 0.5);
  let m = 0, q = 0; for (let i = 0; i < n; i++) { m += H[i]; q += H[i] * H[i]; } m /= n; const sd = Math.sqrt(Math.max(1e-9, q / n - m * m));
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const t = Math.min(1, Math.max(0, (d[i] - 1) / rim));
    s[i] = Math.min(1, Math.max(0, floor + (1 - floor) * t * t * (3 - 2 * t) + rough * (H[i] - m) / sd));
  }
  return s;
}
