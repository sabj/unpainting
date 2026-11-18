// Which medium the preparatory drawing is laid in. `auto` reads the source: a source that shows its own pen line
// (at least `threshold` per cent of its cells read as line) is drawn in ink; a source without one gets a light pencil
// drawing, which the washes cover. An explicit `ink` or `graphite` always wins.
const OUTLINE_MEDIA = Object.freeze(['auto', 'ink', 'graphite']);

/** @returns {{ medium: 'ink' | 'graphite', chosen: boolean, percent: number }} */
export function resolveOutlineMedium({ requested = 'auto', share, threshold = 0.5 }) {
  if (!OUTLINE_MEDIA.includes(requested)) throw new Error(`--outlinemedium: auto, ink or graphite, not ${requested}`);
  if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error(`outline medium: line share must be in [0, 1], not ${share}`);
  if (!Number.isFinite(threshold)) throw new Error(`outline medium: threshold must be a number, not ${threshold}`);
  const percent = 100 * share;
  if (requested !== 'auto') return { medium: requested, chosen: false, percent };
  return { medium: percent >= threshold ? 'ink' : 'graphite', chosen: true, percent };
}

/** One log line for the decision, e.g. "the line: ink, source shows 2.3% line". */
export function describeOutlineMedium({ medium, chosen, percent }) {
  return `the line: ${medium}, ${chosen ? 'source shows' : 'set by --outlinemedium; source shows'} ${percent.toFixed(1)}% line`;
}
