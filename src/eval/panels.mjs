// Find the panels in a comparison sheet by splitting on background-coloured gaps, whatever S, Z and pad were.
import sharp from 'sharp';

const BAND_MIN = 48;          // anything shorter than this is a label strip, not a picture
const TOL = 10;               // max distance from background colour to count as gap

// Background is the colour of the sheet's outermost ring.
function backgroundOf(px, w, h) {
  const seen = new Map();
  const add = (x, y) => { const i = (y * w + x) * 3, k = `${px[i] >> 3},${px[i + 1] >> 3},${px[i + 2] >> 3}`; seen.set(k, (seen.get(k) || 0) + 1); };
  for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); }
  const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  return best.map(v => v * 8 + 4);
}

const isBg = (px, i, bg) => Math.abs(px[i] - bg[0]) <= TOL && Math.abs(px[i + 1] - bg[1]) <= TOL && Math.abs(px[i + 2] - bg[2]) <= TOL;

// Runs of consecutive true values in a flag array, returned as [start, end] inclusive.
function runs(flags) {
  const out = []; let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (start < 0) start = i; }
    else if (start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  return out;
}

export async function sniffPanels(file, forcedCols = null) {
  const { data: px, info } = await sharp(file).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, bg = backgroundOf(px, w, h);

  // background rows separate bands; "almost all background" tolerates JPEG ringing in gutters
  const rowSolid = new Uint8Array(h);
  for (let y = 0; y < h; y++) { let off = 0, n = 0; for (let x = 0; x < w; x += 2) { n++; if (!isBg(px, (y * w + x) * 3, bg)) off++; } rowSolid[y] = off <= n * 0.02 ? 1 : 0; }
  const bands = runs(Array.from(rowSolid, v => !v)).filter(([a, b]) => b - a + 1 >= BAND_MIN);

  // column grid is found once per sheet, since a band with a blank tile would otherwise pair the wrong columns
  const bandCells = [];
  for (const [y0, y1] of bands) {
    const colSolid = new Uint8Array(w);
    for (let x = 0; x < w; x++) { let off = 0, n = 0; for (let y = y0; y <= y1; y++) { n++; if (!isBg(px, (y * w + x) * 3, bg)) off++; } colSolid[x] = off <= n * 0.02 ? 1 : 0; }
    bandCells.push({ y0, y1, cells: runs(Array.from(colSolid, v => !v)).filter(([a, b]) => b - a + 1 >= BAND_MIN) });
  }
  // group bands by tile width first (full view and zoom have different columns), then resolve columns per group
  const groups = new Map();
  for (const b of bandCells) for (const c of b.cells) {
    const key = Math.round((c[1] - c[0] + 1) / 8);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ band: b, cell: c });
  }
  const resolved = [], problems = [];
  for (const [, items] of groups) {
    const columns = [];
    for (const { cell: [a, b] } of items) {
      const hit = columns.find(c => Math.abs(c.x0 - a) <= 6 && Math.abs(c.x1 - b) <= 6);
      if (hit) { hit.n++; hit.x0 = Math.min(hit.x0, a); hit.x1 = Math.max(hit.x1, b); } else columns.push({ x0: a, x1: b, n: 1 });
    }
    columns.sort((a, b) => a.x0 - b.x0);
    const widths = columns.map(c => c.x1 - c.x0 + 1), uniform = widths.every(v => Math.abs(v - widths[0]) <= 4);
    // two columns: target and painting; four: two pairs. Anything else is refused rather than guessed.
    let pairs = null;
    if (columns.length === 2) pairs = [[0, 1]];
    else if (columns.length === 4 && uniform) pairs = [[0, 1], [2, 3]];
    else if (forcedCols && forcedCols.every(i => i < columns.length)) pairs = [forcedCols];
    if (!pairs) { if (columns.length > 1) problems.push({ columns, widths }); continue; }
    resolved.push({ columns, pairs, items });
  }
  if (!resolved.length) {
    if (!problems.length) return null;
    const p0 = problems[0];
    return { layout: 'ambiguous', panels: [], size: [w, h], columns: p0.columns.map(c => [c.x0, c.x1]),
      why: `${p0.columns.length} columns of tiles at x ${p0.columns.map(c => `${c.x0}-${c.x1}`).join(', ')}; a sheet is read on its own only when a tile width has two columns, or four of one width. Pass --cols <target>,<painting> (zero based, within one width) to say which two hold the target and the painting.` };
  }

  const panels = [];
  for (const { columns, pairs, items } of resolved) {
    const byBand = new Map();
    for (const { band, cell } of items) { if (!byBand.has(band)) byBand.set(band, []); byBand.get(band).push(cell); }
    for (const [band, cells] of byBand) {
      const find = ci => cells.find(([a, b]) => Math.abs(a - columns[ci].x0) <= 6 && Math.abs(b - columns[ci].x1) <= 6);
      for (const [ti, pi] of pairs) {
        const tc = find(ti), pc = find(pi);
        if (!tc || !pc) continue;
        // same size so panels compare pixel for pixel
        const cw = Math.min(tc[1] - tc[0], pc[1] - pc[0]) + 1, ch = band.y1 - band.y0 + 1;
        panels.push({ name: `y${band.y0}w${cw}`, target: [tc[0], band.y0, cw, ch], painting: [pc[0], band.y0, cw, ch] });
      }
    }
  }
  panels.sort((a, b) => a.target[1] - b.target[1] || a.target[0] - b.target[0]);
  return panels.length ? { layout: 'sniffed', panels, size: [w, h] } : null;
}

