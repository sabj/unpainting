// --drags 1: dry-brush drags in given regions: a flat, nearly dry brush loaded with one mixed puddle, pulled along
// the form so it breaks on the paper's tooth.
//
// Regions are boxes per plate (--dragbox x0,y0,x1,y1[;...], fractions of the sheet), because no texture statistic
// separates dragged regions (sand, fur, grass) from ones that must stay soft. A drag lands only on painted cells
// (source density over --dragpaper), less any --dragskip box. There:
//   1. the washes are thinned by --dragshare (0.35), so the drags carry that share without overshooting the plan;
//   2. drags are seeded on a jittered grid (--draggap, px at 1086) and walked along the source's orientation field,
//      with log-normal length (median --draglen, 21 px at 1086);
//   3. the brush is a flat --dragwidth px wide (8 at 1086), dry (--dragwater 0.3), bridging the tooth (--dragbridge 0.9);
//   4. the charge is one mixed puddle: what the plan still owes along the stroke (remainingMix), times --draggain.
import { orientationField } from '../../crop/fur.mjs';
import { remainingMix } from './colour-budget.mjs';
import { dilate } from '../../raster.js';
import { needCells } from '../../media/sheet.mjs';

export function dragRegion({ w, h, n, SRC, num, opt }) {
  if (num('drags', 0) <= 0 || !opt('dragbox', '')) return null;
  const m = new Uint8Array(n), paper = num('dragpaper', 0.06);
  for (const b of opt('dragbox').split(';')) {
    const [x0, y0, x1, y1] = b.split(',').map(Number);
    for (let y = Math.floor(y0 * h); y < Math.min(h, Math.ceil(y1 * h)); y++) for (let x = Math.floor(x0 * w); x < Math.min(w, Math.ceil(x1 * w)); x++) {
      const i = y * w + x; if (SRC[i] > paper) m[i] = 1;
    }
  }
  // --dragskip boxes are taken back out (a tongue inside a dog's fur)
  if (opt('dragskip', '')) for (const b of opt('dragskip').split(';')) {
    const [x0, y0, x1, y1] = b.split(',').map(Number);
    for (let y = Math.floor(y0 * h); y < Math.min(h, Math.ceil(y1 * h)); y++) for (let x = Math.floor(x0 * w); x < Math.min(w, Math.ceil(x1 * w)); x++) m[y * w + x] = 0;
  }
  let c = 0; for (let i = 0; i < n; i++) c += m[i];
  // drags walk a mask dilated over paper specks (--dragreach px at 1086), so a drag runs across a speck instead of stopping
  return c ? { mask: m, walk: dilate(m, w, h, Math.max(1, num('dragreach', 6) * w / 1086)), cells: c, share: num('dragshare', 0.35) } : null;
}

/** Thin the wash plan where the drags will carry their share. */
export function thinForDrags(R, Aw, K) {
  if (!R) return;
  for (let i = 0; i < R.mask.length; i++) if (R.mask[i]) for (let j = 0; j < K; j++) Aw[i * K + j] *= 1 - R.share;
}

/** The drags' paths, in plan cells: [{x, y}] per drag. Seeded, so a run is repeatable. */
function dragPaths(R, SRC, w, h, { gaussian, num, SEED = 0, count = 0, medCells = 0 }) {
  const s1086 = w / 1086, O = orientationField(SRC, w, h, gaussian, { sigma: 6 * s1086 });
  // --dragcount (400, or the stroke budget's share): the seed grid is spaced so about that many drags are laid
  const gap = Math.max(2, count > 0 ? Math.sqrt(R.cells / count) : num('draggap', 9) * s1086), med = medCells > 0 ? medCells : num('draglen', 21) * s1086, spread = num('dragspread', 0.95);
  let s = (7919 + SEED) | 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return (u - 3) / Math.SQRT1_2 / 1.0; };
  const walk = R.walk ?? R.mask;
  const inside = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h && walk[yi * w + xi]; };
  const out = [];
  for (let gy = gap / 2; gy < h; gy += gap) for (let gx = gap / 2; gx < w; gx += gap) {
    const x0 = gx + (rnd() - 0.5) * gap, y0 = gy + (rnd() - 0.5) * gap;
    if (!inside(x0, y0)) continue;
    // log-normal length: median `med`, sigma `spread` (p90 = med * e^(1.28 spread), 3.4x at 0.95)
    const L = Math.max(3, med * Math.exp(spread * gauss()));
    const i0 = Math.round(y0) * w + Math.round(x0);
    let ux = O.dx[i0], uy = O.dy[i0];
    if (rnd() < 0.5) { ux = -ux; uy = -uy; }
    // start half the length back, so the drag is centred on its seed
    const pts = [];
    let x = x0 - ux * L / 2, y = y0 - uy * L / 2;
    for (let t = 0; t <= L; t += 1) {
      const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))), j = yi * w + xi;
      let vx = O.dx[j], vy = O.dy[j]; if (vx * ux + vy * uy < 0) { vx = -vx; vy = -vy; }
      ux = 0.85 * ux + 0.15 * vx; uy = 0.85 * uy + 0.15 * vy; const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
      if (inside(x, y)) pts.push({ x, y }); else if (pts.length) break;
      x += ux; y += uy;
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

