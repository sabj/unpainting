// Which passes take the plan-against-sheet mark and which are filmed, as two separate cadences.
//
// A mark (mark() in tools/paint-plate.mjs) renders the sheet and, under --feedbacklag, tells the next pass that the
// sheet is in hand, so that pass reads it instead of predicting it from the ledger. The marks once followed --frames,
// so asking for more film frames made the painter read its sheet more often and changed the painting (Overlook:
// --frames 120 read the sheet on 147 passes instead of 10, and 58% of its pixels moved). Frames are pictures only.
// --markcadence N sets about N marks a painting; --frames only decides which passes --filmby pass films.
//
// Without --markcadence a painting takes MARKS_PER_PAINTING marks, the old --frames default. The recipes pin
// --markcadence to their old --frames (8, src/paint/recipe.mjs), so a painting made without capture keeps its marks.

export const MARKS_PER_PAINTING = 40;

/** Whether pass L (0-based) of `passes` falls on a cadence of about `per` a painting, every pass when there are fewer. */
export function passDue(L, passes, per) {
  if (!(per > 0)) throw new Error(`pass cadence: per must be positive, got ${per}`);
  return L % Math.max(1, Math.round(passes / per)) === 0;
}

/** Whether pass L takes the plan-against-sheet mark, at `per` (the --markcadence value, if given) marks a painting. */
export function markDue(L, passes, per) {
  return passDue(L, passes, per == null || per === '' ? MARKS_PER_PAINTING : Number(per));
}
