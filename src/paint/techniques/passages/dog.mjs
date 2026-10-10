// Technique for a dark-coated dog: one dark mass laid wet on dry short of the silhouette, short outward flicks that
// draw the coat's edge, dry-brush paper flecks on the lit side, a few lights kept at the eye and muzzle, curl hooks,
// and a soft grey on the sand beside it.
//
// Flags, all read with ctx.num, all prefixed dog:
//   --dogerode 1.2      the mass is laid inside the segment eroded by this many cells; the flicks cross the rest
//   --dogquant 0.82     the mass is charged at this quantile of what the region still wants, --dogload 1.0 of it
//   --dogradius 0.28    the round brush, as a share of the region's inradius
//   --dogwater 0.42     the mass's water on the shaded side (wet on dry)
//   --dogdrywater 0.38  water on the lit side, with --dogbreakup 1.9, where the tooth should show
//   --dogchunk 5        recharge every this many sixths of the brush radius, at the local want
//   --dogflicks 1       the edge pass on or off; --dogflickgap 2 cells between two flicks' roots
//   --dogflickin 3.4    how far inside the boundary a flick starts, --dogflickout 4.0 how far outside it ends
//   --dogcurlyshare .28 this share of flicks run out --dogcurlyout 9 cells instead, as long hooks
//   --dogscatter 0.95   radians of scatter about the local outward normal, --dogbend 0.30 radians per cell of hook
//   --doglift 1         the dry-brush breakup over the lit side, lifted out of the damp mass
//   --doglit 0.42       where the lit side starts, as a share of the region's width from its left
//   --dogcurls 16       curl hooks over the dry mass
//   --dogshadow 0.16    the grey on the sand beside the dog, in OD
//   --doglights 4       how many of the palest cells in the head (--doghead 0.45 of its height) stay paper

export const when = 'shapes';

