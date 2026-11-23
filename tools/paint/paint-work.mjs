// The work a painting did, read from the painter's own backend record (backend.json, gpuStats): recorded beside a
// look's fixed price and beside the final, never charged or limited (owner, 23 Nov). And the one guard, resource
// management only: a session's painting stops when its water steps pass ten times those of the automatic painting of
// the subject (src/media/gpu/water-guard.mjs does the stopping; this sets the ceiling and reads the stop back).
import fs from 'node:fs';
import path from 'node:path';

/** How many times Auto's water steps a session's painting may take before the guard stops it. */
export const WATER_GUARD_TIMES = 10;
/** The line the painter writes when the guard stops it (water-guard.mjs waterGuardLine). */
const GUARD_LINE = /^WATER-STEP GUARD: .*$/m;

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/**
 * The work in a plate's backend record: {waterSteps, dryings, drySolverIterations, cellSteps, cellStepsFrom} or null
 * when the plate has no record (a look stopped at a stage writes none). Each water step runs over the whole sheet,
 * so cell-steps are the water steps times the sheet's cells (`cells`: [across, down]); the record holds no finer count.
 */
export function backendWork(plate, cells) {
  const g = readJson(path.join(plate, 'backend.json'))?.gpuStats;
  if (!g || !Number.isInteger(g.steps)) return null;
  const n = cells && cells[0] > 0 && cells[1] > 0 ? cells[0] * cells[1] : null;
  return { waterSteps: g.steps, dryings: g.drys ?? null, drySolverIterations: g.drySolverIterations ?? null, cellSteps: n ? g.steps * n : null, cellStepsFrom: n ? `water steps x ${cells[0]} x ${cells[1]} cells` : null };
}

/** The sheet's cells [across, down] for `across` cells on a sheet of these millimetres. */
export const cellsOf = (across, sheet) => [across, Math.round(across * sheet.heightMm / sheet.widthMm)];

/**
 * The water steps of the automatic painting of a subject: the prepared unit look's (the same at half and full size:
 * Mittens 4442 both, 23 Nov). From the prepared record, else its unit look's backend record. Throws when neither has it.
 */
export function autoWaterSteps(folder, unit) {
  if (Number.isInteger(unit?.waterSteps) && unit.waterSteps > 0) return unit.waterSteps;
  const w = backendWork(path.join(folder, 'unit-look', 'plate'));
  if (!w?.waterSteps) throw new Error(`the prepared folder ${folder} holds no water-step count of the automatic painting (unit-look/plate/backend.json); prepare the subject again`);
  return w.waterSteps;
}

/** The guard's line in a painter's log, or null: the painting was stopped as resource management. */
export const guardStopOf = text => GUARD_LINE.exec(String(text ?? ''))?.[0] ?? null;
