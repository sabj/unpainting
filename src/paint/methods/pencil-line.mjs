// --penpencil <stage.png>: the opening drawing laid dry in pencil, in the line colour and weight of the target's own
// drawing stage. A wet dip pen wicks and beads where it slows or overlaps; a pencil line stays light and continuous.
// DOM free apart from the one image read.

/**
 * The target drawing stage's line: per-channel density of the line core against its paper, its rgb, and its share of cells.
 * Line cells are at least `cut` (--pencilcut) levels darker than a blurred copy; the core is their darkest third.
 */
export async function measureLine({ file, w, h, sharp, cut = 12, log, min = 50 }) {
  const img = sharp(file).removeAlpha().resize(w, h, { fit: 'fill' });
  const { data } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { data: bg } = await img.clone().blur(4).raw().toBuffer({ resolveWithObject: true });
  const n = w * h, lum = (a, i) => 0.2126 * a[3 * i] + 0.7152 * a[3 * i + 1] + 0.0722 * a[3 * i + 2];
  const cells = [];
  for (let i = 0; i < n; i++) { const dl = lum(bg, i) - lum(data, i); if (dl >= cut) cells.push([dl, i]); }
  if (min === 0 && cells.length < 50) return { density: [0, 0, 0], rgb: [0, 0, 0], share: cells.length / n };
  if (cells.length < 50) throw new Error(`--penpencil: only ${cells.length} line cells in ${file}`);
  cells.sort((a, b) => b[0] - a[0]);
  const core = cells.slice(0, Math.max(20, Math.floor(cells.length / 3)));
  const d = [0, 0, 0], rgb = [0, 0, 0];
  for (const [, i] of core) for (let c = 0; c < 3; c++) { d[c] += Math.max(0, -Math.log(Math.max(1, data[3 * i + c]) / Math.max(1, bg[3 * i + c]))); rgb[c] += data[3 * i + c]; }
  for (let c = 0; c < 3; c++) { d[c] /= core.length; rgb[c] /= core.length; }
  const share = cells.length / n;
  log(`pencil: line of ${file}: ${(100 * share).toFixed(2)}% of cells, core rgb ${rgb.map(v => v.toFixed(0)).join('/')}, density ${d.map(v => v.toFixed(3)).join('/')}`);
  return { density: d, rgb, share };
}

/** The pencil pigment: absorption shaped like the measured line, unit mean; the deposit carries the strength. */
export function pencilPigment(density) {
  const m = (density[0] + density[1] + density[2]) / 3 || 1;
  return { K: density.map(v => Math.max(0.02, v / m)), S: [0.02, 0.02, 0.02], rho: 0.05, omega: 60, gamma: 0, strength: m };
}

export {pencilDraw} from '../../media/graphite.mjs';
