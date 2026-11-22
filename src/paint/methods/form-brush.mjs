// The widest wash brush by named form (named-forms.mjs): rounds inside a face, a figure or an animal; the mop and the
// flat only where a painter would use them.

/** Forms of these kinds are painted with rounds (a face, a figure, an animal); every other kind, and paper in no named
 * form, may take the widest wash brushes (the mop, the 1 in flat: a sky, water, the ground, a wall, a background). */
const ROUND_KINDS = Object.freeze(['face', 'eye', 'animal', 'fur', 'figure', 'hair', 'clothing']);
/** A wash with at least this share of its cells in such forms takes their ceiling (a wash that spans a form boundary
 * takes the smaller ceiling; under this share it only overlaps the form's edge, as every wash overlaps its neighbour). */
const FORM_SPAN = 0.05;

/**
 * The widest wash brush (mm) for a wash over these plan cells: `ceilingMm` when it lies in forms of the round kinds, else
 * Infinity (no named forms: Infinity, the kit as it is).
 */
export function brushCeilingMm(cells, named, ceilingMm) {
  if (!named || !cells.length || !(ceilingMm > 0)) return Infinity;
  let inside = 0; for (const q of cells) if (ROUND_KINDS.includes(named.kindAt(q))) inside++;
  return inside >= FORM_SPAN * cells.length ? ceilingMm : Infinity;
}

/** The brushes of `kitMm` no wider than `ceilingMm`; the smallest alone when none is. */
export function kitUnder(kitMm, ceilingMm) {
  if (!(ceilingMm < Infinity)) return kitMm;
  const fit = kitMm.filter(v => v <= ceilingMm + 1e-9);
  return fit.length === kitMm.length ? kitMm : fit.length ? fit : [Math.min(...kitMm)];
}
