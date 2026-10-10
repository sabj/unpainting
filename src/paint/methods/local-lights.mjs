// --locallights <share>: lights relative to their region. In each segment, this share of the plan's lightest cells
// gets masking fluid before any wash, so a lit plane stays paper however pale or deep its region is.
// The absolute masks (--smalllights, --resistmin) take only cells near paper white.
//
// --locallightsmax caps the density a masked cell may have (OD, summed over the pigments), so a dark region's
// lightest cells are masked only where they pass the light threshold; --locallightsmin drops specks under that many cells.
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { removeSmall } from '../../raster.js';

export async function localLights({ A, K, w, h, n, image, opt, num, log, path }) {
  const share = num('locallights', 0);
  if (!(share > 0)) return null;
  const base = image ? path.basename(image, path.extname(image)) : '';
  // without segments the whole sheet is one region: the lightest share of the painting
  const seg = base && hasSegments(base) ? await loadSegments(base, w, h) : { regions: [{ name: 'sheet', area: 1, mask: new Uint8Array(n).fill(1) }] };
  if (seg.regions.length === 1) log(`local lights: no segments for ${base || 'this source'}, the whole sheet is one region`);
  const tot = new Float32Array(n); for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; tot[i] = t; }
  const cap = num('locallightsmax', 0.35), mask = new Uint8Array(n), parts = [];
  // --locallightsoff sea,trees: segments whose lights are left to the washes (their gaps are between strokes, not flecks)
  const off = opt('locallightsoff', '').split(',').filter(Boolean);
  for (const r of seg.regions) {
    if (!r.area || off.includes(r.name)) continue;
    const cells = []; for (let i = 0; i < n; i++) if (r.mask[i]) cells.push(i);
    if (cells.length < 50) continue;
    const vals = cells.map(i => tot[i]).sort((a, b) => a - b), cut = vals[Math.min(vals.length - 1, Math.floor(share * vals.length))];
    let c = 0; for (const i of cells) if (tot[i] <= cut && tot[i] <= cap) { mask[i] = 1; c++; }
    parts.push(`${r.name} ${(100 * c / cells.length).toFixed(0)}%`);
  }
  const kept = removeSmall(mask, w, h, Math.round(num('locallightsmin', 12)));
  let m = 0; for (let i = 0; i < n; i++) m += kept[i];
  log(`local lights: the lightest ${(100 * share).toFixed(0)}% of each segment under ${cap} OD, ${(100 * m / n).toFixed(1)}% of the sheet masked (${parts.join(', ')})`);
  return kept;
}
