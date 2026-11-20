// Scoring for the mushroom renderer benchmark (render-bench.mjs): CIE L* of sRGB pixels, the CPU-against-GPU difference
// of two finished sheets, a coarse fingerprint that says whether a later renderer change moved a plate, and the table.
// Pure: no files, no GPU.

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LIN = Float64Array.from({ length: 256 }, (_, v) => lin(v));

/** CIE L* (D65 white) of an 8-bit sRGB colour. */
export function lstar(r, g, b) {
  const Y = 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
}

/** L* per pixel of a packed RGB buffer (3 bytes a pixel). */
export function lightness(rgb) {
  const n = rgb.length / 3, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = lstar(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  return out;
}

/** Mean and worst absolute difference in L* between two RGB buffers of the same size, and the share over 1 L*. */
export function lstarDiff(a, b) {
  if (a.length !== b.length || a.length % 3) throw new RangeError('lstarDiff: buffers differ in size');
  const n = a.length / 3; let sum = 0, worst = 0, over = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(lstar(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) - lstar(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]));
    sum += d; if (d > worst) worst = d; if (d > 1) over++;
  }
  return { mean: n ? sum / n : 0, worst, over1: n ? over / n : 0 };
}

const fnv = values => { let h = 2166136261; for (const v of values) { h = Math.imul(h ^ (v & 255), 16777619); h = Math.imul(h ^ ((v >> 8) & 255), 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };

/**
 * A coarse fingerprint of a w x h RGB sheet: the mean L* of each cell of a grid x grid split, rounded to whole L*,
 * and a hash of that grid. Float noise below half an L* in a cell's mean does not change it; a renderer change does.
 */
export function fingerprint(rgb, w, h, grid = 8) {
  if (rgb.length !== w * h * 3) throw new RangeError('fingerprint: buffer is not w x h RGB');
  const L = lightness(rgb), sums = new Float64Array(grid * grid), counts = new Uint32Array(grid * grid);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = Math.min(grid - 1, Math.floor(y * grid / h)) * grid + Math.min(grid - 1, Math.floor(x * grid / w));
    sums[c] += L[y * w + x]; counts[c]++;
  }
  const cells = Array.from(sums, (s, i) => Math.round(counts[i] ? s / counts[i] : 0));
  return { grid, cells, hash: fnv(cells) };
}

/** Exact checksum of an RGB buffer (FNV-1a over every byte). */
export function checksum(rgb) { let h = 2166136261; for (let i = 0; i < rgb.length; i++) h = Math.imul(h ^ rgb[i], 16777619); return (h >>> 0).toString(16).padStart(8, '0'); }

/**
 * Same or changed against an earlier run's entry for the same plate: 'same' when the checksum matches, 'same (coarse)'
 * when only the fingerprint matches, 'changed' when the fingerprint moved, 'new' when there is nothing to compare.
 */
export function verdict(now, before) {
  if (!before) return 'new';
  if (now.checksum && now.checksum === before.checksum) return 'same';
  if (now.fingerprint === before.fingerprint) return 'same (coarse)';
  return 'changed';
}

/** A plain text table: columns [{ key, label, fmt? }], rows of objects. Numbers right-aligned. */
export function table(columns, rows) {
  const cell = (c, r) => { const v = r[c.key]; return v == null ? '-' : c.fmt ? c.fmt(v) : String(v); };
  const body = rows.map(r => columns.map(c => cell(c, r)));
  const width = columns.map((c, j) => Math.max(c.label.length, ...body.map(b => b[j].length)));
  const right = columns.map((c, j) => rows.some(r => typeof r[c.key] === 'number'));
  const line = vals => vals.map((v, j) => right[j] ? v.padStart(width[j]) : v.padEnd(width[j])).join('  ').trimEnd();
  return [line(columns.map(c => c.label)), line(width.map(n => '-'.repeat(n))), ...body.map(line)].join('\n');
}
