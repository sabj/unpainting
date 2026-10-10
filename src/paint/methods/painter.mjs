// The painter's loop: look at the subject, look at the sheet, decide one act, do it by brush, look again.
// Pencil first (drawing.mjs), then first washes light and big first, each to its light note (subject.mjs), then rounds
// of looking (look.mjs) that cut in what is still wanted at a rising level with a shrinking brush.
import { layersOf, thickness } from '../../media/sheet.mjs';
import { renderLayers } from '../../media/km.mjs';
import { dilate } from '../../raster.js';

import { chooseTechnique } from '../../crop/technique.mjs';
import { mixPalette, wellFor, describePalette } from './palette.mjs';
import { lightsMask, bigShapes, meanOver } from './subject.mjs';
import { sheetDensity, residualOf, quantileOver, passesMedian } from './look.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { layPassage, passagePaths, softenPassage, dryFully, calibrateYield, chargeFor, TECHNIQUES } from './lay.mjs';
import { outlineGestures, drawPencil } from './drawing.mjs';

const unit = v => { const m = Math.hypot(v[0], v[1], v[2]); return m > 1e-12 ? v.map(x => x / m) : [0.577, 0.577, 0.577]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The rounds that follow the first washes: where the level sits in what is still wanted, the smallest region worth an act
 *  as a share of the sheet, and the brush as a share of the first mop. */
const ROUNDS = [
  { q: 0.35, minArea: 0.006, brush: 0.7 },
  { q: 0.50, minArea: 0.003, brush: 0.45 },
  { q: 0.65, minArea: 0.0015, brush: 0.28 },
  { q: 0.78, minArea: 0.0008, brush: 0.18 },
  { q: 0.85, minArea: 0.0005, brush: 0.14 },
];

/**
 * @param ctx  { sheet, base, paints, S, w, h, O, shoot?, log? }: the sheet (its pigments the paints, then graphite),
 *             the paper buffer it renders on, the paints (K per pigment), the subject (readSubject), the physics
 * @param opts wells, cap, tol (palette); rounds; aim (share of the residual to lay per act, under one because paint
 *             cannot be lifted); maxPasses (acts a cell may take); drawing 'pencil' or 'none'; brushShare (the mop
 *             as a share of the short side); k (colours the first washes are cut into); frames (about how many)
 */
export async function paint(ctx, opts = {}) {
  const { sheet, base, paints, S, w, h, O } = ctx, n = w * h, K = sheet.pigments.length;
  const { wells = 10, cap = 12, tol = 0.975, rounds = 5, aim = 0.85, maxPasses = 6, drawing = 'pencil', brushShare = 0.076, k = 6, frames = 80, floor = 0.03, seed = 1, graphiteAt = paints.length, bare = 0.05, lightShare = 0.4 } = opts;
  const log = ctx.log ?? (() => {}), shoot = ctx.shoot ?? (async () => {});
  const render = () => renderLayers(layersOf(sheet), sheet.pigments, base, n, 1);
  const look = () => sheetDensity(render(), base, n);

  // the palette and the brush's yield, before anything touches the sheet
  const lights = lightsMask(S.tone, w, h, { bare });
  const palette = mixPalette(paints, S.D, { wells, cap, tol, stride: 2 });
  // one swatch per technique for the mop and one for the small round brush: their loads differ by an order of magnitude
  const yields = { mop: calibrateYield(paints, O, { seed: 5, maxRadius: 8 }), small: calibrateYield(paints, O, { seed: 5, maxRadius: 2, size: 48 }) }, gain = { mop: {}, small: {} };
  for (const t of Object.keys(TECHNIQUES)) { gain.mop[t] = 1; gain.small[t] = 1; }
  void 0;
  log(`calibration cover: mop ${yields.mop.cover.toFixed(2)} sweeps over the swatch's mean cell, small brush ${yields.small.cover.toFixed(2)}`);
  log(`palette: ${palette.wells.length} wells mixed from ${paints.map(p => p.name).join(', ')}\n${describePalette(palette)}`);
  log(`yield per unit charge, mop: ${Object.keys(TECHNIQUES).map(t => `${t} ${yields.mop[t].toFixed(3)}`).join(', ')}; small brush: ${Object.keys(TECHNIQUES).map(t => `${t} ${yields.small[t].toFixed(3)}`).join(', ')}`);
  const passes = new Uint8Array(n), acts = [], used = {};
  const mop = Math.max(3, Math.round(brushShare * Math.min(w, h)));
  let peak = quantileOver(S.tone, 0.98);
  let sweeps = 0, dips = 0, act = 0;
  const wet = mask => { const d = dilate(mask, w, h, 2); for (let i = 0; i < n; i++) if (d[i] && sheet.M[i]) return true; return false; };

  // Stage 1: the drawing.
  if (drawing === 'pencil') {
    const gestures = outlineGestures(S, w, h);
    const r = drawPencil(sheet, gestures, { w, h, graphiteAt, O });
    log(`pencil: ${r.drawn} outlines placed first`);
    await shoot({ stage: 'pencil', outlines: r.drawn });
  }

  /** One act: a well and a mass for the residual r over `mask`, laid with T, then read back. */
  const doAct = async (mask, r, T, maxRadius, want, round, why, film) => {
    // the first washes keep the brush a little inside their passage so neighbours laid wet do not run together; a glaze
    // goes to the edge, since a gap there leaves a keyline of bare paper around every dark mass
    const { paths, radius, cover } = passagePaths(mask, w, h, { maxRadius, want, seed: seed * 7 + act * 13, pad: round === 1 ? 1.5 : 0.8 });
    if (!paths.length) return null;
    // a new well is worth mixing for a passage of size wanting a colour the palette has not got; a touch takes the nearest
    let area = 0; for (let i = 0; i < n; i++) area += mask[i];
    const pick = wellFor(palette, r, { allowNew: area >= 0.01 * n && Math.hypot(r[0], r[1], r[2]) >= 0.1 }), cls = radius < 2.5 ? 'small' : 'mop';
    // paint cannot be lifted, so an act aims short of what is wanted, and shorter with a small brush whose delivery
    // over a few cells is the least predictable; the next look pays the difference. One act lays no more than the
    // optics' linear range (a mass of 1.6, km.mjs): the deepest darks take two acts, as they do on a real sheet.
    const mass = Math.min(1.6, pick.mass * (cls === 'small' ? Math.min(aim, 0.65) : round > 1 ? Math.min(aim, 0.7) : aim));
    if (mass < 1e-4) return null;
    // the sweeps cover this passage's mean cell more or fewer times than they covered the calibration swatch's
    const coverRatio = clamp(cover / Math.max(0.2, yields[cls].cover), 0.4, 2.5);
    const charge = chargeFor(pick.well, mass, yields[cls][T.name] * gain[cls][T.name] * coverRatio, K);
    const before = meanOver(look(), mask);
    // a glaze goes over dry paint, and a wash beside a wet one would run into it
    if ((T.dryAfter || round > 1) && wet(mask)) dryFully(sheet, O);
    const laid = layPassage(sheet, mask, charge, { w, h, T, maxRadius, seed: seed * 7 + act * 13, O, want, amount: dot(r, [1, 1, 1]) / 3, onSweep: film, paths, tone: S.tone, reach: T.intoWet ? Math.round(0.03 * Math.min(w, h)) : 0 });
    // the first washes lose the stretches of their edge the source loses, while they are wet
    if (laid.sweeps && round === 1 && !T.intoWet) softenPassage(sheet, mask, S.tone, lights, w, h, O, { radius: Math.max(4, Math.round(maxRadius * 0.6)), seed: 17 + act });
    if (!laid.sweeps) return null;
    sweeps += laid.sweeps; dips += laid.dips;
    for (let i = 0; i < n; i++) if (mask[i] && passes[i] < 255) passes[i]++;
    const after = meanOver(look(), mask), dir = pick.well.dir;
    const wanted = 2 * dot(pick.well.K, dir) * mass, delivered = dot(after.map((v, c) => v - before[c]), dir), ratio = delivered / Math.max(1e-6, wanted);
    // the brush is learned from acts big enough to read: a one-sweep act over forty cells is noise
    if (ratio > 0.2 && ratio < 5 && laid.sweeps >= 3 && area >= 40) gain[cls][T.name] = clamp(gain[cls][T.name] * (0.5 + 0.5 * ratio), 0.3, 3);
    used[T.name] = (used[T.name] || 0) + 1;
    act++;
    const rec = { act, round, why, well: pick.index + 1, name: pick.well.name, fresh: pick.fresh, washed: pick.washed, fit: +pick.fit.toFixed(3), mass: +mass.toFixed(3), technique: T.name, brush: cls, cover: +cover.toFixed(2), area, sweeps: laid.sweeps, dips: laid.dips, wanted: +wanted.toFixed(3), delivered: +delivered.toFixed(3) };
    acts.push(rec);
    log(`act ${act} (round ${round}, ${why}): well ${rec.well} ${rec.name}${pick.fresh ? (pick.washed ? ' [washed out and re-mixed]' : ' [new]') : ''} at mass ${mass.toFixed(2)}, ${T.name}, ${laid.sweeps} sweeps, wanted ${wanted.toFixed(2)} got ${delivered.toFixed(2)}`);
    return rec;
  };

  // Stage 2: the first washes, light first, each to its light note.
  const shapes = bigShapes(S, w, h, { k, lights, minArea: 0.015, seed, lightShare, smooth: Math.max(1, Math.round(0.005 * Math.min(w, h))) });
  log(`first washes: ${shapes.length} passages, light first`);
  let filmed = 0;
  for (const [j, sh] of shapes.entries()) {
    const have = meanOver(look(), sh.mask);
    const r = sh.light.map((v, c) => Math.max(0, v - have[c]));
    if (dot(r, [1, 1, 1]) / 3 < floor) continue;
    // a first wash is a wash: wet into wet where the source's edge is lost, wet on dry where it stops; the dry brush
    // and the glaze are later rounds' instruments
    const T0 = chooseTechnique(S.tone, sh.mask, w, h, { peak });
    const T = T0.name === 'wet on wet' ? TECHNIQUES['wet on wet'] : TECHNIQUES['first wash'];
    const film = async (done, total) => { if (total >= 6 && done % Math.ceil(total / 3) === 0 && done < total) { await shoot({ stage: 'wash', round: 1, act: act + 1, of: shapes.length, well: '', laying: true }); filmed++; } };
    // the film callback is synchronous inside the stroke loop: frames are queued by the caller's shoot
    const rec = await doAct(sh.mask, r, T, mop, S.tone, 1, `first wash, passage ${j + 1} of ${shapes.length}`, (d, t) => { film(d, t); });
    if (rec) await shoot({ stage: 'wash', round: 1, act, of: shapes.length, well: rec.name, technique: T.name });
  }
  dryFully(sheet, O);
  await shoot({ stage: 'dry', round: 1 });

  // Stage 3: look, and cut in what is still wanted, round by round.
  const perRound = Math.max(4, Math.round((frames - acts.length - 2) / Math.max(1, rounds - 1)));
  const rounds_ = [];
  for (let round = 2; round <= rounds; round++) {
    const P = ROUNDS[Math.min(ROUNDS.length - 1, round - 2)];
    const have = look(), { R, mag, over } = residualOf(S.D, have, n);
    let meanR = 0; for (let i = 0; i < n; i++) meanR += mag[i]; meanR /= n;
    const exclude = new Uint8Array(n); for (let i = 0; i < n; i++) exclude[i] = lights[i] || passes[i] >= maxPasses ? 1 : 0;
    const level = Math.max(floor, quantileOver(mag, P.q, { floor, mask: Uint8Array.from(exclude, v => 1 - v) }));
    // What is still wanted, as shapes of the picture: the subject cut into its colours at a finer blur each round, each
    // shape kept only where the sheet still wants more than the level. So a dark is cut in with the picture's own edges;
    // regions cut from the residual alone come out as blobs and dots. Each region's want is its mean residual.
    const below = Uint8Array.from(exclude); { const B = gaussian(mag, w, h, 1); for (let i = 0; i < n; i++) if (B[i] < level) below[i] = 1; }
    const regions = bigShapes(S, w, h, { k: 4 + round, sigma: Math.max(1, (0.02 / (round - 1)) * Math.min(w, h)), minArea: P.minArea, lights: below, seed: seed + round, grow: 2, smooth: 0 })
      .filter(reg => reg.area >= Math.max(6, Math.round(P.minArea * n)))
      .map(reg => ({ ...reg, mean: meanOver(R, reg.mask) }))
      .sort((a, b) => b.area - a.area);
    rounds_.push({ round, residual: +meanR.toFixed(4), over: +over.toFixed(3), level: +level.toFixed(3), regions: regions.length });
    log(`round ${round}: residual ${meanR.toFixed(3)} (over ${(100 * over).toFixed(1)}% of cells), level ${level.toFixed(3)}, ${regions.length} regions, brush ${Math.max(1, Math.round(mop * P.brush))}`);
    if (meanR < 0.02 || !regions.length) break;
    const every = Math.max(1, Math.ceil(regions.length / perRound));
    // a frame is taken when the sheet has changed by an act's worth of area since the last one, so the late rounds'
    // small touches do not fill the film with near-identical frames
    let j = 0, since = 0;
    for (const reg of regions) {
      const r = reg.mean;
      if (dot(r, [1, 1, 1]) / 3 < floor * 0.5) continue;
      // a glaze overlaps its neighbours by a cell, never a light: adjacent regions cut from the picture's colours meet
      // at a seam, and a brush held inside each would leave the seam as bare paper
      { const d = dilate(reg.mask, w, h, 1); for (let i = 0; i < n; i++) reg.mask[i] = d[i] && !lights[i] ? 1 : 0; }
      const T0 = chooseTechnique(S.tone, reg.mask, w, h, { peak });
      // a glaze over dry paint; a passage the source says is dragged is dragged; wet on wet only in the first washes
      const T = T0.name === 'dry brush' ? TECHNIQUES['dry brush'] : T0.name === 'glazed' ? TECHNIQUES.glazed : TECHNIQUES['wet on dry'];
      const rec = await doAct(reg.mask, r, T, Math.max(1, Math.round(mop * P.brush)), mag, round, `round ${round} region ${++j} of ${regions.length}`, null);
      if (rec) since += rec.area;
      if (rec && (j % every === 0 || j === regions.length) && since >= 0.01 * n) { await shoot({ stage: 'wash', round, act, of: regions.length, well: rec.name, technique: T.name }); since = 0; }
    }
    dryFully(sheet, O);
  }
  dryFully(sheet, O);
  await shoot({ stage: 'finished' });
  const have = look(), { mag, over } = residualOf(S.D, have, n);
  let meanR = 0; for (let i = 0; i < n; i++) meanR += mag[i]; meanR /= n;
  let pmax = 0; for (let i = 0; i < n; i++) if (passes[i] > pmax) pmax = passes[i];
  const lightsKept = (() => { const th = thickness(sheet); let s = 0, c = 0; for (let i = 0; i < n; i++) if (lights[i]) { c++; for (let j = 0; j < paints.length; j++) s += th[j][i]; } return c ? s / c : 0; })();
  return {
    palette, acts, rounds: rounds_, used, sweeps, dips, passes,
    stats: { acts: act, sweeps, dips, wells: palette.wells.length, mixed: palette.mixed, washouts: palette.washouts, passesMedian: passesMedian(passes), passesMax: pmax, residual: +meanR.toFixed(4), over: +over.toFixed(3), lightsMass: +lightsKept.toFixed(4), techniques: used },
  };
}
