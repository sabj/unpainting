// For a far treeline and the shore under it: separate wet-on-dry dabs of a round brush, each a lump of foliage with its
// own top, so the tree-sky line is what the touches leave, never the mask's straight edge. Then a darker, drier base
// band, a pale soft strip of far shore, and two or three tiny upright darks on it for buildings.
// Flags (all read off ctx.num, all prefixed trees):
//   --treesdabs 0        how many dabs; 0 takes it from the span and the brush, between 8 and 15
//   --treesrad 0.2       the round brush's radius as a share of the region's height
//   --treesquant 0.85    the dabs' puddle is this quantile of what the region still wants (the deep end, as shapes do)
//   --treesload 0.9      lay this share of it
//   --treesragged 0.5    how far a dab's centre wanders off the top edge, in radii
//   --treestall 0.35     this share of the dabs are crowns that ride higher than their neighbours
//   --treeslow 0.18      this share sit low, so the sky comes down between two clumps
//   --treeswater 0.62    the dabs' water: wet on dry, drier than a wash
//   --treesbridge 0.78   how far the dab's liquid reaches into the tooth; low leaves grit instead of a lump
//   --treesbreakup 1.25  how fast a hair's film breaks as it empties
//   --treesbase 1.35     the base pass is charged this much heavier than the dabs
//   --treesbaseh 0.32    the base band is this share of each column's run of trees
//   --treesbasewater 0.4 less water at the base, so the tooth shows
//   --treesshore 0.45    the far shore strip lays this share of the plan's own colour there
//   --treesshoreh 2      the strip is this many cells deep
//   --treesposts 3       tiny uprights on the strip
//   --treescal 1.08      wet on dry delivers 0.92 of its charge on this paper
export const when = 'shapes';

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, A, K, expected, used, O, SEED,
    seg, subject, thickness, createBrush, dip, stroke, step, dry, sweepCover,
    clock, snap, stage, num, log,
  } = ctx;

  const region = seg && seg.regions && seg.regions.find(r => r.name === 'trees');
  if (!region || !region.area) { log('trees: no trees segment on this sheet'); return; }

  // the figure stands in front of the treeline; the trees behind it were painted before it and are not this passage's
  const M = new Uint8Array(n);
  let cells = 0;
  for (let i = 0; i < n; i++) if (region.mask[i] && !(subject && subject[i] > 0.5)) { M[i] = 1; cells++; }
  if (cells < 40) { log(`trees: only ${cells} cells of treeline are clear of the figure`); return; }

  // what the sheet still wants, read at the plan's grid the way the mop and the shape stage read it, so the passage is
  // charged for what the washes left rather than for the whole plan
  const onSheet = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    return on;
  };
  const residualOf = on => (i, j) => Math.max(0, A[i * K + j] - on[i * K + j]);
  const planAt = (i, j) => A[i * K + j];

  // one puddle for a pass: every pigment at the same quantile of what the cells under it want. Independent per pigment
  // is how the mop mixes its puddles; the olive is whatever the earth and the dark come to at that quantile.
  const puddle = (pick, q, load, from) => {
    const mix = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      const v = [];
      for (let i = 0; i < n; i++) if (pick[i]) v.push(from(i, j));
      if (!v.length) continue;
      v.sort((a, b) => a - b);
      mix[j] = (v[Math.floor(Math.min(0.99, Math.max(0.01, q)) * (v.length - 1))] || 0) * load;
    }
    return mix;
  };

  // the silhouette, read at the brush's scale
  const top = new Int32Array(w).fill(-1), bot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (M[y * w + x]) { if (top[x] < 0) top[x] = y; bot[x] = y; }
  let xa = -1, xb = -1, ymin = h, ymax = -1;
  for (let x = 0; x < w; x++) if (top[x] >= 0) {
    if (xa < 0) xa = x; xb = x;
    if (top[x] < ymin) ymin = top[x];
    if (bot[x] > ymax) ymax = bot[x];
  }
  // the band's depth where the brush stands, not the bounding box of the whole region: a treeline can thin from deep
  // crowns to a few cells, and a brush sized off the box lays dabs too deep at the thin end and leaves paper below.
  const run = new Int32Array(w);
  for (let x = 0; x < w; x++) run[x] = top[x] < 0 ? -1 : bot[x] - top[x] + 1;
  // the depth under the deep end rather than the median of every column: the brush that paints the crowns is the one
  // a painter picks up, and the thin left end is painted with the tip of it, not with a smaller brush
  const runsSorted = Array.from(run).filter(v => v > 0).sort((a, b) => a - b);
  const bandH = Math.max(3, runsSorted[Math.floor(num('treesdepth', 0.85) * (runsSorted.length - 1))] || (ymax - ymin + 1));
  const RAD = Math.max(2 * SC, Math.round(num('treesrad', 0.2) * bandH * SC));

  // a hand sees the top of a treeline at the brush's width, not cell by cell: the labeller's stepped boundary is
  // averaged over a brush before any dab is placed against it
  const smoothRow = src => {
    const out = new Float32Array(w).fill(-1), win = Math.max(1, Math.round(RAD / SC));
    for (let x = 0; x < w; x++) {
      if (src[x] < 0) continue;
      let s = 0, c = 0;
      for (let d = -win; d <= win; d++) { const q = x + d; if (q >= 0 && q < w && src[q] >= 0) { s += src[q]; c++; } }
      out[x] = c ? s / c : src[x];
    }
    return out;
  };
  const topS = smoothRow(top), botS = smoothRow(bot), runS = smoothRow(run);

  let s = ((SEED + 4409) | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const clampX = x => Math.max(0, Math.min(W2 - 1, x));
  const clampY = y => Math.max(0, Math.min(H2 - 1, y));

  // what a pass actually covered, so it is booked where the paint went and not over the whole mask: a passage of
  // separate touches leaves paper between them, and booking the mask would charge the plan for paper
  const bookFoot = (paths, mix) => {
    const foot = new Uint8Array(n);
    for (const pts of paths) for (const p of pts) {
      const r = Math.ceil(p.r);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const X = Math.round(p.x) + dx, Y = Math.round(p.y) + dy;
        if (X < 0 || Y < 0 || X >= W2 || Y >= H2) continue;
        foot[((Y / SC) | 0) * w + ((X / SC) | 0)] = 1;
      }
    }
    let c = 0;
    for (let i = 0; i < n; i++) if (foot[i]) { c++; for (let j = 0; j < K; j++) expected[i * K + j] += mix[j]; }
    return c;
  };

  const upMask = (() => {
    if (SC === 1) return M;
    const m = new Uint8Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = M[((y / SC) | 0) * w + ((x / SC) | 0)];
    return m;
  })();

  const strength = num('strength', 2.2) * num('treescal', 1.08);
  const settle = () => clock('flow', () => { for (let q = 0; q < num('settle', 60); q++) step(sheet, O); });
  const dryOff = () => clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));

  // 1. The mass, dab by dab.
  const dabMix = puddle(M, num('treesquant', 0.85), num('treesload', 0.9), residualOf(onSheet()));
  if (dabMix.reduce((a, b) => a + b, 0) < 0.05) { log('trees: the washes already carry the treeline'); return; }

  const span = Math.max(1, xb - xa);
  const wantDabs = Math.round(num('treesdabs', 0));
  const N = wantDabs > 0 ? wantDabs : Math.max(8, Math.min(15, Math.round(span * SC / (1.45 * RAD))));
  const dabPaths = [], dabPlan = [];
  for (let k = 0; k < N; k++) {
    // the touches are spaced along the span and then nudged, so they are not a row of beads on a wire
    const u = (k + 0.5 + (rnd() - 0.5) * 0.6) / N;
    const xi = Math.max(xa, Math.min(xb, Math.round(xa + u * span)));
    if (topS[xi] < 0) continue;
    const tall = rnd() < num('treestall', 0.35);
    const low = !tall && rnd() < num('treeslow', 0.18);
    const deep = Math.max(1, (runS[xi] > 0 ? runS[xi] : bandH) * SC);
    // a fifth of the depth under this dab, held within reach of the one brush the passage carries
    const rLocal = Math.min(RAD * 1.5, Math.max(RAD * 0.75, num('treesrad', 0.2) * deep));
    const r = Math.max(1.5, rLocal * (tall ? 1.05 + 0.25 * rnd() : low ? 0.55 + 0.25 * rnd() : 0.78 + 0.3 * rnd()));
    // the centre sits about a radius below the edge, then wanders: a crown pokes above it, a low clump leaves sky
    const off = (tall ? -0.40 : low ? 0.70 : 0.05) + (rnd() - 0.5) * 2 * num('treesragged', 0.5);
    const cy = topS[xi] * SC + r * (1 + off);
    // A dab is a rounded lump, and the brush does not stamp one: `stroke` lays a strip across its travel at every step,
    // so a short straight path sweeps a rectangle. A round brush pulled a brush-width lands on its point, presses
    // through the belly and lifts off the point again, so the width along the mark runs 0.3 of the brush to full and back.
    const ang = (rnd() - 0.5) * num('treestilt', 0.7);
    const len = r * (1.0 + 1.3 * rnd());
    const steps = Math.max(4, Math.round(len / Math.max(0.8, r * 0.28)));
    const pts = [];
    for (let t = 0; t <= steps; t++) {
      const f = t / steps, d = (f - 0.5) * len, belly = Math.sin(Math.PI * f);
      pts.push({
        x: clampX(xi * SC + Math.cos(ang) * d + (rnd() - 0.5) * r * 0.16),
        y: clampY(cy + Math.sin(ang) * d + (rnd() - 0.5) * r * 0.2),
        r: Math.max(1, r * (0.30 + 0.74 * belly + (rnd() - 0.5) * 0.1)),
        p: Math.max(0.5, Math.min(1, 0.6 + 0.4 * belly)),
      });
    }
    // under a deep crown the touch is not enough: the hand pulls the same loaded brush down into the mass before it
    // lifts, which is the move that gives a clump body instead of a lid
    const reach = topS[xi] * SC + deep * num('treescrown', 0.55);
    if (reach > cy + r * 1.1) {
      const last = pts[pts.length - 1], drop = reach - cy;
      for (let t = 1; t <= 2; t++) {
        const f = t / 2;
        pts.push({
          x: clampX(last.x + (rnd() - 0.5) * r * 0.5),
          y: clampY(cy + drop * f),
          r: Math.max(1.2, r * (0.9 - 0.25 * f)),
          p: Math.max(0.4, 0.85 - 0.3 * f),
        });
      }
    }
    dabPaths.push(pts);
    dabPlan.push({ r, tall, low });
  }

  const cover = Math.max(1, Math.min(2.5, sweepCover(dabPaths, upMask, W2, H2)));
  const every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, dabPaths.length))));
  const charge = dabMix.map(v => v * strength / cover);
  log(`trees: ${dabPaths.length} dabs of a round brush of radius ${RAD} over a band ${bandH} cells deep, puddle [${dabMix.map(v => v.toFixed(2)).join(' ')}], cover ${cover.toFixed(2)}`);
  dabPaths.forEach((pts, k) => {
    const r = dabPlan[k].r;
    const brush = createBrush({
      radius: Math.max(2, Math.round(r)), bristles: Math.max(8, Math.ceil(r * 2)), capacity: 60, belly: 6,
      // a loaded round brush laying a dab of foliage puts down a film, not a scatter: a higher breakup or a lower bridge
      // leaves grit in the tooth instead of lumps of colour with an edge
      feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 6, breakup: num('treesbreakup', 1.25),
      wetMix: 0.45, bridge: num('treesbridge', 0.78), bridgeSoft: 1.8, grainShift: num('treesgrain', 1), seed: 61 + k + SEED,
    });
    // a painter recharges between touches and never gets the same load twice: the mass comes out uneven, which is what
    // keeps it from reading as a slab
    dip(brush, { water: num('treeswater', 0.62), conc: charge.map(v => v * (0.80 + 0.42 * rnd())) });
    clock('strokes', () => stroke(brush, sheet, pts, {
      upright: false, flowEvery: every,
      between: q => { if (q % every === 0) clock('flow', () => step(sheet, O)); },
    }));
  });
  used['tree dab'] = (used['tree dab'] || 0) + dabPaths.length;
  bookFoot(dabPaths, dabMix);
  settle();
  stage({ step: 'the treeline, dab by dab', pass: 1, dabs: dabPaths.length, brush: RAD });
  snap();
  dryOff();

  // 2. The darker base where the trees meet the ground.
  const BASE = new Uint8Array(n);
  let baseCells = 0;
  for (let x = xa; x <= xb; x++) {
    if (top[x] < 0) continue;
    const run = bot[x] - top[x] + 1, deep = Math.max(1, Math.round(run * num('treesbaseh', 0.32)));
    for (let y = bot[x] - deep + 1; y <= bot[x]; y++) if (y >= 0 && M[y * w + x]) { BASE[y * w + x] = 1; baseCells++; }
  }
  if (baseCells > 12) {
    // read the sheet again: the dabs are down, and the base is darker than what they left, not darker than the plan
    const baseMix = puddle(BASE, num('treesbasequant', 0.9), num('treesload', 0.9) * num('treesbase', 1.35), residualOf(onSheet()));
    const basePaths = [];
    const bn = Math.max(4, Math.min(10, Math.round(span * SC / (2.2 * RAD))));
    const br = Math.max(1.4, RAD * num('treesbaserad', 0.6));
    for (let k = 0; k < bn; k++) {
      const u0 = (k + 0.08 + 0.32 * rnd()) / bn, u1 = (k + 0.62 + 0.34 * rnd()) / bn;
      const pts = [];
      const steps = Math.max(3, Math.round((u1 - u0) * span * SC / Math.max(1, br * 0.8)));
      for (let t = 0; t <= steps; t++) {
        const f = t / steps, xf = xa + (u0 + (u1 - u0) * f) * span;
        const xi = Math.max(xa, Math.min(xb, Math.round(xf)));
        if (botS[xi] < 0) continue;
        pts.push({
          x: clampX(xf * SC),
          y: clampY(botS[xi] * SC - br * (0.35 + 0.5 * Math.sin(Math.PI * f)) + (rnd() - 0.5) * br * 0.5),
          r: Math.max(1.2, br * (0.72 + 0.4 * Math.sin(Math.PI * f))),
          p: Math.max(0.42, Math.min(1, 0.62 + 0.36 * Math.sin(Math.PI * f))),
        });
      }
      if (pts.length >= 2) basePaths.push(pts);
    }
    if (basePaths.length && baseMix.reduce((a, b) => a + b, 0) > 0.03) {
      const bcover = Math.max(1, Math.min(2.5, sweepCover(basePaths, upMask, W2, H2)));
      const bevery = Math.max(24, Math.round(24 * Math.sqrt(basePaths.length)));
      log(`trees: ${basePaths.length} darker pulls along the base, puddle [${baseMix.map(v => v.toFixed(2)).join(' ')}]`);
      basePaths.forEach((pts, k) => {
        const brush = createBrush({
          radius: Math.max(2, Math.round(br)), bristles: Math.max(8, Math.ceil(br * 2.4)), capacity: 50, belly: 5,
          feed: 0.22, give: 0.85, free: 0.45, film: 0.25, splay: 0.06, stiffness: 5, breakup: 2.1, streak: 0.5,
          wetMix: 0.35, bridge: num('treesbasebridge', 0.42), bridgeSoft: 1.2, grainShift: num('treesgrain', 2), seed: 131 + k + SEED,
        });
        // less water than the dabs: the brush skips the tooth along the base instead of flooding it, which is how the
        // dark under a treeline is put in
        dip(brush, { water: num('treesbasewater', 0.4), conc: baseMix.map(v => v * strength / bcover * (0.85 + 0.3 * rnd())) });
        clock('strokes', () => stroke(brush, sheet, pts, {
          upright: false, flowEvery: bevery,
          between: q => { if (q % bevery === 0) clock('flow', () => step(sheet, O)); },
        }));
      });
      used['tree base pull'] = (used['tree base pull'] || 0) + basePaths.length;
      bookFoot(basePaths, baseMix);
      settle();
      stage({ step: 'darker where the trees meet the shore', pass: 2, pulls: basePaths.length, brush: Math.round(br) });
      snap();
      dryOff();
    }
  }

  // 3. The pale strip of far shore.
  const SHORE = new Uint8Array(n);
  const deep = Math.max(1, Math.round(num('treesshoreh', 2)));
  let shoreCells = 0;
  for (let x = xa; x <= xb; x++) {
    if (bot[x] < 0) continue;
    for (let d = 1; d <= deep; d++) {
      const y = bot[x] + d;
      if (y >= h) break;
      if (subject && subject[y * w + x] > 0.5) break;
      if (M[y * w + x]) continue;
      SHORE[y * w + x] = 1; shoreCells++;
    }
  }
  const posts = [];
  if (shoreCells > 8) {
    // the strip's colour is the plan's own there and not the residual: the sea wash has already tinted this band, and
    // the strip is a mark a painter makes over it, pale and grey-violet, rather than a hole being filled in
    const shoreMix = puddle(SHORE, num('treesshorequant', 0.6), num('treesshore', 0.45), planAt);
    const sr = Math.max(1.1, num('treesshorerad', 1.5) * SC);
    const pts = [];
    const steps = Math.max(6, Math.round(span * SC / Math.max(1, sr * 1.1)));
    for (let t = 0; t <= steps; t++) {
      const f = t / steps, xf = xa + f * span;
      const xi = Math.max(xa, Math.min(xb, Math.round(xf)));
      if (botS[xi] < 0) continue;
      // a hand's line is never level and never even: two slow waves in the height, three in the pressure, so the
      // strip fades out in two places instead of ruling a horizon across the sheet
      const wob = Math.sin(f * 5.1 + 0.7) * 0.55 + Math.sin(f * 11.3 + 2.1) * 0.3;
      const press = 0.52 + 0.34 * Math.sin(f * 7.4 + 1.3) + 0.14 * Math.sin(f * 17.0);
      pts.push({
        x: clampX(xf * SC),
        y: clampY(botS[xi] * SC + sr * (0.9 + 0.25 * wob)),
        r: Math.max(1, sr * (0.8 + 0.3 * Math.sin(f * 9.2))),
        p: Math.max(0.24, Math.min(1, press)),
      });
    }
    if (pts.length >= 3 && shoreMix.reduce((a, b) => a + b, 0) > 0.02) {
      const brush = createBrush({
        radius: Math.max(1, Math.round(sr)), bristles: Math.max(8, Math.ceil(sr * 3)), capacity: 40, belly: 5,
        feed: 0.3, give: 0.9, free: 0.4, film: 0.25, splay: 0.05, stiffness: 4, breakup: 1.4,
        // a wet brush and a high bridge: the strip wets its own edge and the sea below takes it, so the join is soft
        wetMix: 0.7, bridge: num('treesshorebridge', 0.85), bridgeSoft: 2.6, seed: 211 + SEED,
      });
      dip(brush, { water: num('treesshorewater', 0.8), conc: shoreMix.map(v => v * strength) });
      clock('strokes', () => stroke(brush, sheet, pts, {
        upright: false, lift: false, flowEvery: 24,
        between: q => { if (q % 24 === 0) clock('flow', () => step(sheet, O)); },
      }));
      log(`trees: the far shore in one stroke of ${pts.length} points, puddle [${shoreMix.map(v => v.toFixed(2)).join(' ')}]`);
      used['far shore'] = (used['far shore'] || 0) + 1;
      bookFoot([pts], shoreMix);

      // two or three uprights on it: the buildings under the trees, each one touch of the point of the same brush
      const want = Math.max(0, Math.round(num('treesposts', 3)));
      const dark = puddle(BASE.some(v => v) ? BASE : M, 0.95, num('treesload', 0.9), planAt);
      for (let k = 0; k < want; k++) {
        const u = (k + 0.35 + 0.3 * rnd()) / Math.max(1, want);
        const xi = Math.max(xa, Math.min(xb, Math.round(xa + u * span)));
        if (botS[xi] < 0) continue;
        const ph = Math.max(2, num('treesposth', 3.2) * SC * (0.7 + 0.6 * rnd()));
        const y0 = botS[xi] * SC + sr * 0.9;
        const pr = Math.max(0.9, num('treespostrad', 1.0) * SC * (0.8 + 0.4 * rnd()));
        const line = [];
        for (let t = 0; t <= 3; t++) {
          const f = t / 3;
          line.push({ x: clampX(xi * SC + (rnd() - 0.5) * 0.6), y: clampY(y0 - ph * (1 - f)), r: pr, p: 0.9 - 0.2 * f });
        }
        posts.push(line);
      }
      posts.forEach((line, k) => {
        const brush2 = createBrush({
          radius: Math.max(1, Math.round(line[0].r)), bristles: 8, capacity: 30, belly: 4,
          feed: 0.3, give: 0.85, free: 0.4, film: 0.25, splay: 0.02, stiffness: 5, breakup: 1.2,
          wetMix: 0.3, bridge: 0.5, bridgeSoft: 1.2, seed: 307 + k + SEED,
        });
        dip(brush2, { water: num('treespostwater', 0.4), conc: dark.map(v => v * strength * num('treespostload', 1.1)) });
        clock('strokes', () => stroke(brush2, sheet, line, { upright: false }));
      });
      if (posts.length) { used['shore upright'] = (used['shore upright'] || 0) + posts.length; bookFoot(posts, dark); }
      settle();
      stage({ step: 'the far shore and its uprights', pass: 3, uprights: posts.length });
      snap();
    }
  }
}
