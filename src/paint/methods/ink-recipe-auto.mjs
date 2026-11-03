// --inkrecipe auto, opt in: the pen-and-wash recipe (ink-recipe.mjs) when the source reads as a pen drawing, else
// none. A source is a pen drawing when the ink separator reads at least --penfirst per cent of it as pen line. A run that
// sets its own drawing, a drawing file or a line source keeps what it set, so a plan's drawing is never replaced.
import { paperOf } from '../../crop/palettepick.mjs';
import { separate } from '../../crop/inkwash.mjs';

/** The width the picture is read at: the separator's line share depends on it, and this is the width of the benchmark runs. */
export const AUTO_INK_WIDTH = 1200;

/** The recipe a run uses when --inkrecipe is not given: none, so the drawing is pencil only. */
export const DEFAULT_INK_RECIPE = 'none';

/** Flags that say how the drawing is made; any of them on the command line turns the automatic choice off. */
export const DRAWING_FLAGS = Object.freeze(['--drawing', '--drawingfile', '--drawinglast', '--outlinemedium', '--linesource', '--drawingstages', '--stages']);

/** The share of the picture (0 to 1) that the ink separator reads as pen line. px is RGB bytes, w by h. */
export function penShare(px, w, h) {
  const paper = paperOf(px, w, h, { margin: 0.03, mode: 'auto' }).paperRGB;
  return separate(px, w, h, paper).stats.ink / (w * h);
}

/** The recipe name to use: 'wash' or 'none' for 'auto', the given name otherwise. share is read lazily. */
export function chooseInkRecipe(name, argv, readShare, penfirst = 0.5) {
  if (name !== 'auto') return { recipe: name, why: null };
  const set = DRAWING_FLAGS.find(f => argv.includes(f));
  if (set) return { recipe: 'none', why: `${set} is set` };
  const share = readShare();
  return share * 100 >= penfirst
    ? { recipe: 'wash', share, why: `the source shows ${(share * 100).toFixed(2)}% pen line, at least --penfirst ${penfirst}%` }
    : { recipe: 'none', share, why: `the source shows ${(share * 100).toFixed(2)}% pen line, under --penfirst ${penfirst}%` };
}
