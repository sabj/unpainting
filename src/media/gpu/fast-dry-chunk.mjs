export function fastDryChunk(value=50){const n=Number(value);if(n!==50&&n!==200)throw new RangeError('Fast dry chunk must be50 (original) or200 (opt-in)');return n;}

// Keep full-mode scheduling and near-dry observations conservative. Fast mode
// amortizes readbacks while a substantial wet frontier remains. All stops are
// still bounded by the caller's limit/checkpoint and verified by actual counters.
export function adaptiveFastDryChunk(state, tiles = Infinity) {
  // Most ordinary drys finish in their first 50 fast steps. Probe once before
  // expanding: a long first chunk would only submit work after they are dry.
  // The quiet-film dt boost already ends most tails in the next small chunk.
  if (!state.analyticTail || state.fastChunks === 0 || state.adaptiveUsed) return 50;
  if (state.lastWetCounter >= Math.max(16, tiles / 8)) return 200;
  return state.fastChunks < 3 && state.lastWetCounter > 0 ? 150 : 50;
}
