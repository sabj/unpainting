// What a picture needs in its box that the fit does not ask for. The box chooser (boxpick.mjs, palettewide.mjs) scores
// a set of paints by how well its ideal mixes reproduce the picture, and three bright paints that span every hue
// reproduce anything on that measure, a black and a brown included: nothing in it prefers a dark or an earth. On the
// sheet a black mixed from a yellow, a rose and a blue dries navy, and a brown drawing given a blue to grey its earths
// is painted indigo wherever its plan leans cool. A painter keeps three habits the fit does not have:
//   - a picture with a mass of darks is given a dark paint, the one nearest those darks' own colour;
//   - a picture that is mostly muted warm is given the earths, with a paint to grey them: a blue when the picture has
//     cool colours, a dark neutral when it has none;
//   - a picture with no cool colour is given no blue: a blue the fit chose only to grey with gives way to the dark.
// The fit cannot be asked what a blue earns there. Its unmix (pigments.mjs, thirty steps) does not settle for paints as
// alike as the earths and a dark: Guardi's colonnade in sap green, cadmium red, the siennas and sepia reads 4.6 dE off
// where the settled answer is 2.6, so every box of earths looks worse to it than it is. The rule is the picture's own
// colours: a blue is mixed into greens, blues and violets, and a picture with none of them has no use for one.
// Shares are of the picture's painted cells (toned or coloured), not of the sheet: bare paper says nothing about paint.
// Every limit is a setting (NEEDS, or the options of boxNeeds). Paints are told apart by their own measured colour
// (box.mjs appearance), not by name. Plan time; reads the picture as the pick does. DOM free.
import { BOX, appearance } from './box.mjs';
import { renderedLab } from './boxpick.mjs';
import { deltaE2000 } from '../eval/colour.mjs';

/** The settings, with their defaults. Lightness, chroma and hue are CIELAB against the paper; hue in degrees. */
export const NEEDS = Object.freeze({
  // a cell is painted when it is toned (L* under greyL) or coloured (chroma at least minChroma); the rest is bare paper
  greyL: 85, minChroma: 8,
  // darks: painted cells under darkL; a dark paint is kept when they are at least darkShare of the painted cells
  darkL: 35, darkShare: 0.15,
  // muted warm local colours (hue and chroma between these); the earths come in at earthShare of the painted cells
  earthHue: [45, 90], earthC: [4, 32], earthShare: 0.2,
  // cool colours, the ones a blue is mixed into (green through violet): coloured cells with a hue between these; a
  // picture has them at coolShare of its painted cells
  coolHue: [120, 330], coolShare: 0.01,
  // a dark paint: laid until its most absorbed channel passes 0.15 of the light, no lighter than L* and no stronger than C
  darkPanL: 30, darkPanC: 30,
  // a blue paint, and an earth paint: as a half-strength tint, hue between these and chroma at least / between these
  bluePanHue: [200, 310], bluePanC: 15, earthPanHue: [30, 95], earthPanC: [15, 45],
  // the earths a muted warm picture is given, and the blue that greys them when the picture has cool colours
  earths: Object.freeze(['rawsienna', 'sienna']), earthBlue: 'ultramarine',
});

const within = (v, [lo, hi]) => v >= lo && v <= hi;
const hueOf = (a, b) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

/** A dark paint (lamp black, Payne's grey, sepia, burnt umber in the box as it stands): dark and near neutral in mass. */
export function isDarkPan(pan, o = NEEDS) { const a = appearance(pan.dir, 0.15); return a.L <= o.darkPanL && a.C <= o.darkPanC; }
/** A blue paint (ultramarine, phthalo blue, cerulean). */
export function isBluePan(pan, o = NEEDS) { const a = appearance(pan.dir, 0.5); return within(a.h, o.bluePanHue) && a.C >= o.bluePanC; }
/** An earth paint (yellow ochre, raw sienna, burnt sienna, burnt umber): a muted warm tint. */
export function isEarthPan(pan, o = NEEDS) { const a = appearance(pan.dir, 0.5); return within(a.h, o.earthPanHue) && within(a.C, o.earthPanC); }

/**
 * What the picture holds, on the chooser's sample and its local colours (palettewide.mjs localColours):
 * { painted (share of the sample), dark, earth, cool (shares of the painted cells), darkCells (sample indices: the
 * cells under darkL, or the darkest tenth of the painted cells when under a hundredth of them are that dark) }.
 */
