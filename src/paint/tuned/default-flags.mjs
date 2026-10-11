// The tuned flags of the V096 recipe (--recipe v096), the default recipe until 2026-10-10. Their values were fitted by
// self study on benchmark subjects, mostly Trumbull (Y1), and V096 ran them on every subject. The default recipe no
// longer sets them; presets.mjs groups the same flags into presets a plan opts into. docs/overfitting.md lists them.
export const TUNED_DEFAULT_FLAGS = [
  '--darkgain 1.3 --coolgain 1.3',
  '--skylanemm 6 --skylanestep .8 --skyfloc .5',
  '--violetshadow 1 --groundglaze 1',
  '--stoneblocks 0.6 --stoneblockamt 0.2 --stoneblockmm 4 --stoneirregular 1',
  '--recesslayers 2 --recessshare .75 --recessclean 1 --foliagerefit 1',
  '--texvariety 0.8 --touchgain .6',
].join(' ');