const TAU = Math.PI * 2;

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, PIGS, K, A, expected, used, O, SEED, UPRIGHT, seg,
    thickness, gaussian, components, dilate, erode, distanceToZero,
    createBrush, dip, stroke, step, dry, containPaths, brushedWashPaths, washPaths, sweepCover,
    clock, snap, stage, num, log,
  } = ctx;

  const region = seg && seg.regions ? seg.regions.find(r => r.name === 'dog') : null;
  if (!region || !region.area) { log('dog: the segments carry no dog, nothing to paint'); return; }
  const DOG = Uint8Array.from(region.mask);

  let s = (Math.round(SEED) + 4703) | 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const up = m => {
    if (SC === 1) return m instanceof Uint8Array ? m : Uint8Array.from(m);
    const o = new Uint8Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) o[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)];
    return o;
  };
  const upF = f => {
    if (SC === 1) return f instanceof Float32Array ? f : Float32Array.from(f);
    const o = new Float32Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) o[y * W2 + x] = f[((y / SC) | 0) * w + ((x / SC) | 0)];
    return o;
  };
  const flowEvery = sweeps => Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, sweeps))));
  // what the sheet already holds, at the plan's grid, in the wash pigments
  const onSheet = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    return on;
  };
  const book = (mask, mix) => { for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) expected[i * K + j] += mix[j]; };
  const count = (name, k) => { used[name] = (used[name] || 0) + k; };
  const settle = q => clock('flow', () => { for (let t = 0; t < q; t++) step(sheet, O); });
  // pressure along a sweep: ramps in, peaks mid-stroke, ramps out
  const shaped = pts => {
    const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
    let run = 0;
    return pts.map((p, i) => {
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const u = run / total;
      return { ...p, p: Math.max(0.2, Math.min(1, (0.74 + 0.26 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / 0.06), Math.min(1, (1 - u) / 0.10)))) };
    });
  };

  // the region's box and centroid, in plan cells; light is assumed from the right
  let x0 = w, y0 = h, x1 = 0, y1 = 0, cx = 0, cy = 0, area = 0;
  for (let i = 0; i < n; i++) if (DOG[i]) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    cx += x; cy += y; area++;
  }
  cx /= area; cy /= area;
  const litFrom = x0 + (x1 - x0) * num('doglit', 0.42);

  // the plan's total density over all pigments
  const PLAN = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; PLAN[i] = t; }

  // A few tiny lights kept as paper so the head reads (eye, muzzle). Searched in the head only:
  // the palest cells of the whole segment tend to sit on the lit flank.
  const head = num('doghead', 0.45);
  const inner = erode(DOG, w, h, 3);
  const LIGHTS = new Uint8Array(n);
  {
    const vals = []; for (let i = 0; i < n; i++) if (inner[i] && ((i / w) | 0) <= y0 + head * (y1 - y0)) vals.push(PLAN[i]);
    vals.sort((a, b) => a - b);
    const cut = vals.length ? vals[Math.floor(Math.min(0.4, Math.max(0.005, num('doglightq', 0.05))) * (vals.length - 1))] : 0;
    const raw = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (inner[i] && ((i / w) | 0) <= y0 + head * (y1 - y0) && PLAN[i] <= cut) raw[i] = 1;
    const { labels, areas, count: cnt } = components(raw, w, h);
    const keep = [];
    for (let id = 1; id <= cnt; id++) if (areas[id] >= num('doglightmin', 3)) keep.push(id);
    keep.sort((a, b) => areas[b] - areas[a]);
    const top = new Set(keep.slice(0, Math.round(num('doglights', 4))));
    for (let i = 0; i < n; i++) if (top.has(labels[i])) LIGHTS[i] = 1;
    log(`dog: ${top.size} lights kept as paper inside the mass (eye, muzzle), ${keep.length} found`);
    // A wet mass flows into unpainted cells, so the lights go under a frisket, merged with any existing one.
    // It stays on; the plate lifts the frisket once at the end.
    if (num('doglightmask', 1) > 0 && top.size) {
      const here = up(LIGHTS), was = sheet.resist;
      const both = new Uint8Array(N2);
      for (let i = 0; i < N2; i++) both[i] = here[i] || (was && was[i]) ? 1 : 0;
      ctx.applyResist(sheet, both);
    }
  }

  // 1. the mass
  const er = Math.max(0, num('dogerode', 1.2));
  const CORE = er > 0 ? erode(DOG, w, h, er) : DOG;
  const BODY = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (CORE[i] && !LIGHTS[i]) BODY[i] = 1;
  let bodyArea = 0; for (let i = 0; i < n; i++) bodyArea += BODY[i];
  if (!bodyArea) { log('dog: the eroded region is empty'); return; }

  const on = onSheet();
  const WANT = new Float32Array(n);      // what the dog still wants, all pigments, per cell
  for (let i = 0; i < n; i++) if (DOG[i]) { let t = 0; for (let j = 0; j < K; j++) t += Math.max(0, A[i * K + j] - on[i * K + j]); WANT[i] = t; }
  const q = Math.min(0.98, Math.max(0.5, num('dogquant', 0.82)));
  const mix = new Array(K).fill(0);
  for (let j = 0; j < K; j++) {
    const v = []; for (let i = 0; i < n; i++) if (BODY[i]) v.push(Math.max(0, A[i * K + j] - on[i * K + j]));
    v.sort((a, b) => a - b);
    mix[j] = (v[Math.floor(q * (v.length - 1))] ?? 0) * num('dogload', 1.0);
  }
  if (mix.reduce((a, b) => a + b, 0) < 0.05) { log('dog: the sheet already holds the dog'); return; }
  let meanWant = 0; for (let i = 0; i < n; i++) if (BODY[i]) meanWant += WANT[i];
  meanWant = Math.max(1e-4, meanWant / bodyArea);

  const M2 = up(BODY), dist = distanceToZero(M2, W2, H2);
  let rIn = 0; for (let i = 0; i < N2; i++) if (dist[i] > rIn) rIn = dist[i];
  const RAD = Math.max(2 * SC, Math.round(num('dogradius', 0.28) * rIn));
  const field = upF(WANT);
  let paths = brushedWashPaths(M2, W2, H2, {
    pad: num('dogpad', 0.6) * SC, minRadius: SC, minLength: 3 * SC, maxRadius: RAD,
    field, seed: 61 + SEED, overlap: num('dogoverlap', 0.25), walk: true,
  });
  paths = containPaths(paths, dist, W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: num('dogslack', 0.35) * SC });
  if (!paths.length) { log('dog: no stroke fits inside the mass'); return; }

  const cover = Math.max(1, sweepCover(paths, M2, W2, H2));
  const CAL = num('dogcal', 1.08);           // wet-on-dry charge factor from the calibration
  const STRENGTH = num('strength', 2.2);
  const base = mix.map(v => v * STRENGTH * CAL / cover);
  const every = flowEvery(paths.length);
  const chunkLen = Math.max(2, num('dogchunk', 5) * RAD / 6);
  const atWant = p => {
    const sx = Math.min(w - 1, Math.max(0, Math.round(p.x / SC))), sy = Math.min(h - 1, Math.max(0, Math.round(p.y / SC)));
    return WANT[sy * w + sx];
  };
  log(`dog: the mass, ${paths.length} strokes with a round brush of radius ${RAD}, puddle [${mix.map(v => v.toFixed(2)).join(' ')}], cover ${cover.toFixed(2)}`);
  let dryStrokes = 0;
  for (const raw of paths) {
    const pts = shaped(raw);
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length / SC;
    const lit = mx > litFrom;                 // the lit side: a drier brush, so the tooth shows through the black
    if (lit) dryStrokes++;
    const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
    const brush = createBrush({
      radius: r, bristles: Math.max(8, Math.ceil(r * 2)), capacity: 60, belly: 6, feed: 0.25, give: 0.85,
      free: 0.4, film: 0.25, splay: 0.05, stiffness: 6,
      wetMix: lit ? 0.3 : 0.5, bridge: lit ? 0.5 : 0.78, bridgeSoft: lit ? 1.3 : 2.0,
      breakup: lit ? num('dogbreakup', 1.9) : 1.5, grainShift: num('doggrainshift', 2),
      seed: 71 + dryStrokes + SEED,
    });
    const water = lit ? num('dogdrywater', 0.38) : num('dogwater', 0.42);
    const load = base.map(v => v * (lit ? num('dogdrymul', 1.25) : 1));
    // recharged every few cells at the local want, so the darkest parts get the most paint; one flat puddle reads as a blob
    const chunks = []; let d = 0;
    for (let k = 0; k < pts.length; k++) {
      if (k) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      if (!chunks.length || d >= chunkLen) { chunks.push([]); d = 0; if (k) chunks[chunks.length - 1].push(pts[k - 1]); }
      chunks[chunks.length - 1].push(pts[k]);
    }
    const f = chunks.map(ch => Math.max(num('dogchunkmin', 0.5), Math.min(num('dogchunkmax', 1.8), ch.reduce((a, p) => a + atWant(p), 0) / ch.length / meanWant)));
    const fmean = f.reduce((a, b) => a + b, 0) / f.length || 1;
    clock('strokes', () => chunks.forEach((ch, k) => {
      dip(brush, { water, conc: load.map(v => v * f[k] / fmean) });
      stroke(brush, sheet, ch, { upright: UPRIGHT, flowEvery: every, between: t => { if (t % every === 0) clock('flow', () => step(sheet, O)); } });
    }));
  }
  settle(num('dogsettle', 30));
  // booked over the whole segment, not only the mass: the value ladder's --skipheld reads this ledger,
  // and a gap at the rim would let it glaze over the edge and flecks
  book(DOG, mix);
  count('dog mass', paths.length);
  stage({ step: 'the dog laid as one mass, wet on dry', brush: RAD, strokes: paths.length, dry: dryStrokes });
  snap();

  // 2. the coat's edge: short outward flicks of a drier brush across the boundary, along the outward normal with scatter.
  // Laid while the mass is damp, so a flick's root melts in and its tip dries crisp.
  if (num('dogflicks', 1) > 0) {
    const dIn = distanceToZero(DOG, w, h);                        // distance from an inside cell to the outside
    const S = gaussian(Float32Array.from(DOG), w, h, num('dogsmooth', 1.6));
    const edge = [];
    for (let i = 0; i < n; i++) if (DOG[i] && dIn[i] <= 1.6) edge.push(i);
    // sorted by angle round the centroid, so the frames travel round the silhouette instead of scanning rows
    edge.sort((a, b) => Math.atan2(((a / w) | 0) - cy, (a % w) - cx) - Math.atan2(((b / w) | 0) - cy, (b % w) - cx));
    const gap = Math.max(1, num('dogflickgap', 2));
    const taken = new Uint8Array(n);
    const flicks = [];
    const inLen = num('dogflickin', 3.4), outLen = num('dogflickout', 4.0);
    for (const i of edge) {
      if (taken[i]) continue;
      const px = i % w, py = (i / w) | 0;
      for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && dx * dx + dy * dy <= gap * gap) taken[yy * w + xx] = 1;
      }
      if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
      let gx = (S[i + 1] - S[i - 1]) / 2, gy = (S[i + w] - S[i - w]) / 2;   // points into the dog
      const gm = Math.hypot(gx, gy);
      if (gm < 1e-4) { gx = px - cx; gy = py - cy; } else { gx = -gx / gm; gy = -gy / gm; }   // outward
      const m = Math.hypot(gx, gy) || 1; gx /= m; gy /= m;
      // a share are long hooks: run further out and turned harder, so the edge carries curls and not only stubble
      const hook = rnd() < num('dogcurlyshare', 0.28);
      const scale = 0.55 + 0.95 * rnd();
      const li = inLen * scale, lo = (hook ? num('dogcurlyout', 9) : outLen) * scale, total = li + lo;
      const a0 = Math.atan2(gy, gx) + (rnd() - 0.5) * num('dogscatter', 0.95);
      const bend = (hook ? (rnd() < 0.5 ? -1 : 1) * (0.7 + 0.6 * rnd()) : (rnd() - 0.5) * 2) * num('dogbend', 0.30);
      const stepLen = Math.max(0.5, num('dogflickstep', 0.8));
      const tipR = num('dogflicktip', 0.45), rootR = num('dogflickr', 1.2);
      let x = px - Math.cos(a0) * li, y = py - Math.sin(a0) * li, a = a0;
      const pts = [];
      for (let t = 0; t <= total + 1e-6; t += stepLen) {
        const u = Math.min(1, t / total);
        if (x < 0 || y < 0 || x > w - 1 || y > h - 1) break;
        pts.push({ x: (x + 0.5) * SC, y: (y + 0.5) * SC, r: SC * (rootR + (tipR - rootR) * u), p: Math.max(0.1, 1 - 0.9 * Math.pow(u, 1.1)) });
        a += bend * stepLen;
        x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen;
      }
      if (pts.length >= 3) flicks.push(pts);
    }
    if (flicks.length) {
      const fEvery = flowEvery(flicks.length);
      const fmix = mix.map(v => v * num('dogflickstrength', 1.25));
      const brush = createBrush({
        radius: SC * num('dogflickr', 1.2), bristles: Math.max(6, Math.round(4 * SC * num('dogflickr', 1.2))),
        capacity: 30, belly: 3, feed: 0.3, give: 0.85, free: 0.45, film: 0.28, splay: 0.09, stiffness: 3,
        wetMix: 0.15, bridge: 0.62, bridgeSoft: 1.5, breakup: num('dogflickbreakup', 1.3), streak: 0.5,
        seed: 137 + SEED,
      });
      let k = 0;
      clock('strokes', () => { for (const pts of flicks) {
        dip(brush, { water: num('dogflickwater', 0.34), conc: fmix.map(v => v * STRENGTH * CAL) });
        stroke(brush, sheet, pts, { upright: false, flowEvery: fEvery, between: t => { if (t % fEvery === 0) clock('flow', () => step(sheet, O)); } });
        k++;
      } });
      settle(30);
      // booked over the band the flicks cross, at a share of the puddle: they are line, not a wash
      const band = new Uint8Array(n);
      const grown = dilate(DOG, w, h, Math.round(outLen));
      const shrunk = erode(DOG, w, h, Math.round(inLen));
      for (let i = 0; i < n; i++) if (grown[i] && !shrunk[i]) band[i] = 1;
      book(band, mix.map(v => v * num('dogflickbook', 0.45)));
      count('dog edge flick', flicks.length);
      log(`dog: ${flicks.length} flicks of a drier brush across the silhouette, ${inLen.toFixed(1)} cells in to ${outLen.toFixed(1)} out`);
      stage({ step: 'the coat: flicks outward all round the edge', flicks: flicks.length });
      snap();
    }
  }

  // 3. a thirsty brush dragged over the damp lit side lifts paint off the tooth, leaving paler flecks.
  // Dragged along the form, because scattered single cells read as dust.
  if (num('doglift', 1) > 0) {
    const LIT = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (BODY[i] && (i % w) > litFrom) LIT[i] = 1;
    const L2 = up(LIT), ldist = distanceToZero(L2, W2, H2);
    let lp = brushedWashPaths(L2, W2, H2, {
      pad: 0.6 * SC, minRadius: SC, minLength: 4 * SC, maxRadius: Math.max(SC, Math.round(num('dogliftr', 2.2) * SC)),
      field, seed: 211 + SEED, overlap: num('dogliftgap', -0.9), walk: true,
    });
    lp = containPaths(lp, ldist, W2, H2, { minRadius: 0.6 * SC, minLength: 3 * SC, slack: 0.2 * SC });
    if (lp.length) {
      const lEvery = flowEvery(lp.length);
      const brush = createBrush({
        radius: Math.max(SC, Math.round(num('dogliftr', 2.2) * SC)), bristles: Math.max(6, Math.round(3 * num('dogliftr', 2.2) * SC)),
        capacity: 30, belly: 2, feed: 0.15, give: 0.6, free: 0.55, film: 0.2, splay: 0.12, stiffness: 3,
        wetMix: 0, bridge: num('dogliftbridge', 0.22), bridgeSoft: 0.7, breakup: num('dogliftbreakup', 3.4), streak: 0.6,
        seed: 307 + SEED,
      });
      clock('strokes', () => { for (const raw of lp) {
        const pts = raw.map(p => ({ ...p, p: Math.max(0.25, Math.min(0.7, 0.45 + 0.25 * Math.sin(p.x / (3 * SC)))) }));
        dip(brush, { water: num('dogliftwater', 0.12), conc: new Array(K).fill(0) });
        stroke(brush, sheet, pts, { upright: UPRIGHT, flowEvery: lEvery, between: t => { if (t % lEvery === 0) clock('flow', () => step(sheet, O)); } });
      } });
      settle(30);
      count('dog dry-brush breakup', lp.length);
      log(`dog: ${lp.length} thirsty drags over the lit side, lifting the tooth back out of the damp black`);
      stage({ step: 'dry brush over the lit side: paper flecks through the black', drags: lp.length });
      snap();
    }
  }

  clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));

  // 4. curl hooks on the dry mass, only where it is not already near black (where a curl would not show)
  const curls = Math.round(num('dogcurls', 16));
  if (curls > 0) {
    const darkest = PIGS.map((p, j) => [j, p.K[0] + p.K[1] + p.K[2]]).sort((a, b) => b[1] - a[1])[0][0];
    const mid = erode(DOG, w, h, 2);
    const vals = []; for (let i = 0; i < n; i++) if (mid[i]) vals.push(PLAN[i]);
    vals.sort((a, b) => a - b);
    const hi = vals.length ? vals[Math.floor(0.72 * (vals.length - 1))] : 0;
    const spots = [];
    for (let i = 0; i < n; i++) if (mid[i] && !LIGHTS[i] && PLAN[i] < hi) spots.push(i);
    const picks = [], taken = new Uint8Array(n), sep = Math.max(3, Math.round(num('dogcurlgap', 7)));
    for (let t = 0; t < spots.length * 4 && picks.length < curls; t++) {
      const i = spots[Math.floor(rnd() * spots.length)];
      if (!i || taken[i]) continue;
      const px = i % w, py = (i / w) | 0;
      for (let dy = -sep; dy <= sep; dy++) for (let dx = -sep; dx <= sep; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) taken[yy * w + xx] = 1;
      }
      picks.push(i);
    }
    const hooks = [];
    for (const i of picks) {
      const px = i % w, py = (i / w) | 0;
      const len = num('dogcurllen', 7) * (0.6 + 0.8 * rnd()), sense = rnd() < 0.5 ? -1 : 1;
      const radius = num('dogcurlradius', 2.6) * (0.7 + 0.7 * rnd());
      let a = rnd() * TAU, x = px, y = py;
      const pts = [];
      for (let t = 0; t <= len; t += 0.8) {
        if (x < 1 || y < 1 || x > w - 2 || y > h - 2 || !DOG[Math.round(y) * w + Math.round(x)]) break;
        const u = t / len;
        pts.push({ x: (x + 0.5) * SC, y: (y + 0.5) * SC, r: SC * num('dogcurlr', 0.85), p: Math.max(0.2, 1 - 0.7 * u) });
        a += (sense * 0.8) / radius;
        x += Math.cos(a) * 0.8; y += Math.sin(a) * 0.8;
      }
      if (pts.length >= 3) hooks.push(pts);
    }
    if (hooks.length) {
      const brush = createBrush({
        radius: SC * num('dogcurlr', 0.85), bristles: 6, capacity: 20, belly: 2, feed: 0.3, give: 0.8,
        free: 0.5, film: 0.3, splay: 0.06, stiffness: 2, wetMix: 0, bridge: 0.5, bridgeSoft: 1.0, breakup: 1.6,
        seed: 409 + SEED,
      });
      const conc = new Array(K).fill(0);
      conc[darkest] = num('dogcurlconc', 0.55) * STRENGTH * CAL;
      clock('strokes', () => { for (const pts of hooks) { dip(brush, { water: num('dogcurlwater', 0.3), conc }); stroke(brush, sheet, pts, { upright: false }); } });
      settle(20);
      count('dog curl', hooks.length);
      log(`dog: ${hooks.length} curl hooks over the dry mass`);
      stage({ step: 'curls over the dry mass', hooks: hooks.length });
      snap();
    }
  }

  // 5. the grey on the sand beside it
  const shade = num('dogshadow', 0.16);
  if (shade > 0) {
    const sand = seg.regions.find(r => r.name === 'sand');
    if (sand) {
      const reach = Math.max(2, Math.round(num('dogshadowreach', 11)));
      const grown = dilate(DOG, w, h, reach), touch = dilate(DOG, w, h, 1);
      const dir = num('dogshadowdir', 1);
      const SH = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (!grown[i] || touch[i] || !sand.mask[i]) continue;
        if (dir > 0 ? (i % w) < cx : (i % w) > cx) continue;
        if (((i / w) | 0) < cy - (y1 - y0) * 0.35) continue;       // beside and below the dog, not above its shoulders
        SH[i] = 1;
      }
      let shArea = 0; for (let i = 0; i < n; i++) shArea += SH[i];
      if (shArea > 20) {
        const S2 = up(SH), sdist = distanceToZero(S2, W2, H2);
        let sp = washPaths(S2, W2, H2, { pad: 0.5 * SC, minRadius: 0.6 * SC, minLength: 3 * SC });
        sp = containPaths(sp, sdist, W2, H2, { minRadius: 0.6 * SC, minLength: 2 * SC, slack: 0.2 * SC });
        if (sp.length) {
          // the residual mix beside the dog, at its 0.6 quantile
          const on2 = onSheet(), smix = new Array(K).fill(0);
          for (let j = 0; j < K; j++) {
            const v = []; for (let i = 0; i < n; i++) if (SH[i]) v.push(Math.max(0, A[i * K + j] - on2[i * K + j]));
            v.sort((a, b) => a - b);
            smix[j] = (v[Math.floor(0.6 * (v.length - 1))] ?? 0);
          }
          const top = Math.max(...smix, 1e-6);
          // below the floor the residual is too weak to use: mix the most neutral pigment at --dogshadow depth
          if (top < num('dogshadowfloor', 0.05)) {
            for (let j = 0; j < K; j++) smix[j] = 0;
            const grey = PIGS.map((p, j) => [j, (Math.max(...p.K) - Math.min(...p.K)) / ((p.K[0] + p.K[1] + p.K[2]) / 3)]).sort((a, b) => a[1] - b[1])[0][0];
            smix[grey] = shade;
          } else for (let j = 0; j < K; j++) smix[j] *= shade / top;
          const scover = Math.max(1, sweepCover(sp, S2, W2, H2)), sEvery = flowEvery(sp.length);
          clock('strokes', () => { for (const raw of sp) {
            const pts = shaped(raw).map(p => ({ ...p, p: p.p * 0.7 }));
            const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
            const brush = createBrush({
              radius: r, bristles: Math.max(10, Math.ceil(r * 2)), capacity: 60, belly: 8, feed: 0.35, give: 0.9,
              free: 0.4, film: 0.25, splay: 0.03, stiffness: 6, wetMix: 0.5, bridge: 0.8, bridgeSoft: 2.6, breakup: 1.2,
              seed: 503 + SEED,
            });
            dip(brush, { water: 0.62, conc: smix.map(v => v * STRENGTH * CAL / scover) });
            stroke(brush, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: sEvery, between: t => { if (t % sEvery === 0) clock('flow', () => step(sheet, O)); } });
          } });
          settle(40);
          book(SH, smix);
          count('dog shadow', sp.length);
          log(`dog: the shadow on the sand, ${sp.length} strokes over ${(100 * shArea / n).toFixed(1)}% of the sheet, puddle [${smix.map(v => v.toFixed(2)).join(' ')}]`);
          stage({ step: 'a soft grey on the sand beside the dog', strokes: sp.length });
          snap();
        }
      }
    }
  }
}
