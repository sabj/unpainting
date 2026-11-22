// A session's counted look, painted for real: the model's present choice goes through the 0.4 painter on the GPU,
// through drying, on a sheet of fewer cells so that it takes minutes, and the dried sheet is what the model is shown
// (session.mjs counts it; cli.mjs runs it; plan-data.mjs measures and draws it). Pure: nothing is read or run here.
//
// The size. A script is written in millimetres, so the same script on half the cells is the same plan painted
// coarser. The code planner reads its shapes on the cell grid: tuned by settings it is planned again for the small
// sheet (broader shapes than the final sheet will have; the look says so); its plan edited wash by wash exists on
// the full grid only, so a look at an edited plan is painted at full size and takes as long as a painting.

/** The share of the run's cells across a look is painted at, and the least cells a sheet is painted on. */
export const LOOK_SHARE = 0.5, LEAST_CELLS = 16;
/** Look paintings at once in one command; with the machine's other GPU paintings they wait for a place (--jobs). */
export const LOOK_JOBS = 2;
/** Plans, looks and paintings at once in one plan-mode command: each holds 13 to 18 GB. */
export const HEAVY_JOBS = 4;

/** The cells across of a look's sheet for a choice of this kind ('settings' | 'script' | 'plan') on a run of `cells`. */
export function lookCells(cells, kind) {
  return kind === 'plan' ? cells : Math.max(LEAST_CELLS, Math.round(cells * LOOK_SHARE));
}

/** The run's --set list for a look's painting: the same, with the cells across of the look. */
export function lookSets(sets, cells, kind) {
  return [...sets.filter(([k]) => k !== 'width'), ['width', String(lookCells(cells, kind))]];
}

/**
 * Why a painting cannot be shown as a look, or null when it can. `done` {exit, signal} is how the painter ended;
 * `results` what it left (run.mjs collectResults). A painting that did not stay on the GPU is not shown: no silent
 * fallback.
 */
export function lookFault(done, results) {
  if (done.exit !== 0 && done.exit !== 3) return `the painter ended with exit ${done.exit ?? done.signal} before the sheet was dry`;
  if (results.state !== 'finished' || !results.painting) return 'the painter ended without a finished, dried sheet';
  const b = results.backend;
  if (!b || b.backend !== 'gpu' || b.fallback !== false) return `the painting did not stay on the GPU (${b ? `backend ${b.backend}, fallback ${b.fallback}` : 'no backend record'}), so it is not shown`;
  return null;
}

/** How the look was painted, in words for its numbers and the record: its size against the final sheet's. */
export function lookSizeNote({ cells, fullCells, cellMm, kind }) {
  if (cells === fullCells) return `painted at the final size, ${cells} cells across`;
  return `painted small, ${cells} cells across (${cellMm} mm a cell) where the final painting has ${fullCells}: the same sheet in millimetres, coarser grain${kind === 'settings' ? '; the code planner planned again for the small sheet, so its shapes are a little broader here than they will be' : ''}`;
}
