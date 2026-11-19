// A passage of fur strands: many thin lights running the same way inside one dark region. A painter does not copy each
// hair; she lays hair with a rigger, along the way the coat lies, as long as the strands are, no closer than a rigger can
// lay them, and more where the coat has more. This module reads the thin ridges of a region (src/crop/thin-lights.mjs
// ridgeChains) as a direction field and a strand density, finds the passages where both are clear, and lays strokes
// by following the field from seeds spread over the passage. A stroke's place and length come from the field, not from
// any one ridge, so the result is the coat's character and not a trace of it.
//
// A passage is a connected area (at least PASSAGE_MIN_MM2) where the ridge length per square millimetre is at least
// RHO_MIN and the ridges agree on a direction (coherence at least COH_MIN). Ridges that do not agree are texture, and
// nothing is laid there. Strokes are laid at COVER of the ridge length, each as long as the passage's typical ridge
// (LENGTH_MM), at least MIN_STROKE_MM long (no flecks), and no closer to another stroke than a rigger can lay it
// (MIN_SPACING_MM), wider apart where the strands are sparser. DOM free.
import { gaussian } from '../keyframes/density.mjs';
import { components } from '../raster.js';
import { turnSigns } from './curve-fit.mjs';

export const RHO_MIN = 0.12;          // ridge length per mm^2 at which a coat is a coat
const COH_MIN = 0.45;          // 0 for ridges in every direction, 1 for all alike, read over a few millimetres
const PASSAGE_MIN_MM2 = 40;
const PASSAGE_MIN_RIDGES = 15;  // a few long lights are whiskers or rigging, not a coat
const COVER = 0.5;             // the share of the ridge length a painter lays in strokes: a hair in two, not every hair
export const MIN_SPACING_MM = 0.9;    // two rigger lines (about 0.4 mm each) with a gap between them
export const MIN_STROKE_MM = 3;
const LENGTH_MM = Object.freeze([4, 12]);
const CELL_MM = 1, SIGMA_FINE = 2, SIGMA_WIDE = 4, AGREE_RAD = 40 * Math.PI / 180, STEP_MM = 0.3, MAX_TURNS_PER_CM = 0.75, BLOCK_MM = 0.25;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @param chains   [{ pts: [[x, y]] (pixels, about one pixel apart), widthMm, rgb|null, lightOd }]
 * @param w, h     the field's pixels, pixelMm the millimetres of one
 * @param ceiling  the most strokes this sheet may carry in fields
 * @returns {{ strokes, passages, inside: (x, y) => boolean }} strokes as thin-lights strokes (kind 'strand', field: id)
 */
