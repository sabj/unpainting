// Technique for a sand ground: one pale warm wash, dry-brush drags crowding towards the bottom, the subject's cast
// shadow as one soft-edged shape, then a few warm specks. No tone is laid over the whole region twice.
//
// Flags, all --sand*:
//   --sandwash 0.05      lay the pale wash only if the region holds less than this many OD; 0 never lays it
//   --sandpaper 0.10     a cell the plan leaves under this many OD stays paper; no drag or speck lands on it
//   --sanddrags 26       dry-brush drags for a ground of the calibration size
//   --sanddragr 7        flat brush radius, in calibration cells
//   --sanddraglen 34     drag length before the taper, in calibration cells
//   --sandcalextent 192  region extent the sizes were fitted at; every length scales with the region's own extent
//   --sandmarkcap 0.02   no mark wider than this share of the region's width
//   --sanddragang -0.26  drag angle in radians (negative rises to the right)
//   --sanddrywater 0.2   water left in the brush for the driest drags
//   --sanddark 1.35      how much darker the drag mix is than the residual under it
//   --sandbottom 0.35    drag density at the top of the region, against 1 at the bottom
//   --sandshadow 1       paint the subject's cast shadow (0 leaves it to the ladder)
//   --sandshadowmax 0.22 cap on the shadow's share of the ground; the cut tightens until it fits
//   --sandspecks 26      sienna specks for a ground of the calibration size
//   --sandspeckmax 0.30  max speck depth in OD

export const when = 'shapes';

