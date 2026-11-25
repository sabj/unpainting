// A step longer than its chunk is taken as several shorter ones (kinetic events as well as transport).
// An ordinary step: chunks of at most 2. The fast dry's tail (analyticTail, the sheet already level): chunks of at most
// DRY_TAIL_CHUNK_DT, since nothing there moves fast enough to need the short chunk and every chunk is a whole step's
// dispatches on the GPU.
export const STEP_CHUNK_DT = 2;
// (7 against 14, White Ships look 38 against rc4: mean 0.69 against 1.31 levels, 0.15% against 0.87% of pixels over 8)
export const DRY_TAIL_CHUNK_DT = 7;
export function timeChunks(dt, chunkDt = STEP_CHUNK_DT) { return Math.max(1, Math.ceil(dt / chunkDt)); }

// A dry looks at whether its surface is level every levelEvery steps from its `level` step on (at most `levelMax`). The
// fast dry looks every 5, so the level phase, the costliest steps of a dry, ends within 5 steps of being level, not 25.
export const levelEvery = analyticTail => (analyticTail ? 5 : 25);

// The most CG iterations a fast dry's levelling encodes a step (each is two dispatches, needed or not).
// (a solve that needs more keeps the iterate it reached, and the next step levels on from it)
export const DRY_LEVEL_ITERS = 16;
