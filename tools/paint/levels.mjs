// The levels of a model session, as named settings of one session (never a fork of the code).
// Option A ladder (0.5.1): every level is ONE fresh, independent session; no level is handed another level's output,
// so every level and picture can run at once. At every level: the same look budget, the anti-cheat guard (code may not
// read the original's pixels), no judge feedback, and the model hands in its own script.
//   L1  the picture, the script format and the painting tips; nothing prepared; blank paper. Fixed rounds.
//   L2  + three unnumbered colour studies for visual value/colour reference; no prepared drawing, named forms, or traced
//       shapes; blank paper. Fixed rounds.
//   L3  + opt-in prepared drawing (OFF/blank paper unless selected), named forms, traced shapes, and Auto's plan & painting. Fixed rounds.
//   L4  L3's inputs (with opt-in prepared drawing) in an open sandboxed session with tools (--work session).
// Kept only to replay the runs of 23-24 Nov made under the earlier ladder, never part of the benchmark:
//   L4-retry  the old level 4: the traced shapes and the model's own earlier painting and script (--previous); nothing of Auto.
// Planner settings alone, or the code's plan as a choice, are refused at every level (OWN_SCRIPT_ONLY): Auto's plan
// at L3 and L4 is something to read, never a choice to hand in. Looks are priced by size and share (look-cost.mjs).
// Pure: nothing is read or written here.

/** The clock of every benchmark level, L1 to L4, in minutes (docs rules.md; bench/scripts/levels.mjs passes it): every brief states it. */
export const LEVEL_MINUTES = 60;

/** Retries at a level when the command line names no number (the old retry level only). */
export const DEFAULT_RETRIES = 1;

export const LEVELS = Object.freeze({
  L1: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: false, autoPainting: false, shapesData: false, noInputs: true, studiesOnly: false, preparedDrawing: false, namedForms: false, what: 'the picture, the script format and the painting tips; nothing prepared (fixed rounds)' },
  L2: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: false, autoPainting: false, shapesData: false, noInputs: false, studiesOnly: true, preparedDrawing: false, namedForms: false, what: 'L1 and three unnumbered colour studies for visual value/colour reference; no prepared drawing, named forms, or traced shapes (fixed rounds)' },
  L3: { work: 'rounds', previousTry: false, codePlan: false, autoPlan: true, autoPainting: true, shapesData: true, noInputs: false, studiesOnly: false, preparedDrawing: 'opt-in', namedForms: true, what: 'L2 plus opt-in prepared drawing (blank unless selected), named forms, traced shapes, and Auto\'s plan and painting (fixed rounds)' },
  L4: { work: 'session', previousTry: false, codePlan: false, autoPlan: true, autoPainting: true, shapesData: true, noInputs: false, studiesOnly: false, preparedDrawing: 'opt-in', namedForms: true, what: 'L3\'s inputs (with opt-in prepared drawing) in an open session with tools (sandbox, painter commands, its own files), the anti-cheat guard on' },
  'L4-retry': { work: null, replayOnly: true, previousTry: true, codePlan: false, autoPlan: false, autoPainting: false, shapesData: true, noInputs: false, studiesOnly: false, preparedDrawing: true, namedForms: true, what: 'the old level 4 of 23-24 Nov, for replaying those runs only: the traced shapes and its own earlier result (--previous); nothing of Auto' },
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
  return { previous: Boolean(previous), plan: level.codePlan, autoPlan: level.autoPlan, auto: level.autoPainting, shapes: level.shapesData,
    studiesOnly: Boolean(level.studiesOnly), preparedDrawing: level.preparedDrawing ?? true, namedForms: level.namedForms ?? !level.noInputs,
    ...(level.noInputs ? { noInputs: true } : {}) };
}

/**
 * Shared Option A prepared-drawing policy for both fixed rounds (L1-L3) and open sessions (L4).
 * Given a parsed `choice` (from readChoice, with `choice.tools?.linesEdit` already loaded when `lines` is set) and the
 * level's `preparedDrawing` (`false`, `'opt-in'`, or `true`), returns the normalized choice actually laid:
 *   - false (L1, L2): always forces `medium: 'none'` (blank paper; author's `own` lines still drawn).
 *   - 'opt-in' (L3, L4):
 *       * explicit `medium` ('pencil' | 'pen' | 'none') is respected verbatim;
 *       * omitted `medium` + `linesEdit.rules` with any non-drop rule (`r.do && r.do !== 'drop'`) sets `startDropped: true`
 *         so ONLY the explicitly selected prepared lines are drawn (not the whole default drawing);
 *       * omitted `medium` + (no rules or drop-only rules) forces `medium: 'none'` (blank paper; `own` lines still drawn).
 *   - true (L4-retry / legacy): returns `choice` unchanged.
 */
export function applyPreparedDrawingPolicy(choice, preparedDrawing = true) {
  if (preparedDrawing === true || !choice) return choice;
  const tools = choice.tools ? { ...choice.tools } : {};
  if (preparedDrawing === false) {
    tools.medium = 'none';
    return { ...choice, tools };
  }
  if (preparedDrawing === 'opt-in') {
    if (tools.medium) return choice;
    const rules = tools.linesEdit?.rules;
    const selectsPrepared = Array.isArray(rules) && rules.some(r => r && r.do && r.do !== 'drop');
    if (selectsPrepared) {
      tools.startDropped = true;
      return { ...choice, tools };
    }
    tools.medium = 'none';
    return { ...choice, tools };
  }
  return choice;
}
