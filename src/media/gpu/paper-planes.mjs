// The four constant paper planes a GPU sheet binds (PAPER, PAPER2, PAPER3, BPAP), as GpuSheet.init builds them. A batch's
// painter thread builds them before attaching, so its GPU thread does not spend about half a second a sheet on them.
import { permeability } from './permeability.mjs';
import { HASH } from './stepfull.mjs';

export function paperPlanes(paper, n) {
  const { px, py } = permeability(paper), P4 = new Float32Array(n * 4), P2 = new Float32Array(n * 4), P3 = new Float32Array(n * 4), PB = new Float32Array(n * 4);
  const hv = paper.valley || paper.height;
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    P4[q] = paper.capacity[i]; P4[q + 1] = paper.grain[i]; P4[q + 2] = paper.fdx[i]; P4[q + 3] = paper.fdy[i];
    P2[q] = px[i]; P2[q + 1] = py[i];
    P3[q] = paper.tooth[i]; P3[q + 1] = HASH(i); P3[q + 2] = hv[i]; P3[q + 3] = paper.height[i];
    PB[q] = paper.height[i]; PB[q + 1] = paper.tooth[i]; PB[q + 2] = hv[i]; PB[q + 3] = paper.proud ? paper.proud[i] : paper.height[i] - hv[i];
  }
  return { P4, P2, P3, PB };
}
