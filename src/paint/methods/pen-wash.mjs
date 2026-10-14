// Lays the pen-and-wash style's planned passages (pen-wash-plan.mjs) after the ink drawing has dried, with the
// painter's ordinary mop, wash brush, sheet flow and drying. Each passage is one connected wash with one charge:
//   - its edge is roughened by a smooth noise field (--pwedge, share of a 1.2 mm blur), slipped off the drawing by
//     --pwslip mm in a direction of its own, and faded short of the sheet's border (--pwmargin, share of the short side),
//     so the wash supports the ink instead of filling it;
//   - wet passages (the sky or unifying wash) go into clean water laid first, graded down the sheet when planned so;
//   - with --pwallwet 1 (the recipe) every passage goes into clean water laid on its own shape first: brushed wet on
//     dry, the simulated passages broke into mottled dabs (Yale, 2026-10-13); flooded, each is one smooth soft-edged wash;
//   - otherwise a dry passage is mopped in overlapping lanes (--pwmop 1, default) or brushed in contained sweeps (--pwmop 0);
//   - the brush is no wider than --pwbrushmm (default 10 mm); contained sweeps keep --pwslack cells of give;
//   - the sheet dries completely before the next passage, so each wash is its own transparent layer;
//   - a passage may say how it is laid: `dry` (wet on dry for a crisp edge, whatever --pwallwet says), `pad` (mm of
//     clean water past its shape when flooded; the stage planner's first wash keeps 0 so the whites stay paper),
//     `brushMm` (its own brush width) and `soft` (a band outside its edge wetted just before the colour goes in,
//     so the edge softens there and stays crisp against dry paper elsewhere).
// --pwcharge scales every charge (default 8: on the Flatiron calibration run the dry passages laid 0.99 to 1.01 of
// their planned amount on average over the footprint and the wet sky 0.68; penwash-run.json records both per passage).
import { brushedWashPaths, containPaths, sweepCover } from '../../media/wash.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { distanceToZero, dilate } from '../../raster.js';
import { passageAmounts } from './pen-wash-plan.mjs';
import { omissionField } from './pen-wash-lines.mjs';

const WET_ON_WET = { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.9, bridgeSoft: 3, intoWet: true };
// a juicy wet-on-dry load, so a passage stays one wet bead across its sweeps instead of dragging dry
const WET_ON_DRY = { name: 'wet on dry', water: 0.82, wetMix: 0.6, bridge: 0.85, bridgeSoft: 2.4, intoWet: false };

/**
 * The cells a passage's wash is aimed at on the plan grid: its planned mask slipped by `slip` cells at `angle`,
 * with a broken edge from `noise` (unit field) and nothing within `margin` cells of the border (also broken).
 */
export function washFootprint(mask, w, h, { slip = 0, angle = 0, edgeSigma = 3, edgeAmp = 0.25, margin = 0, noise = null }) {
  const n = w * h, dx = Math.round(slip * Math.cos(angle)), dy = Math.round(slip * Math.sin(angle));
  const moved = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x - dx, sy = y - dy; if (sx >= 0 && sy >= 0 && sx < w && sy < h && mask[sy * w + sx]) moved[y * w + x] = 1; }
  const soft = gaussian(moved, w, h, Math.max(0.5, edgeSigma)), out = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, nz = noise ? noise[i] : 0;
    // the noise only moves the edge: far from the shape (soft near 0) it must not raise islands of wash
    if (soft[i] < 0.12 || soft[i] + edgeAmp * nz <= 0.5) continue;
    if (margin > 0 && Math.min(x, y, w - 1 - x, h - 1 - y) < margin * (1 + 0.45 * nz)) continue;
    out[i] = 1;
  }
  return out;
}

// pressure along a sweep: the brush lands, presses through the middle and lifts
const shapePressure = pts => {
  const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
  let run = 0;
  return pts.map((p, i) => { if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); const u = run / total; return { ...p, p: Math.max(0.2, Math.min(1, (0.75 + 0.25 * Math.sin(Math.PI * u)) * Math.min(1, u / 0.06, (1 - u) / 0.1))) }; });
};

