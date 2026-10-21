// Presets: named sets of painter flags whose values were fitted on benchmark subjects. The default recipe uses none of
// them. A value plan opts in with "presets": [...], or the command line with --recipe default+<preset>[+<preset>].
// docs/techniques.md (Tuned settings) lists every item, what it was fitted on and its risk.

// The flags each preset sets: general techniques whose values were fitted mostly on Trumbull (Y1). No preset is
// keyed to a subject, and none is applied by subject id.
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
});

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
