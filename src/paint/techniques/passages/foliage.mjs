// For hillsides of bushes and trees (--passages foliage): light to dark and broken, not glazed. A light ground wash,
// then mid-value clump touches with paper between them, then smaller darks, then optional dry scumbles across the
// slope. Each touch is a ragged lump charged with what the cells under it still want.
//   --foliagebox 0,0,1,1   where the hill is, as fractions of the sheet (x0,y0,x1,y1)
//   --foliagemind 0.08     cells paler than this density are paper, not hill
//   --foliageground 0.3    the ground wash's puddle: this quantile of what the region still wants
//   --foliagegroundload 0.8, --foliagegroundwater 0.72
//   --foliagemm 1.6        a clump touch's radius in mm (it varies 0.55 to 1.5 times this)
//   --foliagecover 0.75    clumps aim to cover this share of the region (the rest is the ground showing)
//   --foliagewater 0.52    a clump's water: wet on dry, wet enough to merge with a neighbour still wet
//   --foliagebridge 0.66   how far the clump's liquid reaches into the tooth (lower leaves sparkle)
//   --foliagedarkmm 0.9, --foliagedarkcover 0.3, --foliagedarkq 0.7, --foliagedarkwater 0.42
//   --foliagescumble 6     dry dragged strokes for grit; 0 = none
//   --foliagecal 1.08      charge calibration: wet on dry delivers 0.92 of its charge
import { smoothUp } from '../../methods/smoothup.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SHEET_MM } from '../../../media/sheet-size.mjs';
export const when = 'washes';
export const dryAfter = true;   // under --passexact, dry the sheet after this passage (passages.mjs)