export function pictureShares(sample, colours, options = {}) {
  const o = { ...NEEDS, ...options }, { m, lab } = sample, painted = [], dark = [];
  let cool = 0;
  for (let s = 0; s < m; s++) {
    const C = Math.hypot(lab.a[s], lab.b[s]);
    if (!(lab.L[s] < o.greyL || C >= o.minChroma)) continue;
    painted.push(s);
    if (lab.L[s] < o.darkL) dark.push(s);
    if (C >= o.minChroma && within(hueOf(lab.a[s], lab.b[s]), o.coolHue)) cool++;
  }
  const n = Math.max(1, painted.length), share = painted.length / Math.max(1, m);
  const earth = colours.filter(r => within(r.h, o.earthHue) && within(r.C, o.earthC)).reduce((a, r) => a + r.share, 0);
  const deep = dark.length >= 0.01 * n ? dark : [...painted].sort((p, q) => lab.L[p] - lab.L[q]).slice(0, Math.max(1, Math.round(0.1 * n)));
  return { painted: share, dark: dark.length / n, earth: share > 0 ? Math.min(1, earth / share) : 0, cool: cool / n, darkCells: Int32Array.from(deep) };
}

/** How far a paint alone is from these cells: the mean CIEDE2000 of the cells against their render in that one paint. */
function fitAlone(sample, cells, pan) {
  const { lab } = sample, L2 = renderedLab(sample, [pan]);
  let e = 0; for (const s of cells) e += deltaE2000([lab.L[s], lab.a[s], lab.b[s]], [L2.L[s], L2.a[s], L2.b[s]]);
  return e / Math.max(1, cells.length);
}

/**
 * The fitted box with what the picture needs (the head of this file). `paints`: the box the fit chose; `cover`: the
 * fit's own guard for key hues (paints => paints, palettewide.mjs coverKeyHues), asked again after a blue is dropped so
 * no saturated hue the picture holds is left without its paint.
 * @returns { paints, added (keys), dropped (keys), shares (pictureShares), notes (plain words for the log) }
 */
export function boxNeeds(sample, colours, paints, { cover = null, library = BOX, ...options } = {}) {
  const o = { ...NEEDS, ...options }, shares = pictureShares(sample, colours, o);
  let kept = [...paints];
  const added = [], dropped = [], notes = [], pct = v => `${(100 * v).toFixed(1)}%`;
  const has = key => kept.some(p => p.key === key), hasDark = () => kept.some(p => isDarkPan(p, o));
  const add = (pan, why) => { if (!pan || has(pan.key)) return; kept.push(pan); added.push(pan.key); notes.push(`${pan.name} ${why}`); };
  // the dark paint nearest the picture's own darks: neutral for a black coat, warm for a brown drawing's shadows
  const nearestDark = () => library.filter(p => isDarkPan(p, o) && !has(p.key)).map(p => ({ p, e: fitAlone(sample, shares.darkCells, p) })).reduce((a, b) => (a && a.e <= b.e ? a : b), null)?.p ?? null;
  const cool = shares.cool >= o.coolShare;
  if (shares.earth >= o.earthShare) {
    for (const key of o.earths) add(library.find(p => p.key === key), `for muted warm colours on ${pct(shares.earth)} of the painted cells`);
    if (cool) add(library.find(p => p.key === o.earthBlue), `to grey the earths (cool colours on ${pct(shares.cool)} of the painted cells)`);
    else if (!hasDark()) add(nearestDark(), 'to grey the earths (the picture has no cool colour)');
  }
  if (shares.dark >= o.darkShare && !hasDark()) add(nearestDark(), `for darks on ${pct(shares.dark)} of the painted cells`);
  // no cool colour: a blue was chosen only to grey the other paints, which a dark does without turning them blue
  if (!cool && kept.some(p => isBluePan(p, o))) {
    if (!hasDark()) add(nearestDark(), 'to grey the other paints (the picture has no cool colour)');
    if (hasDark()) {
      for (const p of kept.filter(q => isBluePan(q, o))) { dropped.push(p.key); notes.push(`${p.name} dropped: the picture has no cool colour (${pct(shares.cool)} of the painted cells), and the dark greys the other paints`); }
      kept = kept.filter(p => !isBluePan(p, o));
      if (cover) for (const p of cover(kept)) if (!has(p.key)) add(p, 'for a saturated hue the picture holds');
    }
  }
  return { paints: kept, added: added.filter(k => kept.some(p => p.key === k)), dropped: dropped.filter(k => !kept.some(p => p.key === k)), shares, notes };
}
