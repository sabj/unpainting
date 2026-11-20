// A wash laid beside a neighbour that is still damp ("beside damp"), so the two meet while damp and the edge between
// them softens. The new wash's own cells are dry paper: it is not laid into a wet bed (wet-bed-wait.mjs) and it skips the
// wet-on-dry gate that would dry the neighbour first (passage-dry-gate.mjs). It waits only until the neighbour has lost
// its shine (its typical cell's standing water at or under the wet bed's glossy limit), as a painter waits before laying
// a wash against one just laid, so the two do not flood into each other.
import { WET_BED } from './wet-bed-wait.mjs';

export const BESIDE_DAMP = Object.freeze({ glossy: WET_BED.glossy, maxWaits: 20000, batch: 10 });

/**
 * observe(): the neighbouring paper the stroke will meet, with full statistics (waterP50); step(o): one physics step.
 * Returns { paper, waits }: the neighbour as it is when the stroke is laid and the steps waited (0 when it is not glossy).
 */
export function waitBesideDamp({ observe, step, O }) {
  let paper = observe(), waits = 0;
  if (!Number.isFinite(paper.waterP50)) throw new Error('beside damp: the neighbour was measured without its typical cell (waterP50)');
  while (paper.waterP50 > BESIDE_DAMP.glossy && waits < BESIDE_DAMP.maxWaits) {
    for (let j = 0; j < BESIDE_DAMP.batch; j++) step(O);
    waits += BESIDE_DAMP.batch;
    paper = observe();
  }
  return { paper, waits };
}