export function strandFields(chains, { w, h, pixelMm, ceiling = Infinity, seed = 1 }) {
  const gw = Math.ceil(w * pixelMm / CELL_MM) + 1, gh = Math.ceil(h * pixelMm / CELL_MM) + 1, n = gw * gh;
  const len = new Float32Array(n), c2 = new Float32Array(n), s2 = new Float32Array(n), wid = new Float32Array(n), od = new Float32Array(n), col = [0, 1, 2].map(() => new Float32Array(n)), hasCol = new Float32Array(n);
  const cellAt = (xPx, yPx) => { const gx = Math.min(gw - 1, Math.max(0, Math.floor(xPx * pixelMm / CELL_MM))), gy = Math.min(gh - 1, Math.max(0, Math.floor(yPx * pixelMm / CELL_MM))); return gy * gw + gx; };
  for (const ch of chains) {
    for (let j = 1; j < ch.pts.length; j++) {
      const a = ch.pts[j - 1], b = ch.pts[j], dx = b[0] - a[0], dy = b[1] - a[1], s = Math.hypot(dx, dy) * pixelMm; if (s < 1e-9) continue;
      const th = Math.atan2(dy, dx), i = cellAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      len[i] += s; c2[i] += s * Math.cos(2 * th); s2[i] += s * Math.sin(2 * th); wid[i] += s * ch.widthMm; od[i] += s * ch.lightOd;
      if (ch.rgb) { hasCol[i] += s; for (let c = 0; c < 3; c++) col[c][i] += s * ch.rgb[c]; }
    }
  }
  // density and the wide direction over SIGMA_WIDE mm; the local direction over SIGMA_FINE mm. A direction counts only where
  // both scales agree: strands that run one way over a centimetre are a coat, flecks in every direction are texture.
  const wide = F => gaussian(F, gw, gh, SIGMA_WIDE), fine = F => gaussian(F, gw, gh, SIGMA_FINE);
  const L = wide(len), C6 = wide(c2), S6 = wide(s2), Lf = fine(len), C = fine(c2), S = fine(s2), Wd = fine(wid), Od = fine(od), Hc = fine(hasCol), Col = col.map(fine);
  const rho = Float32Array.from(L, v => v / (CELL_MM * CELL_MM));
  const cohF = Float32Array.from(Lf, (v, i) => (v > 1e-9 ? Math.hypot(C[i], S[i]) / v : 0)), cohW = Float32Array.from(L, (v, i) => (v > 1e-9 ? Math.hypot(C6[i], S6[i]) / v : 0));
  const agree = i => { let d = Math.abs(0.5 * Math.atan2(S[i], C[i]) - 0.5 * Math.atan2(S6[i], C6[i])); d = Math.min(d, Math.PI - d); return d <= AGREE_RAD; };
  const mask = Uint8Array.from(rho, (v) => (v >= RHO_MIN ? 1 : 0));
  const { labels, areas, count } = components(mask, gw, gh, 4);
  const keep = new Uint8Array(count + 1); for (let l = 1; l <= count; l++) keep[l] = areas[l] * CELL_MM * CELL_MM >= PASSAGE_MIN_MM2 ? 1 : 0;
  const inside = (xPx, yPx) => { const l = labels[cellAt(xPx, yPx)]; return l > 0 && keep[l] === 1; };
  let rhoMax = 0, dense = 0, coherent = 0; for (let i = 0; i < n; i++) { if (rho[i] > rhoMax) rhoMax = rho[i]; if (rho[i] >= RHO_MIN) { dense++; if (cohF[i] >= COH_MIN && cohW[i] >= COH_MIN * 0.6 && agree(i)) coherent++; } }
  const out = { strokes: [], passages: [], inside, stats: { ridges: chains.length, cellsDense: dense, cellsCoherent: coherent, rhoMax: +rhoMax.toFixed(3) } };
  if (!keep.some(Boolean)) return out;

  // bilinear sample of a grid in millimetres
  const at = (F, xmm, ymm) => {
    const gx = xmm / CELL_MM - 0.5, gy = ymm / CELL_MM - 0.5, x0 = Math.max(0, Math.min(gw - 2, Math.floor(gx))), y0 = Math.max(0, Math.min(gh - 2, Math.floor(gy))), fx = Math.max(0, Math.min(1, gx - x0)), fy = Math.max(0, Math.min(1, gy - y0));
    return F[y0 * gw + x0] * (1 - fx) * (1 - fy) + F[y0 * gw + x0 + 1] * fx * (1 - fy) + F[(y0 + 1) * gw + x0] * (1 - fx) * fy + F[(y0 + 1) * gw + x0 + 1] * fx * fy;
  };
  const wmm = w * pixelMm, hmm = h * pixelMm, bw = Math.ceil(wmm / BLOCK_MM) + 1, bh = Math.ceil(hmm / BLOCK_MM) + 1, blocked = new Uint8Array(bw * bh);
  const stamp = (x, y, r, own = null) => {
    const R = Math.ceil(r / BLOCK_MM);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (Math.hypot(dx, dy) * BLOCK_MM > r) continue;
      const bx = Math.floor(x / BLOCK_MM) + dx, by = Math.floor(y / BLOCK_MM) + dy;
      if (bx >= 0 && by >= 0 && bx < bw && by < bh) { if (own) own.push(by * bw + bx); else blocked[by * bw + bx] = 1; }
    }
  };
  const free = (x, y) => { const bx = Math.floor(x / BLOCK_MM), by = Math.floor(y / BLOCK_MM); return bx >= 0 && by >= 0 && bx < bw && by < bh && !blocked[by * bw + bx]; };
  const onField = (x, y) => {
    if (at(rho, x, y) < RHO_MIN * 0.5) return false;
    const lf = at(Lf, x, y), lw = at(L, x, y); if (lf < 1e-9 || lw < 1e-9) return false;
    const cf = at(C, x, y), sf = at(S, x, y), cw = at(C6, x, y), sw = at(S6, x, y);
    if (Math.hypot(cf, sf) / lf < COH_MIN * 0.8 || Math.hypot(cw, sw) / lw < COH_MIN * 0.5) return false;
    let d = Math.abs(0.5 * Math.atan2(sf, cf) - 0.5 * Math.atan2(sw, cw)); d = Math.min(d, Math.PI - d);
    return d <= AGREE_RAD * 1.3;
  };
  const dirAt = (x, y, prev) => {
    let th = 0.5 * Math.atan2(at(S, x, y), at(C, x, y)), dx = Math.cos(th), dy = Math.sin(th);
    if (prev && dx * prev[0] + dy * prev[1] < 0) { dx = -dx; dy = -dy; }
    return [dx, dy];
  };

  const rnd = rng(seed);
  for (let id = 1; id <= count; id++) {
    if (!keep[id]) continue;
    const cells = []; for (let i = 0; i < n; i++) if (labels[i] === id) cells.push(i);
    let ridgeMm = 0; const lens = [];
    for (const ch of chains) { const mid = ch.pts[ch.pts.length >> 1]; if (labels[cellAt(mid[0], mid[1])] === id) { const l = ch.pts.length * pixelMm; ridgeMm += l; lens.push(l); } }
    if (lens.length < PASSAGE_MIN_RIDGES) { for (const i of cells) labels[i] = 0; continue; }
    lens.sort((a, b) => a - b);
    const ell = Math.min(LENGTH_MM[1], Math.max(LENGTH_MM[0], lens[lens.length >> 1] * 1.5));
    let want = Math.round(COVER * ridgeMm / ell);
    want = Math.min(want, Math.max(0, ceiling - out.strokes.length));
    const seeds = cells.filter(i => cohF[i] >= COH_MIN && cohW[i] >= COH_MIN * 0.6 && agree(i)).map(i => { const gx = i % gw, gy = (i / gw) | 0; return { x: (gx + rnd()) * CELL_MM, y: (gy + rnd()) * CELL_MM, p: rho[i] * (0.5 + rnd()) }; }).sort((a, b) => b.p - a.p);
    const mine = []; let rhoSum = 0, cohSum = 0;
    for (const i of cells) { rhoSum += rho[i]; cohSum += cohF[i]; }
    for (const sd of seeds) {
      if (mine.length >= want) break;
      if (!free(sd.x, sd.y) || !onField(sd.x, sd.y)) continue;
      const target = ell * (0.7 + 0.6 * rnd()), sep = Math.max(MIN_SPACING_MM, 0.7 / (COVER * Math.max(at(rho, sd.x, sd.y), 1e-3)));
      const grow = (sign, budget) => {
        const pts = []; let x = sd.x, y = sd.y, prev = null, used = 0;
        while (used < budget) {
          const d = dirAt(x, y, prev || [sign * Math.cos(0.5 * Math.atan2(at(S, sd.x, sd.y), at(C, sd.x, sd.y))), sign * Math.sin(0.5 * Math.atan2(at(S, sd.x, sd.y), at(C, sd.x, sd.y)))]);
          // midpoint step
          const mx = x + d[0] * STEP_MM / 2, my = y + d[1] * STEP_MM / 2, d2 = dirAt(mx, my, d);
          const nx = x + d2[0] * STEP_MM, ny = y + d2[1] * STEP_MM;
          if (nx < 0 || ny < 0 || nx > wmm || ny > hmm || !onField(nx, ny) || !free(nx, ny)) break;
          x = nx; y = ny; prev = d2; used += STEP_MM; pts.push([x, y]);
        }
        return pts;
      };
      const fwd = grow(1, target / 2), back = grow(-1, target / 2);
      const line = [...back.reverse(), [sd.x, sd.y], ...fwd];
      if ((line.length - 1) * STEP_MM < MIN_STROKE_MM) continue;
      const px = line.map(([x, y]) => [x / pixelMm, y / pixelMm]);
      const turns = turnSigns(px), lenMm = (line.length - 1) * STEP_MM, perCm = turns / Math.max(0.1, lenMm / 10);
      if (perCm > MAX_TURNS_PER_CM) continue;
      const mid = line[line.length >> 1], hc = at(Hc, mid[0], mid[1]), lw = at(Lf, mid[0], mid[1]);
      const rgb = hc > 1e-6 ? Col.map(F => Math.round(at(F, mid[0], mid[1]) / hc)) : null;
      const own = []; for (const [x, y] of line) stamp(x, y, sep / 2, own);
      // only a later stroke is held off by this one: its own cells were free when it grew
      for (const b of own) blocked[b] = 1;
      const strand = { kind: 'strand', field: id, points: px, widthMm: Math.min(1.0, Math.max(0.25, lw > 1e-9 ? at(Wd, mid[0], mid[1]) / lw : 0.4)), lengthMm: lenMm, lightOd: lw > 1e-9 ? at(Od, mid[0], mid[1]) / lw : 0, surroundOd: null, rgb,
        fit: { maxMm: 0, meanMm: 0, turnsPerCm: +perCm.toFixed(3) }, score: lenMm * at(rho, mid[0], mid[1]) };
      mine.push(strand);
    }
    out.strokes.push(...mine);
    out.passages.push({ id, areaMm2: cells.length * CELL_MM * CELL_MM, ridgeLengthMm: +ridgeMm.toFixed(1), meanDensity: +(rhoSum / cells.length).toFixed(3), meanCoherence: +(cohSum / cells.length).toFixed(3), strokeLengthMm: +ell.toFixed(1), wanted: want, strokes: mine.length, lengthMm: +mine.reduce((a, s) => a + s.lengthMm, 0).toFixed(1) });
  }
  return out;
}
