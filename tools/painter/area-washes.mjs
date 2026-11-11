// Colour and value changed inside the wet wash (painting-rules.md 15): an area pass can be a graded or variegated wash
// with a direction, and can have a second colour charged into it while it is wet.
//   pass.wash {kind:graded, direction, strength:[start,end], reason}: the pass's loads are dipped stronger or weaker
//     along `direction`, start to end (a plane over each shape, mean 1, so the shape's booked paint is unchanged; the
//     painter dips each load at the plane under it and presses along it: graded-demand.mjs).
//   pass.wash {kind:variegated, direction, paint:{pigment:share}, reason}: the wash turns from the pass's own colour at
//     the start to `paint` at the end, the same amount of pigment throughout; each load is dipped at the mix where it lies.
//   pass.charge {paint, strength, water, reason, polygon?}: right after the pass, while it is wet, a load of `paint`
//     (strength x the pass's mean amount) is dropped into it in lanes one brush width apart, inside `polygon` or over the
//     whole pass. The brush carries `water`, never wetter than the pass's own load (a wetter brush makes a backrun); a
//     lane whose bed has passed the wet stage is not charged and is counted.
// Directions are in normalized target coordinates; nothing here reads the target.
import { BOX } from '../../src/crop/box.mjs';

const fail = m => { throw Error(`semantic areas: ${m}`); };
const finite = x => typeof x === 'number' && Number.isFinite(x);
const WET_MOVES = ['wet on wet', 'wet on dry'];

export const AREA_WASHES_CONTRACT = Object.freeze({
  wash: 'Optional pass.wash on a wet on wet or wet on dry pass (not authored): {kind:graded,direction:[dx,dy],strength:[start,end],reason} loads stronger or weaker along direction (normalized target), mean unchanged; {kind:variegated,direction:[dx,dy],paint:{pigment:share},reason} turns from the pass colour to paint along direction, same amount of pigment.',
  charge: 'Optional pass.charge:{paint:{pigment:share},strength,water,reason,polygon?} on a wet on wet or wet on dry pass (not authored): right after the pass, while it is wet, a second colour at strength x the pass mean amount is charged into it in lanes one brush width apart (inside polygon when given); water 0..1 and no more than the pass load water.',
});

const paintShares = (paint, key) => {
  if (typeof paint !== 'object' || paint === null || Array.isArray(paint) || !Object.keys(paint).length) fail(`${key}: paint {pigment: share} required`);
  for (const [k, v] of Object.entries(paint)) if (!k || !finite(v) || v <= 0) fail(`${key}: paint share ${k}`);
};
const only = (o, allowed, key) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${key}: unknown field ${k}`); };

/** Checks pass.wash and pass.charge (document level). polygonCheck validates a polygon. */
export function validateAreaWashes(pass, key, polygonCheck) {
  if (pass.wash === undefined && pass.charge === undefined) return;
  if (pass.source === 'authored') fail(`wash/charge ${key}: not on authored passes`);
  if (!WET_MOVES.includes(pass.move)) fail(`wash/charge ${key}: needs a wet on wet or wet on dry pass`);
  const w = pass.wash;
  if (w !== undefined) {
    if (typeof w !== 'object' || w === null) fail(`wash ${key}`);
    if (typeof w.reason !== 'string' || !w.reason.trim()) fail(`wash ${key}.reason required`);
    if (!Array.isArray(w.direction) || w.direction.length !== 2 || !w.direction.every(finite) || Math.hypot(...w.direction) < 1e-9) fail(`wash ${key}: direction [dx, dy] required`);
    if (w.kind === 'graded') {
      only(w, ['kind', 'direction', 'strength', 'reason'], `wash ${key}`);
      if (!Array.isArray(w.strength) || w.strength.length !== 2 || !w.strength.every(v => finite(v) && v > 0) || w.strength[0] === w.strength[1]) fail(`wash ${key}: strength [start, end], positive and different`);
    } else if (w.kind === 'variegated') {
      only(w, ['kind', 'direction', 'paint', 'reason'], `wash ${key}`);
      paintShares(w.paint, `wash ${key}`);
    } else fail(`wash ${key}: kind graded or variegated`);
  }
  const c = pass.charge;
  if (c !== undefined) {
    if (typeof c !== 'object' || c === null) fail(`charge ${key}`);
    only(c, ['paint', 'strength', 'water', 'reason', 'polygon'], `charge ${key}`);
    if (typeof c.reason !== 'string' || !c.reason.trim()) fail(`charge ${key}.reason required`);
    paintShares(c.paint, `charge ${key}`);
    if (!finite(c.strength) || c.strength <= 0) fail(`charge ${key}: strength > 0`);
    if (!finite(c.water) || c.water < 0 || c.water > 1) fail(`charge ${key}: water 0..1`);
    if (c.water > pass.load.water) fail(`charge ${key}: the brush (water ${c.water}) is wetter than the wash (${pass.load.water}); that makes a backrun, not a charge`);
    if (c.polygon !== undefined) polygonCheck(c.polygon, `${key}.charge`);
  }
}

/** Pigment amounts for paint shares over a palette, scaled to `amount` in total; fails on a pigment not on the palette. */
// a palette entry's box key: its own key, or the box pigment of the same name (a picked palette carries names)
const keyOf = p => p.key ?? BOX.find(b => b.name === p.name)?.key ?? null;
export function paintMix(paint, palette, amount, key) {
  const keys = palette.map(keyOf), total = Object.values(paint).reduce((a, b) => a + b, 0), mix = new Array(keys.length).fill(0);
  for (const [k, v] of Object.entries(paint)) { const j = keys.indexOf(k); if (j < 0) fail(`${key}: pigment ${k} is not on this run's palette (${keys.join(', ')})`); mix[j] = amount * v / total; }
  return mix;
}

