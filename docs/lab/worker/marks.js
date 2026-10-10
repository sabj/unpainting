// What a painting is made of, in paper units: how many marks, how wide they are in millimetres, and how much of the paint
// went down in marks too small to be a brush's work. The last is the measure that flags a painting built from tiny marks.
const TINY_IN = 1 / 16; // a mark narrower than a sixteenth of an inch is a dot, not a stroke

/** Pigment a brush holds: in its hairs and in its belly. */
export const brushPigment = b => b.hairs.reduce((s, h) => s + h.pig.reduce((a, v) => a + v, 0), 0) + (b.resP ? b.resP.reduce((a, v) => a + v, 0) : 0);

/** marks: [{ mm, paint }]. mm is the mark's diameter; paint the pigment it laid. */
export function markStats(marks, MM = 25.4) {
  const tinyMm = TINY_IN * MM, n = marks.length;
  if (!n) return { strokes: 0, medianMm: 0, tinyShare: 0, tinyMm, paint: 0 };
  const sorted = marks.map(m => m.mm).sort((a, b) => a - b), mid = n >> 1;
  const medianMm = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  let paint = 0, tiny = 0;
  for (const m of marks) { paint += m.paint; if (m.mm < tinyMm) tiny += m.paint; }
  return { strokes: n, medianMm, tinyShare: paint > 0 ? tiny / paint : 0, tinyMm, paint };
}
