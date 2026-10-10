// --fleckshape 1: the reserved lights reshaped as paper a dry brush skipped (irregular blobs with broken edges, grouped
// in drags), not as single cells. Every small light (a component of the resist mask up to --fleckmax cells) is:
//   dropped on the ground segments named in --fleckoff (sky and sea by default), where the washes leave their own gaps;
//   grown from its seed as an ellipse along the drag direction (--fleckaspect), its rim pushed in and out by the
//   paper's height (--fleckrough, in standard deviations of the relief), to an area drawn between --fleckmin and
//   --fleckarea cells: a compact broken blob, not a line of single cells;
//   with chance --fleckdragp, given 1 to --fleckdrag smaller satellites a few cells further along that direction, as a
//   brush skips over the tooth in a drag.
// The drag direction runs along the source's structure where it has an edge and along the hand's diagonal
// (--handmean) where it has none. Larger lights are left as they are.
import { components } from '../../raster.js';

export async function shapeFlecks(mask, { w, h, n, SRC, paper, SC = 1, gaussian, image, path, num, opt, log, seed = 0 }) {
  if (!mask || opt('fleckshape', '0') === '0') return mask;
  const { hasSegments, loadSegments } = await import('../../crop/segments.mjs');
  const base = image ? path.basename(image, path.extname(image)) : '';
  const off = new Uint8Array(n), offNames = opt('fleckoff', 'sky,sea').split(',').filter(Boolean);
  if (base && hasSegments(base)) { const seg = await loadSegments(base, w, h); for (const r of seg.regions) if (offNames.includes(r.name)) for (let i = 0; i < n; i++) if (r.mask[i]) off[i] = 1; }
  const W2 = w * SC, ht = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i % w, y = (i / w) | 0; ht[i] = paper.height[(y * SC) * W2 + x * SC]; }
  const H = gaussian(ht, w, h, 0.6), B = gaussian(SRC, w, h, 1.5);
  let s = (seed * 2654435761 + 12345) >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const maxSmall = Math.round(num('fleckmax', 12)), aMin = num('fleckmin', 3), aMax = num('fleckarea', 14), drags = Math.round(num('fleckdrag', 2));
  const hand = num('handmean', 0.35), edgeMin = num('fleckedge', 0.04), aspect = num('fleckaspect', 1.8), rough = num('fleckrough', 0.8), dragP = num('fleckdragp', 0.4);
  // the paper's relief sets the broken edge: a blob is an ellipse along the drag whose rim follows the tooth
  let hMid = 0, hSq = 0; for (let i = 0; i < n; i++) { hMid += H[i]; hSq += H[i] * H[i]; } hMid /= n; const hSpread = Math.sqrt(Math.max(1e-9, hSq / n - hMid * hMid));
  const { labels, areas, count } = components(mask, w, h);
  const out = Uint8Array.from(mask), seeds = [], sizes = [];
  for (let i = 0; i < n; i++) { const id = labels[i]; if (!id || areas[id] > maxSmall) continue; out[i] = 0; if (!seeds[id]) seeds[id] = i; }
  // --fleckcount source: as many lights as the source keeps inside its painted forms, where it keeps them and at its
  // sizes. Each has a bare core of at least --fleckcore cells at 540 px width (scaled to the sheet, grown by --fleckring
  // for a soft rim). The source's lights: cells under --fleckwhite OD in components of at most --fleckmaxsrc cells,
  // where the source blurred over 4 cells is over 0.15 OD. The --fleckoff segments are still left out.
  if (opt('fleckcount', '') === 'source') {
    seeds.length = 0;
    const white = num('fleckwhite', 0.08), P = gaussian(SRC, w, h, 4), lm = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (SRC[i] < white && P[i] > 0.15) lm[i] = 1;
    const L = components(lm, w, h), sum = new Float64Array(L.count + 1 << 1), cap = num('fleckmaxsrc', 40) * (w / 540) ** 2;
    for (let i = 0; i < n; i++) { const id = L.labels[i]; if (id) { sum[id * 2] += i % w; sum[id * 2 + 1] += (i / w) | 0; } }
    const core = num('fleckcore', 6) * (w / 540) ** 2, least = Math.max(3, Math.round(core * num('fleckring', 2.6)));
    for (let id = 1; id <= L.count; id++) { if (L.areas[id] > cap) continue; const x = Math.round(sum[id * 2] / L.areas[id]), y = Math.round(sum[id * 2 + 1] / L.areas[id]); seeds.push(y * w + x); sizes.push(Math.max(least, L.areas[id])); }
  }
  const dirAt = i => {
    const x = i % w, y = (i / w) | 0, gx = B[y * w + Math.min(w - 1, x + 1)] - B[y * w + Math.max(0, x - 1)], gy = B[Math.min(h - 1, y + 1) * w + x] - B[Math.max(0, y - 1) * w + x];
    const g = Math.hypot(gx, gy);
    return g > edgeMin ? [-gy / g, gx / g] : [Math.cos(hand), Math.sin(hand)];
  };
  const grow = (seed, area, d) => {
    const got = new Set([seed]), front = new Map();
    const sx = seed % w, sy = (seed / w) | 0;
    const push = j => { if (got.has(j) || off[j]) return; const x = j % w, y = (j / w) | 0, dx = x - sx, dy = y - sy, r = Math.hypot(dx, dy) || 1;
      const a = dx * d[0] + dy * d[1], c = -dx * d[1] + dy * d[0]; front.set(j, -Math.hypot(a / aspect, c) + rough * (H[j] - hMid) / hSpread + 0.05 * rnd()); };
    const nb = j => { const x = j % w, y = (j / w) | 0; if (x > 0) push(j - 1); if (x < w - 1) push(j + 1); if (y > 0) push(j - w); if (y < h - 1) push(j + w); };
    nb(seed);
    while (got.size < area && front.size) { let best = -1, bv = -Infinity; for (const [j, v] of front) if (v > bv) { bv = v; best = j; } front.delete(best); got.add(best); nb(best); }
    for (const j of got) out[j] = 1;
    return got.size;
  };
  let kept = 0, dropped = 0, cells = 0, sats = 0;
  for (let id = sizes.length ? 0 : 1; id < (sizes.length ? sizes.length : count + 1); id++) {
    const sd = seeds[id]; if (sd === undefined) continue;
    if (off[sd]) { dropped++; continue; }
    const d = dirAt(sd), area = sizes.length ? sizes[id] : Math.round(aMin + (aMax - aMin) * rnd());
    cells += grow(sd, area, d); kept++;
    const k = rnd() < dragP ? 1 + Math.floor(rnd() * drags) : 0;
    for (let q = 1; q <= k; q++) {
      const step = (3 + 3 * rnd()) * q * (rnd() < 0.5 ? -1 : 1), x = Math.round(sd % w + d[0] * step), y = Math.round(((sd / w) | 0) + d[1] * step);
      if (x < 0 || y < 0 || x >= w || y >= h || off[y * w + x] || SRC[y * w + x] > num('fleckdark', 9)) continue;
      cells += grow(y * w + x, Math.max(2, Math.round(area * (0.4 + 0.3 * rnd()))), d); sats++;
    }
  }
  log(`flecks shaped: ${kept} grown to ${aMin} to ${aMax} cells along the drag, ${sats} satellites, ${dropped} dropped on ${offNames.join(' and ')}, ${cells} cells`);
  return out;
}
