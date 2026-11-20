// One plan owns drawing, washes and order. Flags are an execution adapter, not a second plan.
import { drawingFlags } from './drawing-plan.mjs';
import { readSubjectOrder } from './methods/subject-order.mjs';
import { BOX } from '../crop/box.mjs';

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
  const physics = object(washes.physics ?? {}, 'washes.physics');
  const resolved = {
    drawing,
    washes: {
      furReserves: washes.furReserves == null ? null : object(washes.furReserves, 'washes.furReserves'),
      paints: paints(washes.paints),
      colour: choice(washes.colour, 'family', ['family', 'layered'], 'washes.colour'),
      sessions: choice(washes.sessions, 'passage', ['dry', 'passage', 'connected'], 'washes.sessions'),
      inkAware: washes.inkAware ?? false,
      charge: number(washes.charge, .5, 0, 1, 'washes.charge'),
      carryMm: number(washes.carryMm, 2, 0, 10, 'washes.carryMm'),
      paleLimit: number(washes.paleLimit, .16, 0, 1, 'washes.paleLimit'),
      skyOneLayer: washes.skyOneLayer == null ? null : washes.skyOneLayer,
      lanes: washes.lanes == null ? null : washes.lanes,
      soften: washes.soften == null ? null : (typeof washes.soften === 'boolean' ? { enabled: washes.soften } : object(washes.soften, 'washes.soften')),
      edgeFadeMm: washes.edgeFadeMm == null ? null : number(washes.edgeFadeMm, 0, 0, 10, 'washes.edgeFadeMm'),
      edgeWobbleMm: washes.edgeWobbleMm == null ? null : number(washes.edgeWobbleMm, 0, 0, 5, 'washes.edgeWobbleMm'),
      smallMarks: washes.smallMarks == null ? null : washes.smallMarks,
      joinSmall: washes.joinSmall == null ? null : washes.joinSmall,
      physics: {
        holeRimMm: number(physics.holeRimMm, 0, 0, 3, 'washes.physics.holeRimMm'),
        marangoni: number(physics.marangoni, 0, 0, 1, 'washes.physics.marangoni'),
        slope: number(physics.slope, 0, -1, 1, 'washes.physics.slope'),
      },
    },
    order: { subjects, strength: number(order.strength, subjects ? .5 : 0, 0, 1, 'order.strength') },
  };
  if (typeof resolved.washes.inkAware !== 'boolean') throw Error('washes.inkAware: expected boolean');
  for (const k of ['skyOneLayer', 'lanes', 'smallMarks', 'joinSmall']) {
    if (resolved.washes[k] != null && typeof resolved.washes[k] !== 'boolean') throw Error(`washes.${k}: expected boolean`);
  }
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
  if (w.furReserves && (!onlyAuthored || rawW.furReserves != null)) add('furreserves', JSON.stringify(w.furReserves));
  if (w.paints && (!onlyAuthored || rawW.paints != null)) add('paints', w.paints.join(','));
  if (!onlyAuthored || rawW.sessions != null) add('washsession', { dry:0, passage:1, connected:2 }[w.sessions]);
  // Honour the authored wash mode: colour-family splitting changes the passage plan. Layered
  // washes still keep light colour families apart, split on perceptual chroma, so a neutral
  // foundation cannot pool its sepia charge across a saturated orange passage.
  // Both modes split saturated from muted at the same chroma, 30. (A layered-only split at Lab chroma 20, chosen so one
  // subject's orange got its own wash, was removed in 0.3.3 as fitted to that subject.)
  if (!onlyAuthored || rawW.colour != null) {
    add('huechroma', 30);
    if (w.colour === 'layered') add('huechromalab', 1);
    if (w.colour === 'layered') add('shadowfamilies', 1);
    add('maskmm', w.colour === 'family' ? w.carryMm : 0);
    add('lightfamilies', 1);
    add('palelights', w.colour === 'family' ? w.paleLimit : 0);
  }
  // Both modes charge each passage at the washes.charge quantile of its demand and carry the rest into the next
  // band, so the darkest cells of a shadow get a smaller, darker restatement instead of the shape's flat mean.
  if (!onlyAuthored || rawW.charge != null) add('passcap', w.charge);
  if (onlyAuthored && rawW.carryMm != null && rawW.colour == null) add('maskmm', w.colour === 'family' ? w.carryMm : 0);
  if (onlyAuthored && rawW.paleLimit != null && rawW.colour == null) add('palelights', w.colour === 'family' ? w.paleLimit : 0);
  if (!onlyAuthored || rawW.inkAware != null) add('washinkfree', +w.inkAware);
  if (!onlyAuthored || rawOrder.strength != null || rawOrder.subjects != null || plan?.subjectOrder != null) add('subjectorder', p.order.strength);
  if (w.skyOneLayer != null) add('skyonelayer', +w.skyOneLayer);
  if (w.lanes != null) { add('strokeplan', +w.lanes); add('laneadapt', +w.lanes); }
  if (w.soften != null) {
    const on = w.soften.enabled ?? true;
    add('softsplit', +on);
    if (w.soften.maxArcMm != null) add('softmm', w.soften.maxArcMm);
  }
  if (w.edgeFadeMm != null) add('edgefade', w.edgeFadeMm);
  if (w.edgeWobbleMm != null) add('edgewobble', w.edgeWobbleMm);
  if (w.smallMarks != null) add('smallmarks', +w.smallMarks);
  if (w.joinSmall != null) add('washjoin', +w.joinSmall);
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
