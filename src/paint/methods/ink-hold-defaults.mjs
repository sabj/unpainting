// An ink drawing is held to the target and decided by meaning, whatever made its lines: the line model or the plan.
// These are the pruning half of the wash recipe (ink-recipe.mjs), applied to any ink drawing that does not set them, so an
// authored line file or a plain source-ink run is not drawn raw. A flag on the command line always wins. Pure: no I/O.
import { subjectMediumOf } from '../subject-medium.mjs';

/** The flags that hold the lines to the target and decide each by its region's meaning (docs/ink.md). */
export const INK_HOLD_FLAGS = Object.freeze({
  inkdecide: '1', inkshadowmask: '0', inkdropfaint: '0', inklabeljudge: 'simple', inkdarkrule: '1', inkjoin: '2.5', inkeconomy: '1',
  inksalience: '1', inkfoliage: '1', linesupport: '5', linesmooth: '0.3', linesmoothcorner: '50', linegapmm: '0.6', lineminmm: '1.2',
});
/** With a source-ink line source (an auto source may choose another, which would leave these unread): the line model is the pool, and the source's pen strokes are traced where it sees a line. */
export const INK_POOL_FLAGS = Object.freeze({ linemodel: 'strict', linestroke: '1', copylinesmin: '0' });

const last = (argv, name) => { const at = argv.lastIndexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const isGraphite = v => v === 'graphite' || /^graphite-/.test(String(v));

/** The flags to add to argv for an ink drawing: each one argv does not set. Nothing for graphite or a run with no drawing. */
export function inkHoldArgs(argv) {
  const outline = last(argv, '--outlinemedium');
  const ink = outline !== undefined && outline !== 'none' && outline !== 'auto' && !isGraphite(outline);
  const noPen = ['none', 'pencil'].includes(subjectMediumOf(argv));
  // an area plan decides its own lines by drawingRole and refuses the region-label decision (area-owned-options.mjs)
  if (!ink || last(argv, '--drawing') === 'none' || noPen || argv.includes('--areaplan')) return [];
  const source = last(argv, '--linesource');
  const want = { ...INK_HOLD_FLAGS, ...(source === 'source-ink' ? INK_POOL_FLAGS : {}) };
  return Object.entries(want).flatMap(([k, v]) => (argv.includes('--' + k) ? [] : ['--' + k, v]));
}
