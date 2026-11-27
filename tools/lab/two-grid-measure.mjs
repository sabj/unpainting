// Numerical measurements of the archived synthetic two-grid wash, at each run's native pigment spacing.
// This writes numbers only. Source-painting comparison plates still require the strict doctor gate.
import fs from 'node:fs';
import path from 'node:path';
import { renderLayers } from '../../src/media/km.mjs';
import { luminance, densityOf, grainContrast, rimContrast } from './wash-measure.mjs';

const PIGMENT = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02] };
const PAPER = new Uint8Array([246, 245, 239]);
const PAPER_Y = luminance(PAPER, 1)[0];

// First 10% and 90% crossings of the left edge profile, linearly located between native cell centres.
function edgeWidth(od, w, h, mm, plateau) {
  const profile = new Float64Array(Math.min(w, Math.ceil(9 / mm)));
  let count = 0;
  for (let y = 0; y < h; y++) if ((y + 0.5) * mm > 10 && (y + 0.5) * mm < 36) {
    for (let x = 0; x < profile.length; x++) profile[x] += od[y * w + x];
    count++;
  }
  if (!count || !(plateau > 0)) return null;
  const crossing = fraction => {
    const threshold = fraction * plateau;
    for (let x = 1; x < profile.length; x++) {
      const a = profile[x - 1] / count, b = profile[x] / count;
      if (a < threshold && b >= threshold) return (x - 0.5 + (threshold - a) / (b - a)) * mm;
    }
    return null;
  };
  const x10 = crossing(0.1), x90 = crossing(0.9);
  return x10 == null || x90 == null ? null : x90 - x10;
}

/** All grain measurements stay on the native grid; a band past Nyquist remains null. */
export function measurePlane(plane, w, h, mm, N = 1) {
  if (plane.length !== w * h || !(mm > 0)) throw new Error('plane geometry does not match its metadata');
  if (!plane.every(v => Number.isFinite(v) && v >= 0)) throw new Error('plane has negative or nonfinite pigment');
  const paper = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) paper.set(PAPER, i * 3);
  const rgb = renderLayers([[plane]], [PIGMENT], paper, w * h);
  const od = densityOf(luminance(rgb, w * h), PAPER_Y), mask = new Uint8Array(w * h);
  let mean = 0, count = 0, boundary2 = 0, other2 = 0, bn = 0, on = 0;
  // A fixed physical interior leaves three mm inside the nominal 3..43 mm wash on every grid.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if ((x + 0.5) * mm <= 6 || (x + 0.5) * mm >= 40 || (y + 0.5) * mm <= 6 || (y + 0.5) * mm >= 40) continue;
    mask[i] = 1; mean += od[i]; count++;
    if (N > 1) for (const stride of [1, w]) {
      const next = i + stride; if (next >= od.length || (stride === 1 && x === w - 1)) continue;
      const square = (od[next] - od[i]) ** 2, atBoundary = stride === 1 ? (x + 1) % N === 0 : (y + 1) % N === 0;
      if (atBoundary) { boundary2 += square; bn++; } else { other2 += square; on++; }
    }
  }
  const meanOD = count ? mean / count : null;
  const rim = rimContrast(od, w, h, mm);
  return {
    meanOD, grain02: grainContrast(od, w, h, mm, mask, 0.2, 1),
    grain05: grainContrast(od, w, h, mm, mask, 0.5, 1.5),
    rimContrast: rim.contrast, edgeWidthMm: edgeWidth(od, w, h, mm, meanOD),
    // A diagnostic of block boundaries, not a substitute for looking at diagonal wet fronts.
    coarseSeamRatio: bn && on && other2 ? Math.sqrt((boundary2 / bn) / (other2 / on)) : null,
  };
}

if (import.meta.main) {
  const dir = path.resolve(process.argv[2] ?? 'work/lead-04/work/proof/two-grids/out');
  const rows = [];
  for (const name of fs.readdirSync(dir).filter(n => /^(single|split)-.*\.json$/.test(n)).sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const bytes = fs.readFileSync(path.join(dir, name.replace(/\.json$/, '.f32')));
    const plane = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), w = run.width ?? Math.sqrt(run.cells);
    const retainedFineMB = run.fineBytesPerCell == null ? (run.fineMB ?? 0) : run.fineBytesPerCell * run.cells / 2 ** 20;
    rows.push({ ...run, ...measurePlane(plane, w, w, run.pigmentMm, run.N),
      // Early summaries sampled peaks during steps only. Fixing adds a layer after the last observer.
      peakFineMB: Math.max(run.peakFineMB ?? 0, retainedFineMB),
      peakFineIncludesFixedLayer: true,
    });
  }
  const ref = rows.find(r => r.N === 1 && r.waterMm === 0.1);
  for (const row of rows) {
    const coarse = rows.find(r => r.N === 1 && r.waterMm === row.waterMm);
    row.grain02VsReference = row.grain02 && ref?.grain02 ? row.grain02.relative / ref.grain02.relative - 1 : null;
    row.meanODVsReference = ref ? row.meanOD / ref.meanOD - 1 : null;
    row.timeVsCoarse = coarse ? row.dryS / coarse.dryS : null;
    row.timeVsReference = ref ? row.dryS / ref.dryS : null;
  }
  const result = { purpose: 'CPU engineering measurements; release comparison gate not cleared', rows };
  fs.writeFileSync(path.join(dir, 'matrix.json'), JSON.stringify(result, null, 2) + '\n');
  for (const r of rows) console.log(JSON.stringify({ tag: r.tag, grain02: r.grain02?.relative ?? null,
    grainError: r.grain02VsReference, meanOD: r.meanOD, rim: r.rimContrast, edgeMm: r.edgeWidthMm,
    seam: r.coarseSeamRatio, dryS: r.dryS, timeVsCoarse: r.timeVsCoarse, peakRssMB: r.peakRssMB ?? null }));
}