// The region: a segment named "foliage" if the sheet has one, else --foliagefrom (ground) less the figure, near-paper
// cells and clear sky-blue, inside --foliagebox. Its cells are owned: with --ladderkeepout 1 the ladder keeps off them.
export async function region(ctx) {
  const { w, h, n, seg, px, fwSubject, subject, opt, num } = ctx;
  const own = seg && seg.regions && seg.regions.find(r => r.name === 'foliage' && r.area > 0);
  if (own) return Uint8Array.from(own.mask);
  const from = seg && seg.regions && seg.regions.find(r => r.name === opt('foliagefrom', 'ground'));
  const [bx0, by0, bx1, by1] = String(opt('foliagebox', '0,0,1,1')).split(',').map(Number);
  const fig = fwSubject || subject, minD = num('foliagemind', 0.08), M = new Uint8Array(n), holes = new Uint8Array(n), holeY = num('foliageholey', 0);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue;
    if (from && !from.mask[i]) continue;
    if (fig && fig[i] > 0.5) continue;
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], Y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (-Math.log(Math.max(0.02, Y)) < minD || (b - r > 25 && Y > 0.6) || (holeY > 0 && Y > holeY)) { holes[i] = 1; continue; }
    // --foliagetrees 1: own only tree cells, olive or green (g within --foliagewarm of r) or dark (under --foliagedarky).
    // Light warm fields and light cool far hills are left to the ladder's flat washes.
    if (num('foliagetrees', 0) > 0 && Y >= num('foliagedarky', 0.35) && ((r - g > num('foliagewarm', 8) && Y > num('foliagefieldy', 0.45)) || (b - r > 10 && Y > 0.45))) continue;
    // --foliagetrees 2: a tree cell must also be green or olive in hue (g at least r less --foliagewarm and above b), or
    // dark and not red (r - g under 20), so dark warm walls are not taken for trees.
    if (num('foliagetrees', 0) >= 2 && !((g >= r - num('foliagewarm', 8) && g > b + 4) || (g > r && b - g < 15) || (Y < 0.25 && r - g < 20))) continue;
    M[i] = 1;
  }
  // under --foliagetrees, a majority filter so fields come out as bands and trees as clumps, not salt and pepper
  if (num('foliagetrees', 0) > 0) {
    const R = Math.max(1, Math.round(num('foliagetreesmooth', 1))), T = Uint8Array.from(M);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (holes[i]) continue;
      let c = 0, t = 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; c++; t += T[Y * w + X]; }
      M[i] = t * 2 > c ? (T[i] || (x >= bx0 * w && x <= bx1 * w && y >= by0 * h && y <= by1 * h && !(fig && fig[i] > 0.5)) ? 1 : 0) : 0;
    }
  }
  M.holes = holes;
  // --foliagefieldcut d: light warm field cells (blurred by --foliagefieldsq cells, density under d, red over green by
  // --foliagefieldrg) leave the tree region, so no tier, fill or first wash covers them. M.field keeps them for the
  // washes; pieces under --foliagefieldmin cells are dropped.
  if (num('foliagefieldcut', 0) > 0 && ctx.gaussian) {
    const sq = num('foliagefieldsq', 1.5), dn = Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, (0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2]) / 255)));
    // --foliagefieldrb d: a field cell must also be red over blue by d or more, so grey and cool shade is not counted (0: off)
    const frb = num('foliagefieldrb', 0) > 0 ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => px[i * 3] - px[i * 3 + 2]), w, h, sq) : null;
    const fd = ctx.gaussian(dn, w, h, sq), frg =ctx.gaussian(Float32Array.from({ length: n }, (_, i) => px[i * 3] - px[i * 3 + 1]), w, h, sq);
    let F = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0; if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h || holes[i] || (fig && fig[i] > 0.5)) continue;
      if (fd[i] < num('foliagefieldcut', 0) && fd[i] >= minD && frg[i] >= num('foliagefieldrg', 8) && (!frb || frb[i] >= num('foliagefieldrb', 0))) F[i] = 1;
    }
    if (ctx.removeSmall) F = ctx.removeSmall(F, w, h, Math.round(num('foliagefieldmin', 12)));
    // --foliagefieldthin r: only strips under 2r plan cells wide stay field; wider pale areas go back to the trees (0: off)
    if (num('foliagefieldthin', 0) >= 1 && ctx.erode && ctx.dilate) {
      const r = Math.round(num('foliagefieldthin', 0)), core = ctx.dilate(ctx.erode(F, w, h, r), w, h, r);
      F = Uint8Array.from(F, (v, i) => (v && !core[i] ? 1 : 0));
      if (ctx.removeSmall) F = ctx.removeSmall(F, w, h, Math.round(num('foliagefieldmin', 12)));
    }
    // --foliagefieldown 1: field cells stay owned (the ladder keeps off them) but are not trees: M.field marks them and the
    // tier masks leave them out. Without it they leave the region.
    const own = num('foliagefieldown', 0) > 0; let fc = 0; for (let i = 0; i < n; i++) if (F[i]) { M[i] = own ? 1 : 0; fc++; }
    M.field = F; M.fieldOwned = own; if (ctx.log) ctx.log(`foliage region: ${fc} light warm field cells ${own ? 'owned by the passage, not trees' : 'taken out of the trees'}`);
  }
  if (opt('foliagedumpmask', '')) { try { const sh = (await import('sharp')).default; const o = Buffer.alloc(n * 3); for (let i = 0; i < n; i++) { const v = M[i] ? 0 : holes[i] ? 255 : 200; o[i * 3] = v; o[i * 3 + 1] = M[i] ? 120 : v; o[i * 3 + 2] = v; } await sh(o, { raw: { width: w, height: h, channels: 3 } }).resize(w * 3, h * 3, { kernel: 'nearest' }).png().toFile(opt('foliagedumpmask', '')); } catch (e) { /* debug only */ } }
  // --foliagefeather f: the box's edges are not straight lines. Within f of the sheet's width of a box edge cells are
  // dropped by a smooth noise, more of them the nearer the edge, so the hill ends in a ragged edge, not a seam.
  const fe = num('foliagefeather', 0) * w;
  if (fe > 0 && ctx.gaussian) {
    let s = 4242; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const z = ctx.gaussian(Float32Array.from({ length: n }, () => rnd() - 0.5), w, h, Math.max(1.5, fe / 8));
    let m0 = 0, v0 = 0; for (let i = 0; i < n; i++) m0 += z[i]; m0 /= n; for (let i = 0; i < n; i++) v0 += (z[i] - m0) ** 2; const sd = Math.sqrt(v0 / n) || 1;
    for (let i = 0; i < n; i++) if (M[i]) {
      const x = i % w, y = (i / w) | 0;
      const d = Math.min(bx0 > 0 ? x - bx0 * w : 1e9, bx1 < 1 ? bx1 * w - x : 1e9, by0 > 0 ? y - by0 * h : 1e9, by1 < 1 ? by1 * h - y : 1e9);
      const ramp = Math.max(0, Math.min(1, d / fe));
      if (ramp + 0.3 * (z[i] - m0) / sd < 0.5) M[i] = 0;
    }
  }
  return M;
}

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, A, K, expected, used, O, SEED,
    thickness, createBrush, dip, stroke, step, dry, sweepCover, washPaths,
    clock, snap, stage, num, opt, log, region: M,
  } = ctx;
  let cells = 0; if (M) for (let i = 0; i < n; i++) cells += M[i];
  if (!M || cells < 60) { log(`foliage: only ${cells} cells of hillside`); return; }

  // --foliageholes 1: the sky holes and light flecks inside and at the edge of the hill are sealed (masking fluid, as a
  // painter reserves them) for the whole passage and lifted at its end, so no wash covers them. Only cells within
  // --foliageholereach cells of the hill; not when the plate already holds masking fluid. Needs the dry sheet.
  let sealed = false, fieldSealed = false, restoreSeal = () => {};
  const HOLES = M.holes;
  if (num('foliageholes', 0) > 0 && HOLES && !sheet.resist) {
    const near = ctx.dilate(M, w, h, Math.round(num('foliageholereach', 4)));
    const seal = new Uint8Array(W2 * H2); let c = 0;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0); if (HOLES[i] && near[i]) { seal[y * W2 + x] = 1; c++; } }
    // --foliagesmooth s: cut the seal's edges smooth at the sheet's grid (smoothUp, blur in plan cells); needs --scale 2
    // or more to show (0: off)
    if (num('foliagesmooth', 0) > 0 && SC > 1) { c = 0; const hm = Uint8Array.from(HOLES, (v, i) => (v && near[i] ? 1 : 0)), sm = smoothUp(hm, w, h, SC, num('foliagesmooth', 0), ctx.gaussian); for (let i = 0; i < sm.length; i++) { seal[i] = sm[i]; c += sm[i]; } }
    if (c) { clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) })); ctx.applyResist(sheet, seal); sealed = true; log(`foliage: ${c} sheet cells of sky holes and flecks sealed`); }
  }
  // what the sheet still wants, read at the plan's grid (as the trees passage reads it)
  const onSheet = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    return on;
  };
  // --foliageplanscale s: the passage aims at s times the plan's pigment (default 1); the ladder after it darkens further
  const PS = num('foliageplanscale', 1);
  const residual = on => { const R = new Float32Array(n * K); for (let i = 0; i < n; i++) if (M[i]) for (let j = 0; j < K; j++) R[i * K + j] = Math.max(0, A[i * K + j] * PS - on[i * K + j]); return R; };
  const total = R => { const T = new Float32Array(n); for (let i = 0; i < n; i++) if (M[i]) { let s = 0; for (let j = 0; j < K; j++) s += R[i * K + j]; T[i] = s; } return T; };
  const quantileMix = (R, pick, q, load) => {
    const mix = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      const v = []; for (let i = 0; i < n; i++) if (pick[i]) v.push(R[i * K + j]);
      if (!v.length) continue; v.sort((a, b) => a - b);
      mix[j] = (v[Math.floor(Math.min(0.99, Math.max(0.01, q)) * (v.length - 1))] || 0) * load;
    }
    return mix;
  };

  let s = ((SEED + 7919) | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const clampX = x => Math.max(0, Math.min(W2 - 1, x)), clampY = y => Math.max(0, Math.min(H2 - 1, y));
  const upMask = SC === 1 ? M : (() => { const m = new Uint8Array(W2 * H2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = M[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; })();
  // the tree cells: the region less the field cells it owns under --foliagefieldown (the tier masks cut from these)
  // --foliagefieldmargin m: the tier masks also keep m cells off the field cells, so dark clumps do not overlap their edges
  const fieldKeep = (M.field && M.fieldOwned && num('foliagefieldmargin', 0) >= 1 && ctx.dilate) ? ctx.dilate(M.field, w, h, Math.round(num('foliagefieldmargin', 0))) : M.field;
  const upTree = (M.field && M.fieldOwned) ? Uint8Array.from(upMask, (v, i) => (v && !fieldKeep[((((i / W2) | 0) / SC) | 0) * w + (((i % W2) / SC) | 0)] ? 1 : 0)) : upMask;
  const bookFoot = (paths, mixes) => {
    paths.forEach((pts, k) => {
      const mix = mixes[k] || mixes[0];
      const seen = new Uint8Array(n);
      for (const p of pts) {
        const r = Math.ceil(p.r);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const X = Math.round(p.x) + dx, Y = Math.round(p.y) + dy;
          if (X < 0 || Y < 0 || X >= W2 || Y >= H2) continue;
          const i = ((Y / SC) | 0) * w + ((X / SC) | 0);
          if (seen[i] || !M[i]) continue; seen[i] = 1;
          for (let j = 0; j < K; j++) expected[i * K + j] += mix[j];
        }
      }
    });
  };
  // --foliagelogsheet 1 (debug): after each stage, log sheet pigment over plan pigment on the passage's cells, by quarter
  // of how much the plan wants (lightest first); an overshoot shows as a ratio above 1
  const sheetLog = name => {
    if (num('foliagelogsheet', 0) <= 0) return;
    const on = onSheet(), tot = []; for (let i = 0; i < n; i++) if (M[i]) { let a = 0, o = 0; for (let j = 0; j < K; j++) { a += A[i * K + j]; o += on[i * K + j]; } tot.push([a, o]); }
    tot.sort((p, q) => p[0] - q[0]); const parts = [0, 1, 2, 3].map(g => { const s = tot.slice(Math.floor(g * tot.length / 4), Math.floor((g + 1) * tot.length / 4)); const a = s.reduce((x, y) => x + y[0], 0), o = s.reduce((x, y) => x + y[1], 0); return `${(o / Math.max(1e-9, a)).toFixed(2)}`; });
    const all = tot.reduce((x, y) => [x[0] + y[0], x[1] + y[1]], [0, 0]);
    let fa = 0, fo = 0; if (M.field) for (let i = 0; i < n; i++) if (M.field[i]) for (let j = 0; j < K; j++) { fa += A[i * K + j]; fo += on[i * K + j]; }
    log(`foliage sheet after ${name}: pigment on sheet over plan ${(all[1] / Math.max(1e-9, all[0])).toFixed(2)} (lightest to darkest quarter ${parts.join(' ')})${M.field ? `; on the field cells ${(fo / Math.max(1e-9, fa)).toFixed(2)}` : ''}`);
  };
  // --foliagewashclip 1: hold the wash sweeps inside their mask. washPaths sizes each disc from one row's run, so at the
  // mask's ragged edges the disc hangs over other rows. containPaths clamps it to the distance from the mask edge (plus
  // --foliagewashslack cells) and cuts the path where it gets too small.
  // --foliagewashfloor f: never narrow the disc below f cells, so the wash may spill f cells past the edge and still
  // covers thin parts.
  const washOf = (mask, extra = {}) => {
    const paths = washPaths(mask, W2, H2, { pad: 0, minRadius: 1.5 * SC, minLength: 3 * SC, ...extra });
    if (!(num('foliagewashclip', 0) > 0) || !ctx.containPaths || !ctx.distanceToZero) return paths;
    const out = ctx.containPaths(paths, ctx.distanceToZero(mask, W2, H2), W2, H2, { minRadius: num('foliagewashminr', 1) * SC, minLength: 3 * SC, slack: num('foliagewashslack', 0) * SC, floor: num('foliagewashfloor', 0) * SC });
    if (num('foliagelogsheet', 0) > 0) log(`foliage wash clip: ${paths.length} sweeps became ${out.length}`);
    return out;
  };
  const strength = num('strength', 2.2) * num('foliagecal', 1.08);
  const settle = () => clock('flow', () => { for (let q = 0; q < num('settle', 60); q++) step(sheet, O); });
  const dryOff = () => clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  // millimetres per sheet cell
  const mmCell = num('sheetmm', DEFAULT_SHEET_MM) / W2;

  // 1. the ground: one wet wash of the light value over the whole hill
  {
    // under --foliagejoin the ground is charged from the plan itself (the hill's light value), not from a residual
    const R = num('foliagejoin', 0) > 0 ? A : residual(onSheet());
    const mix = quantileMix(R, M, num('foliageground', 0.3), num('foliagegroundload', 0.8));
    if (mix.reduce((a, b) => a + b, 0) > 0.02) {
      const paths = washOf(upMask);
      const cover = Math.max(1, Math.min(3, sweepCover(paths, upMask, W2, H2)));
      const every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, paths.length))));
      for (const [k, pts] of paths.entries()) {
        const R0 = Math.max(2, Math.round(Math.max(...pts.map(p => p.r))));
        const b = createBrush({ radius: R0, bristles: Math.max(12, Math.min(48, Math.ceil(R0 * 2))), capacity: 100, belly: 10, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.9, bridgeSoft: 2.6, seed: 9001 + k + SEED });
        dip(b, { water: num('foliagegroundwater', 0.72), conc: mix.map(v => v * strength / cover) });
        clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q => { if (q % every === 0) clock('flow', () => step(sheet, O)); } }));
      }
      bookFoot(paths, [mix]);
      used['foliage ground'] = (used['foliage ground'] || 0) + paths.length;
      log(`foliage: ground wash in ${paths.length} sweeps over ${cells} cells, puddle [${mix.map(v => v.toFixed(2)).join(' ')}]`);
      // --foliagedamp 1: the clumps go in while the ground wash is still damp (wet in wet)
      settle(); stage({ step: 'the hill: light ground wash', pass: 1 }); snap(); if (num('foliagedamp', 0) <= 0) dryOff();
    }
  }

  // 2 and 3. clumps, then darks: touches where the sheet still lacks the most
  // --foliagejoin 1: connected clusters, irregular gaps, paler and softer toward the top of the hill, darks under and
  // between the clusters. Default 0: independent touches.
  // --foliageplan 1: before painting, cut the region's lightness into three bands (lightest 30%, middle 45%, darkest 25%)
  // and plan one dry layer per band from its measured colour, value and share, replacing the light, mid and dark flags.
  // Saved as foliage-plan.json and .txt; --foliageplanfile replays an edited json (mm, cover, load, water, dryAfter).
  let PLAN = null;
  if (num('foliageplan', 0) > 0 || opt('foliageplanfile', '')) {
    const { px: PX, PIGS: PG } = ctx;
    const file = opt('foliageplanfile', '');
    if (file) { PLAN = JSON.parse(fs.readFileSync(path.resolve(ctx.root || '.', file), 'utf8')); log(`foliage: layer plan read from ${file}`); }
    else {
      const ys = [], ids = []; for (let i = 0; i < n; i++) if (M[i]) { ys.push((0.299 * PX[i * 3] + 0.587 * PX[i * 3 + 1] + 0.114 * PX[i * 3 + 2]) / 255); ids.push(i); }
      const sorted = Float32Array.from(ys).sort(), qv = q => sorted[Math.floor(Math.min(0.999, Math.max(0, q)) * (sorted.length - 1))];
      const t1 = qv(0.25), t2 = qv(0.70);
      const bands = { dark: { name: 'dark', ids: [] }, mid: { name: 'mid', ids: [] }, light: { name: 'light', ids: [] } };
      ids.forEach((i, k) => (ys[k] <= t1 ? bands.dark : ys[k] <= t2 ? bands.mid : bands.light).ids.push(i));
      let hole = 0; if (M.holes) for (let i = 0; i < n; i++) hole += M.holes[i] ? 1 : 0;
      const nM = ids.length, odAll = ys.reduce((a, y) => a - Math.log(Math.max(0.02, y)), 0) / nM;
      const stats = b => {
        let r = 0, g = 0, bl = 0, y = 0, od = 0; const mix = new Array(K).fill(0);
        for (const i of b.ids) { r += PX[i * 3]; g += PX[i * 3 + 1]; bl += PX[i * 3 + 2]; const Y = (0.299 * PX[i * 3] + 0.587 * PX[i * 3 + 1] + 0.114 * PX[i * 3 + 2]) / 255; y += Y; od -= Math.log(Math.max(0.02, Y)); for (let j = 0; j < K; j++) mix[j] += A[i * K + j]; }
        const c = Math.max(1, b.ids.length), ms = mix.reduce((a, v) => a + v, 0) || 1;
        return { share: b.ids.length / nM, value: +(100 * y / c).toFixed(1), colour: '#' + [r, g, bl].map(v => Math.round(v / c).toString(16).padStart(2, '0')).join(''), od: od / c, mix: Object.fromEntries(mix.map((v, j) => [(PG[j] && PG[j].name) || `pan${j}`, +(v / ms).toFixed(3)])) };
      };
      const sl = stats(bands.light), sm = stats(bands.mid), sd = stats(bands.dark);
      const tiersOn = num('foliagejoin', 0) > 0 && num('foliagetiers', 0) > 0, pressOn = num('foliagejoin', 0) > 0 && num('foliagepress', 0) > 0;
      const loadOf = st => +Math.max(0.3, st.od / odAll * num('foliageplanload', 1)).toFixed(2);
      PLAN = { region_cells: nM, paper_holes_share: +(hole / Math.max(1, hole + nM)).toFixed(3), value_cuts_lightness: [+t1.toFixed(3), +t2.toFixed(3)], layers: [
        { name: 'light', tag: 'light', value: sl.value, colour: sl.colour, mix: sl.mix, band_share: +sl.share.toFixed(3), paper: 'dry', mm: num('foliagelightmm', 2.4), shape: pressOn ? 'a round pressed, rolled into a short scalloped belly mark downward, lifted; neighbouring lobes join while wet; gaps left' : 'side of a round brush, short drags from the clump edge toward its centre, random angles, gaps left', cover: +Math.min(2.5, Math.min(1.2, (sl.share + sm.share) * 1.07) * num('foliagecovermul', 1)).toFixed(2), load: loadOf(sl), water: num('foliagelightwater', 0.6), dryAfter: true },
        { name: 'mid', tag: 'clumps', value: sm.value, colour: sm.colour, mix: sm.mix, band_share: +sm.share.toFixed(3), paper: tiersOn ? 'dry (onto the DRIED light layer, worked from the top crowns to the bottom crowns; each clump overlaps the lower 30 to 50 percent of a light crown, leaving its upper shoulder light)' : 'dry (partly over the light layer)', mm: num('foliagemm', 1.6), shape: pressOn ? 'a short downward press with a small side press, scalloped lower edge' : 'round touches in chains, random angles, ragged edge', cover: +((sm.share + sd.share) * 1.5 * num('foliagecovermul', 1)).toFixed(2), load: loadOf(sm), water: num('foliagewater', 0.52), dryAfter: true },
        { name: 'dark', tag: 'darks', value: sd.value, colour: sd.colour, mix: sd.mix, band_share: +sd.share.toFixed(3), paper: tiersOn ? 'dry (small touches just under the mid crowns, top to bottom, and between them)' : 'dry (small touches on the lower side of clumps and between them)', mm: num('foliagedarkmm', 1.0), shape: pressOn ? 'small downward presses under the mid crowns' : 'small touches under and between the clumps', cover: +(sd.share * 1.2).toFixed(2), load: loadOf(sd), water: num('foliagedarkwater', 0.42), dryAfter: true },
      ] };
      log(`foliage: layer plan from the reference, ${nM} cells, ${(100 * PLAN.paper_holes_share).toFixed(0)}% bare paper; ${PLAN.layers.map(l => `${l.name} value ${l.value} cover ${l.cover} load ${l.load} ${l.mm} mm`).join('; ')}`);
    }
    try {
      const dir = ctx.outDir || '.'; fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'foliage-plan.json'), JSON.stringify(PLAN, null, 2));
      fs.writeFileSync(path.join(dir, 'foliage-plan.txt'), `Foliage layer plan (${PLAN.region_cells} cells of foliage, ${(100 * PLAN.paper_holes_share).toFixed(0)}% of the box is bare paper left as sky holes).\nLayers go on in this order, each one onto dry paper, and the sheet is dried after each:\n` + PLAN.layers.map((l, k) => `${k + 1}. ${l.name}: aim at lightness ${l.value} (colour ${l.colour}); ${l.paper}; brush ${l.mm} mm; ${l.shape}; covers about ${Math.round(100 * l.cover)}% of the foliage in ink (overlap included); load ${l.load}; ${l.dryAfter ? 'dried after' : 'left wet'}.`).join('\n') + '\n' + (num('foliageclumps', 0) > 0 && num('foliagejoin', 0) > 0 ? 'Under --foliageclumps 1 the loads above are used clump by clump instead: back rows first, per clump 2 to 3 light presses on dry paper then 1 to 3 dark presses into the wet light on its lower and shadow side, dried after each row, a few darkest accents under the front clumps last (see foliage-clumps.txt).\n' : ''));
    } catch (e) { log(`foliage: plan not saved: ${e.message}`); }
  }
  const PL = name => (PLAN ? PLAN.layers.find(l => l.name === name) : null);
  const JOIN = num('foliagejoin', 0) > 0, CL = [];
  const TIERS = JOIN && num('foliagetiers', 0) > 0, PRESS = JOIN && num('foliagepress', 0) > 0;
  const farPale = num('foliagefarpale', 0.4), farSoft = num('foliagefarsoft', 0.4), farThin = num('foliagefarthin', 0.35), gapMul = num('foliagegap', 1);
  const dragMul = Math.max(0.5, num('foliagedrag', 1));
  const darkUnder = num('foliagedarkunder', 0.55), darkBetween = num('foliagedarkbetween', 0.6);
  let hy0 = h, hy1 = 0; for (let i = 0; i < n; i++) if (M[i]) { const y = (i / w) | 0; if (y < hy0) hy0 = y; if (y > hy1) hy1 = y; }
  const farAt = y => 1 - Math.max(0, Math.min(1, (y - hy0) / Math.max(1, hy1 - hy0)));   // 1 at the top of the hill, 0 at its foot
  // --foliagefromplan 1: charge every touch from the plan's colour under it, not from what the sheet still lacks; after
  // a ground wash the residual is nearly colourless. The touch loads carry the tone ladder (light 0.5, mid 0.8, dark 1.0).
  const FROMPLAN = num('foliagefromplan', 0) > 0;
  const touches = ({ mm, coverShare, q, water, bridge, breakup, load, tag, pass, seedBase }) => {
    const R = FROMPLAN ? (() => { const P = new Float32Array(n * K); for (let i = 0; i < n; i++) if (M[i]) for (let j = 0; j < K; j++) P[i * K + j] = A[i * K + j]; return P; })() : residual(onSheet()), T = total(R);
    const vals = []; for (let i = 0; i < n; i++) if (M[i]) vals.push(T[i]);
    vals.sort((a, b) => a - b);
    const cut = vals[Math.floor(Math.min(0.99, Math.max(0, q)) * (vals.length - 1))] || 0;
    const rBase = Math.max(1.2, mm / mmCell);                     // in sheet cells
    const want = Math.round(coverShare * cells * SC * SC / (Math.PI * rBase * rBase * 1.3));
    // candidate centres in a seeded random order, kept when the cell still lacks paint and no kept centre is too close
    const order = []; for (let i = 0; i < n; i++) if (M[i] && T[i] > cut) order.push(i);
    for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
    const gap = Math.max(1, Math.round(0.9 * rBase / SC)), taken = new Uint8Array(n), paths = [], mixes = [];
    const waters = [];
    for (const i of (JOIN ? [] : order)) {
      if (paths.length >= want) break;
      if (taken[i]) continue;
      const cx = i % w, cy = (i / w) | 0;
      for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h) taken[y * w + x] = 1; }
      const r = rBase * (0.55 + 0.95 * rnd());
      // the touch's paint: what the cells under it still want, on average
      const mix = new Array(K).fill(0); let c = 0;
      const rr = Math.max(1, Math.round(r / SC));
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= w || y >= h || !M[y * w + x]) continue; c++; for (let j = 0; j < K; j++) mix[j] += R[(y * w + x) * K + j]; }
      if (!c) continue;
      for (let j = 0; j < K; j++) mix[j] = mix[j] / c * load;
      // a lump, not a stamp: a short pull at a random angle, landing on the point, through the belly, off the point;
      // then a smaller touch beside it, so the clump's edge is ragged
      const pts = [], ang = rnd() * Math.PI, len = r * (0.8 + 1.0 * rnd()), steps = Math.max(4, Math.round(len / Math.max(0.8, r * 0.3)));
      const X0 = (cx + 0.5) * SC, Y0 = (cy + 0.5) * SC;
      for (let t = 0; t <= steps; t++) {
        const f = t / steps, d = (f - 0.5) * len, belly = Math.sin(Math.PI * f);
        pts.push({ x: clampX(X0 + Math.cos(ang) * d + (rnd() - 0.5) * r * 0.3), y: clampY(Y0 + Math.sin(ang) * d + (rnd() - 0.5) * r * 0.3), r: Math.max(0.9, r * (0.32 + 0.72 * belly)), p: Math.max(0.5, 0.6 + 0.4 * belly) });
      }
      paths.push(pts); mixes.push(mix);
      const a2 = ang + (rnd() - 0.5) * 2.2, off = r * (0.7 + 0.5 * rnd()), r2 = r * (0.45 + 0.3 * rnd());
      const X1 = X0 + Math.cos(a2) * off, Y1 = Y0 + Math.sin(a2) * off;
      paths.push([0, 1, 2, 3].map(t => { const f = t / 3, belly = Math.sin(Math.PI * f); return { x: clampX(X1 + Math.cos(a2) * (f - 0.5) * r2 * 1.4), y: clampY(Y1 + Math.sin(a2) * (f - 0.5) * r2 * 1.4), r: Math.max(0.8, r2 * (0.4 + 0.7 * belly)), p: 0.7 }; }));
      mixes.push(mix);
    }
    if (JOIN) {
      // --foliagejoin 1: a cluster is a short chain of overlapping touches laid while damp, so they run into one bush with a
      // ragged edge. Each keeps its own gap, so gaps are irregular; toward the top of the hill clusters are fewer, paler
      // and wetter. Darks go under the clusters and between them.
      const inM = (x, y) => { const X = Math.floor(x / SC), Y = Math.floor(y / SC); return X >= 0 && Y >= 0 && X < w && Y < h && M[Y * w + X]; };
      const meanMix = (specs2) => {
        const mix = new Array(K).fill(0); let c = 0;
        for (const m of specs2) {
          const rr = Math.max(1, Math.round(m.r / SC)), mx = Math.floor(m.x / SC), my = Math.floor(m.y / SC);
          for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const x = mx + dx, y = my + dy; if (x < 0 || y < 0 || x >= w || y >= h || !M[y * w + x]) continue; c++; for (let j = 0; j < K; j++) mix[j] += R[(y * w + x) * K + j]; }
        }
        return c ? mix.map(v => v / c * load) : null;
      };
      const lumpAt = (X0, Y0, r, mix, wf) => {
        if (PRESS) {
          // --foliagepress 1: a touch is a short press rolled downward into a belly mark, then lifted: wide and firm at the
          // top, narrowing to the lift. A smaller press beside it makes the crown's scalloped lower edge.
          const len = r * (1.0 + 0.5 * rnd()), steps = 6, sway = (rnd() - 0.5) * r * 0.5, pp = [];
          for (let t = 0; t <= steps; t++) {
            const f = t / steps, bell = Math.sin(Math.PI * Math.min(1, f * 1.25 + 0.1));
            pp.push({ x: clampX(X0 + sway * f + (rnd() - 0.5) * r * 0.12), y: clampY(Y0 + (f - 0.35) * len), r: Math.max(0.9, r * (0.45 + 0.6 * bell) * (1 - 0.3 * f)), p: Math.max(0.5, 0.95 - 0.5 * f) });
          }
          paths.push(pp); mixes.push(mix); waters.push(wf);
          if (rnd() < 0.7) {
            const sd = rnd() < 0.5 ? -1 : 1, off = r * (0.8 + 0.4 * rnd()), r2 = r * (0.5 + 0.25 * rnd()), X1 = X0 + sd * off, Y1 = Y0 + r * 0.25 * rnd();
            paths.push([0, 1, 2, 3].map(t => { const f = t / 3; return { x: clampX(X1), y: clampY(Y1 + (f - 0.35) * r2 * 1.2), r: Math.max(0.8, r2 * (0.5 + 0.55 * Math.sin(Math.PI * Math.min(1, f * 1.25 + 0.1)))), p: 0.8 - 0.3 * f }; }));
            mixes.push(mix); waters.push(wf);
          }
          return;
        }
        // --foliagedrag d: the touch is dragged on its side from the outer edge inward, this many times longer (1 = a lump)
        const ang = rnd() * Math.PI, len = r * (0.8 + 1.0 * rnd()) * dragMul, steps = Math.max(4, Math.round(len / Math.max(0.8, r * 0.3))), pts = [];
        for (let t = 0; t <= steps; t++) {
          const f = t / steps, d = (f - 0.5) * len, belly = Math.sin(Math.PI * f);
          pts.push({ x: clampX(X0 + Math.cos(ang) * d + (rnd() - 0.5) * r * 0.3), y: clampY(Y0 + Math.sin(ang) * d + (rnd() - 0.5) * r * 0.3), r: Math.max(0.9, r * (0.32 + 0.72 * belly)), p: Math.max(0.5, 0.6 + 0.4 * belly) });
        }
        paths.push(pts); mixes.push(mix); waters.push(wf);
        if (rnd() < 0.6) {
          const a2 = ang + (rnd() - 0.5) * 2.2, off = r * (0.7 + 0.5 * rnd()), r2 = r * (0.45 + 0.3 * rnd()), X1 = X0 + Math.cos(a2) * off, Y1 = Y0 + Math.sin(a2) * off;
          paths.push([0, 1, 2, 3].map(t => { const f = t / 3, belly = Math.sin(Math.PI * f); return { x: clampX(X1 + Math.cos(a2) * (f - 0.5) * r2 * 1.4), y: clampY(Y1 + Math.sin(a2) * (f - 0.5) * r2 * 1.4), r: Math.max(0.8, r2 * (0.4 + 0.7 * belly)), p: 0.7 }; }));
          mixes.push(mix); waters.push(wf);
        }
      };
      // --foliagetiers 1: touches are collected and laid from the top of the hill to the bottom (back crowns first), and
      // each mid clump is anchored on the lower part of a light crown already dried on the sheet, so the crown's upper
      // shoulder stays light. Darks go under the mid clumps only.
      const pend = [], emit = (yy, fn) => (TIERS ? pend.push({ y: yy, fn }) : fn());
      const flush = () => { if (TIERS) { pend.sort((p, q) => p.y - q.y); for (const p of pend) p.fn(); } };
      if (tag !== 'darks') {
        const taken = new Uint8Array(n);
        let laid = 0;
        const anchors = TIERS && tag === 'clumps' ? CL.filter(c => c.tag === 'light').flatMap(c => c.members) : [];
        if (TIERS && tag === 'clumps') log(`foliage tiers: ${anchors.length} light crowns to overlap, mid clumps laid top to bottom`);
        for (const i of order) {
          if (laid >= want) break;
          if (taken[i]) continue;
          let cy0 = (i / w) | 0, far = farAt(cy0), sx0 = null, sy0 = null;
          if (anchors.length) {
            const px0 = (i % w + 0.5) * SC, py0 = (cy0 + 0.5) * SC; let best = null, bd = 1e18;
            for (const a0 of anchors) { const d = (a0.x - px0) ** 2 + (a0.y - py0) ** 2; if (d < bd) { bd = d; best = a0; } }
            if (!best || Math.sqrt(bd) > 3 * rBase + best.r) continue;
            sx0 = best.x + (rnd() - 0.5) * best.r * 1.4; sy0 = best.y + best.r * (0.35 + 0.3 * rnd());
            cy0 = Math.max(0, Math.min(h - 1, Math.floor(sy0 / SC))); far = farAt(cy0);
            if (taken[cy0 * w + Math.max(0, Math.min(w - 1, Math.floor(sx0 / SC)))]) continue;
          }
          if (rnd() < farThin * far) continue;
          const gapR = Math.max(1, rBase * gapMul * (1.0 + 1.6 * rnd()) / SC), k = 3 + Math.floor(rnd() * 5), members = [];
          let x = sx0 != null ? sx0 : (i % w + 0.5) * SC, y = sy0 != null ? sy0 : (cy0 + 0.5) * SC, a = (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 1.3;
          for (let t = 0; t < k; t++) {
            if (!inM(x, y)) break;
            const r = rBase * (0.6 + 0.8 * rnd()) * (1 - 0.2 * far);
            members.push({ x, y, r });
            a += (rnd() - 0.5) * 1.7;
            const st = r * (0.85 + 0.5 * rnd());
            x += Math.cos(a) * st; y += Math.sin(a) * st * 0.8;
          }
          if (members.length < 2) { taken[i] = 1; continue; }
          for (const m of members) { const rr = Math.ceil(m.r / SC + gapR), mx = Math.floor(m.x / SC), my = Math.floor(m.y / SC); for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { if (dx * dx + dy * dy > rr * rr) continue; const X = mx + dx, Y = my + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) taken[Y * w + X] = 1; } }
          let cm = meanMix(members); if (!cm) continue;
          // --foliagevary v: each cluster gets its own value, its mix scaled by 1 + v * (2 rnd - 1) (0: off)
          if (num('foliagevary', 0) > 0) { const vs = 1 + num('foliagevary', 0) * (2 * rnd() - 1); cm = cm.map(v => v * vs); }
          const pale = 1 - farPale * far, wet = 1 + farSoft * far;
          const cmF = cm;
          emit(members[0].y, () => members.forEach((m, ti) => lumpAt(m.x, m.y, m.r, cmF.map(v => v * pale * (0.85 + 0.3 * rnd())), wet * (ti === 0 ? 1 : 0.92))));
          CL.push({ members, far, tag });
          laid += members.length;
        }
        flush();
      } else {
        // darks: under each clump (the sheet's y grows downward) and between clusters that nearly touch
        const specs = [];
        const CLd = TIERS && CL.some(c => c.tag === 'clumps') ? CL.filter(c => c.tag === 'clumps') : CL;
        for (const c of CLd) for (const m of c.members) {
          if (rnd() > darkUnder) continue;
          if (rnd() < farThin * c.far) continue;
          specs.push({ x: m.x + (rnd() - 0.5) * m.r * 1.2, y: m.y + m.r * (TIERS ? 0.6 + 0.6 * rnd() : 0.5 + 0.5 * rnd()), r: m.r * (0.3 + 0.25 * rnd()), far: c.far });
        }
        const cen = CLd.map(c => { let sx = 0, sy = 0; for (const m of c.members) { sx += m.x; sy += m.y; } return { x: sx / c.members.length, y: sy / c.members.length, far: c.far, r: Math.max(...c.members.map(m => m.r)) }; });
        for (let p = 0; p < cen.length; p++) for (let q2 = p + 1; q2 < cen.length; q2++) {
          const dx = cen[q2].x - cen[p].x, dy = cen[q2].y - cen[p].y, d = Math.hypot(dx, dy);
          if (d > rBase * 7 || rnd() > darkBetween) continue;
          specs.push({ x: cen[p].x + dx * 0.5 + (rnd() - 0.5) * rBase * 0.6, y: cen[p].y + dy * 0.5 + (rnd() - 0.5) * rBase * 0.6, r: rBase * (0.3 + 0.25 * rnd()), far: (cen[p].far + cen[q2].far) / 2 });
        }
        for (let k = specs.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = specs[k]; specs[k] = specs[j]; specs[j] = t; }
        let laid = 0;
        for (const s2 of specs) {
          if (laid >= want) break;
          if (!inM(s2.x, s2.y)) continue;
          const T0 = T[Math.floor(s2.y / SC) * w + Math.floor(s2.x / SC)];
          if (T0 < cut * 0.6) continue;
          const mix = meanMix([s2]); if (!mix) continue;
          emit(s2.y, () => lumpAt(s2.x, s2.y, Math.max(1.2, s2.r), mix.map(v => v * (1 - 0.5 * farPale * s2.far)), 1 + farSoft * 0.5 * s2.far));
          laid++;
        }
        flush();
      }
    }
    if (!paths.length) { log(`foliage: ${tag}: nothing left to lay`); return 0; }
    const cover = Math.max(1, Math.min(2.5, sweepCover(paths, upMask, W2, H2)));
    const every = Math.max(24, Math.round(24 * Math.sqrt(paths.length)));
    paths.forEach((pts, k) => {
      const R0 = Math.max(1, Math.round(Math.max(...pts.map(p => p.r))));
      const b = createBrush({ radius: R0, bristles: Math.max(8, Math.ceil(R0 * 2.2)), capacity: 50, belly: 5, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.06, stiffness: 5, breakup, wetMix: 0.4, bridge, bridgeSoft: 1.6, grainShift: 1, seed: seedBase + k + SEED });
      // a painter recharges between touches and never gets the same load twice
      dip(b, { water: Math.min(0.9, water * (waters[k] || 1) * (0.85 + 0.3 * rnd())), conc: mixes[k].map(v => v * strength * (JOIN ? num('foliageboost', 1) : 1) / cover * (0.8 + 0.4 * rnd())) });
      clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q2 => { if (q2 % every === 0) clock('flow', () => step(sheet, O)); } }));
    });
    bookFoot(paths, mixes);
    used[`foliage ${tag}`] = (used[`foliage ${tag}`] || 0) + paths.length;
    log(`foliage: ${paths.length} ${tag} touches, radius about ${rBase.toFixed(1)} cells, above ${cut.toFixed(3)} still wanted, cover ${cover.toFixed(2)}`);
    // --foliagewetin 1: light and mid touches are not dried before the next tones go in, so tones mingle inside a clump
    // while its outer edge, laid on dry paper, stays broken. Only the darks are dried.
    settle(); stage({ step: `the hill: ${tag}`, pass }); snap();
    // dried between layers unless --foliagewetin 1 (and, under a layer plan, unless the plan leaves the layer wet)
    const wetNow = PLAN ? PL(tag === 'clumps' ? 'mid' : tag === 'darks' ? 'dark' : 'light')?.dryAfter === false : (num('foliagewetin', 0) > 0 && tag !== 'darks');
    if (!wetNow) { dryOff(); used['foliage dried after a layer'] = (used['foliage dried after a layer'] || 0) + 1; log(`foliage: sheet dried after the ${tag} layer`); }
    return paths.length;
  };
  // --foliageclumps 1: clumps read from the reference (centre, width, row, light upper and dark lower colour), painted
  // back rows first. Per clump 2 to 3 light presses on dry paper, then 1 to 3 dark presses into the wet lower side; dried
  // after each row, then a few darkest accents under the front clumps. Writes foliage-clumps.json and .txt.
  //   --foliageclumpmm 6 (clump width), --foliageclumpscut 0.2 (clumps only where the smoothed darkness is above this
  //   quantile; the rest stay as holes), --foliageclumpsgap 1.0 (spacing along a row), --foliageclumpsrow 0.7 (row height
  //   in clump widths), --foliageclumpslight 0.87, --foliageclumpsdark 1.0, --foliageclumpscover 1.4, --foliageclumpsbridge 1.0
  const CLUMPS = JOIN && num('foliageclumps', 0) > 0;
  const paintClumps = async () => {
    const PXc = ctx.px;
    const cwmm = num('foliageclumpmm', 6), cwS = cwmm / mmCell, cwP = cwS / SC;
    const loadL = (PL('light') ? PL('light').load : 0.6) * num('foliageclumpslight', 0.87);
    const loadD = (PL('mid') ? PL('mid').load : 0.9) * num('foliageclumpsdark', 1);
    const loadA = PL('dark') ? PL('dark').load : 1.2;
    const covF = Math.max(0.5, num('foliageclumpscover', 1.4)), bridgeC = num('foliageclumpsbridge', 1.0), rowH = cwS * num('foliageclumpsrow', 0.7), gapC = num('foliageclumpsgap', 1.0);
    const pressL = num('foliageclumpspress', 0.19), pressD = num('foliageclumpsdarkpress', 0.15);   // press radius as a share of the clump width
    const lum = i => (0.299 * PXc[i * 3] + 0.587 * PXc[i * 3 + 1] + 0.114 * PXc[i * 3 + 2]) / 255;
    const od = new Float32Array(n); const vals = [];
    for (let i = 0; i < n; i++) if (M[i]) od[i] = -Math.log(Math.max(0.02, lum(i)));
    const sm = ctx.gaussian ? ctx.gaussian(od, w, h, Math.max(1, cwP * 0.3)) : od;
    for (let i = 0; i < n; i++) if (M[i]) vals.push(sm[i]);
    vals.sort((a, b) => a - b);
    const cut = vals[Math.floor(Math.min(0.99, Math.max(0, num('foliageclumpscut', 0.2))) * (vals.length - 1))] || 0;
    const tot = i => { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; return s; };
    const hex = ids => { let r = 0, g = 0, b = 0; for (const i of ids) { r += PXc[i * 3]; g += PXc[i * 3 + 1]; b += PXc[i * 3 + 2]; } const c = Math.max(1, ids.length); return '#' + [r, g, b].map(v => Math.round(v / c).toString(16).padStart(2, '0')).join(''); };
    const meanA = ids => { const m = new Array(K).fill(0); for (const i of ids) for (let j = 0; j < K; j++) m[j] += A[i * K + j]; const c = Math.max(1, ids.length); return m.map(v => v / c); };
    // 1. the clump plan: rows from the top (back) down, centres along each row where the reference has trees
    const clumps = [];
    const inMs = (x, y) => { const X = Math.floor(x / SC), Y = Math.floor(y / SC); return X >= 0 && Y >= 0 && X < w && Y < h && M[Y * w + X] ? Y * w + X : -1; };
    let row = 0;
    for (let yc = hy0 * SC + cwS * 0.5; yc <= (hy1 + 1) * SC; yc += rowH, row++) {
      let x = rnd() * cwS * 0.6 + (row % 2 ? cwS * 0.4 : 0);
      for (; x < W2; x += cwS * (0.8 + 0.5 * rnd()) * gapC) {
        const cy = yc + (rnd() - 0.5) * rowH * 0.5, cx = x + (rnd() - 0.5) * cwS * 0.3, ci = inMs(cx, cy);
        if (ci < 0 || sm[ci] < cut || rnd() < 0.08) continue;
        const cw = cwS * (0.75 + 0.6 * rnd());
        let inside = 0, tries = 0; for (const [a, b] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]]) { tries++; if (inMs(cx + a * cw, cy + b * cw) >= 0) inside++; }
        if (inside < 5) continue;
        const up = [], lo = [], rP = Math.max(1, Math.round(cw / SC / 2)), mx = Math.floor(cx / SC), my = Math.floor(cy / SC);
        for (let dy = -rP; dy <= rP; dy++) for (let dx = -rP; dx <= rP; dx++) { if (dx * dx + dy * dy > rP * rP) continue; const X = mx + dx, Y = my + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !M[Y * w + X]) continue; (dy <= 0 ? up : lo).push(Y * w + X); }
        const all = up.concat(lo); if (all.length < 3) continue;
        const upU = up.length ? up : all, loU = lo.length ? lo : all;
        const loS = loU.slice().sort((p, q) => tot(q) - tot(p));
        const darkIds = loS.slice(0, Math.max(1, Math.ceil(loS.length * 0.5))), accIds = loS.slice(0, Math.max(1, Math.ceil(loS.length * 0.25)));
        clumps.push({ id: clumps.length + 1, row, x: cx, y: cy, cw, light: meanA(upU), dark: meanA(darkIds), acc: meanA(accIds), lightHex: hex(upU), darkHex: hex(darkIds), marks: 0, light_marks: 0, dark_marks: 0 });
      }
    }
    if (!clumps.length) { log('foliage clumps: none planned'); return 0; }
    // 2. paint, back rows first
    const pressPath = (X0, Y0, r, len) => {
      const sway = (rnd() - 0.5) * r * 0.5, pp = [];
      // --foliageclumpsblob 1: the press keeps its width to the lift (a rounded blob, a stadium), instead of tapering to a point
      // --foliageclumpsblob 2: the press starts at a tip and swells to its belly, then lifts round (pointed top, round base)
      if (num('foliageclumpsblob', 0) >= 2) { for (let t = 0; t <= 6; t++) { const f = t / 6; pp.push({ x: clampX(X0 + sway * f + (rnd() - 0.5) * r * 0.12), y: clampY(Y0 + (f - 0.35) * len), r: Math.max(0.9, r * (0.45 + 0.55 * Math.sin(Math.PI / 2 * Math.min(1, f * 1.3))) * (f > 0.9 ? 0.9 : 1)), p: Math.max(0.5, 0.6 + 0.35 * Math.min(1, f * 1.3)) }); } return pp; }
      if (num('foliageclumpsblob', 0) > 0) { for (let t = 0; t <= 6; t++) { const f = t / 6; pp.push({ x: clampX(X0 + sway * f + (rnd() - 0.5) * r * 0.12), y: clampY(Y0 + (f - 0.35) * len), r: Math.max(0.9, r * (0.8 + 0.25 * Math.sin(Math.PI * Math.min(1, f * 0.9)))), p: 0.9 - 0.15 * f }); } return pp; }
      for (let t = 0; t <= 6; t++) { const f = t / 6, bell = Math.sin(Math.PI * Math.min(1, f * 1.25 + 0.1)); pp.push({ x: clampX(X0 + sway * f + (rnd() - 0.5) * r * 0.12), y: clampY(Y0 + (f - 0.35) * len), r: Math.max(0.9, r * (0.45 + 0.6 * bell) * (1 - 0.3 * f)), p: Math.max(0.5, 0.95 - 0.5 * f) }); }
      return pp;
    };
    const press = (pts, mix, water, seed, bridge, breakup) => {
      const R0 = Math.max(1, Math.round(Math.max(...pts.map(p => p.r))));
      const b = createBrush({ radius: R0, bristles: Math.max(8, Math.ceil(R0 * 2.2)), capacity: 50, belly: 5, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.06, stiffness: 5, breakup, wetMix: 0.4, bridge, bridgeSoft: 1.6, grainShift: 1, seed: seed + SEED });
      dip(b, { water: Math.min(0.9, water * (0.85 + 0.3 * rnd())), conc: mix.map(v => v * strength * num('foliageboost', 1) / covF * (0.85 + 0.3 * rnd())) });
      clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: 24, between: q2 => { if (q2 % 24 === 0) clock('flow', () => step(sheet, O)); } }));
    };
    let marksAll = 0, rowsDone = 0, lastRow = clumps[clumps.length - 1].row; const perRow = {};
    const rowIds = [...new Set(clumps.map(c => c.row))];
    for (const rw of rowIds) {
      const cs = clumps.filter(c => c.row === rw), paths = [], mixes = [];
      for (const c of cs) {
        const nL = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let k = 0; k < nL; k++) {
          const ox = (k - (nL - 1) / 2) * c.cw * 0.3 + (rnd() - 0.5) * c.cw * 0.12, oy = -c.cw * (0.14 + 0.1 * rnd()) - (k % 2 ? c.cw * 0.05 : 0);
          const pts = pressPath(c.x + ox, c.y + oy, c.cw * pressL * (0.85 + 0.3 * rnd()), c.cw * (0.4 + 0.15 * rnd()) * (pressL / 0.19));
          const mix = c.light.map(v => v * loadL); press(pts, mix, num('foliagelightwater', 0.6), 9100 + c.id * 7 + k, bridgeC, 0); paths.push(pts); mixes.push(mix); c.light_marks++;
        }
        for (let q2 = 0; q2 < 4; q2++) clock('flow', () => step(sheet, O));
        const nD = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < nD; k++) {
          const ox = (rnd() - 0.3) * c.cw * 0.4, oy = c.cw * (0.14 + 0.12 * rnd());
          const pts = pressPath(c.x + ox, c.y + oy, c.cw * pressD * (0.85 + 0.3 * rnd()), c.cw * 0.3 * (pressD / 0.15));
          const mix = c.dark.map(v => v * loadD); press(pts, mix, num('foliagewater', 0.52), 9400 + c.id * 7 + k, bridgeC, 0); paths.push(pts); mixes.push(mix); c.dark_marks++;
        }
        c.marks = c.light_marks + c.dark_marks; marksAll += c.marks;
      }
      bookFoot(paths, mixes);
      settle(); stage({ step: `the hill: clump row ${rw}`, pass: 2 }); snap(); dryOff(); rowsDone++; perRow[rw] = cs.length;
    }
    // 3. a few darkest accents under the front clumps, on dry paper
    const accPaths = [], accMixes = []; let acc = 0;
    for (const c of clumps) {
      if (c.row < lastRow * 0.4 || rnd() > num('foliageclumpsacc', 0.35)) continue;
      const r = Math.min(1.5 / mmCell, Math.max(0.75 / mmCell, c.cw * 0.09));
      const pts = pressPath(c.x + (rnd() - 0.2) * c.cw * 0.3, c.y + c.cw * (0.3 + 0.1 * rnd()), r, r * 3);
      const mix = c.acc.map(v => v * loadA); press(pts, mix, 0.35, 9800 + c.id, 0.6, 1.2); accPaths.push(pts); accMixes.push(mix); acc++; c.marks++; marksAll++;
    }
    if (acc) { bookFoot(accPaths, accMixes); settle(); stage({ step: 'the hill: accents', pass: 3 }); snap(); dryOff(); }
    used['foliage clump presses'] = (used['foliage clump presses'] || 0) + marksAll;
    const marks = clumps.map(c => c.marks);
    log(`foliage clumps: ${clumps.length} clumps in ${rowIds.length} rows, ${marksAll} marks (${acc} accents), ${(marksAll / clumps.length).toFixed(1)} a clump (min ${Math.min(...marks)}, max ${Math.max(...marks)}), clump ${cwmm} mm, bridge ${bridgeC}`);
    try {
      const dir = ctx.outDir || '.'; fs.mkdirSync(dir, { recursive: true });
      const mmx = v => +(v * mmCell).toFixed(1);
      fs.writeFileSync(path.join(dir, 'foliage-clumps.json'), JSON.stringify({ clump_mm: cwmm, rows: rowIds.length, marks: marksAll, clumps: clumps.map(c => ({ id: c.id, row: c.row, x_mm: mmx(c.x), y_mm: mmx(c.y), width_mm: mmx(c.cw), light: c.lightHex, dark: c.darkHex, marks: c.marks })) }, null, 1));
      fs.writeFileSync(path.join(dir, 'foliage-clumps.txt'), `Foliage clump plan: ${clumps.length} clumps in ${rowIds.length} rows, ${marksAll} marks in all. Painted back rows (top of the crop) first; per clump 2 to 3 presses of the light mix on dry paper, then while wet 1 to 3 presses of the dark mix on its lower and shadow side; the sheet is dried after each row; a few darkest accents under the front clumps at the end.\n` + clumps.map(c => `clump ${c.id}: row ${c.row}, centre ${mmx(c.x)},${mmx(c.y)} mm, width ${mmx(c.cw)} mm, light ${c.lightHex}, dark ${c.darkHex}, ${c.marks} marks`).join('\n') + '\n');
    } catch (e) { log(`foliage clumps: plan not saved: ${e.message}`); }
    return marksAll;
  };
  // --foliagemasks 1: four value tiers over the tree cells, each covering cells at least as dark as a blurred lightness
  // quantile (0.96, 0.62, 0.32, 0.10). Each tier mask is cleaned to what its brush can make and covered with round clumps
  // of crossing touches plus rim lobes, laid top row first and dried after each tier. The light tier gets a flat wash
  // first, its clumps touched in wet. A clump is charged with what its cells still lack, thinned for overlap.
  //   --foliagemasksize 1 (brush scale), --foliagemaskload 0.8, --foliagemaskwash 0.6 (wash share of the light tier's mix),
  //   --foliagemasksquint 2, --foliagemaskcover 0.85, --foliagemasktiers 4 (3 leaves out the darkest)
  const MASKS = num('foliagemasks', 0) > 0;
  const paintMasks = async () => {
    const { dilate, erode } = ctx; const PXm = ctx.px, WH = W2 * H2;
    const lumP = new Float32Array(n); for (let i = 0; i < n; i++) lumP[i] = (0.299 * PXm[i * 3] + 0.587 * PXm[i * 3 + 1] + 0.114 * PXm[i * 3 + 2]) / 255;
    const upL = new Float32Array(WH); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) upL[y * W2 + x] = lumP[((y / SC) | 0) * w + ((x / SC) | 0)];
    const LS = ctx.gaussian ? ctx.gaussian(upL, W2, H2, num('foliagemasksquint', 2)) : upL;
    const tl = []; for (let i = 0; i < WH; i++) if (upTree[i]) tl.push(LS[i]); tl.sort((a, b) => a - b);
    if (tl.length < 200) { log('foliage masks: too few tree cells'); return 0; }
    const qv = p => tl[Math.min(tl.length - 1, Math.floor(p * tl.length))];
    const k0 = num('foliagemasksize', 1), rb12 = 3.5 / mmCell * k0, rb8 = 2.5 / mmCell * k0, rb4 = 1.5 / mmCell * k0;
    const tiers = [
      { name: 'light olive', at: 0.96, rMin: rb12 * 0.8, rMax: rb12 * 1.3, rb: rb12, water: 0.62, open: 2, spill: 0.5, thin: 0.85 },
      { name: 'mid olive', at: 0.62, rMin: rb8 * 0.8, rMax: rb8 * 1.3, rb: rb8, water: 0.6, open: 1.5, spill: 0, thin: 0.88 },
      { name: 'dark olive', at: 0.32, rMin: rb4 * 1.1, rMax: rb4 * 1.8, rb: rb4 * 1.2, water: 0.58, open: 1, spill: -0.5, thin: 1 },
      { name: 'darkest', at: 0.10, rMin: rb4 * 0.7, rMax: rb4 * 1.2, rb: rb4, water: 0.55, open: 1, spill: -0.5, thin: 1 },
    ].slice(0, Math.max(2, Math.min(4, Math.round(num('foliagemasktiers', 4)))));
    // --foliagemaskat a,b,c,d: the quantiles the four tier masks are cut at (default 0.96,0.62,0.32,0.10). A first
    // value under 0.96 leaves the lightest cells of the hill to the pale ground alone, so the light crowns stand against it.
    if (opt('foliagemaskat', '')) String(opt('foliagemaskat', '')).split(',').map(Number).forEach((v, k) => { if (tiers[k] && v > 0 && v < 1) tiers[k].at = v; });
    tiers.forEach((t, k) => { t.thr = qv(t.at); t.lo = k + 1 < tiers.length ? qv(tiers[k + 1].at) : -1; });
    const clean = (m, r) => { const rr = Math.max(1, Math.round(r)); return ctx.removeSmall(dilate(erode(m, W2, H2, rr), W2, H2, rr), W2, H2, Math.round(Math.PI * rr * rr * 2)); };
    const placeClumps = (mask, { rMin, rMax, spill, cover }) => {
      const dist = ctx.distanceToZero(mask, W2, H2), covered = new Uint8Array(WH), cand = [];
      for (let i = 0; i < WH; i++) if (mask[i]) cand.push(i);
      for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
      const out = [];
      for (const i of cand) {
        if (covered[i] || dist[i] < 1.5) continue;
        const x = i % W2, y = (i / W2) | 0, want = rMin + (rMax - rMin) * rnd(), R = Math.max(rMin * 0.6, Math.min(want, dist[i] + spill));
        out.push({ x: x + 0.5, y: y + 0.5, R });
        const rc = R * cover;
        for (let yy = Math.max(0, Math.floor(y - rc)); yy <= Math.min(H2 - 1, Math.ceil(y + rc)); yy++) for (let xx = Math.max(0, Math.floor(x - rc)); xx <= Math.min(W2 - 1, Math.ceil(x + rc)); xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= rc * rc) covered[yy * W2 + xx] = 1;
      }
      const band = Math.max(8, rMax * 2);
      out.sort((a, b) => { const ba = Math.floor(a.y / band), bb = Math.floor(b.y / band); return ba !== bb ? ba - bb : (ba % 2 ? b.x - a.x : a.x - b.x); });
      return out;
    };
    const touch = (ox, oy, ang, len) => [0.45, 0.9, 1, 0.9, 0.55].map((p, k) => { const u = (k / 4) * 2 - 1; return { x: clampX(ox + Math.cos(ang) * len / 2 * u), y: clampY(oy + Math.sin(ang) * len / 2 * u), p }; });
    const clumpTouches = (cx, cy, R, rb) => {
      const big = num('foliagemaskclump', 1) > 1, nT = big ? Math.max(3, Math.min(9, Math.round(1.5 * R / rb))) : (R < rb * 1.4 ? 2 : 3), base = rnd() * Math.PI, out = [];
      for (let j = 0; j < nT; j++) { const ang = base + Math.PI * j / nT + (rnd() - 0.5) * 0.5, len = Math.max(1.5, (R - rb * 0.7) * (1.6 + 0.6 * rnd())); out.push(touch(cx + (rnd() - 0.5) * R * 0.35, cy + (rnd() - 0.5) * R * 0.35, ang, len)); }
      const lobes = R > rb ? 1 + (rnd() < 0.5 ? 1 : 0) + (big ? Math.round(R / rb / 2) : 0) : 0;
      for (let j = 0; j < lobes; j++) { const t = -Math.PI / 2 + (rnd() - 0.5) * 3.6, d = R * (0.55 + 0.25 * rnd()); out.push(touch(cx + d * Math.cos(t), cy + d * Math.sin(t), t + Math.PI / 2 + (rnd() - 0.5), Math.max(1.5, rb * 0.8))); }
      return out;
    };
    const covF = Math.max(0.5, num('foliagemaskcover', 1.0)), loadM = num('foliagemaskload', 0.8), boost = num('foliageboost', 1);
    const meanOver = (R, cells) => { const m = new Array(K).fill(0); for (const i of cells) for (let j = 0; j < K; j++) m[j] += R[i * K + j]; const c = Math.max(1, cells.length); return m.map(v => v / c); };
    const record = []; let marksAll = 0;
    // --foliagefields d: light warm cells (blurred density under d, red over green by 8 or more) get neither the first
    // wash nor the fill, so the ladder paints them pale and the olive does not cover them
    let FIELD = null;
    if (num('foliagefields', 0) > 0 && ctx.gaussian) {
      const fd = ctx.gaussian(Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, lumP[i]))), w, h, 2), frg = ctx.gaussian(Float32Array.from({ length: n }, (_, i) => PXm[i * 3] - PXm[i * 3 + 1]), w, h, 2);
      FIELD = new Uint8Array(n); let fc = 0; for (let i = 0; i < n; i++) if (fd[i] < num('foliagefields', 0) && frg[i] >= 8) { FIELD[i] = 1; fc++; }
      log(`foliage masks: ${fc} light warm field cells left out of the washes`);
    }
    if (!FIELD && M.field) FIELD = M.field;   // --foliagefieldcut cells are kept off the washes too
    // --foliagefieldwash f: the field cells get their own wash first (light before dark), f times the plan's mean colour
    // over them, in --foliagefieldgroups (2) value groups each with its own puddle. Dried before the trees' first wash.
    if (num('foliagefieldwash', 0) > 0 && M.field) {
      const dn = ctx.gaussian(Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, lumP[i]))), w, h, num('foliagefieldsq', 1.5)), ids = [];
      for (let i = 0; i < n; i++) if (M.field[i]) ids.push(i);
      const FGN = Math.max(1, Math.round(num('foliagefieldgroups', 2))), sorted = ids.map(i => dn[i]).sort((a, b) => a - b);
      for (let g = 0; g < FGN && ids.length >= 50; g++) {
        const lo = sorted[Math.floor(g / FGN * (sorted.length - 1))], hi = sorted[Math.min(sorted.length - 1, Math.floor((g + 1) / FGN * (sorted.length - 1)))];
        const cells = ids.filter(i => dn[i] >= lo && (g === FGN - 1 ? dn[i] <= hi : dn[i] < hi)), gm = new Uint8Array(n); for (const i of cells) gm[i] = 1;
        // --foliagefieldpan j, --foliagefieldpanx x (diagnostic): scale pan j (index into the plate's pans) by x in the puddle
        const mix = meanOver(A, cells).map((v, j) => v * num('foliagefieldwash', 0) * (j === Math.round(num('foliagefieldpan', -1)) ? num('foliagefieldpanx', 1) : 1));
        if (mix.reduce((a, b) => a + b, 0) < 0.02) continue;
        const gUp = new Uint8Array(WH); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) gUp[y * W2 + x] = gm[((y / SC) | 0) * w + ((x / SC) | 0)];
        const gp = washOf(gUp), gc = Math.max(1, Math.min(3, sweepCover(gp, gUp, W2, H2))), every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, gp.length))));
        for (const [kk, pts] of gp.entries()) {
          const R0 = Math.max(2, Math.round(Math.max(...pts.map(p => p.r))));
          const b = createBrush({ radius: R0, bristles: Math.max(12, Math.min(48, Math.ceil(R0 * 2))), capacity: 100, belly: 10, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.9, bridgeSoft: 2.6, seed: 9701 + kk + SEED + 37 * g });
          dip(b, { water: num('foliagefieldwater', 0.7), conc: mix.map(v => v * strength / gc) });
          clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q2 => { if (q2 % every === 0) clock('flow', () => step(sheet, O)); } }));
        }
        bookFoot(gp, [mix]); marksAll += gp.length;
        log(`foliage masks: field wash ${g + 1}: ${gp.length} sweeps over ${cells.length} cells, puddle [${mix.map(v => v.toFixed(2)).join(' ')}]`);
      }
      settle(); stage({ step: 'the hill: field bands', pass: 1 }); snap(); dryOff(); sheetLog('the field wash');
      // --foliagefieldseal 1: once the field wash is dry, seal its cells with masking fluid until the passage ends, so no
      // later wash or tier reaches them. --foliagefieldsealgrow g widens the seal by g plan cells.
      if (num('foliagefieldseal', 0) > 0) {
        const fm = num('foliagefieldsealgrow', 0) >= 1 && ctx.dilate ? ctx.dilate(M.field, w, h, Math.round(num('foliagefieldsealgrow', 0))) : M.field;
        // the plate's own masking fluid (the reserved lights) stays in the seal and is restored, with its own start, once
        // the seal is lifted (as sea.mjs does)
        const prev = sheet.resist, prevFrom = sheet.resistFrom, prevStr = sheet.resistStrength;
        const seal = new Uint8Array(W2 * H2); let c = 0;
        for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0), k = y * W2 + x; if ((fm[i] && !(M.holes && M.holes[i])) || (prev && prev[k])) { seal[k] = 1; c++; } }
        if (c) { ctx.applyResist(sheet, seal); fieldSealed = true; restoreSeal = () => { if (prev) { ctx.applyResist(sheet, prev, prevStr); sheet.resistFrom = prevFrom; } }; log(`foliage: ${c} sheet cells of the field bands sealed until the passage ends`); }
      }
    }
    // --foliagemaskbase b: one pale warm wash over the box less paper and the figure, so the light between the tiers is not
    // bare sheet. Its mix is the lightest 12% of what the plan wants there, times b (0: none). Dried before the first tier.
    if (num('foliagemaskbase', 0) > 0) {
      const fig = ctx.fwSubject || ctx.subject, bm = new Uint8Array(n), [bx0, by0, bx1, by1] = String(opt('foliagebox', '0,0,1,1')).split(',').map(Number);
      const ids = [], bMind = num('foliagefillmind', 0);
      const bDens = bMind > 0 && ctx.gaussian ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, lumP[i]))), w, h, 2) : null;
      for (let i = 0; i < n; i++) { const x = i % w, y = (i / w) | 0; if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue; if (M.holes && M.holes[i]) continue; if (fig && fig[i] > 0.5) continue; if (bDens && bDens[i] < bMind) continue; if (FIELD && FIELD[i]) continue; bm[i] = 1; ids.push(i); }
      ids.sort((a, b) => lumP[b] - lumP[a]);
      const top = ids.slice(0, Math.max(1, Math.round(ids.length * 0.12))), bmix = meanOver(A, top).map(v => v * num('foliagemaskbase', 0));
      if (bmix.reduce((a, b) => a + b, 0) > 0.02) {
        const bUp = new Uint8Array(WH); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) bUp[y * W2 + x] = bm[((y / SC) | 0) * w + ((x / SC) | 0)];
        const bp = washOf(bUp);
        if (num('foliagelogsheet', 0) > 1) { let mx0 = 1e9, my0 = 1e9, mx1 = -1, my1 = -1; for (let i = 0; i < WH; i++) if (bUp[i]) { const x = i % W2, y = (i / W2) | 0; mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y); } let px0 = 1e9, py0 = 1e9, px1 = -1, py1 = -1, rmax = 0, jump = 0; for (const pts of bp) { for (const q of pts) { px0 = Math.min(px0, q.x - q.r); px1 = Math.max(px1, q.x + q.r); py0 = Math.min(py0, q.y); py1 = Math.max(py1, q.y); rmax = Math.max(rmax, q.r); } for (let k = 1; k < pts.length; k++) jump = Math.max(jump, Math.abs(pts[k].x - pts[k - 1].x)); } log(`foliage debug first wash: mask box x ${mx0}..${mx1} y ${my0}..${my1}; path box x ${px0.toFixed(0)}..${px1.toFixed(0)} y ${py0.toFixed(0)}..${py1.toFixed(0)}; biggest radius ${rmax.toFixed(1)}; biggest sideways jump between rows ${jump.toFixed(1)}; sheet ${W2}x${H2}`); }
        const bc =Math.max(1, Math.min(3, sweepCover(bp, bUp, W2, H2))), every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, bp.length))));
        for (const [kk, pts] of bp.entries()) {
          const R0 = Math.max(2, Math.round(Math.max(...pts.map(p => p.r))));
          const b = createBrush({ radius: R0, bristles: Math.max(12, Math.min(48, Math.ceil(R0 * 2))), capacity: 100, belly: 10, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.9, bridgeSoft: 2.6, seed: 9501 + kk + SEED });
          dip(b, { water: 0.8, conc: bmix.map(v => v * strength / bc) });
          clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q2 => { if (q2 % every === 0) clock('flow', () => step(sheet, O)); } }));
        }
        marksAll += bp.length; log(`foliage masks: first wash in ${bp.length} sweeps over ${ids.length} cells`);
        settle(); stage({ step: 'the hill: first wash', pass: 1 }); snap(); dryOff(); sheetLog('the first wash');
      }
    }
    // --foliagefill f: a variegated first wash over the box less sky holes and the figure, in a cool and a warm group that
    // run together where they meet. Each puddle is the --foliagefillq (0.5) quantile of what the plan wants there, times f.
    // Dried before the first tier (0: off). --foliagefillgrow g widens the area by g cells so holes do not cut its edge.
    if (num('foliagefill', 0) > 0) {
      const fig = ctx.fwSubject || ctx.subject, [bx0, by0, bx1, by1] = String(opt('foliagebox', '0,0,1,1')).split(',').map(Number);
      const cool = ctx.gaussian ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => PXm[i * 3 + 2] - (PXm[i * 3] + PXm[i * 3 + 1]) / 2), w, h, 2) : null;
      let fillOk = null;
      let groups = [{ name: 'cool', m: new Uint8Array(n), ids: [] }, { name: 'warm', m: new Uint8Array(n), ids: [] }];
      const FG = Math.round(num('foliagefillgroups', 0)), FMIND = num('foliagefillmind', 0);
      if (FG < 2 && FMIND <= 0) {
        for (let i = 0; i < n; i++) {
          const x = i % w, y = (i / w) | 0; if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue; if (M.holes && M.holes[i]) continue; if (fig && fig[i] > 0.5) continue;
          const g = cool && cool[i] > -9 ? groups[0] : groups[1]; g.m[i] = 1; g.ids.push(i);
        }
      } else {
        // --foliagefillmind d: cells with blurred density under d are paper-like and get no fill. --foliagefillgroups g:
        // split the washed cells into g groups by local colour (k-means on density and two hue axes, then a majority
        // filter), each with its own puddle.
        const dens = ctx.gaussian ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, lumP[i]))), w, h, 2) : Float32Array.from({ length: n }, (_, i) => -Math.log(Math.max(0.02, lumP[i])));
        const hu1 = ctx.gaussian ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => (PXm[i * 3] - PXm[i * 3 + 1]) / 255), w, h, 2) : null;
        const hu2 = ctx.gaussian ? ctx.gaussian(Float32Array.from({ length: n }, (_, i) => (PXm[i * 3 + 2] - (PXm[i * 3] + PXm[i * 3 + 1]) / 2) / 255), w, h, 2) : null;
        const elig = []; const ok = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          const x = i % w, y = (i / w) | 0; if (x < bx0 * w || x > bx1 * w || y < by0 * h || y > by1 * h) continue; if (M.holes && M.holes[i]) continue; if (fig && fig[i] > 0.5) continue;
          if (dens[i] < FMIND || (FIELD && FIELD[i])) continue; ok[i] = 1; elig.push(i);
        }
        fillOk = ok;
        if (FG < 2) { const g = { name: 'all', m: ok, ids: elig }; groups = [g]; }
        else if (elig.length >= 200) {
          // features scaled so a 0.15 step in density, a 0.08 step in either hue axis count the same
          const feat = i => [dens[i] / 0.15, (hu1 ? hu1[i] : 0) / 0.08, (hu2 ? hu2[i] : 0) / 0.08];
          const F = elig.map(feat), cen = [F[Math.floor(rnd() * F.length)]];
          while (cen.length < FG) { let best = -1, bd = -1; for (let k = 0; k < F.length; k += 3) { let d = 1e9; for (const c of cen) d = Math.min(d, (F[k][0] - c[0]) ** 2 + (F[k][1] - c[1]) ** 2 + (F[k][2] - c[2]) ** 2); if (d > bd) { bd = d; best = k; } } cen.push(F[best].slice()); }
          const lab = new Int16Array(F.length);
          for (let it = 0; it < 10; it++) {
            const sum = cen.map(() => [0, 0, 0, 0]);
            for (let k = 0; k < F.length; k++) { let bi = 0, bd = 1e9; for (let c = 0; c < cen.length; c++) { const d = (F[k][0] - cen[c][0]) ** 2 + (F[k][1] - cen[c][1]) ** 2 + (F[k][2] - cen[c][2]) ** 2; if (d < bd) { bd = d; bi = c; } } lab[k] = bi; const s2 = sum[bi]; s2[0] += F[k][0]; s2[1] += F[k][1]; s2[2] += F[k][2]; s2[3]++; }
            for (let c = 0; c < cen.length; c++) if (sum[c][3]) cen[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
          }
          const L = new Int16Array(n).fill(-1); elig.forEach((i, k) => { L[i] = lab[k]; });
          // a majority filter (radius 2) so a group is made of bands and patches, not salt and pepper
          const L2 = Int16Array.from(L);
          for (const i of elig) { const x = i % w, y = (i / w) | 0, cnt = new Array(FG).fill(0); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const v = L[Y * w + X]; if (v >= 0) cnt[v]++; } let bi = L[i]; for (let c = 0; c < FG; c++) if (cnt[c] > cnt[bi]) bi = c; L2[i] = bi; }
          groups = cen.map((c, k) => ({ name: `g${k + 1}`, m: new Uint8Array(n), ids: [] }));
          for (const i of elig) { const g = groups[L2[i]]; g.m[i] = 1; g.ids.push(i); }
        } else groups = [];
      }
      for (const g of groups) {
        if (g.ids.length < 50) continue;
        const mix = new Array(K).fill(0), fq = num('foliagefillq', 0.5);
        for (let j = 0; j < K; j++) { const v = g.ids.map(i => A[i * K + j]).sort((a, b) => a - b); mix[j] = (v[Math.floor(Math.min(0.99, Math.max(0.01, fq)) * (v.length - 1))] || 0) * num('foliagefill', 0); }
        if (mix.reduce((a, b) => a + b, 0) < 0.02) { log(`foliage masks: fill ${g.name}: nothing wanted`); continue; }
        const gm = num('foliagefillgrow', 0) > 0 ? ctx.dilate(g.m, w, h, Math.round(num('foliagefillgrow', 0))) : g.m;
        const gUp = new Uint8Array(WH); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0); gUp[y * W2 + x] = gm[i] && !(M.holes && M.holes[i] && !g.m[i]) && (!fillOk || fillOk[i]) ? 1 : 0; }
        const gp = washOf(gUp), gc = Math.max(1, Math.min(3, sweepCover(gp, gUp, W2, H2))), every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, gp.length))));
        for (const [kk, pts] of gp.entries()) {
          const R0 = Math.max(2, Math.round(Math.max(...pts.map(p => p.r))));
          const b = createBrush({ radius: R0, bristles: Math.max(12, Math.min(48, Math.ceil(R0 * 2))), capacity: 100, belly: 10, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.9, bridgeSoft: 2.6, seed: 9601 + kk + SEED + (g.name === 'cool' ? 0 : g.name.startsWith('g') ? 70 * (+g.name.slice(1) || 1) : 500) });
          dip(b, { water: num('foliagefillwater', 0.8), conc: mix.map(v => v * strength / gc) });
          clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q2 => { if (q2 % every === 0) clock('flow', () => step(sheet, O)); } }));
        }
        bookFoot(gp, [mix]); marksAll += gp.length;
        log(`foliage masks: fill ${g.name}: ${gp.length} sweeps over ${g.ids.length} cells, puddle [${mix.map(v => v.toFixed(2)).join(' ')}]`);
      }
      settle(); stage({ step: 'the hill: variegated first wash', pass: 1 }); snap(); dryOff(); sheetLog('the fill');
    }
    // --foliagemaskclump c: clump radius c times the brush's, with more touches each (about 1.5 R/rb, 3 to 9), so a tier
    // is rows of clumps, not many small fragments. --foliagemaskmerge m: before cutting clumps, join near fragments
    // (closing by m times the tier's smallest clump radius) and drop pieces under pi (m rMin)^2.
    const CS = Math.max(1, num('foliagemaskclump', 1)), MG = Math.max(0, num('foliagemaskmerge', 0)), EDGE = Math.max(0, num('foliagemaskedge', 0));
    // --foliagedryfull 1: dry each tier with 30 flow steps, then a longer dry
    const dryTier = () => { if (num('foliagedryfull', 0) > 0) { clock('flow', () => { for (let q = 0; q < 30; q++) step(sheet, O); }); clock('dry', () => dry(sheet, 30000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) })); } else dryOff(); };
    if (CS > 1) for (const t of tiers) { t.rMin *= CS; t.rMax *= CS; }
    let dumpT = null;   // --foliagedumptiers file.png (debug): how many tier masks cover each cell, darker for more
    for (const [k, t] of tiers.entries()) {
      const R = residual(onSheet());
      // --foliagemaskopen 1: open each tier mask at the brush's own size, not the enlarged clump size, and skip a merge that
      // would empty a tier
      const OPEN = num('foliagemaskopen', 0) > 0, sRaw = Uint8Array.from(upTree, (v, i) => (v && LS[i] <= t.thr ? 1 : 0));
      let mS = clean(sRaw, k === 0 ? t.open : Math.max(t.open, t.rMin * 0.5 / (OPEN ? CS : 1)));
      if (MG > 0) {
        const rc = Math.max(1, Math.round(t.rMin * MG)), closed = erode(dilate(mS, W2, H2, rc), W2, H2, rc);
        const merged = ctx.removeSmall(Uint8Array.from(closed, (v, i) => (v && upTree[i] ? 1 : 0)), W2, H2, Math.round(Math.PI * rc * rc));
        if (!OPEN || merged.some(v => v)) mS = merged;
      }
      const stopS = Uint8Array.from(mS, (v, i) => (v && LS[i] > t.lo ? 1 : 0));
      if (opt('foliagedumptiers', '')) { dumpT = dumpT || new Uint8Array(WH); for (let i = 0; i < WH; i++) if (mS[i]) dumpT[i]++; }
      const clumps = placeClumps(mS, { rMin: t.rMin, rMax: t.rMax, spill: t.spill, cover: num('foliagemaskcover', 0.85) });
      if (!clumps.length) continue;
      const cellsOf = (c, onlyStop) => {
        const out = [], r = Math.max(1, Math.round(c.R / SC)), mx = Math.floor(c.x / SC), my = Math.floor(c.y / SC);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue; const X = mx + dx, Y = my + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !M[Y * w + X]) continue;
          const sI = (Math.min(H2 - 1, Y * SC + (SC >> 1))) * W2 + Math.min(W2 - 1, X * SC + (SC >> 1)); if (onlyStop ? stopS[sI] : mS[sI]) out.push(Y * w + X);
        }
        return out;
      };
      const stopCells = []; for (let i = 0; i < n; i++) if (M[i]) { const sI = Math.min(H2 - 1, ((i / w) | 0) * SC + (SC >> 1)) * W2 + Math.min(W2 - 1, (i % w) * SC + (SC >> 1)); if (stopS[sI]) stopCells.push(i); }
      const tierMix = meanOver(R, stopCells), CAP = num('foliagetiercap', 0), tierPlan = CAP > 0 && stopCells.length ? meanOver(A, stopCells) : null;
      const paths = [], mixes = [];
      if (k === 0) {
        // the light tier is a mass: a flat wash inside its mask, the clumps touched in while it is wet
        const inner = ctx.erode ? erode(mS, W2, H2, Math.max(1, Math.round(t.rMin * 0.9 / CS))) : mS;
        const wmix = tierMix.map(v => v * num('foliagemaskwash', 0.6) * loadM * t.thin);
        if (wmix.reduce((a, b) => a + b, 0) > 0.02) {
          const wp = washOf(inner);
          const wc = Math.max(1, Math.min(3, sweepCover(wp, inner, W2, H2))), every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, wp.length))));
          for (const [kk, pts] of wp.entries()) {
            const R0 = Math.max(2, Math.round(Math.max(...pts.map(p => p.r))));
            const b = createBrush({ radius: R0, bristles: Math.max(12, Math.min(48, Math.ceil(R0 * 2))), capacity: 100, belly: 10, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.7, bridge: 0.9, bridgeSoft: 2.6, seed: 9001 + kk + SEED });
            dip(b, { water: 0.7, conc: wmix.map(v => v * strength / wc) });
            clock('strokes', () => stroke(b, sheet, pts, { upright: false, flowEvery: every, between: q2 => { if (q2 % every === 0) clock('flow', () => step(sheet, O)); } }));
          }
          bookFoot(wp, [wmix]); marksAll += wp.length; log(`foliage masks: light wash in ${wp.length} sweeps`);
        }
      }
      let tm = 0, lastBand = null;
      const bandH = Math.max(8, t.rMax * 2) * Math.max(1, num('foliagemaskdryrows', 0) > 0 ? num('foliagemaskdryrows', 0) : 1);
      for (const c of clumps) {
        // --foliagemaskdryrows n: dry after each band of crowns n clump heights tall, so the next row goes on dry paper and
        // keeps hard edges (0: dry only once the whole tier is laid)
        if (num('foliagemaskdryrows', 0) > 0) { const bnd = Math.floor(c.y / bandH); if (lastBand !== null && bnd !== lastBand) { clock('flow', () => { for (let q = 0; q < 6; q++) step(sheet, O); }); dryOff(); } lastBand = bnd; }
        const near = cellsOf(c, true), cells = near.length >= 4 ? near : cellsOf(c, false);
        let mix = (cells.length ? meanOver(R, cells) : tierMix).map(v => v * loadM * t.thin * (k === 0 ? (1 - 0.0) : 1));
        // --foliagemaskedge e: a clump always lays at least e of what the plan wants over its cells (not only what the
        // sheet still lacks once washed), so its edge stands against the wash under it instead of melting into it
        if (EDGE > 0 && cells.length) { const pm = meanOver(A, cells); mix = mix.map((v, j) => Math.max(v, EDGE * pm[j] * loadM * t.thin)); }
        // --foliagetiercap f: a tier never lays more than f times what the plan wants in its own value band (tierPlan), per
        // pigment, so a light crown over a dark area stays light and each tier adds its own step (0: off)
        if (CAP > 0 && tierPlan) mix = mix.map((v, j) => Math.min(v, tierPlan[j] * CAP * PS * loadM));
        const b = createBrush({ radius: Math.max(1, Math.round(Math.min(t.rb, c.R * 0.6))), bristles: Math.max(8, Math.ceil(Math.min(t.rb, c.R * 0.6) * 2.5)), capacity: 60, belly: 6, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.07, stiffness: Math.max(2, Math.round(Math.min(t.rb, c.R * 0.6) * 0.5)), streak: 0.4, seed: 9100 + 131 * k + record.length + SEED });
        dip(b, { water: Math.min(0.9, t.water * num('foliagemaskwater', 1) * (0.85 + 0.3 * rnd())), conc: mix.map(v => v * strength * boost / covF * (0.85 + 0.3 * rnd())) });
        // --foliagemaskvary v: each clump's charge is scaled by 1 + v (2 rnd - 1), so neighbouring crowns differ and their
        // edges read (0: off)
        if (num('foliagemaskvary', 0) > 0) { const vs = 1 + num('foliagemaskvary', 0) * (2 * rnd() - 1); dip(b, { water: Math.min(0.9, t.water * num('foliagemaskwater', 1)), conc: mix.map(v => v * strength * boost / covF * vs) }); }
        for (const pts of clumpTouches(c.x, c.y, c.R, Math.min(t.rb, c.R * 0.6))) { clock('strokes', () => stroke(b, sheet, pts, { upright: false })); paths.push(pts); mixes.push(mix); tm++; }
        clock('flow', () => step(sheet, O));
        record.push({ tier: t.name, x_mm: +(c.x * mmCell).toFixed(1), y_mm: +(c.y * mmCell).toFixed(1), radius_mm: +(c.R * mmCell).toFixed(2) });
      }
      bookFoot(paths, mixes); marksAll += tm;
      used[`foliage tier ${t.name}`] = (used[`foliage tier ${t.name}`] || 0) + clumps.length;
      log(`foliage masks: tier ${k + 1} ${t.name}: lightness up to ${t.thr.toFixed(3)}, ${clumps.length} clumps, ${tm} touches, brush ${(t.rb * mmCell).toFixed(1)} mm`);
      // --foliagemasksettle n: flow steps after a tier before it is dried (default --settle, 60); fewer leave edges where laid
      if (num('foliagemasksettle', -1) >= 0) clock('flow', () => { for (let q = 0; q < num('foliagemasksettle', 0); q++) step(sheet, O); }); else settle();
      stage({ step: `the hill: ${t.name}`, pass: 2 + k }); snap(); dryTier(); sheetLog(`tier ${k + 1}`);
    }
    if (dumpT) { try { const sh = (await import('sharp')).default, o = Buffer.alloc(WH); for (let i = 0; i < WH; i++) o[i] = Math.min(255, 255 - dumpT[i] * 60); await sh(o, { raw: { width: W2, height: H2, channels: 1 } }).png().toFile(opt('foliagedumptiers', '')); } catch (e) { /* debug only */ } }
    used['foliage tier touches'] = (used['foliage tier touches'] || 0) + marksAll;
    log(`foliage masks: ${record.length} clumps, ${marksAll} marks in all (${(marksAll / Math.max(1, record.length)).toFixed(1)} a clump)`);
    try {
      const dir = ctx.outDir || '.'; fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'foliage-clumps.json'), JSON.stringify({ method: 'foliagemasks', marks: marksAll, clumps: record }, null, 1));
      fs.writeFileSync(path.join(dir, 'foliage-clumps.txt'), `Foliage tier plan: four value tiers over the tree cells (light, mid, dark, darkest), each a mask cut from the reference, covered with round clumps (2 to 3 crossing touches and rim lobes), laid from the top of the hill down, dried after each tier; the light tier is washed in flat first. ${record.length} clumps, ${marksAll} marks.\n` + record.map((c, i) => `${i + 1}: ${c.tier}, centre ${c.x_mm},${c.y_mm} mm, radius ${c.radius_mm} mm`).join('\n') + '\n');
    } catch (e) { log(`foliage masks: plan not saved: ${e.message}`); }
    return marksAll;
  };
  // --foliagelight c: a first pass of larger, paler touches over this share of the hill before the clumps (0: none)
  if (MASKS) await paintMasks();
  else if (CLUMPS) await paintClumps();
  else if (PL('light')) touches({ mm: PL('light').mm, coverShare: PL('light').cover, q: 0, water: PL('light').water, bridge: num('foliagebridge', 0.66), breakup: num('foliagebreakup', 1.4), load: PL('light').load, tag: 'light', pass: 1, seedBase: 9100 });
  else if (num('foliagelight', 0) > 0) touches({ mm: num('foliagelightmm', 2.4), coverShare: num('foliagelight', 0), q: 0, water: num('foliagelightwater', 0.6), bridge: num('foliagebridge', 0.66), breakup: num('foliagebreakup', 1.4), load: num('foliagelightload', 0.5), tag: 'light', pass: 1, seedBase: 9100 });
  if (!CLUMPS && !MASKS) touches({ mm: PL('mid') ? PL('mid').mm : num('foliagemm', 1.6), coverShare: PL('mid') ? PL('mid').cover : num('foliagecover', 0.75), q: num('foliageclumpq', 0.25), water: PL('mid') ? PL('mid').water : num('foliagewater', 0.52), bridge: num('foliagebridge', 0.66), breakup: num('foliagebreakup', 1.4), load: PL('mid') ? PL('mid').load : num('foliageload', FROMPLAN ? 0.8 : 0.9), tag: 'clumps', pass: 2, seedBase: 9300 });
  if (!CLUMPS && !MASKS) touches({ mm: PL('dark') ? PL('dark').mm : num('foliagedarkmm', 0.9), coverShare: PL('dark') ? PL('dark').cover : num('foliagedarkcover', 0.3), q: num('foliagedarkq', 0.7), water: PL('dark') ? PL('dark').water : num('foliagedarkwater', 0.42), bridge: num('foliagedarkbridge', 0.6), breakup: num('foliagedarkbreakup', 1.6), load: PL('dark') ? PL('dark').load : num('foliagedarkload', 1.0), tag: 'darks', pass: 3, seedBase: 9700 });

  // 4. scumble: a few dry strokes dragged across the slope for grit
  const NS = Math.round(num('foliagescumble', 6));
  if (NS > 0) {
    const R = residual(onSheet());
    const mix = quantileMix(R, M, 0.6, num('foliagescumbleload', 0.6));
    let x0 = W2, x1 = 0, y0 = H2, y1 = 0;
    for (let i = 0; i < n; i++) if (M[i]) { const x = (i % w) * SC, y = ((i / w) | 0) * SC; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const paths = [], rS = Math.max(2, (num('foliagescumblemm', 3) / mmCell));
    for (let k = 0; k < NS; k++) {
      const yy = y0 + (k + 0.3 + 0.4 * rnd()) / NS * (y1 - y0), tilt = (rnd() - 0.5) * 0.35, pts = [];
      for (let t = 0; t <= 16; t++) { const f = t / 16, x = x0 + f * (x1 - x0); const Y = yy + Math.tan(tilt) * (x - x0) + Math.sin(f * 7 + k) * rS * 0.4; if (upMask[Math.round(clampY(Y)) * W2 + Math.round(clampX(x))]) pts.push({ x: clampX(x), y: clampY(Y), r: rS, p: 0.55 + 0.25 * Math.sin(f * 5 + k) }); }
      if (pts.length >= 4) paths.push(pts);
    }
    paths.forEach((pts, k) => {
      const b = createBrush({ flat: true, radius: Math.round(rS), bristles: Math.max(10, Math.ceil(rS * 1.5)), capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.12, stiffness: 5, wetMix: 0, bridge: 0.36, bridgeSoft: 1.0, streak: 0.6, seed: 9900 + k + SEED });
      dip(b, { water: 0.2, conc: mix.map(v => v * strength) });
      clock('strokes', () => stroke(b, sheet, pts, { upright: false }));
    });
    if (paths.length) { bookFoot(paths, [mix]); used['foliage scumble'] = (used['foliage scumble'] || 0) + paths.length; log(`foliage: ${paths.length} dry scumbles`); settle(); stage({ step: 'the hill: dry scumble', pass: 4 }); snap(); }
  }
  if (sealed || fieldSealed) { clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) })); ctx.liftResist(sheet); log(`foliage: ${sealed ? 'sky holes' : ''}${sealed && fieldSealed ? ' and ' : ''}${fieldSealed ? 'field bands' : ''} unsealed`); if (fieldSealed) restoreSeal(); snap(); }
}
