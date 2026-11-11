// Step-backs: the only times the painter looks at the subject while painting (default mode).
//
// A painter steps back a few times, at set points fixed before the first mark, usually after a layer dries (0 to 5 a
// painting, usually 1 or 2: ~/wt/agents/painting-study.md; painting rule 23). Each step-back reads the sheet and the
// subject at shape scale, once, and leads to a few placed corrections. It is never repeated until an error stops
// falling: no look, correct, look again.
//
// The plan of step-backs is made before painting from the options alone:
//   - 'washes'  (--touchpoints > 0): after the planned washes dry, each planning family is read once; a family that
//     reads at least one value step lighter than the subject gets one darkening glaze (src/paint/methods/touch-up.mjs).
//   - 'accents' (--finaldarks > 0): before the last small darks, each accent family is read once (final-darks.mjs).
// Outside an open step-back every painting-time look returns null, so passages keep the charge frozen at planning,
// exactly as in strict mode. Strict mode (--notargetlooks 1) keeps the same plan and takes no look at all.
import { paintingLooks } from './painting-look.mjs';

/** The subject's own value step: its lightest (the 99th percentile of luminance, the paper) to its darkest (the 0.1th,
 *  the ink) on a nine-step value scale, the painter's usual one (the pen tracer's rule, src/crop/pen-trace.mjs). */
export function subjectValueStep(lum) {
  const n = lum.length; if (!n) throw new Error('step-backs: an empty subject has no value scale');
  const s = Float32Array.from(lum).sort(), q = f => s[Math.min(n - 1, Math.floor(f * n))];
  return (q(0.99) - q(0.001)) / 8;
}

/** Luminance 0..1 of an RGB mean (0..255). */
export const lumOf = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** The step-backs of one painting, fixed before the first mark. */
export function planStepBacks({ touchpoints = 0, finalDarks = 0 } = {}) {
  const plan = [];
  if (touchpoints > 0) plan.push({ id: 'washes', when: 'after the planned washes dry', reads: 'planning families', corrects: 'darken only, families a value step lighter than the subject' });
  if (finalDarks > 0) plan.push({ id: 'accents', when: 'after the touch-ups, before the last small darks', reads: 'accent families', corrects: 'a dark mark where the accent reads lighter' });
  return plan;
}

/**
 * The look gate. look(...) is the target guard's look inside an open step-back and null anywhere else (and always null
 * with noLooks > 0). open(id) fails loudly for a step-back not in the plan or one already taken; each family label may be
 * read once in a painting. record() says what was planned, taken and declined.
 */
export function createStepBacks(guard, noLooks, plan) {
  const planned = new Map(plan.map(p => [p.id, p])), taken = [], declined = {}, readLabels = new Set();
  const see = paintingLooks(guard, noLooks);
  let current = null;
  const api = {
    plan,
    open(id) {
      if (!planned.has(id)) throw new Error(`step-backs: '${id}' is not a planned step-back (${[...planned.keys()].join(', ') || 'none planned'})`);
      if (taken.some(t => t.id === id)) throw new Error(`step-backs: '${id}' was taken already; a step-back is never repeated`);
      if (current) throw new Error(`step-backs: '${current.id}' is still open`);
      current = { id, looks: 0, corrections: 0, strict: noLooks > 0 };
      taken.push(current);
      return current;
    },
    close(corrections = 0) {
      if (!current) throw new Error('step-backs: no step-back is open');
      current.corrections = corrections; current = null;
    },
    look(checkpoint, label, mask, options) {
      if (noLooks > 0) return null;
      if (!current) { declined[checkpoint] = (declined[checkpoint] ?? 0) + 1; return null; }
      if (readLabels.has(label)) throw new Error(`step-backs: '${label}' was read already; each shape is looked at once`);
      readLabels.add(label);
      const out = see(checkpoint, label, mask, options);
      if (out) current.looks++;
      return out;
    },
    record() {
      return { planned: plan, taken: taken.map(t => ({ ...t })), shapeLooks: taken.reduce((a, t) => a + t.looks, 0), declinedOutsideStepBacks: { ...declined }, strict: noLooks > 0 };
    },
  };
  return api;
}
