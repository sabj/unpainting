export function fastDryChunk(value=50){const n=Number(value);if(n!==50&&n!==200)throw new RangeError('Fast dry chunk must be50 (original) or200 (opt-in)');return n;}

// Keep full-mode scheduling and near-dry observations conservative. Fast mode
// amortizes readbacks while a substantial wet frontier remains. All stops are
// still bounded by the caller's limit/checkpoint and verified by actual counters.
export function adaptiveFastDryChunk(state, tiles = Infinity, options) {
  // Most ordinary drys finish in far fewer than 50 fast steps because absorption and pinned-edge evaporation
  // remove surface water much faster than uniform evap alone. Bound every surface-wet probe by the measured
  // evaporation horizon (capped at 16 steps) so dampOnly, light levelling and the quiet pore tail engage promptly
  // instead of overshooting into 150-200 wasted steps after surface dryness.
  if (!state.analyticTail || state.adaptiveUsed) return 50;
  const maxWater = state.lastCounters && new Float32Array(state.lastCounters.buffer, state.lastCounters.byteOffset, state.lastCounters.length)[7];
  if (Number.isFinite(maxWater) && maxWater >= 0 && options?.evap > 0 && state.dt > 0) {
    if (maxWater > 0) return Math.min(16, Math.max(1, Math.ceil(maxWater / (options.evap * state.dt))));
    if (state.fastChunks === 0) return 1;
    // Surface water is already gone (dampOnly pores): probe in bounded chunks so quietDryTail finishes promptly.
    return 16;
  }
  if (state.fastChunks === 0) return 50;
  if (state.lastWetCounter >= Math.max(16, tiles / 8)) return 200;
  return state.fastChunks < 3 && state.lastWetCounter > 0 ? 150 : 50;
}
