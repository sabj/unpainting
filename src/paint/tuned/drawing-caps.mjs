// Subject-specific drawing limits fitted to reference images.
// Other subjects use methods/material-profiles.mjs defaults.
// lines: most gestures per stage; pressure: 0..1 cap; minLengthMm: shortest opening gesture; edgeMin: the closing
// pen draws only where edge strength is at least this.
export const TUNED_DRAWING_CAPS = Object.freeze({
 'subject-c': { opening: { lines: 18, pressure: .25, minLengthMm: 4 }, closing: { lines: 16, pressure: .32, edgeMin: .25 } },
 'subject-a': { opening: { lines: 12, pressure: .28, minLengthMm: 8 }, closing: { lines: 20, pressure: .35, edgeMin: .28 } },
});
