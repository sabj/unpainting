// Per-subject caps on the drawing stages, fitted by self study to two private benchmark subjects: 3T (a portrait)
// and 1D (an ink and wash dog). --drawsubject 3T or 1D picks a set; the portrait-3t and dog-1d presets set it. Other runs
// use the default caps in methods/material-profiles.mjs.
// lines: most gestures per stage; pressure: 0..1 cap; minLengthMm: shortest opening gesture; edgeMin: the closing
// pen draws only where edge strength is at least this.
export const TUNED_DRAWING_CAPS = Object.freeze({
 'subject-c': { opening: { lines: 18, pressure: .25, minLengthMm: 4 }, closing: { lines: 16, pressure: .32, edgeMin: .25 } },
 'subject-a': { opening: { lines: 12, pressure: .28, minLengthMm: 8 }, closing: { lines: 20, pressure: .35, edgeMin: .28 } },
});
