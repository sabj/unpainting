// Passage progress is measured at completed boundaries, never by wall time.
// Keep drawing/material stages for galleries and the first wash for the process map.

/** Fast all-frame films keep every other stage, the first and every fourth completed pass, and every forced frame
 * (a completed value band, dried): nothing while a pass is still being laid. */
export function fastPaintFrame(stage) {
  if (stage.stage !== 'paint') return true;
  if (stage.laying) return false;
  return Boolean(stage.force) || (stage.pass ?? 0) <= 1 || stage.pass % 4 === 0;
}

/**
 * Whether a fast-mode painting keeps the frame the painter asks for at `stage`. `policy` is the run's framePolicy
 * after keep(stage); `sameAsLast`: the last frame kept was of this same stage.
 * A film (--video 1) keeps every frame asked for, the --frames ones laid inside a pass too: several of those share
 * one stage, so they are kept though it repeats. Keeping all frames without a film (--keepallframes) keeps completed
 * boundaries only (fastPaintFrame).
 */
export function fastKeepsFrame(stage, policy, sameAsLast) {
  if (policy.film) return !sameAsLast || Boolean(stage.laying);
  if (policy.all && !fastPaintFrame(stage) && !policy.byDefault) return false;
  return !sameAsLast;
}

export function framePolicy({ video = false, keepAll = false } = {}) {
  const all = Boolean(video || keepAll), goals = [0.1, 0.25, 0.5, 0.75, 1];
  let next = 0, firstWash = false, last = null, prevOf = 0;
  return {
    all,
    // the film is switched on (--video 1): its frames are kept lossless (src/media/frame-file.mjs)
    film: Boolean(video),
    state() { return {next, firstWash, last, prevOf}; },
    restore(state) { if (state) ({next, firstWash, last, prevOf = 0} = state); },
    // what the checkpoint policy would keep, worked out under every policy (so keeping all is a superset of it)
    byDefault: false,
    keep(stage) {
      this.byDefault = this.decide(stage);
      return all || this.byDefault;
    },
    decide(stage) {
      const key = JSON.stringify(stage);
      if (key === last) return false;
      if (stage.stage === 'paint') {
        if (stage.laying || !stage.of) return false;
        const grew = prevOf > 0 && stage.of > prevOf;
        prevOf = stage.of;
        if (grew) {
          next = 0;
          const prevProgress = Math.max(0, (stage.pass - 1) / stage.of);
          while (next < goals.length && prevProgress >= goals[next]) next++;
        }
        if (!stage.force && !grew) {
          const progress = stage.pass / stage.of;
          const crossed = next < goals.length && progress >= goals[next];
          if (firstWash && !crossed) return false;
          while (next < goals.length && progress >= goals[next]) next++;
        }
        firstWash = true;
      }
      last = key;
      return true;
    },
  };
}
