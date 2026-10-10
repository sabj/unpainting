// --shapes: the darks as shapes. Each dark region of the plan is laid once before the ladder, one colour, wet on dry,
// with a round brush held inside the shape, so it keeps a crisp edge instead of the mud of many stacked glazes.
// The ladder then skips what it holds. Cells a passage owns (passages.mjs) are never a shape.
//   --shapes N        at most N dark shapes (0: off)
//   --shapedeep 0.9   a cell belongs to a dark shape over this many OD of everything
//   --shapemin 0.004  a shape covers at least this share of the sheet
//   --shapeload 0.9   lay this share of the dark end (the --shapequant quantile) of the residual
//   --shapewater 0.5  the brush's water: drier than a wash, so the tooth shows at the edge
import { thickness, step, dry } from '../../media/sheet.mjs';
import { createBrush, stroke } from '../../media/brush.mjs';
import { components, distanceToZero } from '../../raster.js';
import { brushedWashPaths, containPaths, sweepCover } from '../../media/wash.mjs';

// Lays up to ctx.shapes dark shapes on ctx.sheet, books them into ctx.expected and ctx.used, films each one through
// ctx.shoot, and returns how many strokes it laid, which the caller adds to its own count.
export async function paintShapes(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, PIGS, A, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, owned: PASSAGE_OWNED,
    shapes: SHAPES, flowEvery, dip, up, clock, shoot, setStage, num, log,
  } = ctx;
  let laid = 0;
  const K = PIGS.length;
  const th = thickness(sheet), on = new Float32Array(n * K);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x; for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC); }
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; if (s >= num('shapedeep', 0.9) && !PASSAGE_OWNED[i]) dark[i] = 1; }
  const { labels, areas, count } = components(dark, w, h);
  const order = []; for (let id = 1; id <= count; id++) if (areas[id] >= num('shapemin', 0.004) * n) order.push(id);
  order.sort((a, b) => areas[b] - areas[a]);
  const T = { name: 'wet on dry', water: num('shapewater', 0.5), wetMix: 0.45, bridge: num('shapebridge', 0.6), bridgeSoft: 1.6, intoWet: false, passes: 1 };
  let k = 0;
  for (const id of order.slice(0, SHAPES)) {
    const MASK = new Uint8Array(n); for (let i = 0; i < n; i++) if (labels[i] === id) MASK[i] = 1;
    const q = Math.min(0.98, Math.max(0.5, num('shapequant', 0.85))), mix = new Array(K).fill(0);
    for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (MASK[i]) v.push(Math.max(0, A[i * K + j] - on[i * K + j])); v.sort((a, b) => a - b); mix[j] = (v[Math.floor(q * (v.length - 1))] ?? 0) * num('shapeload', 0.9); }
    if (mix.reduce((a, b) => a + b, 0) < 0.2) continue;
    const M2 = up(MASK), dist = distanceToZero(M2, W2, H2);
    let rIn = 0; for (let i = 0; i < N2; i++) if (dist[i] > rIn) rIn = dist[i];
    const RAD = Math.max(2 * SC, Math.min(Math.round(1.5 * BRUSH), Math.round(num('shaperadius', 0.5) * rIn)));
    let paths = brushedWashPaths(M2, W2, H2, { pad: 0.5 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: RAD, seed: 41 + k + SEED, overlap: num('shapeoverlap', 0.3) });
    paths = containPaths(paths, dist, W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: 0.3 * SC });
    if (!paths.length) continue;
    const cover = Math.max(1, sweepCover(paths, M2, W2, H2)), every = flowEvery(paths.length);
    log(`shape ${k + 1}: ${(100 * areas[id] / n).toFixed(1)}% of the sheet, ${paths.length} strokes, brush up to ${RAD}, puddle [${mix.map(v => v.toFixed(2)).join(' ')}], cover ${cover.toFixed(2)}`);
    for (const pts of paths) {
      const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
      const brush = createBrush({ radius: r, bristles: Math.max(8, Math.ceil(r * 2)), capacity: 60, belly: 6, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.04, stiffness: 6, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: 43 + k + SEED });
      dip(brush, { water: WET(T), conc: mix.map(v => v * num('strength', 2.2) * (CAL[T.name] ?? 1) / cover) });
      clock('strokes', () => stroke(brush, sheet, pts, { upright: UPRIGHT, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, O)); } }));
      laid++;
    }
    for (let i = 0; i < n; i++) if (MASK[i]) for (let j = 0; j < K; j++) expected[i * K + j] += mix[j];
    used['shape stroke'] = (used['shape stroke'] || 0) + paths.length;
    k++;
    setStage({ stage: 'shape', step: `dark mass ${k}`, pass: k, area: +(areas[id] / n).toFixed(3), brush: RAD });
    clock('flow', () => { for (let q2 = 0; q2 < num('settle', 60); q2++) step(sheet, O); });
    await shoot();
  }
  if (k) clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  return laid;
}
