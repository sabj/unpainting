// The scrap swatch for a painting script's passage laid into paint that is still wet from its own sitting: a passage
// `into` the one before it (`wait: damp` or none), or a charge dropped into its wash. Its brush meets paper whose
// pores are full and that holds a film already. It pours far less of its load than on dry paper, and where the two
// films touch they trade paint, so the brush also takes up some of the wash it is laid into. Charged from the swatch
// of its instrument on dry paper (or on a bed of clean water) such a passage added 0.02 to 0.26 of its planned pigment
// to the sheet, and a stack planned at L* 23 dried at L* 55. So it is tried on scrap as it will be laid: a
// wet-into-wet wash goes down first and is left until its shine has gone, then the passage's own lanes or marks go
// over it. The wash and the passage are the same paint in two pigment channels, so the swatch gives both what the
// passage laid of its own paint and what it took up of the wash. Nothing here reads the sheet or the subject.
//
// Only a script's passages come here. The code planner's own "beside damp" washes (study-washes.mjs: a wash laid on
// dry paper against a damp neighbour) keep their dry-paper swatch.
import { makePaper } from '../../media/paper.mjs';
import { createSheet } from '../../media/sheet.mjs';
import { SWATCH } from './scrap-swatch.mjs';

/** The scrap's pigment channels: the wash laid first, and the passage tried over it. */
export const DAMP_CHANNEL = Object.freeze({ under: 0, own: 1 });

/** The moves a script's passage is laid into this sitting's wet paint with (script-washes.mjs moveOf). */
const INTO_WET = new Set(['beside damp', 'wet on wet']);

/**
 * Whether a planned shape is a painting script's passage laid into paint still wet from its own sitting: at least
 * `least` of its cells already hold paint of the wet session it belongs to (the plan's script.underShare; a setting,
 * --dampshare). A passage that only touches the wash before it is laid on dry paper and keeps its dry-paper swatch.
 */
export function isDampPassage(sh, least) {
  if (!(least > 0)) throw new RangeError(`damp swatch: the least share of a passage that lies in wet paint must be above 0, got ${least}`);
  const s = sh?._valuePlan?.script;
  return Boolean(s) && INTO_WET.has(sh._valuePlan.move) && (s.underShare ?? 0) >= least;
}

/**
 * The wet paint under a script's passage, as a multiple of the passage's own planned film: the film of its sitting
 * already under it (script.underFilm, over script.underShare of its cells) over its own mix's strength.
 */
export function underOf(sh) {
  const s = sh?._valuePlan?.script, own = (sh?.mix ?? []).reduce((a, v) => a + v, 0);
  if (!s || !(own > 0)) return 0;
  return (s.underFilm ?? 0) * (s.underShare ?? 0) / own;
}

/**
 * The share of the wash a passage's brush took up: the wash's pigment on the scrap before the passage and after it
 * (the whole scrap: it leaves the paper only into the brush), over the wash that lay under the passage's footprint
 * (`footprintShare` of the wash; 1 for lanes over the whole swatch). Never below 0.
 */
export function liftShare(before, after, footprintShare = 1) {
  if (!(before > 0) || !(footprintShare > 0)) return 0;
  return Math.max(0, (before - after) / (before * footprintShare));
}

/** The swatch square's cells on the scrap. */
function squareCells() {
  const cells = [];
  for (let y = SWATCH.y0; y < SWATCH.y1; y++) for (let x = SWATCH.x0; x < SWATCH.x1; x++) cells.push(y * SWATCH.width + x);
  return cells;
}

/**
 * A scrap holding a damp wash, ready for a passage to be tried on it. `lay(scrap)` lays the wash over the swatch
 * square into DAMP_CHANNEL.under and leaves it wet; `wait(scrap, cells)` lets it stand until its shine has gone
 * (cells: the square's). The passage is then laid into DAMP_CHANNEL.own (scrapDelivery or markDelivery with this scrap).
 */
export function dampScrap({ pigment, paperOptions, lay, wait }) {
  const scrap = createSheet(makePaper(SWATCH.width, SWATCH.height, paperOptions), [pigment, pigment]);
  lay(scrap);
  wait(scrap, squareCells());
  return scrap;
}

/**
 * The charge factor for a passage laid into wet paint. Its swatch `delivered` that share of its charge as its own
 * paint, and its brush took up `lift` of the wash under it. On the sheet the wash under it is `under` times the
 * passage's own planned film (underOf), so for the sheet to gain the passage's planned paint the brush must lay
 * 1 + lift x under of it: the factor is that over `delivered`. It is never more than `most` times `dry`, the factor
 * of the same instrument on dry paper (a setting, --dampchargemost): a swatch that delivered next to nothing, or a
 * pale passage laid into a much stronger wash, would otherwise load the brush with paint enough to stain wherever the
 * bed on the sheet has dried further than the scrap's.
 * Returns { cal, limited }: limited when `most` held the factor down.
 */
export function dampCharge(delivered, { lift = 0, under = 0, dry = 1, most }) {
  if (!(dry > 0) || !Number.isFinite(dry)) throw new RangeError(`damp swatch: the dry-paper charge factor must be positive and finite, got ${dry}`);
  if (!(most >= 1) || !Number.isFinite(most)) throw new RangeError(`damp swatch: the most a damp bed raises the charge must be a number, 1 or more, got ${most}`);
  if (!Number.isFinite(delivered) || !(lift >= 0) || !(under >= 0)) throw new RangeError(`damp swatch: the swatch gave no reading (delivered ${delivered}, lift ${lift}, under ${under})`);
  const wanted = delivered > 0 ? (1 + lift * under) / delivered : Infinity, cap = dry * most;
  return { cal: Math.min(wanted, cap), limited: wanted > cap };
}
