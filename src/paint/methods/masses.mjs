// --masses: begin the sheet with a mop and a few broad wet washes, then the value ladder. Nothing is planned ahead:
// after each wash settles the sheet is read again at the mop's scale and the next wash answers what it still lacks.
//   --masses N        at most N broad washes (0: off)
//   --mop 0.22        the mop's radius as a share of the sheet's short side
//   --massfloor 0.10  stop when the best wash's mean residual over its footprint is under this many OD
//   --massarea 0.04   a wash must cover at least this share of the sheet
//   --massquant 0.3   the puddle is this quantile of the residual inside the footprint (the pale end)
//   --massload 0.7    lay this share of it: the first washes go on light and are built on
//   --masswet 3       the first N washes go into pre-wetted paper and are left damp; the rest go on dry paper
//   --masscap 0.22    no wash heavier than this many OD of its pigment; depth is built by overlap
//   --massblur 4      the residual is blurred by the mop radius over this
import { thickness, step, dry } from '../../media/sheet.mjs';
import { createBrush, stroke } from '../../media/brush.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { components } from '../../raster.js';
import { sweepCover } from '../../media/wash.mjs';
import { segmentWashes } from './segment-washes.mjs';

// Lays the broad washes on ctx.sheet, books them into ctx.expected and ctx.used, films each one through ctx.shoot,
// and returns how many sweeps it laid, which the caller adds to its own count.
export async function paintMasses(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, PIGS, A, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, subject: TIER_MASK,
    masses: MASSES, mopLanes, handAngle, flowEvery, dip, up, clock, shoot, setStage, opt, num, log,
  } = ctx;
  let laid = 0;
  const MOP = Math.max(3 * SC, Math.round(num('mop', 0.22) * Math.min(W2, H2)));
  const K = PIGS.length, sigma = Math.max(1, MOP / SC / num('massblur', 4)), MASSWET = Math.round(num('masswet', 3));
  // --massgran: granulation while the mop's washes settle. A few broad washes cannot compound it, so they get their
  // own level apart from the ladder's.
  const OM = { ...O, gran: num('massgran', 1.0) };
  // --mophairs: a mop gets sparser hairs than a small brush; denser hairs carry too much water and bead at lane ends
  const hairsFor = r => Math.max(12, Math.min(Math.round(num('mophairs', 40)), Math.ceil(r * 2)));
  log(`masses: up to ${MASSES} broad washes with a mop of radius ${MOP} cells (${(100 * MOP / Math.min(W2, H2)).toFixed(0)}% of the short side)`);
  // --segwash: the regions come from the picture's semantic segments (segment-washes.mjs)
  const SEG = await segmentWashes({ w, h, n, opt, num, log, subjects: ctx.subjects });
  for (let m = 0; m < MASSES; m++) {
    // what the sheet lacks of each pigment, read off the sheet itself at the plan's resolution
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x; for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC); }
    const R = Array.from({ length: K }, (_, j) => Float32Array.from({ length: n }, (_, i) => Math.max(0, A[i * K + j] - on[i * K + j])));
    // seen at the mop's own scale: a mop cannot lay a nose and is not asked to
    const B = R.map(r => gaussian(r, w, h, sigma));
    // Cut the sheet into regions wanting the same mixture: each pigment's blurred residual is none, pale or deep
    // (--masspale, --massdeep OD). The largest region is washed next. Cutting by mixture, not one pigment at a time,
    // keeps a dark pigment's pale halo from greying the whole sheet.
    const pale = num('masspale', 0.08), deep = num('massdeep', 0.35);
    const code = new Int32Array(n);
    for (let i = 0; i < n; i++) { let cd = 0, p3 = 1; for (let j = 0; j < K; j++) { const v = B[j][i]; cd += (v < pale ? 0 : v < deep ? 1 : 2) * p3; p3 *= 3; } code[i] = cd; }
    const codes = new Set(code); codes.delete(0);
    const topOf = cd => { let t = 0; for (let j = 0; j < K; j++) { const l = cd % 3; cd = (cd - l) / 3; if (l > t) t = l; } return t; };
    let best = null;
    // a segment's puddle: every pigment at the pale quantile of what the region wants, read only over cells that want
    // paint (--masspaper OD), so bare paper inside a region does not pull the quantile to zero
    const PAINTED = Uint8Array.from({ length: n }, (_, i) => { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; return s >= num('masspaper', 0.08) ? 1 : 0; });
    const puddleOf = M => { const mix = new Array(K).fill(0); for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (M[i] && PAINTED[i]) v.push(B[j][i]); v.sort((a, b) => a - b); mix[j] = (v[Math.floor(Math.min(0.95, Math.max(0.05, num('massquant', 0.3))) * (v.length - 1))] ?? 0) * num('massload', 0.7); } return mix; };
    if (SEG) best = SEG.next(puddleOf);
    if (!SEG) for (const cd of codes) {
      // --massmaxlevel: skip regions above this level (1 pale, 2 deep); 1 leaves deep regions as shapes for the next stage
      if (topOf(cd) > num('massmaxlevel', 2)) continue;
      const m8 = new Uint8Array(n); for (let i = 0; i < n; i++) if (code[i] === cd) m8[i] = 1;
      const { labels, areas, count } = components(m8, w, h);
      for (let id = 1; id <= count; id++) {
        if (areas[id] < num('massarea', 0.04) * n) continue;
        if (!best || areas[id] > best.area) best = { cd, id, labels, area: areas[id] };
      }
    }
    if (!best) { log(`masses: no region left at the mop's scale after ${m} washes`); break; }
    // the puddle's strongest pigment names the wash in the log
    if (best.j === undefined) best.j = (() => { let cd = best.cd, bj = 0, bl = -1; for (let j = 0; j < K; j++) { const l = cd % 3; cd = (cd - l) / 3; if (l > bl) { bl = l; bj = j; } } return bj; })();
    const MASK = new Uint8Array(n); for (let i = 0; i < n; i++) if (best.labels[i] === best.id) MASK[i] = 1;
    // one puddle for the wash: every pigment at the pale end of what the footprint wants, and lighter still
    const q = Math.min(0.95, Math.max(0.05, num('massquant', 0.3)));
    const mix = new Array(K).fill(0); let c = 0, mean = 0;
    for (let i = 0; i < n; i++) if (MASK[i]) { c++; mean += R[best.j][i]; }
    mean /= Math.max(1, c);
    // read the blurred residual: per cell the footprint's residual is sparse and its pale quantile near zero
    // --masssingle: one colour per wash, only the pigments at the region's top level; the others come later as glazes
    const levels = (() => { let cd = best.cd; const L = []; for (let j = 0; j < K; j++) { L.push(cd % 3); cd = (cd - L[j]) / 3; } return L; })(), topLevel = Math.max(...levels);
    if (best.mix) for (let j = 0; j < K; j++) mix[j] = best.mix[j];
    else for (let j = 0; j < K; j++) { if (levels[j] < topLevel && opt('masssingle', '1') !== '0') { mix[j] = 0; continue; } const v = []; for (let i = 0; i < n; i++) if (MASK[i]) v.push(B[j][i]); v.sort((a, b) => a - b); mix[j] = (v[Math.floor(q * (v.length - 1))] ?? 0) * num('massload', 0.7); }
    // no single wash heavier than --masscap OD of its pigment (about two glazes): depth comes from overlapping washes
    { const cap = num('masscap', 0.22), top = Math.max(...mix); if (top > cap) for (let j = 0; j < K; j++) mix[j] *= cap / top; }
    if (mix[best.j] < 0.5 * num('massfloor', 0.10)) { log(`masses: the largest region left wants only ${mean.toFixed(2)} OD at its pale end after ${m} washes`); break; }
    const wet = m < MASSWET;
    const T = wet ? { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: num('massbridge', 0.9), bridgeSoft: 3, intoWet: true, passes: 1 }
                  : { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 };
    // --massradius: the brush scales with the region's size, never below the ladder's largest brush or above the mop
    const RAD = Math.max(BRUSH, Math.min(MOP, Math.round(num('massradius', 0.55) * Math.sqrt(best.area * SC * SC / Math.PI))));
    // cells the source leaves under --masspaper OD in total stay paper: a lane breaks at a bare patch wider than the
    // brush and passes over a speck
    const PAPERFLOOR = num('masspaper', 0.08);
    for (let i = 0; i < n; i++) if (MASK[i]) { let s = 0; for (let j = 0; j < K; j++) s += A[i * K + j]; if (s < PAPERFLOOR) MASK[i] = 0; }
    // --massground: with a subject mask the mop washes round the subject and the ladder paints it as a shape
    // (0: wash over everything)
    if (TIER_MASK && opt('massground', '1') !== '0') for (let i = 0; i < n; i++) if (MASK[i] && TIER_MASK[i] > 0.5) MASK[i] = 0;
    if (!MASK.some(v => v)) { log(`masses: the ${m + 1}th region is all subject or paper`); break; }
    const paths = mopLanes(up(MASK), W2, H2, RAD, handAngle(1000 + m), 17 + m + SEED);
    if (!paths.length) { log(`masses: no lane crosses the ${m + 1}th footprint`); break; }
    const cover = Math.max(1, sweepCover(paths, up(MASK), W2, H2));
    log(`mass ${m + 1}: ${best.name ? `${best.name}, ` : ''}${PIGS[best.j].name ?? `pigment ${best.j}`} over ${(100 * best.area / n).toFixed(0)}% of the sheet, ${paths.length} sweeps ${T.name} with a brush of radius ${RAD}, residual ${mean.toFixed(2)} OD, puddle [${mix.map(v => v.toFixed(2)).join(' ')}], cover ${cover.toFixed(2)}`);
    const every = flowEvery(paths.length);
    // wet-on-wet: clean water first covers the region and a margin, in lanes at another angle, so paint edges feather
    // into damp paper. --massfeather: margin as a share of the brush; too wide and the pigment follows the water out.
    // --massreach: the water brush's radius as a share of the paint brush's.
    const wetPaths = T.intoWet ? (() => { const soft = gaussian(Float32Array.from(MASK), w, h, Math.max(1, num('massfeather', 0.15) * RAD / SC)); const M2 = new Uint8Array(n); for (let i = 0; i < n; i++) if (soft[i] > 0.5) M2[i] = 1; return mopLanes(up(M2), W2, H2, Math.round(RAD * num('massreach', 1.0)), handAngle(2000 + m) + 0.9, 23 + m + SEED); })() : [];
    for (const pts of wetPaths) {
      const WR = Math.round(RAD * num('massreach', 1.0));
      const wetB = createBrush({ flat: opt('mopround', '1') === '0', radius: WR, bristles: hairsFor(WR), capacity: 100, belly: num('mopbelly', 12), feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 900 + m + SEED });
      dip(wetB, { water: 1, conc: PIGS.map(() => 0) });
      clock('strokes', () => stroke(wetB, sheet, pts.map(q => ({ ...q, r: WR })), { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, OM)); } }));
    }
    const brush = createBrush({ flat: opt('mopround', '1') === '0', radius: RAD, bristles: hairsFor(RAD), capacity: 100, belly: num('mopbelly', 12), feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: 31 + m + SEED });
    for (const pts of paths) {
      const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
      let run = 0;
      const shaped = pts.map((p, i) => { if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); const u = run / total;
        return { ...p, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / num('land', 0.06)), Math.min(1, (1 - u) / num('lift', 0.10))))) }; });
      const base = mix.map(v => v * num('strength', 2.2) * (CAL[T.name] ?? 1) / cover);
      // --massgrade: recharge every massgrade/6 brush radii at the strength the blurred residual wants there, so the
      // wash grades across its region. Normalised to a mean of one to keep the calibrated charge; 0 lays a flat puddle.
      const chunkLen = num('massgrade', 6) * RAD / 6;
      if (chunkLen > 0 && shaped.length > 3) {
        const at = q => { const sx = Math.min(w - 1, Math.max(0, Math.round(q.x / SC))), sy = Math.min(h - 1, Math.max(0, Math.round(q.y / SC))); return B[best.j][sy * w + sx]; };
        const chunks = []; let d = 0;
        for (let k = 0; k < shaped.length; k++) { const q = shaped[k]; if (k) d += Math.hypot(q.x - shaped[k - 1].x, q.y - shaped[k - 1].y); if (!chunks.length || d >= chunkLen) { chunks.push([]); d = 0; if (k) chunks[chunks.length - 1].push(shaped[k - 1]); } chunks[chunks.length - 1].push(q); }
        const f = chunks.map(ch => Math.max(num('massgrademin', 0.35), Math.min(num('massgrademax', 1.6), ch.reduce((a, q) => a + at(q), 0) / ch.length / Math.max(1e-4, mean))));
        const fmean = f.reduce((a, b) => a + b, 0) / f.length || 1;
        clock('strokes', () => chunks.forEach((ch, k) => { dip(brush, { water: WET(T), conc: base.map(v => v * f[k] / fmean) }); stroke(brush, sheet, ch, { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, OM)); } }); }));
      } else {
        dip(brush, { water: WET(T), conc: base });
        // lift false: no bead at the end of a lane; the hand pulls the bead along the wash rather than dropping it
        clock('strokes', () => stroke(brush, sheet, shaped, { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, OM)); } }));
      }
      laid++;
    }
    clock('flow', () => { for (let q = 0; q < num('settle', 60); q++) step(sheet, OM); });
    // damp between the wet washes, so the next colour meets wet paper; dry before the ladder
    if (wet && m + 1 < MASSES) clock('dry', () => dry(sheet, 3000, OM, { levelMax: 90, dt: 6 }));
    else clock('dry', () => dry(sheet, 20000, OM, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
    for (let i = 0; i < n; i++) if (MASK[i]) for (let j = 0; j < K; j++) expected[i * K + j] += mix[j];
    used['mop wash'] = (used['mop wash'] || 0) + paths.length;
    setStage({ stage: 'wash', step: wet ? 'wet into wet' : 'on dry paper', pass: m + 1, of: MASSES, pigment: best.j, area: +(best.area / n).toFixed(3), technique: T.name, brush: RAD });
    await shoot();
  }
  clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  return laid;
}
