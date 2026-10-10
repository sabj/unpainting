// Default recipe flags fitted to benchmark images, primarily the Trumbull target.
// They run on every subject. docs/techniques.md lists what each does, what it was fitted on, its risk and how to
// turn it off. The drawing's medium, amount and weight are not here: each subject's plan chooses them (its drawing
// section, docs/plan-format.md).
export const TUNED_DEFAULT_FLAGS = [
  '--darkgain 1.3 --coolgain 1.3',
  '--skylanemm 6 --skylanestep .8 --skyfloc .5',
  '--violetshadow 1 --groundglaze 1',
  '--stoneblocks 0.6 --stoneblockamt 0.2 --stoneblockmm 4 --stoneirregular 1',
  '--recesslayers 2 --recessshare .75 --recessclean 1 --foliagerefit 1',
  '--texvariety 0.8 --touchgain .6',
].join(' ');