/** Lays every passage of `plan` on ctx.sheet and returns { laid, records }. ctx carries the painter's own brush,
 * stroke, step and dry wrappers, so the GPU and material bookkeeping stay those of any other wash. */
export async function paintPenWash(ctx, plan) {
  const { createBrush, stroke, step, dry, thickness, sheet, w, h, n, W2, H2, PIGS, O, SEED, UPRIGHT, CAL, WET, mopLanes, handAngle, flowEvery, dip, up, clock, shoot, setStage, num, log, expected, used, mmPerCell, checkpoint } = ctx;
  const K = PIGS.length, cellsPlan = mm => mm / (mmPerCell * W2 / w), cellsSheet = mm => mm / mmPerCell;
  const noise = omissionField(w, h, Math.max(1, cellsPlan(3)), 101 + SEED);
  const hairs = r => Math.max(12, Math.min(40, Math.ceil(r * 2)));
  const settle = () => clock('flow', () => { for (let q = 0; q < num('pwsettle', 50); q++) step(sheet, O); });
  const flow = every => s => { if (s % every === 0) clock('flow', () => step(sheet, O)); };
  let laid = 0; const records = [];
  for (const [k, p] of plan.passages.entries()) {
    const angle = handAngle(3000 + k) * 3.1, foot = washFootprint(p.mask, w, h, {
      slip: cellsPlan(num('pwslip', 0.7)), angle, edgeSigma: cellsPlan(1.2), edgeAmp: num('pwedge', 0.28),
      margin: num('pwmargin', 0.035) * Math.min(w, h), noise,
    });
    const M = up(foot), area = foot.reduce((a, v) => a + v, 0);
    if (area < 20) { log(`pen wash ${p.id}: footprint vanished after edge and margin, skipped`); continue; }
    // --pwallwet 1: every passage goes into clean water laid on its shape first (wet in wet), not only the sky
    const wet = !p.dry && (p.wet || num('pwallwet', 0) > 0), T = wet ? WET_ON_WET : WET_ON_DRY;
    const sumThk = () => { const th = thickness(sheet); let t = 0, c = 0; for (let i = 0; i < M.length; i++) if (M[i]) { for (let j = 0; j < K; j++) t += th[j][i]; c++; } return t / Math.max(1, c); };
    const before = sumThk();
    // --pwwetgain: a shape flooded wet in wet holds more of the charge than the sky's long lanes (Yale, 2026-10-13:
    // 1.45 times its plan at gain 1), so its charge is scaled down to land near the plan
    // --pwdrygain: a passage mopped wet on dry lays about 1.7 times its plan (penwash-run.json, Flatiron and Yale,
    // 2026-10-13), so its charge is scaled down to land near the plan
    const gain = num('pwcharge', 8) * (CAL[T.name] ?? 1) * (wet && !p.wet ? num('pwwetgain', 0.7) : 1) * (wet ? 1 : num('pwdrygain', 1));
    let paths, R;
    if (wet) {
      R = Math.round(Math.min(cellsSheet(num(p.wet ? 'pwmopmm' : 'pwwetmm', p.wet ? 11 : 6)), Math.max(cellsSheet(4), 0.5 * Math.sqrt(area * (W2 / w) ** 2 / Math.PI))));
      // clean water first, a little past the shape, so the colour feathers out instead of stopping at a rim
      const pad = p.pad ?? 1.5;
      const water = mopLanes(up(pad > 0 ? dilate(foot, w, h, Math.max(1, Math.round(cellsPlan(pad)))) : foot), W2, H2, R, handAngle(2000 + k) + 0.9, 23 + k + SEED);
      const wb = createBrush({ flat: false, radius: R, bristles: hairs(R), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 900 + k + SEED });
      const every = flowEvery(water.length);
      for (const pts of water) { dip(wb, { water: 1, conc: PIGS.map(() => 0) }); clock('strokes', () => stroke(wb, sheet, pts.map(q => ({ ...q, r: R })), { upright: UPRIGHT, lift: false, flowEvery: every, between: flow(every) })); }
      paths = mopLanes(M, W2, H2, R, handAngle(1000 + k), 17 + k + SEED);
    } else if (num('pwmop', 1) > 0) {
      // --pwmop 1 (default): a dry passage is mopped in overlapping lanes across its whole footprint with one loaded
      // brush, as a painter floods a shape wet on dry; the lanes overhang the edge a little, which the slip already allows
      R = Math.round(Math.max(cellsSheet(p.brushMm ? 0.6 : 2), cellsSheet(p.brushMm ?? num('pwbrushmm', 10)) / 2));
      paths = mopLanes(M, W2, H2, R, handAngle(1000 + k), 17 + k + SEED);
    } else {
      R = Math.round(Math.max(cellsSheet(1.5), cellsSheet(num('pwbrushmm', 10)) / 2));
      const lanes = brushedWashPaths(M, W2, H2, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: R, seed: 41 + k + SEED, overlap: 0.18 });
      paths = containPaths(lanes, distanceToZero(M, W2, H2), W2, H2, { minRadius: Math.max(1, cellsSheet(0.8)), minLength: 3, slack: num('pwslack', 1.2) });
    }
    if (!paths.length) { log(`pen wash ${p.id}: no sweep crosses its footprint, skipped`); continue; }
    paths = paths.map(shapePressure);
    // a `soft` band outside a dry passage's edge takes clean water just before the colour (--pwsoftedge 0 skips it)
    if (!wet && p.soft && num('pwsoftedge', 1) > 0) {
      const band = Uint8Array.from(p.soft, (v, i) => (v && !foot[i] ? 1 : 0));
      if (band.reduce((a, v) => a + v, 0) >= 20) {
        const Rw = Math.round(Math.max(cellsSheet(1), cellsSheet(1.5)));
        const lanes = mopLanes(up(band), W2, H2, Rw, handAngle(2500 + k) + 0.7, 29 + k + SEED);
        const wb = createBrush({ flat: false, radius: Rw, bristles: hairs(Rw), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 950 + k + SEED });
        const everyW = flowEvery(lanes.length);
        for (const pts of lanes) { dip(wb, { water: 1, conc: PIGS.map(() => 0) }); clock('strokes', () => stroke(wb, sheet, pts.map(q => ({ ...q, r: Rw })), { upright: UPRIGHT, lift: false, flowEvery: everyW, between: flow(everyW) })); }
      }
    }
    const cover = Math.max(1, sweepCover(paths, M, W2, H2)), every = flowEvery(paths.length);
    const brush = createBrush({ flat: false, radius: R, bristles: hairs(R), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: 31 + k + SEED });
    for (const pts of paths) {
      // a graded wash is charged by where the sweep is on the sheet (top darker), the plan's own gradient; else flat
      const yMid = pts.reduce((a, q) => a + q.y, 0) / pts.length / H2, g = p.grade ? p.grade.from + (p.grade.to - p.grade.from) * yMid : 1;
      dip(brush, { water: WET(T), conc: p.dir.map(v => v * p.strength * g * gain / cover) });
      clock('strokes', () => stroke(brush, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: every, between: flow(every) }));
      laid++;
    }
    settle();
    clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
    const delivered = sumThk() - before;
    const amt = passageAmounts({ ...p, mask: foot }, w, h, K);
    for (let i = 0; i < n * K; i++) expected[i] += amt[i];
    used['pen wash'] = (used['pen wash'] || 0) + paths.length;
    const rec = { id: p.id, role: p.role, technique: T.name, sweeps: paths.length, brushRadiusMm: +(R * mmPerCell).toFixed(2), footprint: +(area / n).toFixed(4), cover: +cover.toFixed(2), planned: +p.strength.toFixed(3), delivered: +delivered.toFixed(3) };
    records.push(rec);
    log(`pen wash ${k + 1}/${plan.passages.length} ${p.id} (${p.role}): ${paths.length} sweeps ${T.name}, brush ${rec.brushRadiusMm} mm radius, ${(100 * rec.footprint).toFixed(1)}% of the sheet, strength ${p.strength.toFixed(2)}, laid ${delivered.toFixed(3)} on average over its footprint`);
    setStage({ stage: 'wash', step: `${p.role} ${p.id}`, pass: k + 1, of: plan.passages.length, technique: T.name });
    await shoot();
    if (checkpoint) await checkpoint(k + 1, p.id);
  }
  return { laid, records };
}
