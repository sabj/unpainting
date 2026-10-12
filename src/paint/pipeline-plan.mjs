// One plan owns drawing, washes and order. Flags are an execution adapter, not a second plan.
import { drawingFlags } from './drawing-plan.mjs';
import { readSubjectOrder } from './methods/subject-order.mjs';

function object(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${name}: expected an object`);
  return v;
}
function number(v, fallback, min, max, name) {
  v ??= fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(`${name}: expected ${min}..${max}`);
  return v;
}
function choice(v, fallback, choices, name) {
  v ??= fallback;
  if (!choices.includes(v)) throw Error(`${name}: expected ${choices.join(', ')}`);
  return v;
}
export function resolvePipeline(plan = {}) {
  const drawing = structuredClone(plan.drawing ?? {});
  object(drawing, 'drawing');
  const washes = object(plan.washes ?? {}, 'washes');
  const order = object(plan.order ?? {}, 'order');
  if (plan.subjectOrder && order.subjects) throw Error('use order.subjects, not both order.subjects and subjectOrder');
  const subjects = order.subjects ?? plan.subjectOrder ?? null;
  readSubjectOrder(subjects, plan.families ?? []);
  const physics = object(washes.physics ?? {}, 'washes.physics');
  const resolved = {
    drawing,
    washes: {
      furReserves: washes.furReserves == null ? null : object(washes.furReserves, 'washes.furReserves'),
      colour: choice(washes.colour, 'family', ['family', 'layered'], 'washes.colour'),
      sessions: choice(washes.sessions, 'passage', ['dry', 'passage', 'connected'], 'washes.sessions'),
      inkAware: washes.inkAware ?? (['source-ink', 'line-map'].includes(drawing.source) && drawing.medium !== 'none'),
      charge: number(washes.charge, .5, 0, 1, 'washes.charge'),
      carryMm: number(washes.carryMm, 2, 0, 10, 'washes.carryMm'),
      paleLimit: number(washes.paleLimit, .16, 0, 1, 'washes.paleLimit'),
      physics: {
        holeRimMm: number(physics.holeRimMm, 0, 0, 3, 'washes.physics.holeRimMm'),
        marangoni: number(physics.marangoni, 0, 0, 1, 'washes.physics.marangoni'),
        slope: number(physics.slope, 0, -1, 1, 'washes.physics.slope'),
      },
    },
    order: { subjects, strength: number(order.strength, subjects ? .5 : 0, 0, 1, 'order.strength') },
  };
  if (typeof resolved.washes.inkAware !== 'boolean') throw Error('washes.inkAware: expected boolean');
  if (!subjects && resolved.order.strength) throw Error('order.strength needs order.subjects');
  return resolved;
}
export function pipelineFlags(plan) {
  const p = resolvePipeline(plan), w = p.washes, flags = drawingFlags(p.drawing);
  const add = (k,v) => flags.push('--'+k,String(v));
  if (w.furReserves) add('furreserves', JSON.stringify(w.furReserves));
  add('washsession', { dry:0, passage:1, connected:2 }[w.sessions]);
  // Layering changes dilution and charge, not the source's colour families. A neutral
  // foundation crossing an orange passage cannot be corrected by a later light wash.
  add('huechroma', 30);
  add('passcap', w.colour === 'family' ? w.charge : 0);
  add('maskmm', w.colour === 'family' ? w.carryMm : 0);
  add('lightfamilies', 1);
  add('palelights', w.colour === 'family' ? w.paleLimit : 0);
  add('washinkfree', +w.inkAware);
  add('subjectorder', p.order.strength);
  add('holerim', w.physics.holeRimMm);
  add('physics', `marangoni=${w.physics.marangoni},slope=${w.physics.slope}`);
  return { flags, plan:p };
}
