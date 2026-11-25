// The one guard on how a session's painting is painted, as resource management only (owner, 23 Nov): a painting
// whose water steps pass a ceiling (ten times the steps of the automatic painting of the subject, set by the harness
// in PAINTER_WATER_STEPS_MOST) is stopped with a plain message and exit code 5, so a runaway script ends in minutes.
// It never changes a painting below the ceiling; the harness records the stop, never scores it. Unset: no ceiling
// (Auto, the operator's and the tests' paintings).

/** The exit code of a painting stopped by the guard. */
export const WATER_GUARD_EXIT = 5;

/** The ceiling from the environment: a whole number above 0, or Infinity when unset. Throws on anything else. */
export function waterStepsMost(env = process.env) {
  const v = env.PAINTER_WATER_STEPS_MOST;
  if (v == null || v === '') return Infinity;
  const n = Number(v);
  if (!(Number.isInteger(n) && n > 0)) throw new Error(`PAINTER_WATER_STEPS_MOST=${v}: a whole number of water steps above 0`);
  return n;
}

/** The plain line said when the guard stops a painting. */
export const waterGuardLine = (steps, most) => `WATER-STEP GUARD: this painting passed ${most} water steps (${steps} so far), ten times the automatic painting of this subject; it is stopped as resource management, recorded as a stop and never scored`;

/** Stops the process when `steps` passes `most` (exit WATER_GUARD_EXIT, the line on stderr). `exit` is for the tests. */
export function checkWaterSteps(steps, most, exit = code => process.exit(code)) {
  if (steps <= most) return false;
  console.error(waterGuardLine(steps, most));
  exit(WATER_GUARD_EXIT);
  return true;
}
