// Reserved lights with soft irregular edges, for the detail field of --modulate.
//
//   --practicelightmin 0.0006 a reserved light smaller than this share of the sheet is left to the brush
//   --practicelightsoft 1.5   the light's edge is read at this blur (cells), and wanders by --practicelightwander 0.1
import { removeSmall } from '../../raster.js';

// Reserved lights as a painter masks them: the light's own shape read soft, with an edge that wanders a little, and
// nothing smaller than a deliberate shape. A speck the size of a cell is left to the brush's skip over the tooth.
export function shapeLights(raw, { w, h, n, gaussian, num, seed = 20260923 }) {
  const soft = gaussian(Float32Array.from(raw), w, h, num('practicelightsoft', 1.5));
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const noise = gaussian(Float32Array.from({ length: n }, () => rnd() - 0.5), w, h, 1.2);
  let sd = 0; for (const v of noise) sd += v * v; sd = Math.sqrt(sd / n) || 1;
  const wander = num('practicelightwander', 0.1);
  const m = Uint8Array.from(soft, (v, i) => (v + wander * noise[i] / sd * 0.5 > 0.5 ? 1 : 0));
  return removeSmall(m, w, h, Math.max(8, Math.round(num('practicelightmin', 0.0006) * n)));
}
