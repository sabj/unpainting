// For a sea band (--passages sea): one graded wet wash of a mixed blue-grey in long horizontal sweeps into pre-wetted
// paper, with the foam line reserved in masking fluid along the sea and sand boundary. Once dry, a broken line under
// the far shore and a few dry-brush drags of deeper blue break on the tooth into streaks.
export const when = 'washes';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// the quantile of a field over a mask, which is how a painter reads a puddle: not the mean of the passage but the
// tone most of it sits at
function quantileOver(field, mask, q, keep) {
  const v = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] && (!keep || keep[i])) v.push(field[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.floor(clamp(q, 0, 1) * (v.length - 1))] ?? 0;
}

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, PIGS, K, A, expected, used, O, SEED, UPRIGHT,
    seg, subject, thickness, gaussian, dilate,
    createBrush, dip, stroke, step, dry, applyResist, liftResist,
    mopLanes, sweepCover, clock, snap, stage, opt, num, log,
  } = ctx;

  if (!seg) { log('sea: no segments for this source, nothing to paint'); return; }
  const region = seg.regions.find(r => r.name === 'sea');
  if (!region || !region.area) { log('sea: this source has no sea'); return; }

  const up = mask => {
    if (SC === 1) return mask instanceof Uint8Array ? mask : Uint8Array.from(mask);
    const m = new Uint8Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = mask[((y / SC) | 0) * w + ((x / SC) | 0)];
    return m;
  };
  let rs = ((SEED * 7919 + 1013) % 2147483647) || 7;
  const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;

  // what the picture still wants over the sea, read off the sheet as the mop reads it
  const th = thickness(sheet), on = new Float32Array(n * K);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
    for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
  }
  const R = Array.from({ length: K }, (_, j) => Float32Array.from({ length: n }, (_, i) => Math.max(0, A[i * K + j] - on[i * K + j])));
  // seen at the brush's scale: a wash cannot lay a ripple and is not asked to
  const B = R.map(r => gaussian(r, w, h, Math.max(1, num('seablur', 3))));

  // the region, less the subject and less the paper the picture keeps
  const BASE = Uint8Array.from(region.mask);
  const MASK = Uint8Array.from(BASE);
  if (subject) for (let i = 0; i < n; i++) if (subject[i] > 0.5) MASK[i] = 0;
  const PAPERFLOOR = num('seapaper', 0.05);
  for (let i = 0; i < n; i++) if (MASK[i]) { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; if (s < PAPERFLOOR) MASK[i] = 0; }
  let area = 0; for (let i = 0; i < n; i++) area += MASK[i];
  if (area < 40) { log('sea: the band is too small to wash'); return; }

  // how deep into the band a point lies, per column, so the wash can be charged heavier at the far edge and let out
  // towards the shallows whatever the band's tilt
  const yTop = new Int32Array(w).fill(-1), yBot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (BASE[y * w + x]) { if (yTop[x] < 0) yTop[x] = y; yBot[x] = y; }
  for (let x = 1; x < w; x++) if (yTop[x] < 0 && yTop[x - 1] >= 0) { yTop[x] = yTop[x - 1]; yBot[x] = yBot[x - 1]; }
  for (let x = w - 2; x >= 0; x--) if (yTop[x] < 0 && yTop[x + 1] >= 0) { yTop[x] = yTop[x + 1]; yBot[x] = yBot[x + 1]; }
  const depthAt = (px, py) => {
    const x = clamp(Math.round(px / SC), 0, w - 1);
    if (yTop[x] < 0) return 0.5;
    return clamp((py / SC - yTop[x]) / Math.max(1, yBot[x] - yTop[x]), 0, 1);
  };

  // The foam: a broken masking-fluid reserve along the sea|sand boundary. Fluid, not brushing round it, because a wet
  // wash creeps into any gap left dry.
  const FW = num('seafoam', 3.0);
  const FOAM = new Uint8Array(n);
  const shore = (seg.contours?.boundaries || []).filter(b => (b.between || []).includes('sea') && (b.between || []).includes('sand'));
  const ph = { a: 6.283 / Math.max(2, num('seafoamdash', 11)), b: 6.283 / Math.max(2, num('seafoamdash', 11) * 0.41), p1: rnd() * 6.283, p2: rnd() * 6.283 };
  const thr = clamp(num('seafoamgap', 0.30), 0, 0.9) * 0.9;  // the share of the line the wash is allowed to close over
  let foamRun = 0;
  for (const b of shore) {
    const pts = b.points || [];
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (!(len > 0)) continue;
      for (let d = 0; d <= len; d += 0.5) {
        foamRun += 0.5;
        const t = foamRun;
        const v = 0.5 + 0.30 * Math.sin(t * ph.a + ph.p1) + 0.20 * Math.sin(t * ph.b + ph.p2);
        if (v < thr) continue;                       // here the wash runs over the shore and no foam shows
        const r = FW * (0.55 + 0.75 * (v - thr) / Math.max(0.05, 1 - thr));
        const cx = x0 + dx * (d / len), cy = y0 + dy * (d / len) - num('seafoamup', 0.5);
        const ri = Math.ceil(r);
        for (let oy = -ri; oy <= ri; oy++) for (let ox = -ri; ox <= ri; ox++) {
          if (ox * ox + oy * oy > r * r) continue;
          const x = Math.round(cx) + ox, y = Math.round(cy) + oy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          FOAM[y * w + x] = 1;
        }
      }
    }
  }
  let foamCells = 0; for (let i = 0; i < n; i++) foamCells += FOAM[i];

  // the frisket the sheet already carries is kept: the foam goes on beside it, and the sheet's own mask is put back
  // when this wash is lifted, so the lights it reserves still come off at the end
  const prevResist = sheet.resist, prevFrom = sheet.resistFrom;
  const merged = new Uint8Array(N2), F2 = up(FOAM);
  for (let c = 0; c < N2; c++) merged[c] = (F2[c] || (prevResist && prevResist[c])) ? 1 : 0;
  // --seascrub: earlier washes already cover the shore, so the foam cells are lifted back to paper (every dried layer),
  // as if the fluid had been there before the first wash. 0 reserves from this wash on only.
  if (foamCells && opt('seascrub', '1') !== '0') {
    const savedR = sheet.resist, savedF = sheet.resistFrom;
    sheet.resist = F2; sheet.resistFrom = 0;
    liftResist(sheet);
    sheet.resist = savedR; sheet.resistFrom = savedF;
  }
  const restore = () => { if (prevResist) { applyResist(sheet, prevResist); sheet.resistFrom = prevFrom; } };
  if (foamCells) applyResist(sheet, merged);
  stage({ step: 'sea: foam reserved', cells: foamCells });
  snap();

  // the puddle: one mixed colour for the whole band
  const PAINTED = Uint8Array.from({ length: n }, (_, i) => { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; return s >= PAPERFLOOR ? 1 : 0; });
  const q = clamp(num('seaquant', 0.55), 0.05, 0.95), load = num('seaload', 1.0);
  const mix = new Array(K).fill(0);
  for (let j = 0; j < K; j++) mix[j] = quantileOver(B[j], MASK, q, PAINTED) * load;
  { const cap = num('seacap', 0.18), top = Math.max(...mix); if (top > cap && top > 0) for (let j = 0; j < K; j++) mix[j] *= cap / top; }
  const lead = mix.indexOf(Math.max(...mix));
  let mean = 0, c0 = 0; for (let i = 0; i < n; i++) if (MASK[i]) { mean += B[lead][i]; c0++; }
  mean = mean / Math.max(1, c0) || 1e-4;
  if (Math.max(...mix) < num('seafloor', 0.02)) { log('sea: the band already holds its tone, nothing left to wash'); if (foamCells) { liftResist(sheet); restore(); } return; }

  // the water first, over the band and a margin past it, so every edge of the wash is a wet edge
  const RAD = Math.max(3 * SC, Math.round(num('searadius', 0.075) * Math.min(W2, H2)));
  const WR = Math.max(RAD, Math.round(RAD * num('seareach', 1.15)));
  const hairs = r => Math.max(12, Math.min(Math.round(num('seahairs', 40)), Math.ceil(r * 2)));
  const flat = opt('seaflat', '1') !== '0';
  const OM = { ...O, gran: num('seagran', 1.0) };
  const WETM = dilate(MASK, w, h, num('seawet', 2));
  for (let i = 0; i < n; i++) if (FOAM[i] || (subject && subject[i] > 0.5)) WETM[i] = 0;
  const wetPaths = mopLanes(up(WETM), W2, H2, WR, num('seawetangle', 0.10), 71 + SEED);
  const paths = mopLanes(up(MASK), W2, H2, RAD, num('seaangle', 0), 61 + SEED);
  if (!paths.length) { log('sea: no lane crosses the band'); if (foamCells) { liftResist(sheet); restore(); } return; }
  const every = Math.max(24, Math.round(24 * num('flowmul', 1) * Math.sqrt(Math.max(1, paths.length))));

  for (const pts of wetPaths) {
    const b = createBrush({ flat, radius: WR, bristles: hairs(WR), capacity: 100, belly: num('seabelly', 12), feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 811 + SEED });
    dip(b, { water: 1, conc: PIGS.map(() => 0) });
    clock('strokes', () => stroke(b, sheet, pts.map(p => ({ ...p, r: WR })), { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, OM)); } }));
  }
  stage({ step: 'sea: paper wetted', sweeps: wetPaths.length, brush: WR });
  snap();

  // the wash: long horizontal sweeps, recharged along their run so the band grades
  const cover = Math.max(1, sweepCover(paths, up(MASK), W2, H2));
  const chunkLen = Math.max(2, num('seagrade', 5) * RAD / 6);
  const gmin = num('seagrademin', 0.45), gmax = num('seagrademax', 1.7), topLift = num('seatop', 0.45);
  // --seadarkat: depth into the band where the wash is darkest (0 top, 1 shore). Water is darkest a little below the
  // far shore and lightens both ways; a grade falling from the top edge reads as a slab.
  const darkAt = clamp(num('seadarkat', 0.22), 0.02, 0.9);
  const ramp = d => 1 + topLift * (d <= darkAt ? 0.3 + 0.7 * (d / darkAt) : 1 - 2 * ((d - darkAt) / Math.max(0.05, 1 - darkAt)));
  const shaped = paths.map(pts => {
    const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
    let run = 0;
    return pts.map((p, i) => {
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const u = run / total;
      return { ...p, p: clamp((0.74 + 0.26 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / num('land', 0.06)), Math.min(1, (1 - u) / num('lift', 0.10))), 0.18, 1) };
    });
  });
  // the chunks and their charges are worked out over the whole passage before a stroke is laid, so the grade is
  // normalised across the band and not inside each lane: normalising per lane is what flattens a sea into a slab
  const at = qp => { const sx = clamp(Math.round(qp.x / SC), 0, w - 1), sy = clamp(Math.round(qp.y / SC), 0, h - 1); return B[lead][sy * w + sx]; };
  const plan = shaped.map(pts => {
    const chunks = []; let d = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (k) d += Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y);
      if (!chunks.length || d >= chunkLen) { chunks.push([]); d = 0; if (k) chunks[chunks.length - 1].push(pts[k - 1]); }
      chunks[chunks.length - 1].push(p);
    }
    return chunks.map(ch => {
      const want = ch.reduce((a, p) => a + at(p), 0) / ch.length;
      const dep = ch.reduce((a, p) => a + depthAt(p.x, p.y), 0) / ch.length;
      return { pts: ch, f: clamp(want / mean, gmin, gmax) * ramp(dep) };
    });
  });
  const all = plan.flat();
  const fmean = all.reduce((a, ch) => a + ch.f, 0) / Math.max(1, all.length) || 1;
  const base = mix.map(v => v * num('strength', 2.2) * num('seacal', 1.18) / cover);
  log(`sea: one wash over ${(100 * area / n).toFixed(0)}% of the sheet, ${paths.length} sweeps with a ${flat ? 'flat' : 'round'} brush of radius ${RAD}, puddle [${mix.map(v => v.toFixed(2)).join(' ')}], ${foamCells} cells of foam reserved, cover ${cover.toFixed(2)}`);
  const brush = createBrush({ flat, radius: RAD, bristles: hairs(RAD), capacity: 100, belly: num('seabelly', 12), feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.85, bridge: num('seabridge', 0.9), bridgeSoft: 3, seed: 37 + SEED });
  for (const chunks of plan) {
    clock('strokes', () => chunks.forEach(ch => {
      dip(brush, { water: num('seawater', 0.88), conc: base.map(v => v * ch.f / fmean) });
      stroke(brush, sheet, ch.pts, { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, OM)); } });
    }));
  }
  clock('flow', () => { for (let s = 0; s < num('settle', 60); s++) step(sheet, OM); });
  for (let i = 0; i < n; i++) if (MASK[i] && !FOAM[i]) { const g = ramp(depthAt(i % w, (i / w) | 0)); for (let j = 0; j < K; j++) expected[i * K + j] += mix[j] * g; }
  used['sea wash'] = (used['sea wash'] || 0) + paths.length;
  used['sea pre-wet'] = (used['sea pre-wet'] || 0) + wetPaths.length;
  stage({ step: 'sea: the wash', sweeps: paths.length, brush: RAD, pigment: lead });
  snap();

  clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  if (foamCells) { liftResist(sheet); restore(); }
  stage({ step: 'sea: foam off', cells: foamCells });
  snap();

  // the drags: two or three horizontal streaks of a deeper blue on the dry sheet
  const NS = Math.round(num('seastreaks', 2));
  if (NS > 0) {
    // the deeper blue is what the darker water asks for over the tone the band was just washed at: the plan's dark
    // quantile less its middle, read per pigment, so the drags carry the sea's own colour and not a fresh mixture
    const deepQ = clamp(num('seadeepquant', 0.88), 0.5, 0.99);
    const deep = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      const Aj = Float32Array.from({ length: n }, (_, i) => A[i * K + j]);
      deep[j] = Math.max(0, quantileOver(Aj, MASK, deepQ, PAINTED) - quantileOver(Aj, MASK, 0.5, PAINTED));
    }
    { const cap = num('seadrycap', 0.22), top = Math.max(...deep); if (top > cap && top > 0) for (let j = 0; j < K; j++) deep[j] *= cap / top; }
    const dryR = num('seadryr', 3.2) * SC;
    const dryConc = deep.map(v => v * num('seadryload', 0.7) * num('strength', 2.2) * num('seadrycal', 5.5));
    let marks = 0;
    // One drag: a nearly level run at a fixed depth into the band, wobbling with the hand, its weight wandering so
    // the hairs lose the paper in places. A run at one depth follows the band's tilt. Contacts overlap
    // (--seadryspacing): a dry brush stepped at its own radius leaves a stitched row of specks.
    const drag = (dep, x0f, x1f, r, conc, weight, seed) => {
      let xmin = w, xmax = -1;
      for (let x = 0; x < w; x++) { const y = Math.round(yTop[x] + dep * (yBot[x] - yTop[x])); if (yTop[x] >= 0 && y >= 0 && y < h && MASK[y * w + x]) { if (x < xmin) xmin = x; if (x > xmax) xmax = x; } }
      if (xmax - xmin < 12) return false;
      const span = xmax - xmin, x0 = xmin + span * x0f, x1 = Math.min(xmax, xmin + span * x1f);
      const wob = rnd() * 6.283, wob2 = rnd() * 6.283, pts = [];
      for (let x = x0; x <= x1; x += 1.2) {
        const xi = clamp(Math.round(x), 0, w - 1);
        if (yTop[xi] < 0) continue;
        const yy = yTop[xi] + dep * (yBot[xi] - yTop[xi]) + 0.9 * Math.sin((x - x0) / 15 + wob);
        const yi = clamp(Math.round(yy), 0, h - 1);
        if (!MASK[yi * w + xi]) continue;
        const u = (x - x0) / Math.max(1, x1 - x0);
        const p = clamp(weight * (0.42 + 0.58 * (0.5 + 0.5 * Math.sin((x - x0) / 8 + wob2))) * Math.min(1, u / 0.10) * Math.min(1, (1 - u) / 0.18), 0.10, 1);
        pts.push({ x: xi * SC + 0.5 * SC, y: yy * SC, r, p });
      }
      if (pts.length < 4) return false;
      const b = createBrush({ radius: r, bristles: Math.max(10, Math.round(r * 5)), capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.09, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: num('seadrystreak', 0.7), breakup: num('seadrybreak', 1.8), seed });
      dip(b, { water: num('seadrywater', 0.32), conc });
      clock('strokes', () => stroke(b, sheet, pts, { upright: 'sweep', spacing: num('seadryspacing', 0.3) }));
      for (const p of pts) { const i = clamp(Math.round(p.y / SC), 0, h - 1) * w + clamp(Math.round(p.x / SC), 0, w - 1); for (let j = 0; j < K; j++) expected[i * K + j] += deep[j] * 0.5; }
      return true;
    };
    // --seatopline: a broken dry line along the far edge under the shore, the darkest part of the sea. Without it the
    // band's top is wherever the wash dried and reads as the cut of a slab.
    if (opt('seatopline', '1') !== '0') {
      const c = dryConc.map(v => v * num('seatoplinestrength', 1.3));
      if (drag(num('seatopat', 0.06), 0.03, 0.62, num('seatopliner', 2.2) * SC, c, 0.95, 640 + SEED)) marks++;
      if (drag(num('seatopat', 0.06) + 0.04, 0.48, 0.99, num('seatopliner', 2.2) * SC, c, 0.85, 655 + SEED)) marks++;
    }
    for (let s = 0; s < NS; s++) {
      // the drags sit in the body of the water, not on its edges: a painter draws them where the surface catches the
      // far light, a third to four fifths of the way down the band
      const dep = clamp(num('seadryfrom', 0.38) + (num('seadryto', 0.82) - num('seadryfrom', 0.38)) * (NS === 1 ? 0.5 : s / (NS - 1)) + (rnd() - 0.5) * 0.06, 0.05, 0.95);
      const x0f = 0.04 + 0.26 * rnd();
      if (drag(dep, x0f, Math.min(0.99, x0f + 0.34 + 0.38 * rnd()), dryR, dryConc, 1, 701 + s + SEED)) marks++;
    }
    used['sea dry-brush drag'] = (used['sea dry-brush drag'] || 0) + marks;
    log(`sea: ${marks} dry drags of [${deep.map(v => v.toFixed(2)).join(' ')}] at ${num('seadrywater', 0.32)} water, brush ${dryR}`);
    clock('flow', () => { for (let s = 0; s < 20; s++) step(sheet, OM); });
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
    stage({ step: 'sea: dry drags', marks });
    snap();
  }
}
