// The kit's water clock (bench/v2/kit/kit.mjs). The kit, not the painter's script, moves the water: it steps the
// sheet for the brush time that passed, on the main painter's cadence, so a script only lays strokes and says when to
// wait or dry. Pure: `advance` is the one thing it calls, once a water step.
//
// The cadence is the main painter's own:
// - a brush steps the sheet once every max(24, 24 * sqrt(n)) splats (tools/plate/drawing.mjs flowEvery, n the sweeps
//   of the passage). The kit does not know the painter's passages, so n is the brush strokes laid since the sheet was
//   last dried or waited on (one sitting). The count of splats is carried from stroke to stroke: brush time, not a
//   fresh count per stroke, so many short strokes step the sheet as often as one long one of the same length;
// - a pen steps it once every 60 of its splats (src/media/draw.mjs flowEvery).
// - a broad wash stroke laid at the painter's fast spacing (1.4 cells between splats, not 0.7: native-body-cadence.mjs)
//   steps after the same distance of brush travel: its count of splats a step is scaled by 0.7 / spacing, as the
//   painter's own `every` is.
// Steps a script asks for (a wait) are posted back to back; the GPU worker joins consecutive steps into one submit
// (src/media/gpu/worker.mjs pendingSteps).

export const BRUSH_EVERY = 24, PEN_EVERY = 60;

/** Splats between two water steps for the n-th brush stroke of a sitting (n >= 1). */
export const brushEvery = n => Math.max(BRUSH_EVERY, Math.round(BRUSH_EVERY * Math.sqrt(Math.max(1, n))));

/**
 * A clock over one sheet. `advance()` takes one water step. Counts: {steps, strokeSteps, waitSteps, sitting}.
 * stroke(kind, { spacing }) gives the options a stroke is laid with ({between, flowEvery, gpuBetween}); wait(n) steps n times;
 * dried() starts a new sitting.
 */
export function waterClock(advance) {
  let carry = 0, penCarry = 0;
  const c = { steps: 0, strokeSteps: 0, waitSteps: 0, sitting: 0 };
  const tick = () => { advance(); c.steps++; c.strokeSteps++; };
  return {
    counts: c,
    stroke(kind = 'brush', { spacing = 0.7 } = {}) {
      if (kind === 'pen') return { flowEvery: PEN_EVERY, gpuBetween: true, between: () => { if (++penCarry >= PEN_EVERY) { penCarry = 0; tick(); } } };
      if (!(spacing >= 0.7 && spacing <= 1.4)) throw new RangeError('a brush stroke is spaced 0.7 to 1.4 cells');
      const every = Math.max(1, Math.round(brushEvery(++c.sitting) * 0.7 / spacing));
      return { flowEvery: every, gpuBetween: true, between: () => { if (++carry >= every) { carry = 0; tick(); } } };
    },
    wait(n) {
      if (!(Number.isInteger(n) && n >= 1 && n <= 2000)) throw new RangeError('wait takes a whole number of moments, 1 to 2000');
      for (let q = 0; q < n; q++) { advance(); c.steps++; c.waitSteps++; }
      this.dried();
    },
    dried() { c.sitting = 0; carry = 0; penCarry = 0; },
  };
}
