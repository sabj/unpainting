// Presets: named sets of painter flags whose values were fitted on benchmark subjects. The default recipe uses none of
// them. A value plan opts in with "presets": [...], or the command line with --recipe default+<preset>[+<preset>].
// docs/overfitting.md lists every item, what it was fitted on and its risk.
import { TRUMBULL_PAINTS } from './trumbull.mjs';

// The flags each preset sets. Per-subject presets (trumbull, portrait-3t, dog-1d) turn on rules fitted to one image;
// the others are general techniques with values fitted mostly on Trumbull (Y1).
export const PRESETS = Object.freeze({
  // Buildings under a sky: sky lanes, cut-stone blocks, dark recesses in two layers, a cool ground glaze, varied texture.
  architecture: [
    '--skylanes 1 --skyblue 1 --skysplit 1 --skylanemm 6 --skylanestep .8 --skyfloc .5',
    '--groundglaze 1',
    '--stoneblocks 0.6 --stoneblockamt 0.2 --stoneblockmm 4 --stoneirregular 1',
    '--recesses 1 --recesslayers 2 --recessshare .75 --recessclean 1',
    '--texvariety 0.8',
  ].join(' '),
  // Glaze strengths fitted on Y1 and Y4: 30% more paint in shadow glazes and cool cells, lighter touch-up glazes.
  'glaze-gains': '--darkgain 1.3 --coolgain 1.3 --touchgain .6',
  // Trumbull (Y1): its seven-paint box, the shadow glaze mix, stone and leaf colour fits, the first-ink skips.
  trumbull: `--trumbullrules 1 --shadowraw 1 --violetshadow 1 --foliagerefit 1 --paints ${TRUMBULL_PAINTS}`,
  // The second Trumbull-derived subject (Y4): the seven-paint box only.
  'trumbull-paints': `--paints ${TRUMBULL_PAINTS}`,
  // The private portrait (3T): the lower-face texture zone, the first-ink jaw rule and its drawing caps.
  'portrait-3t': '--portraitrules 1 --drawsubject subject-c',
  // The private ink-and-wash dog (1D): its drawing caps.
  'dog-1d': '--drawsubject subject-a',
});

// The presets the V096 recipe (the default before 2026-10-10) applied by itself when a value plan named one of these
// subjects. Only --recipe v096 reads this map, so old runs repeat exactly.
export const V096_SUBJECT_PRESETS = Object.freeze({
  Y1: Object.freeze(['architecture', 'trumbull']),
  'subject-e': Object.freeze(['trumbull-paints']),
  'subject-c': Object.freeze(['portrait-3t']),
  'subject-a': Object.freeze(['dog-1d']),
});

/** The presets V096 applied for a plan subject, or none. */
export const v096PresetsFor = subject => V096_SUBJECT_PRESETS[subject] ?? [];

/** Every flag name any preset sets, without the leading dashes. */
export function presetFlagNames() {
  const names = new Set();
  for (const flags of Object.values(PRESETS)) for (const t of flags.split(' ')) if (t.startsWith('--')) names.add(t.slice(2));
  return names;
}

/**
 * The flags of the named presets in order, as argv tokens. Throws on an unknown name, so a typo in a plan fails the run
 * instead of painting without the preset.
 */
export function presetFlags(names) {
  const out = [];
  for (const name of names) {
    const flags = PRESETS[name];
    if (!flags) throw new Error(`unknown preset ${name}; known: ${Object.keys(PRESETS).join(', ')}`);
    out.push(...flags.split(' '));
  }
  return out;
}
