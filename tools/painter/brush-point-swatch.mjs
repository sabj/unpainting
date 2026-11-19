// What the engine's brush contact lays at light pressure: a line on dry cold-press paper, width and continuity against pressure,
// and a mask laid the way the painter lays a small passage. The point_width_mm of src/paint/brushes.json is read from this.
// Usage: node tools/painter/brush-point-swatch.mjs   (prints one JSON line per brush, density and pressure; CPU, about a minute)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, dry, thickness, setClip, DEFAULTS, coherent } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { scaleBrushForDensity } from '../../src/media/brush-density.mjs';
import { loadPhysical } from '../../src/paint/methods/brushes.mjs';
import { shapedPlanePaths } from '../../src/paint/techniques/shaped-marks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PIGMENT = { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 };
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
const WET_ON_DRY = { water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2 }; // the stock technique of the painter's scrap swatch
const PRESSURES = [0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 0.9, 1];

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const kitWidthMm = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/paint/brushes.json'), 'utf8')).brushes[name].width_mm;
const sheetFor = (w, h, mm) => createSheet(makePaper(w, h, { mmPerCell: mm, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), [PIGMENT]);
// the painter's wash brush (tools/plate/paint.mjs) of a given half-width in cells, hairs scaled for the render width
const washBrush = (radius, mm, seed = 31) => createBrush(scaleBrushForDensity({ flat: true, radius, bristles: Math.max(12, Math.ceil(radius * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: WET_ON_DRY.wetMix, bridge: WET_ON_DRY.bridge, bridgeSoft: WET_ON_DRY.bridgeSoft, seed }, { renderWidth: 280 / mm }));

/** A straight line of one pressure with the named kit brush on a fresh dry sheet: laid width in cells and mm (cells holding a quarter of the median line's peak), the share of the line that is continuous, and the width's spread. */
function layLine({ mm, brush, pressure, length = 300 }) {
  const belly = kitWidthMm(brush) / 2 / mm, W = length + 80, H = Math.max(40, Math.ceil(belly * 2 + 30));
  const sheet = sheetFor(W, H, mm), b = washBrush(belly, mm), y = H / 2, pts = [];
  dip(b, { water: WET_ON_DRY.water, conc: [0.25] });
  for (let x = 40; x <= 40 + length; x += 4) pts.push({ x, y, p: pressure });
  stroke(b, sheet, pts, { upright: 'sweep', spacing: 1.4, lift: true });
  dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 }); coherent(sheet);
  const t = thickness(sheet)[0], peaks = [], xs = [];
  for (let x = 40 + Math.round(length * 0.15); x < 40 + Math.round(length * 0.85); x++) { let m = 0; for (let yy = 0; yy < H; yy++) m = Math.max(m, t[yy * W + x]); peaks.push(m); xs.push(x); }
  const tau = 0.25 * (median(peaks.filter(v => v > 0)) || 1e-9);
  const widths = xs.map(x => { let n = 0; for (let yy = 0; yy < H; yy++) if (t[yy * W + x] >= tau) n++; return n; });
  const mean = widths.reduce((a, v) => a + v, 0) / widths.length, sd = Math.sqrt(widths.reduce((a, v) => a + (v - mean) ** 2, 0) / widths.length);
  return { cells: median(widths), mm: +(median(widths) * mm).toFixed(3), continuity: widths.filter(v => v >= 1).length / widths.length, cv: sd / Math.max(mean, 1e-9) };
}

/** The lowest pressure at which a line is stable (continuous over 95 percent of its length, width spread under 0.35): its laid width. */
export function narrowestStable({ mm, brush }) {
  for (const pressure of PRESSURES) { const r = layLine({ mm, brush, pressure }); if (r.continuity >= 0.95 && r.cv <= 0.35) return { pressure, ...r }; }
  throw new Error(`no stable line for ${brush} at ${mm} mm a cell`);
}

/** A mask laid as the painter lays a small passage (paint.mjs): shapedPlanePaths, the kit's smallest brush that reaches the widest point, clipped to the mask. Returns the share of mask cells that carry paint. */
export function layMask({ mm, mask, w, h }) {
  const PB = loadPhysical({ root: ROOT, opt: (k, f) => (k === 'sheetmm' ? String(w * mm) : f), num: (k, f) => (k === 'physical' ? 1 : k === 'sheetmm' ? w * mm : f), W2: w, H2: h });
  const paths = shapedPlanePaths(mask, w, h, { mmPerCell: mm }), sheet = sheetFor(w, h, mm);
  setClip(sheet, mask);
  for (const pts of paths) {
    const b = washBrush(PB.half(PB.pick(Math.max(...pts.map(p => p.r)))), mm);
    dip(b, { water: WET_ON_DRY.water, conc: [0.25] });
    stroke(b, sheet, pts, { upright: 'sweep', spacing: 1.4, lift: true });
  }
  setClip(sheet, null); dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 }); coherent(sheet);
  const t = thickness(sheet)[0], inside = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) inside.push(t[i]);
  const tau = 0.25 * median(inside.filter(v => v > 0).length ? inside.filter(v => v > 0) : [1e-9]);
  return inside.filter(v => v >= tau).length / inside.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const mm of [280 / 2172, 280 / 1086]) for (const brush of ['rigger', 'round4']) {
    for (const pressure of PRESSURES) console.log(JSON.stringify({ mm: +mm.toFixed(4), brush, pressure, ...layLine({ mm, brush, pressure }) }));
    console.log(JSON.stringify({ mm: +mm.toFixed(4), brush, narrowestStable: narrowestStable({ mm, brush }) }));
  }
}
