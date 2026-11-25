// One plan owns drawing, washes and order. Flags are an execution adapter, not a second plan.
import { drawingFlags } from './drawing-plan.mjs';
import { readSubjectOrder } from './methods/subject-order.mjs';
import { BOX } from '../crop/box.mjs';
import { DEFAULTS as SHEET } from '../media/sheet.mjs';

function object(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${name}: expected an object`);
  return v;
}
function number(v, fallback, min, max, name) {
  v ??= fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(`${name}: expected ${min}..${max}`);
  return v;
}
// washes.paints: the authored box palette, by box key. A colour subject names its pans instead of the fit choosing them.
function paints(v) {
  if (v == null) return null;
  const keys = BOX.map(p => p.key);
  if (!Array.isArray(v) || !v.length || v.some(k => !keys.includes(k))) throw Error(`washes.paints: expected box keys from ${keys.join(", ")}`);
  return [...v];
}
function choice(v, fallback, choices, name) {
  v ??= fallback;
  if (!choices.includes(v)) throw Error(`${name}: expected ${choices.join(', ')}`);
  return v;
}
export function resolvePipeline(plan = {}) {
  const drawing = structuredClone(plan.drawing ?? {});
  object(drawing, 'drawing');
  drawingFlags(drawing);
  const washes = object(plan.washes ?? {}, 'washes');
  const order = plan.order && typeof plan.order === 'object' && !Array.isArray(plan.order) ? plan.order : {};
  if (plan.subjectOrder && order.subjects) throw Error('use order.subjects, not both order.subjects and subjectOrder');
  const subjects = order.subjects ?? plan.subjectOrder ?? null;
  readSubjectOrder(subjects, plan.families ?? []);
  if (washes.darkGain != null) throw Error('washes.darkGain was removed in 0.3.3: the painter delivers the value the plan states, so a plan sets values, not gains');
  if (washes.deepAccent != null) throw Error('washes.deepAccent was removed in 0.3.3: it restated every cell darker than a threshold as two late dark layers, a rule over target pixels; the plan names its last darks');
  // the wash fields that set the light-to-dark value plan (removed in 0.4, last at commit 49447027): a plan naming one fails
  for (const k of ['colour', 'charge', 'carryMm', 'paleLimit', 'skyOneLayer', 'lanes', 'edgeFadeMm', 'edgeWobbleMm', 'smallMarks', 'joinSmall', 'furReserves'])
    if (washes[k] != null) throw Error(`washes.${k} was removed in 0.4 with the light-to-dark value plan (last at commit 49447027); the washes come from a block-in study (--washplan)`);
  const physics = object(washes.physics ?? {}, 'washes.physics');
  const resolved = {
    drawing,
    washes: {
      paints: paints(washes.paints),
      sessions: choice(washes.sessions, 'passage', ['dry', 'passage', 'connected'], 'washes.sessions'),
      inkAware: washes.inkAware ?? false,
      soften: washes.soften == null ? null : (typeof washes.soften === 'boolean' ? { enabled: washes.soften } : object(washes.soften, 'washes.soften')),
      physics: {
        holeRimMm: number(physics.holeRimMm, 0, 0, 3, 'washes.physics.holeRimMm'),
        marangoni: number(physics.marangoni, 0, 0, 1, 'washes.physics.marangoni'),
        // the sheet's own: water levels its surface over the paper's grain (sheet.mjs slope), unless a plan says otherwise
        slope: number(physics.slope, SHEET.slope, -1, 1, 'washes.physics.slope'),
      },
    },
    order: { subjects, strength: number(order.strength, subjects ? .5 : 0, 0, 1, 'order.strength') },
  };
  if (typeof resolved.washes.inkAware !== 'boolean') throw Error('washes.inkAware: expected boolean');
  if (resolved.washes.soften) {
    if (resolved.washes.soften.enabled != null && typeof resolved.washes.soften.enabled !== 'boolean') throw Error('washes.soften.enabled: expected boolean');
    if (resolved.washes.soften.maxArcMm != null) number(resolved.washes.soften.maxArcMm, 25, 0, 200, 'washes.soften.maxArcMm');
  }
  if (!subjects && resolved.order.strength) throw Error('order.strength needs order.subjects');
  return resolved;
}
export function pipelineFlags(plan, { onlyAuthored = false } = {}) {
  const p = resolvePipeline(plan), w = p.washes, flags = drawingFlags(p.drawing);
  const add = (k,v) => flags.push('--'+k,String(v));
  const rawW = plan?.washes ?? {};
  const rawOrder = plan?.order && typeof plan.order === 'object' && !Array.isArray(plan.order) ? plan.order : {};
  const rawPhysics = rawW.physics ?? {};
  if (w.paints && (!onlyAuthored || rawW.paints != null)) add('paints', w.paints.join(','));
  if (!onlyAuthored || rawW.sessions != null) add('washsession', { dry:0, passage:1, connected:2 }[w.sessions]);
  if (!onlyAuthored || rawW.inkAware != null) add('washinkfree', +w.inkAware);
  if (!onlyAuthored || rawOrder.strength != null || rawOrder.subjects != null || plan?.subjectOrder != null) add('subjectorder', p.order.strength);
  if (w.soften != null) {
    const on = w.soften.enabled ?? true;
    add('softsplit', +on);
    if (w.soften.maxArcMm != null) add('softmm', w.soften.maxArcMm);
  }
  if (!onlyAuthored || rawPhysics.holeRimMm != null) add('holerim', w.physics.holeRimMm);
  if (!onlyAuthored) {
    add('physics', `marangoni=${w.physics.marangoni},slope=${w.physics.slope}`);
  } else if (rawW.physics != null) {
    const parts = [];
    if (rawPhysics.marangoni != null) parts.push(`marangoni=${rawPhysics.marangoni}`);
    if (rawPhysics.slope != null) parts.push(`slope=${rawPhysics.slope}`);
    if (parts.length) add('physics', parts.join(','));
  }
  return { flags, plan:p };
}
