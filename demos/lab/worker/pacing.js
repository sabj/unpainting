// Keep the fractional estimate between batches. Growing from floor(previous) would
// trap a one-step batch at floor(1 * 1.25) forever after an expensive GPU preview.
export function nextChunkSteps(previous, ran, elapsedMs, targetMs = 16) {
  const wanted = ran * targetMs / Math.max(1, elapsedMs);
  return Math.max(1, Math.min(256, Math.max(previous * 0.5, Math.min(previous * 1.25, wanted))));
}
