// The levels of a model session, as named settings of one session (never a fork of the code):
//   L2  one try: the subject's inputs and the code planner's plan.
//   L3  the same, tried again: a try after the first is handed its own previous try (the dried full-size painting
//       beside the subject, the replay sheet, the arrows sheet, a teacher's words, what it handed over).
//   L4  L3, and every try is also handed the automatic painter's dried full-size painting of the subject with its
//       replay sheet and arrows sheet: "this is what the code alone made; improve on it, change it, or discard it".
// Pure: nothing is read or written here.

export const LEVELS = Object.freeze({
  L2: { previousTry: false, autoPainting: false, what: 'one try from the subject\'s inputs and the code planner\'s plan' },
  L3: { previousTry: true, autoPainting: false, what: 'tries in a row; a later try is handed its previous try\'s painting, replay sheet, arrows sheet and a teacher\'s words' },
  L4: { previousTry: true, autoPainting: true, what: 'as L3, and every try is also handed the automatic painter\'s dried full-size painting, its replay sheet and its arrows sheet' },
});

/** The level's terms, or a throw naming the levels. */
export function levelOf(name) {
  const l = LEVELS[name];
  if (!l) throw new Error(`--level: one of ${Object.keys(LEVELS).join(', ')}, not "${name}"`);
  return { name, ...l };
}

/**
 * What a session of this level and try is handed, checked against what the command line gave: {previous: bool, auto:
 * bool}. Throws, plainly, when the level's terms and the command line disagree: nothing is left out or added in silence.
 */
export function handedAt(level, { tryNumber = 1, previous = null, critique = null }) {
  if (!(Number.isInteger(tryNumber) && tryNumber >= 1)) throw new Error('--try: a whole number, 1 or more');
  if (!level.previousTry && (previous || tryNumber > 1)) throw new Error(`--level ${level.name} is one try: --previous and --try belong to L3 and L4`);
  if (level.previousTry && tryNumber > 1 && !previous) throw new Error(`--level ${level.name}, try ${tryNumber}: a try after the first is handed its previous try; name its run folder with --previous`);
  if (previous && tryNumber === 1) throw new Error('--previous names the try before this one, so this is try 2 or later: give --try');
  if (previous && !critique) throw new Error('--previous needs --critique FILE: the teacher\'s words on the previous painting are part of what a later try is handed');
  if (critique && !previous) throw new Error('--critique goes with --previous');
  return { previous: Boolean(previous), auto: level.autoPainting };
}
