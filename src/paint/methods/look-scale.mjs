// A look is the same sheet in millimetres on fewer cells (tools/paint/look.mjs), painted to predict the final painting.
// What the painter reckons from the cells across must then be reckoned from the FINAL sheet's cells, or the look is
// charged and laid as another painting would be. Here: the rules that take the final sheet's cells (--finalwidth; a
// painting that is not a look is its own final). Nothing here reads the sheet or the target.

/** The cells across brush dabs are spaced for: at this many cells a dab every DAB_SPACING cells. */
export const SPACING_CELLS = 540;

/** The cells across of the final painting: `finalWidth` when given (a whole number, no fewer than this sheet's), else this sheet's own. */
export function finalWidthOf(width, finalWidth = null) {
  if (finalWidth == null) return width;
  if (!Number.isInteger(finalWidth) || finalWidth < width) throw new RangeError(`--finalwidth ${finalWidth}: the final painting's cells across, a whole number no fewer than this sheet's ${width}`);
  return finalWidth;
}

/** Whether dabs are spaced by the sheet's size (not its cells) when --mmspacing is not given: above SPACING_CELLS across the FINAL sheet. */
export const mmSpacingDefault = finalWidth => finalWidth > SPACING_CELLS;

/**
 * The factor on a stroke's dab spacing (cells). On the sheet the dabs keep their distance in millimetres: the sheet's own
 * cells over SPACING_CELLS (a look's half the final's cells, the same millimetres). On scrap (a swatch: its cells are
 * its own, grown to fit its brush) the swatch is laid as the final painting's is: the FINAL sheet's cells over
 * SPACING_CELLS, so a look's swatches read what the final's read (laid at the look's own factor a 543-cell look's
 * wet-into-wet swatch read 0.23 of its charge where its 1086-cell final's read 0.21, and the look was charged a tenth less).
 */
export function dabSpacingFactor({ width, finalWidth, onSheet }) {
  return (onSheet ? width : finalWidth) / SPACING_CELLS;
}
