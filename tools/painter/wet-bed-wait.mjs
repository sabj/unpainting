// A wet stroke into a fresh wash waits for the shine to go off while the footprint stays damp, then is laid. The shine
// is read on the typical bed cell (the median over the footprint), as a painter judges a bed by its sheen, never on its
// single wettest spot: waiting until the last puddle has gone lets the rest of the bed dry past a film (Trumbull, 480
// px: a lane wetted to W 0.62 was charged 1375 time units later on W 0.03). The stroke is laid once the damp share
// would drop below the limit, and paper that never met both is counted (src/media/checks.mjs), never a stop unless
// --strict 1. `paper` and `observe` must give full statistics (waterP50).
import { check } from '../../src/media/checks.mjs';

export const WET_BED = { moistShare: .7, glossy: .15, maxWaits: 20000, batch: 10, slowSteps: 140 };
// the typical bed cell's standing water; a measurement without it is a caller's error, not a fallback to the wettest cell
const typical = paper => { if (!Number.isFinite(paper.waterP50)) throw new Error('wet bed: the paper was measured without its typical cell (waterP50)'); return paper.waterP50; };

/**
 * paper: the footprint as measured now; observe(): measure it again; step(o): one physics step with options o.
 * Returns { paper, wetWaits }: the paper the stroke will meet and the steps waited.
 */
export function layIntoWetBed({ paper, observe, step, O, info = {} }) {
  const fast = { ...O, dt: 2 };
  let wetWaits = 0;
  if (paper.moistShare >= WET_BED.moistShare && typical(paper) > WET_BED.glossy) {
    while (typical(paper) > WET_BED.glossy && wetWaits < WET_BED.maxWaits) {
      const before = wetWaits;
      for (let j = 0; j < WET_BED.batch; j++) step(before >= WET_BED.slowSteps ? fast : O);
      wetWaits += WET_BED.batch;
      paper = observe();
      if (paper.moistShare < WET_BED.moistShare) break;
    }
  }
  check('wet wash laid on uneven paper', paper.moistShare >= WET_BED.moistShare && typical(paper) <= WET_BED.glossy,
    { ...info, moistShare: +paper.moistShare.toFixed(3), waterTypical: +typical(paper).toFixed(3), waterMax: +paper.waterMax.toFixed(3), wetWaits });
  return { paper, wetWaits };
}
