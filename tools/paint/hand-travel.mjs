// How far the hand jumps between consecutive strokes of a passage: from where one stroke ends to where the next begins.
// The replay is watched: a passage whose strokes are written in an order that jumps about the sheet is laid in that
// order (the painter does not reorder an author's strokes), so the free compile check tells the author how jumpy its
// order is before it hands in. Information only: nothing is refused on it.

/**
 * `passes`: a compiled plan's washes ([{ strokes: [{ points: [[x, y, ...], ...] }], thing | script.passage }]), in mm.
 * Returns { jumps, medianMm, worstMm, worstIn } over every pair of consecutive strokes within one passage, or null when
 * no passage has two strokes.
 */
export function handTravel(passes) {
  const all = []; let worst = -1, worstIn = null;
  for (const p of passes ?? []) {
    const S = (p.strokes ?? []).filter(s => s.points?.length);
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1].points.at(-1), b = S[k].points[0], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      all.push(d); if (d > worst) { worst = d; worstIn = p.script?.passage ?? p.thing ?? p.id ?? null; }
    }
  }
  if (!all.length) return null;
  all.sort((x, y) => x - y);
  return { jumps: all.length, medianMm: +all[all.length >> 1].toFixed(1), worstMm: +worst.toFixed(1), worstIn };
}

/** The sentence a free compile check adds, or '' when there is nothing to say. */
export function travelLine(t) {
  return t ? ` Between consecutive strokes of one passage the hand jumps ${t.medianMm} mm (median) and ${t.worstMm} mm at worst${t.worstIn ? ` (in ${String(t.worstIn).slice(0, 60)})` : ''}; the replay is watched and strokes are laid in the order written.` : '';
}
