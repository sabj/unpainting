// Step-backs: the only times the painter looks at the subject while painting (default mode).
//
// A painter steps back a few times, at set points fixed before the first mark, usually after a layer dries (0 to 5 a
// painting, usually 1 or 2: ~/wt/agents/painting-study.md; painting rule 23). Each step-back reads the sheet and the
// subject at shape scale, once, and leads to a few placed corrections. It is never repeated until an error stops
// falling: no look, correct, look again.
//
// The plan of step-backs is made before painting from the options alone:
//   - 'washes'  (--touchpoints R > 0): R rounds, each after the last one's glazes dry; every planning family is read once a
//     round, and a family the sheet still shows lighter or less chromatic than the subject gets one glaze of the mixed lack
//     (src/paint/methods/touch-up.mjs). The rounds are fixed before the first mark; a round after a round that corrected
//     nothing is skipped, since the sheet is as the round before it left it.
//   - 'accents' (--finaldarks > 0): before the last small darks, each accent family is read once (final-darks.mjs).
// A passage takes one shape-level look of its own as it is laid, and its charge follows what the sheet already holds of
// its pans (tools/plate/paint.mjs, src/paint/methods/shape-deficit.mjs). Every other look (kept-colour recharge, texture)
// is null outside an open step-back. Strict mode (--notargetlooks 1) keeps the same plan and takes no look at all.
import { paintingLooks } from './painting-look.mjs';

/** The step-backs of one painting, fixed before the first mark. */
export function planStepBacks({ touchpoints = 0, finalDarks = 0 } = {}) {
  const plan = [];
  for (let round = 1; round <= Math.max(0, Math.round(touchpoints)); round++) plan.push({ id: round === 1 ? 'washes' : `washes-${round}`, when: round === 1 ? 'after the planned washes dry' : 'after the last round\'s glazes dry', reads: 'planning families', corrects: 'darken only, families the sheet shows visibly lighter or less chromatic than the subject' });
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
  let passageLooks = 0;
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
      const own = !current && checkpoint === 'passage';
      if (!current && !own) { declined[checkpoint] = (declined[checkpoint] ?? 0) + 1; return null; }
      if (readLabels.has(label)) throw new Error(`step-backs: '${label}' was read already; each shape is looked at once`);
      readLabels.add(label);
      const out = see(checkpoint, label, mask, options);
      if (out) { if (own) passageLooks++; else current.looks++; }
      return out;
    },
    record() {
      return { planned: plan, taken: taken.map(t => ({ ...t })), shapeLooks: taken.reduce((a, t) => a + t.looks, 0), passageLooks, declinedOutsideStepBacks: { ...declined }, strict: noLooks > 0 };
    },
  };
  return api;
}
