// The levels of a model session, as named settings of one session (never a fork of the code). The ladder is the
// owner's (22 Nov): L0 nothing and L1 harness tips are the freehand kit, not this session. Here:
//   L2  some prepared inputs including the automatic plan (the drawing, the colour studies, the named forms, the
//       code planner's plan). One go.
//   L3  L2 with the chance to retry and improve: a session that starts from the model's own L2 result, handed that
//       try's dried full-size painting beside the subject, its replay sheet, its arrows sheet and what it handed over.
//       No critique and never a score: the model judges its own sheet and writes what it will change.
//   L4  the chance to improve on L3 with many resources: a session that starts from the model's L3 result, handed
//       that the same way, and also the code's finished painting with its replay and arrows sheets, and the studies'
//       flat shapes and the plan's wash geometry as data it may select from and name by number in a script.
// How many retries a level has is a setting (--retries, default 1: one L3 session, one L4 session), not a constant.
// Pure: nothing is read or written here.

/** Retries at a level when the command line names no number. */
export const DEFAULT_RETRIES = 1;

export const LEVELS = Object.freeze({
  L2: { previousTry: false, autoPainting: false, shapesData: false, what: 'one go from the subject\'s prepared inputs and the code planner\'s plan' },
  L3: { previousTry: true, autoPainting: false, shapesData: false, what: 'a retry from the model\'s own L2 result: its painting, replay sheet, arrows sheet and what it handed over; it judges its own sheet' },
  L4: { previousTry: true, autoPainting: true, shapesData: true, what: 'a retry from the model\'s L3 result with many resources: the code\'s finished painting, replay and arrows, and the studies\' flat shapes and the plan\'s wash geometry as data' },
});

/** The level's terms, or a throw naming the levels. */
export function levelOf(name) {
  const l = LEVELS[name];
  if (!l) throw new Error(`--level: one of ${Object.keys(LEVELS).join(', ')}, not "${name}"`);
  return { name, ...l };
}

/**
 * What a session of this level and try is handed, checked against what the command line gave: {previous, auto,
 * shapes} (each true or false). `tryNumber`: which retry of the level this is (1 the first), of `retries`. Throws,
 * plainly, when the level's terms and the command line disagree: nothing is left out or added in silence.
 */
export function handedAt(level, { tryNumber = 1, retries = DEFAULT_RETRIES, previous = null }) {
  if (!(Number.isInteger(tryNumber) && tryNumber >= 1)) throw new Error('--try: a whole number, 1 or more');
  if (!(Number.isInteger(retries) && retries >= 1)) throw new Error('--retries: a whole number, 1 or more');
  if (!level.previousTry && (previous || tryNumber > 1)) throw new Error(`--level ${level.name} is one go from the prepared inputs: --previous and --try belong to L3 and L4`);
  if (level.previousTry && tryNumber > retries) throw new Error(`--level ${level.name}, try ${tryNumber}: this benchmark gives ${retries} ${retries === 1 ? 'retry' : 'retries'} at a level (--retries sets it)`);
  if (level.previousTry && !previous) throw new Error(`--level ${level.name} is a retry: it starts from the model's own ${level.name === 'L4' && tryNumber === 1 ? 'L3' : level.name === 'L3' && tryNumber === 1 ? 'L2' : 'previous'} result. Name that run's folder with --previous`);
  return { previous: Boolean(previous), auto: level.autoPainting, shapes: level.shapesData };
}