/** A direction in normalized target coordinates as a unit vector on the plan grid (w x h cells over the crop). */
export function gridDirection(plan, direction) {
  const T = plan.doc.target, c = plan.crop, dx = direction[0] * T.width / c[2] * plan.w, dy = direction[1] * T.height / c[3] * plan.h, d = Math.hypot(dx, dy);
  return [dx / d, dy / d];
}

/** Where along the area the wash runs: projections of the area's cells on the direction (start and end of the run). */
export function washSpan(plan, areaIndex, dir) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < plan.owner.length; i++) if (plan.owner[i] === areaIndex) { const u = (i % plan.w + .5) * dir[0] + (Math.floor(i / plan.w) + .5) * dir[1]; if (u < lo) lo = u; if (u > hi) hi = u; }
  return { dir, lo, hi: hi > lo ? hi : lo + 1 };
}
/** 0 at the start of the run, 1 at its end, at a plan-grid point. */
export const washAt = (span, x, y) => Math.min(1, Math.max(0, (x * span.dir[0] + y * span.dir[1] - span.lo) / (span.hi - span.lo)));

/** A graded wash's plane over a shape's cells (graded-demand.mjs planeAt form), mean 1 over those cells. */
export function gradedPlane(cells, w, span, [start, end]) {
  let sx = 0, sy = 0, sg = 0;
  const g = i => start + (end - start) * washAt(span, i % w + .5, Math.floor(i / w) + .5);
  for (const i of cells) { sx += i % w + .5; sy += Math.floor(i / w) + .5; sg += g(i); }
  const n = cells.length, cx = sx / n, cy = sy / n, m = sg / n, k = (end - start) / (span.hi - span.lo) / m;
  const shift = (start + (end - start) * ((cx * span.dir[0] + cy * span.dir[1] - span.lo) / (span.hi - span.lo))) / m - 1;
  let fmin = Infinity, fmax = -Infinity;
  for (const i of cells) { const f = g(i) / m; if (f < fmin) fmin = f; if (f > fmax) fmax = f; }
  return { cx, cy, gx: k * span.dir[0], gy: k * span.dir[1], shift, lo: Math.min(start, end) / m, hi: Math.max(start, end) / m, range: [fmin, fmax], planned: true };
}

/** A variegated load's charge: the pass colour turning to the second colour by where the load lies (sheet points). */
export function variegatedCharge(base, second, span, points, scale = 1) {
  let t = 0;
  for (const q of points) t += washAt(span, q.x / scale, q.y / scale);
  t /= Math.max(1, points.length);
  return base.map((v, j) => (1 - t) * v + t * second[j]);
}

/** Compile-time: graded plane or variegated colour on each compiled shape of a pass with pass.wash. */
export function compileAreaWash(plan, s, clone, cells, palette) {
  const w = s.pass.wash;
  if (!w) return;
  const dir = gridDirection(plan, w.direction), span = washSpan(plan, plan.doc.areas.indexOf(s.area), dir);
  // lanes run across the direction (brushedWashPaths angle: 0 lays vertical lanes; a lane at angle a runs across
  // [cos a, sin a]); folded into (-pi/2, pi/2], which lays the same lanes
  let a = Math.atan2(dir[1], dir[0]); if (a <= -Math.PI / 2) a += Math.PI; else if (a > Math.PI / 2) a -= Math.PI;
  clone._washAngle = a;
  if (w.kind === 'graded') clone._plane = gradedPlane(cells, plan.w, span, w.strength);
  else clone._variegate = { span, mix: paintMix(w.paint, palette, (clone.mix ?? []).reduce((a, b) => a + b, 0), `wash ${s.key}`) };
}

/** Lanes for a charge: the pass's shapes (inside the charge polygon, when given), one brush width apart. */
export function chargeMix(pass, palette, meanAmount, key) {
  return paintMix(pass.charge.paint, palette, pass.charge.strength * meanAmount, `charge ${key}`);
}
