// Chroma reach of a named paint box: can the painter mix each significant colour of the picture as saturated as it is?
// A box can hold the right hues and still be too dull: earths lie in the direction of an orange but no amount of them
// makes a clear orange. A painter checks this on the palette before starting, by mixing the nearest colour to each
// passage and seeing whether it comes out greyer than the passage. Here that mix is the palette-mix solver's
// (src/paint/methods/palette-mix.mjs): one Kubelka-Munk layer of up to three paints over the paper, thinned to the
// colour's own lightness. A colour is out of reach when its nearest mix has less than `minChromaRatio` of its chroma,
// the same ratio the hue reach test uses (palettewide.mjs keyHueCoverage). Then the box pan whose addition brings the
// mix closest to that chroma is added. Planning only: it reads the palette sample, never the sheet. DOM free.
import { BOX, boxPigment } from './box.mjs';
import { solveMix, labOfColour } from '../paint/methods/palette-mix.mjs';

const chroma = lab => Math.hypot(lab[1], lab[2]);
const round1 = v => Math.round(v * 10) / 10;

/** A local colour's mean colour over its cells of the sample, as 8-bit sRGB numbers. */
export function clusterColour(sample, colour) {
  const v = [0, 0, 0];
  for (const s of colour.cells) for (let c = 0; c < 3; c++) v[c] += sample.rgb[s * 3 + c];
  return v.map(x => x / Math.max(1, colour.cells.length));
}

/**
 * How much of each significant colour's chroma the nearest mix of `paints` reaches at that colour's lightness.
 * Significant: a chromatic local colour (not the greys, chroma at least `minChroma`) holding `minShare` of the sample.
 * @returns {{ colours: object[], loss: number }} per colour { h, C, share, L, rgb, wanted, mixed, ratio, mixOf, loss };
 *   loss is the chroma still missing below `minChromaRatio` of the wanted chroma (0 when reached), and the largest
 *   of them is the box's loss.
 */
export function chromaReach(sample, colours, paints, { minShare = 0, minChroma = 20, minChromaRatio = 0.8 } = {}) {
  if (!paints.length) throw new RangeError('chroma reach needs at least one paint');
  const pigments = paints.map(p => boxPigment(p)), paper = Array.from(sample.paperRGB);
  const out = colours.filter(r => !r.grey && r.C >= minChroma && r.share >= minShare && r.cells.length).map(r => {
    const rgb = clusterColour(sample, r), lab = labOfColour(rgb), wanted = chroma(lab);
    const mix = solveMix(rgb, pigments, paper), mixed = chroma(mix.lab);
    return { h: r.h, C: r.C, share: r.share, L: lab[0], rgb: rgb.map(Math.round), wanted, mixed, ratio: wanted > 0 ? mixed / wanted : 1,
      mixOf: mix.indices.map(j => paints[j].key), loss: Math.max(0, wanted * minChromaRatio - mixed) };
  });
  return { colours: out, loss: Math.max(0, ...out.map(r => r.loss)) };
}

/**
 * Add box pans until every significant colour's chroma is reached, or `max` paints, or no pan helps. Each round adds
 * the pan that leaves the least chroma missing. Every addition carries its reason for the log and the run record.
 * @returns {{ paints: object[], added: object[], reach: object }} added: [{ key, name, colour: { h, C, L, share },
 *   wanted, before, after }] where before and after are the nearest mix's chroma without and with the pan.
 */
export function coverChroma(sample, colours, paints, { max = paints.length + 2, library = BOX, ...options } = {}) {
  let kept = [...paints], reach = chromaReach(sample, colours, kept, options);
  const added = [];
  while (reach.loss > 1e-6 && kept.length < max) {
    const worst = reach.colours.reduce((p, q) => (q.loss > p.loss ? q : p));
    let best = null;
    for (const pan of library.filter(p => !kept.some(q => q.key === p.key))) {
      const trial = chromaReach(sample, colours, [...kept, pan], options);
      if (trial.loss < reach.loss - 1e-6 && (!best || trial.loss < best.reach.loss - 1e-9)) best = { pan, reach: trial };
    }
    if (!best) break;
    const now = best.reach.colours.find(r => r.h === worst.h && r.share === worst.share);
    added.push({ key: best.pan.key, name: best.pan.name, colour: { h: round1(worst.h), C: round1(worst.C), L: round1(worst.L), share: worst.share },
      wanted: round1(worst.wanted), before: round1(worst.mixed), after: round1(now.mixed) });
    kept.push(best.pan); reach = best.reach;
  }
  return { paints: kept, added, reach };
}

/** One plain sentence per added pan, and one for a colour still out of reach at the cap. */
export function chromaNote({ added, reach }, named) {
  const parts = added.map(a => `added ${a.key} for chroma: the colour at hue ${a.colour.h.toFixed(0)}, L ${a.colour.L.toFixed(0)} (${(100 * a.colour.share).toFixed(1)}% of the sheet) has chroma ${a.wanted.toFixed(0)}, the nearest mix of ${named.join(', ')} reaches ${a.before.toFixed(0)}, with ${a.key} ${a.after.toFixed(0)}`);
  if (reach.loss > 1e-6) parts.push(`chroma still short by ${reach.loss.toFixed(1)} at the palette limit`);
  return parts.join('; ');
}
