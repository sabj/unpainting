// A pencil line is dry graphite pressed into the paper's tooth: under a wash it holds as a dried layer does, not as a
// loose deposit that the water's scour lifts. The opening drawing's graphite is laid (carried from the fine sheet) as a
// deposit; before the first wash it is set into a dried layer of its own. Only the graphite: a pen's ink keeps its own
// set or soluble state (--inkfast). Measured on Mittens at 360 cells: the first wash moved 0.50% of the pencil out of
// its cells as a deposit, 0.004% set.
import { coherent, layersChanged } from '../../media/sheet.mjs';

/** Sets graphite channel `k` of `sheet` (its deposit and pore planes) into a new dried layer. Returns the amount set. */
export function setPencil(sheet, k) {
  coherent(sheet);
  const D = sheet.D[k], P = sheet.P[k], n = sheet.n;
  let total = 0; for (let i = 0; i < n; i++) total += D[i] + P[i];
  if (!(total > 0)) return 0;
  const zero = sheet._zeroLayer || (sheet._zeroLayer = new Float32Array(n)), L = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = D[i] + P[i]; D[i] = 0; P[i] = 0; }
  sheet.layers.push(sheet.D.map((_, j) => (j === k ? L : zero)));
  layersChanged(sheet);
  sheet._gpu?.cpuWroteAll?.();
  return total;
}
