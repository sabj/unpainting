// Generated from src/media/time-chunks.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// A step longer than its chunk is taken as several shorter ones (kinetic events as well as transport).
// An ordinary step: chunks of at most 2. The fast dry's tail (analyticTail, the sheet already level): chunks of at most
// DRY_TAIL_CHUNK_DT, since nothing there moves fast enough to need the short chunk and every chunk is a whole step's
// dispatches on the GPU.
export const STEP_CHUNK_DT = 2;
// (7 against 14, White Ships look 38 against rc4: mean 0.69 against 1.31 levels, 0.15% against 0.87% of pixels over 8;
// at 14 on full-size Mittens, multi-stroke first washes lose up to 22% of rim optical density, whereas 7 keeps rims <2%)
export const DRY_TAIL_CHUNK_DT = 7;
export function timeChunks(dt, chunkDt = STEP_CHUNK_DT) { return Math.max(1, Math.ceil(dt / chunkDt)); }

// A dry looks at whether its surface is level every levelEvery steps from its `level` step on (at most `levelMax`). The
// fast dry looks every 5, so the level phase, the costliest steps of a dry, ends within 5 steps of being level, not 25.
export const levelEvery = analyticTail => (analyticTail ? 5 : 25);

// Divide a physical wait of `count` steps at `baseDt` into a ramped implicit schedule preserving exact physical time:
// first 5 steps at baseDt (fast initial h^3 levelling), then up to 1.5 s at <=0.5 s, then the remainder at <=1.0 s.
export function rampedWaitSteps(count, baseDt) {
  if (!(baseDt > 0 && baseDt < 0.5) || !(count >= 20)) return [{ steps: count, dt: baseDt }];
  const total = count * baseDt;
  const phases = [];
  const init = Math.min(5, count);
  phases.push({ steps: init, dt: baseDt });
  let rem = total - init * baseDt;
  if (rem > 1e-12) {
    const midDur = Math.min(rem, 1.5);
    const midSteps = Math.ceil(midDur / 0.5);
    phases.push({ steps: midSteps, dt: midDur / midSteps });
    rem -= midDur;
  }
  if (rem > 1e-12) {
    const hiSteps = Math.ceil(rem / 1.0);
    phases.push({ steps: hiSteps, dt: rem / hiSteps });
  }
  return phases;
}

// Fast-mode levelling schedule shared by CPU dry() and GPU dryAdvance(). Preserves the exact physical durations
// level * baseDt and levelMax * baseDt while stepping the implicit solver at 0.1 -> 0.5 -> 1.0 s once level >= 20.
// Returns null for short/coarse schedules (keeping exact step counts for small-level callers).
export function fastLevelPlan(baseDt, level, levelMax) {
  if (!(baseDt > 0 && baseDt < 0.5) || !(level >= 20)) return null;
  const minPhases = rampedWaitSteps(level, baseDt);
  const segments = [];
  let t = 0;
  for (const p of minPhases) { segments.push({ from: t, to: t + p.steps, dt: p.dt }); t += p.steps; }
  const levelStep = t;
  const postDur = Math.max(0, (levelMax - level) * baseDt);
  const postSteps = postDur > 1e-12 ? Math.ceil(postDur / 1.0) : 0;
  if (postSteps > 0) {
    segments.push({ from: t, to: t + postSteps, dt: postDur / postSteps });
    t += postSteps;
  }
  return { segments, levelStep, levelMaxStep: t, postCheckEvery: postSteps > 2 ? 2 : 1 };
}

export function planStepAt(plan, t) {
  for (const seg of plan.segments) if (t < seg.to) return seg;
  return null;
}

// Below the connected-film floor the minimum levelling wait only integrates the slower kinetic processes. Keep its
// full physical duration, in steps capped at half a second, before entering the ordinary tail. Jumping straight to
// seven-second chunks at this boundary changed a faint native wash's rim by 9%, despite very small mean colour error.
export function thinDryWarmup(maxWater, floor, baseDt, remainingSteps, wetEps = .004) {
  if (!(floor > 0) || !(maxWater <= floor) || !(baseDt > 0 && baseDt < .5) || !(remainingSteps > 0)) return null;
  const duration = remainingSteps * baseDt, steps = Math.ceil(duration / .5);
  // Only a sub-threshold trace permits a doubled kinetic chunk after the full warmup. Merely being below
  // the connected-film floor is insufficient: at .025 mm a two-passage wash still changes its rim with that split.
  return { steps, dt: duration / steps, tailChunkDt: maxWater <= wetEps ? 2 * DRY_TAIL_CHUNK_DT : DRY_TAIL_CHUNK_DT };
}