export async function layDrags(R, c) {
  const { sheet, w, h, n, SC, W2, K, SRC, A, gaussian, num, dip, createBrush, stroke, step, dry, O, CAL, UPRIGHT, SEED, expected, used, clock, shoot, setStage, log } = c;
  if (!R) return;
  const paths = dragPaths(R, SRC, w, h, { gaussian, num, SEED, count: c.count ?? num('dragcount', 400), medCells: c.mmPerCell ? num('draglenmm', 15) / c.mmPerCell : 0 });
  const rW = c.mmPerCell ? Math.max(0.5 * SC, c.dragWmm / c.mmPerCell / 2 * SC) : Math.max(1, num('dragwidth', 8) * (w / 1086) / 2) * SC, gain = num('draggain', 2.5);
  const held = (ci) => { const got = new Array(K).fill(0), x = ci % w, y = (ci / w) | 0; needCells(sheet, x * SC, y * SC, SC, SC); for (let j = 0; j < K; j++) { let v = 0; for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) { const q = (y * SC + dy) * W2 + x * SC + dx; v += sheet.G[j][q] + sheet.D[j][q] + sheet.P[j][q]; for (const layer of sheet.layers) v += layer[j][q]; } got[j] = v / (SC * SC); } return got; };
  const shots = Math.max(1, Math.round(num('dragframes', 3))), every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, paths.length))));
  let st = 0, laid = 0, lens = [];
  for (const [q, m] of paths.entries()) {
    // one puddle for the stroke: what the plan still owes, every pan, averaged over a few cells along it
    const owe = new Array(K).fill(0); let cnt = 0;
    for (let k = 0; k < m.length; k += Math.max(1, m.length >> 2)) {
      const ci = Math.round(m[k].y) * w + Math.round(m[k].x);
      const target = Array.from({ length: K }, (_, j) => A[ci * K + j]);
      const r = remainingMix(target, held(ci)); for (let j = 0; j < K; j++) owe[j] += r[j]; cnt++;
    }
    let tot = 0; for (let j = 0; j < K; j++) { owe[j] /= cnt; tot += owe[j]; }
    if (tot < num('dragmin', 0.02)) continue;
    const last = m.length - 1;
    const pts = m.map((p, k) => { const u = k / last, sw = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.5); return { x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: rW * (0.55 + 0.45 * sw), p: 0.35 + 0.6 * sw }; });
    const b = createBrush({ flat: true, radius: rW, bristles: Math.max(14, Math.ceil(rW * 3)), capacity: 22, belly: 2, feed: 0.05, give: 0.7, free: 0.45, film: 0.22,
      splay: 0.1, stiffness: 20, fine: 0.1, coarse: 0.15, wetMix: 0.1, bridge: num('dragbridge', 0.9), bridgeSoft: 2.2, streak: 0.8, streakLength: Math.max(6, 0.5 * m.length * SC), breakup: 2.4, seed: 9101 + q + SEED });
    dip(b, { water: num('dragwater', 0.3), conc: owe.map(v => v * gain * num('strength', 2.2) * (CAL['wet on dry'] ?? 1)) });
    clock('strokes', () => stroke(b, sheet, pts, { upright: 'sweep', between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
    for (const p of m) { const i = Math.round(p.y) * w + Math.round(p.x); if (i >= 0 && i < n) for (let j = 0; j < K; j++) expected[i * K + j] += owe[j] * 0.5; }
    laid++; lens.push(m.length);
    if (paths.length > shots && (q + 1) % Math.ceil(paths.length / shots) === 0) { setStage({ stage: 'paint', step: 'dry-brush drags', pigment: 'dry brush', laying: true }); await shoot(); }
  }
  clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  used['dry-brush drags'] = laid;
  lens.sort((a, b) => a - b);
  const q = f => (lens.length ? (lens[Math.floor(f * (lens.length - 1))] / (w / 1086)).toFixed(0) : '-');
  log(`drags: ${laid} of ${paths.length} laid over ${(100 * R.cells / n).toFixed(1)}% of the sheet, ${(2 * rW / SC / (w / 1086)).toFixed(0)} px wide, length p50 ${q(0.5)} p90 ${q(0.9)} px at 1086, washes thinned by ${(100 * R.share).toFixed(0)}% there`);
  setStage({ stage: 'paint', step: 'dry-brush drags', pigment: 'dry brush' });
  await shoot();
}
