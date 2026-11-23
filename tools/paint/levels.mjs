// The levels of a model session, as named settings of one session (never a fork of the code). The ladder is the
// owner's (22 Nov, with the level 2 change of that day): L0 nothing (defined, not run) and L1 the freehand kit with
// its tips are not this session. Here:
//   L2  the SAME inputs the code planner gets (the prepared drawing, the three colour studies, the named forms) and
//       NOT the code's plan: the model plans the painting itself, as its own script. One go.
//   L3  L2 again after studying its own L2 painting: a session that starts from the model's own L2 result, handed that
//       try's dried full-size painting beside the subject, its replay sheet, its arrows sheet and what it handed over.
//       No critique and never a score: the model judges its own sheet and writes what it will change. Still no code
//       plan: its own script is the only choice it may hand in.
//   L4  the chance to improve on L3 with many resources: a session that starts from the model's L3 result, handed
//       that the same way, and also the code's plan (to read, edit or discard), the code planner as a tool with its
//       settings, the code's finished painting with its replay and arrows sheets, and the studies' flat shapes and the
//       plan's wash geometry as data it may select from and name by number in a script.
// At every level a look is priced in the same unit: one full look of the automatic plan of the subject is 1.00
// (counted when the subject is prepared); below level 4 the model is told the unit, never shown that plan.
// How many retries a level has is a setting (--retries, default 1: one L3 session, one L4 session), not a constant.
// Pure: nothing is read or written here.

/** Retries at a level when the command line names no number. */
export const DEFAULT_RETRIES = 1;

export const LEVELS = Object.freeze({
  L2: { previousTry: false, codePlan: false, autoPainting: false, shapesData: false, what: 'one go from the same inputs the code planner gets (drawing, studies, named forms), planned by the model itself; no code plan' },
  L3: { previousTry: true, codePlan: false, autoPainting: false, shapesData: false, what: 'L2 again from the model\'s own L2 result: its painting, replay sheet, arrows sheet and what it handed over; it judges its own sheet; no code plan' },
  L4: { previousTry: true, codePlan: true, autoPainting: true, shapesData: true, what: 'a retry from the model\'s L3 result with many resources: the code\'s plan and planner, the code\'s finished painting, replay and arrows, and the studies\' flat shapes and the plan\'s wash geometry as data' },
});

/** What a session below level 4 is told when it reaches for the code's plan or planner (choice.mjs, session.mjs). */
export const CODE_PLAN_IS_L4 = 'the code\'s plan and planner are level 4';

/** The level's terms, or a throw naming the levels. */
export function levelOf(name) {
  const l = LEVELS[name];
  if (!l) throw new Error(`--level: one of ${Object.keys(LEVELS).join(', ')}, not "${name}"`);
  return { name, ...l };
}

/**
 * What a session of this level and try is handed, checked against what the command line gave: {previous, plan (the
 * code's plan and planner: auto/ and the settings and plan-edit choices), auto (the code's finished painting), shapes}
 * (each true or false). `tryNumber`: which retry of the level this is (1 the first), of `retries`. Throws,
 * plainly, when the level's terms and the command line disagree: nothing is left out or added in silence.
 */
export function handedAt(level, { tryNumber = 1, retries = DEFAULT_RETRIES, previous = null }) {
  if (!(Number.isInteger(tryNumber) && tryNumber >= 1)) throw new Error('--try: a whole number, 1 or more');
  if (!(Number.isInteger(retries) && retries >= 1)) throw new Error('--retries: a whole number, 1 or more');
  if (!level.previousTry && (previous || tryNumber > 1)) throw new Error(`--level ${level.name} is one go from the prepared inputs: --previous and --try belong to L3 and L4`);
  if (level.previousTry && tryNumber > retries) throw new Error(`--level ${level.name}, try ${tryNumber}: this benchmark gives ${retries} ${retries === 1 ? 'retry' : 'retries'} at a level (--retries sets it)`);
  if (level.previousTry && !previous) throw new Error(`--level ${level.name} is a retry: it starts from the model's own ${level.name === 'L4' && tryNumber === 1 ? 'L3' : level.name === 'L3' && tryNumber === 1 ? 'L2' : 'previous'} result. Name that run's folder with --previous`);
  return { previous: Boolean(previous), plan: level.codePlan, auto: level.autoPainting, shapes: level.shapesData };
}
