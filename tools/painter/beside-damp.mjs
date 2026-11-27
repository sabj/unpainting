// A wash laid beside a neighbour that is still damp ("beside damp"), so the two meet while damp and the edge between
// them softens. The new wash's own cells are dry paper: it is not laid into a wet bed (wet-bed-wait.mjs) and it skips the
// wet-on-dry gate that would dry the neighbour first (passage-dry-gate.mjs). It waits only until the neighbour has lost
// its shine (its typical cell's standing water at or under the wet bed's glossy limit), as a painter waits before laying
// a wash against one just laid, so the two do not flood into each other.
import { WET_BED } from './wet-bed-wait.mjs';

export const BESIDE_DAMP = Object.freeze({ glossy: WET_BED.glossy, maxWaits: 20000, batch: 10, maxDt: 2 });

/**
 * observe(): the neighbouring paper the stroke will meet, with full statistics (waterP50); step(o): one physics step.
 * Returns { paper, waits }: the neighbour as it is when the stroke is laid and the steps waited (0 when it is not glossy).
 */
export function waitBesideDamp({ observe, step, O }) {
  let paper = observe(), waits = 0, elapsed = 0;
  if (!Number.isFinite(paper.waterP50)) throw new Error('beside damp: the neighbour was measured without its typical cell (waterP50)');
  const baseDt = O.dt ?? .1;
  if (!(baseDt > 0) || !Number.isFinite(baseDt)) throw new RangeError('beside damp: dt must be finite and positive');
  let dt = Math.min(baseDt, BESIDE_DAMP.maxDt);
  while (paper.waterP50 > BESIDE_DAMP.glossy && waits < BESIDE_DAMP.maxWaits) {
    const before = paper.waterP50, batch = Math.min(BESIDE_DAMP.batch, BESIDE_DAMP.maxWaits - waits);
    const options = dt === O.dt ? O : { ...O, dt };
    for (let j = 0; j < batch; j++) step(options);
    waits += batch; elapsed += batch * dt;
    paper = observe();
    if (!Number.isFinite(paper.waterP50)) throw new Error('beside damp: the neighbour was measured without its typical cell (waterP50)');
    // Grow only between observations. Near the shine boundary, spend at most half the estimated remaining time
    // in the next batch. The minimum batch is the original clock, retaining its admission-time resolution.
    const rate = (before - paper.waterP50) / (batch * dt), remaining = paper.waterP50 - BESIDE_DAMP.glossy;
    const approach = rate > 0 ? .5 * remaining / (rate * BESIDE_DAMP.batch) : BESIDE_DAMP.maxDt;
    dt = Math.max(Math.min(baseDt, BESIDE_DAMP.maxDt), Math.min(BESIDE_DAMP.maxDt, 2 * dt, approach));
  }
  return { paper, waits, elapsed };
}
