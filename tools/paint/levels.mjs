// The levels of a model session, as named settings of one session (never a fork of the code). The ladder is the
// owner's of 24 Nov (work/lead-04/work/BENCHMARK-DEFINITION.md, "levels, revised" and the anti-cheat correction):
// every level is ONE fresh, independent session; no level is handed another level's output, so every level and
// picture can run at once. At every level: the same look budget, the anti-cheat guard (code may not read the
// original's pixels), no judge feedback, and the model hands in its own script. Each level adds one thing:
//   L1  the picture, the script format and the painting tips; nothing prepared. Fixed rounds.
//   L2  + the prepared studies: the drawing, the named forms, the studies' traced shapes (offered as regions, maybe
//       wrong). Nothing of Auto. Fixed rounds.
//   L3  + Auto's plan (its washes in numbers, to read) and Auto's finished painting (to improve on). Fixed rounds.
//   L4  L3's inputs in an open session with tools (sandbox, painter commands, its own files). --work session.
// Kept only to replay the runs of 23-24 Nov made under the earlier ladder, never part of the benchmark:
//   L4-retry  the old level 4: the traced shapes and the model's own earlier painting and script (--previous;
//             "L4 after L2" or "after L3"); nothing of Auto.
// Planner settings alone, or the code's plan as a choice, are refused at every level (OWN_SCRIPT_ONLY): Auto's plan
// at L3 and L4 is something to read, never a choice to hand in. Looks are priced by size and share (look-cost.mjs).
// Pure: nothing is read or written here.

/** Retries at a level when the command line names no number (the old retry level only). */
export const DEFAULT_RETRIES = 1;

export const LEVELS = Object.freeze({
  L1: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: false, autoPainting: false, shapesData: false, noInputs: true, what: 'the picture, the script format and the painting tips; nothing prepared (fixed rounds)' },
  L2: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: false, autoPainting: false, shapesData: true, what: 'L1 and the prepared studies: the drawing, the named forms and the studies\' traced shapes; nothing of Auto (fixed rounds)' },
  L3: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: true, autoPainting: true, shapesData: true, what: 'L2 and Auto\'s plan and finished painting, to improve on (fixed rounds)' },
  L4: { work: 'session', previousTry: false, codePlan: false, autoPlan: true, autoPainting: true, shapesData: true, what: 'L3\'s inputs in an open session with tools (sandbox, painter commands, its own files), the anti-cheat guard on' },
  'L4-retry': { work: null, replayOnly: true, previousTry: true, codePlan: false, autoPlan: false, autoPainting: false, shapesData: true, what: 'the old level 4 of 23-24 Nov, for replaying those runs only: the traced shapes and its own earlier result (--previous); nothing of Auto' },
});

/** The benchmark's levels (the replay-only level is not one). */
export const BENCHMARK_LEVELS = Object.freeze(Object.keys(LEVELS).filter(k => !LEVELS[k].replayOnly));

/** What a session is told when it reaches for the code's plan, planner or settings (choice.mjs, session.mjs): at every level. */
export const OWN_SCRIPT_ONLY = 'the code\'s plan, its planner and its settings are handed over at no level: every level hands in its own script';

/** The level's terms, or a throw naming the levels. */
export function levelOf(name) {
  const l = LEVELS[name];
  if (!l) throw new Error(`--level: one of ${Object.keys(LEVELS).join(', ')}, not "${name}"`);
  return { name, ...l };
}

/**
 * What a session of this level is handed, checked against what the command line gave: {previous (its own earlier
 * result: the replay-only level alone), plan (the code's plan as a choice: never), autoPlan (Auto's plan to read),
 * auto (Auto's finished painting), shapes (the traced shapes)}, and noInputs at L1. `work`: rounds or session, when
 * the level names its own. Throws, plainly, when the level's terms and the command line disagree.
 */
export function handedAt(level, { tryNumber = 1, retries = DEFAULT_RETRIES, previous = null, work = null }) {
  if (!(Number.isInteger(tryNumber) && tryNumber >= 1)) throw new Error('--try: a whole number, 1 or more');
  if (!(Number.isInteger(retries) && retries >= 1)) throw new Error('--retries: a whole number, 1 or more');
  if (work && level.work && work !== level.work) throw new Error(`--level ${level.name} is ${level.work === 'rounds' ? 'fixed rounds (--work rounds)' : 'an open session with tools (--work session)'}, not --work ${work}`);
  if (!level.previousTry && (previous || tryNumber > 1)) throw new Error(`--level ${level.name} is one fresh session, handed no other level's result: --previous and --try belong to the replay level L4-retry only`);
  if (level.previousTry && tryNumber > retries) throw new Error(`--level ${level.name}, try ${tryNumber}: this benchmark gives ${retries} ${retries === 1 ? 'retry' : 'retries'} at a level (--retries sets it)`);
  if (level.previousTry && !previous) throw new Error(`--level ${level.name} replays an old retry: it starts from the model's own earlier result. Name that run's folder with --previous`);
  return { previous: Boolean(previous), plan: level.codePlan, autoPlan: level.autoPlan, auto: level.autoPainting, shapes: level.shapesData, ...(level.noInputs ? { noInputs: true } : {}) };
}