const lcg = seed => { let s = (seed * 7919 + 13) >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, K, PIGS, A, expected, used, O, SEED, UPRIGHT,
    seg, subject, thickness, gaussian, components, dilate, removeSmall, distanceToZero,
    createBrush, dip, stroke, step, dry, mopLanes, brushedWashPaths, containPaths, sweepCover,
    clock, snap, stage, num, log,
  } = ctx;

  const region = seg && seg.regions && seg.regions.find(r => r.name === 'sand');
  if (!region) { log('sand: this sheet has no sand segment; nothing to paint'); return; }

  const SAND = Uint8Array.from(region.mask);
  if (subject) for (let i = 0; i < n; i++) if (subject[i] > 0.5) SAND[i] = 0;
  let area = 0, y0 = h, y1 = 0, x0 = w, x1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (SAND[y * w + x]) {
    area++; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x;
  }
  if (!area) { log('sand: the sand segment is all subject here'); return; }

  // Lengths scale with the region, not the sheet, so the same flags look the same at any crop or resolution.
  // EXTENT is sqrt of the region's cell count; a bounding box would misread a long thin band. SCALE is 1 at --sandcalextent.
  const EXTENT = Math.sqrt(area), SCALE = EXTENT / num('sandcalextent', 192);
  // a length in calibration cells, converted to plan cells, never below `min`
  const sized = (flag, dflt, min = 1) => Math.max(min, num(flag, dflt) * SCALE);
  // ceiling on any mark's radius, in plan cells: marks stay small however large the region is
  const REGION_W = Math.max(1, x1 - x0 + 1);
  const MARK_CAP = Math.max(0.8, num('sandmarkcap', 0.02) * REGION_W / 2);
  const up = mask => { if (SC === 1) return Uint8Array.from(mask); const m = new Uint8Array(N2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) m[y * W2 + x] = mask[((y / SC) | 0) * w + ((x / SC) | 0)]; return m; };
  const STRENGTH = num('strength', 2.2);
  const PAPER = num('sandpaper', 0.10);
  const planTotal = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; planTotal[i] = s; }
  // cells the plan paints; the rest is paper the wash must not close up
  const PAINTED = Uint8Array.from(SAND, (v, i) => (v && planTotal[i] >= PAPER ? 1 : 0));

  // what the plan still wants, measured from the paint actually on the sheet
  const residual = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    const R = Array.from({ length: K }, (_, j) => Float32Array.from({ length: n }, (_, i) => Math.max(0, A[i * K + j] - on[i * K + j])));
    const held = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < K; j++) s += on[i * K + j]; held[i] = s; }
    return { R, held };
  };

  const book = (i, mix) => { for (let j = 0; j < K; j++) expected[i * K + j] += mix[j]; };
  const settle = q => clock('flow', () => { for (let t = 0; t < q; t++) step(sheet, O); });

  // 1. the pale warm wash, unless the region already holds one
  {
    const { held } = residual();
    let sum = 0, c = 0;
    for (let i = 0; i < n; i++) if (PAINTED[i]) { sum += held[i]; c++; }
    const mean = c ? sum / c : 0;
    if (num('sandwash', 0.05) <= 0) {
      log('sand: the pale wash is off, so this passage lays only what the ground lacks');
    } else if (mean >= num('sandwash', 0.05)) {
      log(`sand: the mop's wash is already here, ${mean.toFixed(2)} OD over the region; leaving it`);
    } else {
      const { R } = residual();
      const mix = new Array(K).fill(0);
      for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (PAINTED[i]) v.push(R[j][i]); v.sort((a, b) => a - b); mix[j] = (v[Math.floor(0.35 * (v.length - 1))] ?? 0) * num('sandwashload', 0.7); }
      // mop radius scales with the region, not the sheet
      const RAD = Math.max(4, Math.round(num('sandwashr', 0.18) * EXTENT * SC));
      const M2 = up(PAINTED);
      const paths = mopLanes(M2, W2, H2, RAD, num('sanddragang', -0.26) + 1.4, 11 + SEED);
      const cover = Math.max(1, sweepCover(paths, M2, W2, H2));
      log(`sand: one pale wash, ${paths.length} sweeps with a mop of radius ${RAD}, puddle [${mix.map(v => v.toFixed(2)).join(' ')}]`);
      const brush = createBrush({ radius: RAD, bristles: Math.max(12, Math.min(40, RAD * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.85, bridge: 0.9, bridgeSoft: 3, seed: 51 + SEED });
      for (const pts of paths) {
        dip(brush, { water: 0.88, conc: mix.map(v => v * STRENGTH * num('sandwashcal', 1.18) / cover) });
        clock('strokes', () => stroke(brush, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: 24, between: s => { if (s % 24 === 0) clock('flow', () => step(sheet, O)); } }));
      }
      settle(60);
      for (let i = 0; i < n; i++) if (PAINTED[i]) book(i, mix);
      used['sand wash'] = (used['sand wash'] || 0) + paths.length;
      stage({ step: 'the pale ochre wash', sweeps: paths.length, brush: RAD });
      snap();
    }
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  }

  // The cast shadow is found on the plan before anything is laid, so the warm drags can be kept out of it.
  const SHADOW = (() => {
    if (!(num('sandshadow', 1) > 0)) return null;
    // The shadow is the cool note in the sand. Its pigment is the one with the largest K[0] - K[2] (coolest).
    // Cells are ranked by that pigment's share and cut at a quantile, so a palette where it is minor still finds a shadow.
    const coolJ = (() => { let bj = 0, bs = -Infinity; for (let j = 0; j < K; j++) { const kk = PIGS[j].K, sp = kk[0] - kk[2]; if (sp > bs) { bs = sp; bj = j; } } return bj; })();
    const cool = new Float32Array(n), shares = [], depths = [];
    for (let i = 0; i < n; i++) if (SAND[i] && planTotal[i] >= PAPER) {
      const q = A[i * K + coolJ] / Math.max(1e-6, planTotal[i]);
      cool[i] = q; shares.push(q); depths.push(planTotal[i]);
    }
    if (!shares.length) { log('sand: the plan leaves no painted sand to read a shadow out of'); return null; }
    const at = (arr, q) => { const a = Float64Array.from(arr).sort(); return a[Math.floor(clamp(q, 0, 0.98) * (a.length - 1))]; };
    // a shadow is not lighter than the ground it falls on
    const floor = at(depths, num('sandshadowdark', 0.35));
    // The shadow is the cool shape touching the subject, so wet sand elsewhere is not taken for it.
    // It is capped at --sandshadowmax of the ground; the cut tightens until it fits.
    const NEAR = subject
      ? dilate(Uint8Array.from({ length: n }, (_, i) => (subject[i] > 0.5 ? 1 : 0)), w, h, Math.max(2, Math.round(num('sandshadownear', 0.14) * EXTENT)))
      : null;
    const MAXA = num('sandshadowmax', 0.22) * area;
    const closing = Math.max(1, Math.round(sized('sandshadowclose', 2)));
    const minA = Math.max(24, Math.round(num('sandshadowmin', 0.012) * area));
    let fallback = null;
    for (let q = clamp(num('sandshadowq', 0.55), 0, 0.96); q <= 0.965; q += 0.04) {
      const cut = at(shares, q);
      let M = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (cool[i] > cut && planTotal[i] >= floor) M[i] = 1;
      M = removeSmall(dilate(M, w, h, closing), w, h, minA);
      const { labels, areas, count } = components(M, w, h);
      // the largest shape touching the subject; with no subject mask, the largest of all
      const touches = new Uint8Array(count + 1);
      if (NEAR) { for (let i = 0; i < n; i++) if (NEAR[i] && labels[i]) touches[labels[i]] = 1; }
      let best = 0, bestA = 0;
      for (let id = 1; id <= count; id++) {
        if (NEAR && !touches[id]) continue;
        if (areas[id] > bestA) { bestA = areas[id]; best = id; }
      }
      if (!best) continue;
      const SH = new Uint8Array(n); let a = 0;
      for (let i = 0; i < n; i++) if (labels[i] === best && SAND[i]) { SH[i] = 1; a++; }
      if (a <= 40) continue;
      const hit = { mask: SH, area: a, greyJ: coolJ, q };
      fallback = hit;
      if (a <= MAXA) break;
    }
    if (!fallback) { log('sand: nothing in the sand reads as the dog\'s shadow'); return null; }
    log(`sand: the shadow is pigment ${coolJ}, the coolest on the palette, over ${(100 * fallback.area / area).toFixed(0)}% of the ground at a cut of ${fallback.q.toFixed(2)}`);
    return fallback;
  })();

  // 2. the dry-brush drags
  // --sanddrags is scaled by region area over drag footprint, so a narrower brush gets more drags.
  const DRAG_R = Math.min(MARK_CAP, sized('sanddragr', 6, 1.5)), DRAG_LEN = sized('sanddraglen', 34, 6);
  // the calibration drag as literals: read from the flags, they would cancel out of the ratio
  const CAL_R = 6, CAL_LEN = 34, CAL_A = num('sandcalextent', 192) ** 2;
  const footprint = q => Math.PI * q[0] * q[0] + 2 * q[0] * q[1];
  const DRAGS = Math.max(1, Math.round(num('sanddrags', 26) * (area / footprint([DRAG_R, DRAG_LEN])) / (CAL_A / footprint([CAL_R, CAL_LEN]))));
  log(`sand: ${(100 * area / n).toFixed(0)}% of the sheet, ${EXTENT.toFixed(0)} cells a side and ${REGION_W} wide, so every size is ${SCALE.toFixed(2)}x the crop it was fitted on and no mark is wider than ${(2 * MARK_CAP).toFixed(1)} cells`);
  if (DRAGS > 0) {
    const { R } = residual();
    const want = new Float32Array(n);
    for (let i = 0; i < n; i++) if (PAINTED[i]) { let s = 0; for (let j = 0; j < K; j++) s += R[j][i]; want[i] = s; }
    const soft = gaussian(want, w, h, Math.max(1, sized('sanddragblur', 3)));

    // drags crowd towards the bottom of the region; the top stays nearly bare paper
    const lo = clamp(num('sandbottom', 0.35), 0, 1), span = Math.max(1, y1 - y0);
    const score = new Float32Array(n);
    // drags stop short of the shadow's edge
    const KEEPOFF = SHADOW ? dilate(SHADOW.mask, w, h, Math.max(0, Math.round(sized('sandshadowkeepoff', 2, 0)))) : null;
    for (let y = y0; y <= y1; y++) {
      const bias = lo + (1 - lo) * Math.pow((y - y0) / span, num('sandbottomg', 1.2));
      for (let x = x0; x <= x1; x++) { const i = y * w + x; if (PAINTED[i] && !(KEEPOFF && KEEPOFF[i])) score[i] = soft[i] * bias; }
    }

    const rnd = lcg(SEED + 77);
    const ANG = num('sanddragang', -0.26), RBASE = DRAG_R * SC, LEN = DRAG_LEN * SC;
    // spacing is in plan cells, where `spent` lives; RBASE is in sheet cells
    const spacing = Math.max(2, Math.round(num('sanddragspace', 1.5) * DRAG_R));
    const spent = new Uint8Array(n);
    const order = []; for (let i = 0; i < n; i++) if (score[i] > 0) order.push(i);
    order.sort((a, b) => score[b] - score[a]);

    const marks = [];
    for (const i of order) {
      if (marks.length >= DRAGS) break;
      if (spent[i]) continue;
      const sx = (i % w) * SC, sy = ((i / w) | 0) * SC;
      // 0 at the top of the region, 1 at the bottom; lower drags are longer, wider and wetter
      const down = clamp(((sy / SC) - y0) / span, 0, 1);
      const ang = ANG + (rnd() - 0.5) * num('sanddragwobble', 0.50);
      const len = LEN * (0.40 + 1.5 * rnd()) * (0.75 + 0.5 * down);
      const r = Math.min(MARK_CAP * SC, RBASE * (0.6 + 0.9 * rnd()) * (0.8 + 0.5 * down));
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const phase = rnd() * 6.28, phase2 = rnd() * 6.28, phase3 = rnd() * 6.28;
      const wob = num('sanddragbow', 0.55) * r, period = len * (0.5 + 0.5 * rnd());
      const pts = [];
      // The drag starts a little behind its seed cell and stops at the region edge.
      // Width and heading vary along it, as a flat rolls on its corner; a constant band reads as brickwork.
      for (let t = -len * 0.35; t <= len * 0.65; t += 1.4) {
        const u = (t + len * 0.35) / len;
        const off = wob * Math.sin(t / Math.max(4, period) * 6.28 + phase2);
        const px = sx + dx * t + nx * off, py = sy + dy * t + ny * off;
        if (px < 0 || py < 0 || px >= W2 || py >= H2) break;
        const pi = ((py / SC) | 0) * w + ((px / SC) | 0);
        if (!PAINTED[pi] || (SHADOW && SHADOW.mask[pi])) break;
        // pressure peaks mid-drag and skips as the flat lifts
        const taper = Math.min(1, u / 0.30) * Math.min(1, (1 - u) / 0.34);
        const skip = 0.66 + 0.34 * Math.sin(t / (0.9 * r) + phase);
        const roll = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t / (1.7 * r) + phase3));
        pts.push({ x: px, y: py, r: Math.max(1, r * roll * (0.35 + 0.65 * taper)), p: clamp(taper * skip, 0, 1), i: pi });
      }
      if (pts.length < 5) { spent[i] = 1; continue; }
      // exclusion radius varies per drag; a fixed one packs marks on a hexagonal lattice that reads as a repeating texture
      const sp = Math.max(1, Math.round(spacing * (0.45 + 1.1 * rnd())));
      for (const p of pts) {
        const px = Math.round(p.x / SC), py = Math.round(p.y / SC);
        for (let oy = -sp; oy <= sp; oy++) for (let ox = -sp; ox <= sp; ox++) {
          const xx = px + ox, yy = py + oy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox * ox + oy * oy <= sp * sp) spent[yy * w + xx] = 1;
        }
      }
      marks.push({ pts, down });
    }

    const DARK = num('sanddark', 1.35), WARM = [num('sandwarm0', 1.25), num('sandwarm1', 0.70), num('sandwarm2', 1.35)];
    const cal = num('sanddrycal', 5.5);
    // water, breakup and bridging run from dry at the top to wet at the bottom, giving the ground its fall without a second tone
    const dryW = num('sanddrywater', 0.22), wetW = num('sanddragwet', 0.85);
    const dryB = num('sanddragbreak', 1.0), wetB = num('sanddragbreakbot', 0.25);
    const dryG = num('sanddragbridge', 0.12), wetG = num('sanddragbridgebot', 0.80);
    // a share of drags anywhere in the region use the dry settings, so skipping is not only at the top
    const skipShare = clamp(num('sanddragskip', 0.28), 0, 1);
    let laid = 0;
    for (let k = 0; k < marks.length; k++) {
      const { pts, down } = marks[k];
      const spent2 = lcg(SEED + 900 + k)() < skipShare;
      const d = spent2 ? 0 : down;
      const water = dryW + (wetW - dryW) * d, breakup = dryB + (wetB - dryB) * d, bridge = dryG + (wetG - dryG) * d;
      // the residual colour under this drag, pushed warmer and darker
      const mean = new Array(K).fill(0);
      for (const p of pts) for (let j = 0; j < K; j++) mean[j] += R[j][p.i] / pts.length;
      let tot = 0; for (let j = 0; j < K; j++) tot += mean[j];
      if (tot < num('sanddragmin', 0.02)) continue;
      const warm = mean.map((v, j) => v * WARM[j] + 0.12 * tot * (WARM[j] > 1 ? 1 : 0) / Math.max(1, K - 1));
      let wt = 0; for (let j = 0; j < K; j++) wt += warm[j];
      const mix = warm.map(v => (v / Math.max(1e-6, wt)) * tot * DARK * (0.75 + 0.5 * d));
      const r = Math.max(1, Math.max(...pts.map(q => q.r)));
      // A dry flat needs dense hairs (about 6 per cell of radius): fewer lay a dotted line instead of a broken band.
      const brush = createBrush({
        flat: true, radius: r, bristles: Math.max(16, Math.round(r * num('sanddraghairs', 6))), capacity: num('sanddragcap', 60), belly: num('sanddragbelly', 6),
        feed: num('sanddragfeed', 0.30), give: 0.75, free: 0.35, film: num('sanddragfilm', 0.30), breakup,
        streak: 0.6, streakLength: 22, coarse: 0.45, fine: 0.05, splay: 0.06, stiffness: 9,
        wetMix: 0, bridge, bridgeSoft: num('sanddragbridgesoft', 2.2), grainShift: num('sanddragshift', 0), seed: 210 + k + SEED,
      });
      dip(brush, { water, conc: mix.map(v => v * STRENGTH * cal) });
      // the flat is held square to its own direction of travel, not to the sheet
      clock('strokes', () => stroke(brush, sheet, pts.map(p => ({ x: p.x, y: p.y, r: p.r, p: p.p })), { upright: UPRIGHT, spacing: 0.9 }));
      for (const p of pts) book(p.i, mix.map(v => v * p.p * 0.5));
      laid++;
    }
    settle(40);
    log(`sand: ${laid} dry-brush drags with a flat of radius ${RBASE.toFixed(0)}, at ${ANG.toFixed(2)} rad, ${(100 * lo).toFixed(0)}% as dense at the top as at the bottom`);
    used['sand dry-brush drag'] = (used['sand dry-brush drag'] || 0) + laid;
    stage({ step: 'the dry-brush drags', drags: laid, brush: Math.round(RBASE) });
    snap();
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  }

  // 3. the cast shadow, one shape with a soft edge
  if (SHADOW) {
    const { R } = residual();
    const { mask: SH, area: shadowArea, greyJ } = SHADOW;
    const mix = new Array(K).fill(0);
    for (let j = 0; j < K; j++) { const a = []; for (let i = 0; i < n; i++) if (SH[i]) a.push(R[j][i]); a.sort((p, q) => p - q); mix[j] = a[Math.floor(0.62 * (a.length - 1))] ?? 0; }
    let tot = 0; for (let j = 0; j < K; j++) tot += mix[j];
    // grey-violet, not brown: the grey carries it and the warm pigments only keep it off neutral
    const pull = mix.map((val, j) => val * (j === greyJ ? 1.6 : 0.6));
    let pt = 0; for (let j = 0; j < K; j++) pt += pull[j];
    const shade = pull.map(val => (val / Math.max(1e-6, pt)) * tot * num('sandshadowload', 0.95));

    if (tot > 0.03) {
      const M2 = up(SH);
      // dampen a band around the shape with clean water first, so the edge does not dry as a cut line
      const feather = sized('sandshadowfeather', 5);
      const wide = new Uint8Array(n);
      { const sf = gaussian(Float32Array.from(SH), w, h, feather * 0.6); for (let i = 0; i < n; i++) if (sf[i] > 0.28 && SAND[i]) wide[i] = 1; }
      const WR = Math.max(4, Math.round(sized('sandshadowwr', 9) * SC));
      const wetPaths = mopLanes(up(wide), W2, H2, WR, num('sanddragang', -0.26) + 1.2, 33 + SEED);
      const wetB = createBrush({ radius: WR, bristles: Math.max(12, WR * 2), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 310 + SEED });
      for (const pts of wetPaths) {
        dip(wetB, { water: 1, conc: new Array(K).fill(0) });
        clock('strokes', () => stroke(wetB, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: 24, between: sp => { if (sp % 24 === 0) clock('flow', () => step(sheet, O)); } }));
      }

      const dist = distanceToZero(M2, W2, H2);
      let rIn = 0; for (let i = 0; i < N2; i++) if (dist[i] > rIn) rIn = dist[i];
      const RAD = Math.max(3 * SC, Math.round(num('sandshadowr', 0.7) * rIn));
      let paths = brushedWashPaths(M2, W2, H2, { pad: 0.4 * SC, minRadius: SC, minLength: 4 * SC, maxRadius: RAD, seed: 61 + SEED, overlap: 0.25 });
      paths = containPaths(paths, dist, W2, H2, { minRadius: 0.8 * SC, minLength: 3 * SC, slack: 0.6 * SC });
      const cover = Math.max(1, sweepCover(paths, M2, W2, H2));
      log(`sand: the dog's shadow, ${(100 * shadowArea / n).toFixed(1)}% of the sheet in ${paths.length} strokes, puddle [${shade.map(q => q.toFixed(2)).join(' ')}], cover ${cover.toFixed(2)}`);
      for (const pts of paths) {
        const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
        const brush = createBrush({ radius: r, bristles: Math.max(10, Math.ceil(r * 2)), capacity: 70, belly: 7, feed: 0.28, give: 0.88, free: 0.4, film: 0.25, splay: 0.04, stiffness: 6, wetMix: 0.6, bridge: 0.85, bridgeSoft: 2.6, seed: 63 + SEED });
        dip(brush, { water: num('sandshadowwater', 0.72), conc: shade.map(q => q * STRENGTH * num('sandshadowcal', 1.1) / cover) });
        clock('strokes', () => stroke(brush, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: 24, between: sp => { if (sp % 24 === 0) clock('flow', () => step(sheet, O)); } }));
      }
      settle(Math.round(num('sandshadowsettle', 110) * clamp(SCALE, 0.5, 2.5)));
      for (let i = 0; i < n; i++) if (SH[i]) book(i, shade);
      used['sand shadow'] = (used['sand shadow'] || 0) + paths.length;
      stage({ step: "the dog's shadow", area: +(shadowArea / n).toFixed(3), brush: RAD });
      snap();
    } else log(`sand: the shadow wants only ${tot.toFixed(2)} OD; the washes already carry it`);
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  }

  // 4. the sienna specks
  const SPECK_R = Math.min(MARK_CAP, sized('sandspeckr', 1.3, 0.9)), SPECK_SPACE = Math.max(3, Math.round(sized('sandspeckspace', 7)));
  // count scales with region area over speck spacing, as for the drags
  const SPECKS = Math.max(0, Math.round(num('sandspecks', 26) * (area / (SPECK_SPACE * SPECK_SPACE)) / ((num('sandcalextent', 192) ** 2) / (num('sandspeckspace', 7) ** 2))));
  if (SPECKS > 0) {
    const { R } = residual();
    // sienna: the deepest warm pigment (absorbs blue); near-flat absorption means a grey and is excluded
    const siennaJ = (() => {
      const warm = [], spread = j => { const kk = PIGS[j].K; return Math.max(...kk) - Math.min(...kk); };
      for (let j = 0; j < K; j++) { const kk = PIGS[j].K; if (kk[2] > (kk[0] + kk[1]) / 2 && spread(j) > 0.15) warm.push(j); }
      const pool = warm.length ? warm : [...Array(K).keys()];
      let bj = pool[0], bs = -Infinity;
      for (const j of pool) { const s = PIGS[j].K.reduce((a, v) => a + v, 0); if (s > bs) { bs = s; bj = j; } }
      return bj;
    })();
    const want = new Float32Array(n);
    for (let i = 0; i < n; i++) if (PAINTED[i]) { let s = 0; for (let j = 0; j < K; j++) s += R[j][i]; want[i] = s; }
    const lo = clamp(num('sandbottom', 0.35), 0, 1), span = Math.max(1, y1 - y0);
    const score = new Float32Array(n);
    const rnd = lcg(SEED + 401);
    for (let y = y0; y <= y1; y++) {
      const bias = lo + (1 - lo) * ((y - y0) / span);
      // specks land on open sand, never in the shadow
      for (let x = x0; x <= x1; x++) { const i = y * w + x; if (PAINTED[i] && !(SHADOW && SHADOW.mask[i])) score[i] = want[i] * bias * (0.7 + 0.6 * rnd()); }
    }
    const order = []; for (let i = 0; i < n; i++) if (score[i] > 0) order.push(i);
    order.sort((a, b) => score[b] - score[a]);
    const spacing = SPECK_SPACE;
    const spent = new Uint8Array(n), sites = [];
    for (const i of order) {
      if (sites.length >= SPECKS) break;
      if (spent[i]) continue;
      sites.push(i);
      const px = i % w, py = (i / w) | 0;
      for (let oy = -spacing; oy <= spacing; oy++) for (let ox = -spacing; ox <= spacing; ox++) {
        const xx = px + ox, yy = py + oy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox * ox + oy * oy <= spacing * spacing) spent[yy * w + xx] = 1;
      }
    }
    const load = num('sandspeckload', 1.8), cal = num('sandspeckcal', 1.1);
    let laid = 0;
    for (let k = 0; k < sites.length; k++) {
      const i = sites[k];
      let tot = 0; for (let j = 0; j < K; j++) tot += R[j][i];
      if (tot < num('sandspeckmin', 0.04)) continue;
      // capped at --sandspeckmax so a deep residual does not turn a speck into a dark blot
      tot = Math.min(tot * load, num('sandspeckmax', 0.30));
      const mix = new Array(K).fill(0);
      for (let j = 0; j < K; j++) mix[j] = (j === siennaJ ? 0.62 : 0.19) * tot;
      const r = Math.max(0.9, Math.min(MARK_CAP * SC, SPECK_R * SC * (0.7 + 0.8 * rnd())));
      const cx = (i % w) * SC + SC * 0.5, cy = ((i / w) | 0) * SC + SC * 0.5;
      // a speck is a touch with a short tapering drag, not a dot
      const ang = num('sanddragang', -0.26) + (rnd() - 0.5) * 1.6, L = r * (1.2 + 1.8 * rnd());
      const pts = [];
      for (let t = 0; t <= L; t += 0.8) {
        const px = cx + Math.cos(ang) * t, py = cy + Math.sin(ang) * t;
        if (px < 0 || py < 0 || px >= W2 || py >= H2) break;
        if (!PAINTED[((py / SC) | 0) * w + ((px / SC) | 0)]) break;
        pts.push({ x: px, y: py, r, p: 1 - 0.55 * (t / Math.max(1e-6, L)) });
      }
      if (pts.length < 2) continue;
      const brush = createBrush({ radius: r, bristles: 9, capacity: 18, belly: 2.2, feed: 0.12, give: 0.7, free: 0.35, film: 0.22, breakup: 1.8, splay: 0.07, stiffness: 5, wetMix: 0.2, bridge: 0.35, bridgeSoft: 1.0, seed: 520 + k + SEED });
      dip(brush, { water: num('sandspeckwater', 0.4), conc: mix.map(v => v * STRENGTH * cal) });
      clock('strokes', () => stroke(brush, sheet, pts, { upright: UPRIGHT }));
      book(i, mix.map(v => v * 0.5));
      laid++;
    }
    settle(30);
    log(`sand: ${laid} sienna specks in pigment ${siennaJ}`);
    used['sand speck'] = (used['sand speck'] || 0) + laid;
    stage({ step: 'the sienna specks', specks: laid });
    snap();
  }
}
