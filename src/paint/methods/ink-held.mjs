// Has a wash moved the pen's ink? The pen is set before any wash; a wash that lifts and carries it leaves black clouds
// round every line. The measure compares WHERE the ink is, not only how much: the ink that left the cells it was laid
// in, as a share of all the pen's ink. `before` and `after` are the ink's whole thickness per cell (every dried layer
// and whatever is wet: sheet.mjs thickness()), never the top layer alone, which empties each time the sheet dries.

/** The share of the pen's ink a wash moved most before the run stops. */
export const INK_MOVED_MOST = 0.02;

/**
 * The ink that left its cells between two readings of its whole thickness, as a share of the ink before:
 * `{moved, lost, total}`; `lost` is the share no longer on the sheet at all (lifted off, or run off the edge).
 */
export function inkMoved(before, after) {
  if (before.length !== after.length) throw Error('ink held: the two readings are of different sheets');
  let total = 0, left = 0, now = 0;
  for (let i = 0; i < before.length; i++) { total += before[i]; now += after[i]; if (after[i] < before[i]) left += before[i] - after[i]; }
  if (!(total > 0)) throw Error('ink held: no ink in the first reading');
  return { moved: left / total, lost: Math.max(0, total - now) / total, total };
}
