// A watercolour plan for a target picture, light to dark. The picture is cut into value passes; each pass is split into
// a few colour regions (k-means in Lab, a majority filter, connected regions with the small ones merged), and each
// region is filled with brush strokes that follow its shapes: the structure tensor's edge direction where the picture
// has one, the region's own long axis where it is flat, every stroke curved, tapered and a little different in length,
// width, pressure and angle. Light regions are broad wet washes whose strokes run into each other; the paper dries; mid
// values go on as shaped strokes; it dries again; the darks are a few small accents, and on a face a few fine strokes
// at the eyes and edges. Colours are mixed from the preset's pigments (mixfit.js) to match the target over what the
// earlier passes laid. The edges of the picture fade into bare paper. Units are examples.js's: 1/320 of the sheet's
// shorter side, from its centre. DOM only to read the picture's pixels.
import { BY_KEY } from '../media/pigments.js';
import { SURFACES } from '../media/papers.js';
import { seeded, labField, kmeans, majority, mergeSmall, orientation, axisOf } from './segment.js';
import { createMixer } from '../media/mixfit.js';

const UNIT_MM = (6 * 25.4) / 320;
const dia = units => 2 * units * UNIT_MM;
const GRID = 110; // cells on the picture's long side
const MAX_STROKES = 600; // about 20 s on WebGPU at the default sheet

// The passes: which cells (lightness below a quantile of the picture's), the value they are lifted to, how many colour
// regions, the brush radius range in units, stroke length in radii, water, and the pigment gain (a wet wash lays less).
const PASSES = [
  { name: 'light', below: null, lift: 0.72, k: 4, minShare: 0.012, r: [7, 17], len: [3, 7], water: 1.35, gain: 1.45, cover: 0.9 },
  { name: 'mid', below: 0.6, lift: 0.3, k: 5, minShare: 0.004, r: [3.2, 8.5], len: [2.5, 6], water: 1.15, gain: 1.5, cover: 0.85 },
  { name: 'dark', below: 0.25, lift: 0, k: 4, minShare: 0.0012, r: [1.5, 4.2], len: [2, 5], water: 0.85, gain: 1.7, cover: 0.75 },
];

/** Where the picture sits on the sheet, in units: contained and centred, with a margin of bare paper. */
function placement(imgW, imgH, sheetW, sheetH, margin) {
  const S = Math.min(sheetW, sheetH) / 320, uw = sheetW / S, uh = sheetH / S;
  const scale = Math.min((uw * (1 - margin)) / imgW, (uh * (1 - margin)) / imgH), w = imgW * scale, h = imgH * scale;
  return { x0: -w / 2, y0: -h / 2, w, h };
}

/** The picture's colours on the grid, lightly blurred. */
function sample(img, cols, rows) {
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(0.6px)'; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cols, rows);
  return g.getImageData(0, 0, cols, rows).data;
}

/** An irregular oval: 1 inside the vignette, 0 outside, so the painting fades to paper instead of ending in a rectangle. */
function vignette(cols, rows, rnd) {
  const n = cols * rows, noise = new Float32Array(n), blobs = Array.from({ length: 14 }, () => [rnd() * cols, rnd() * rows, (0.12 + 0.2 * rnd()) * cols, rnd() - 0.5]);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let v = 0; for (const [bx, by, br, a] of blobs) v += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br)); noise[y * cols + x] = v; }
  const keep = new Uint8Array(n);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const dx = (x + 0.5) / cols - 0.5, dy = (y + 0.5) / rows - 0.5, d = Math.hypot(dx / 0.54, dy / 0.54);
    keep[y * cols + x] = d < 0.97 + 0.22 * noise[y * cols + x] ? 1 : 0;
  }
  return keep;
}

const quantile = (values, q) => { const s = Float32Array.from(values).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const lerp = (a, b, t) => a + (b - a) * t;

/** One region's strokes: seeds over its uncovered cells, each traced both ways along the direction field. */
function fillRegion(region, ctx, pass, tool, rnd) {
  const { cols, rows, cu, x0, y0, field, inRegion, covered } = ctx;
  const areaUnits = region.cells.length * cu * cu, radius = Math.min(pass.r[1] * ctx.scale, Math.max(pass.r[0] * ctx.scale, 0.32 * Math.sqrt(areaUnits)));
  const rc = radius / cu, axis = axisOf(region.cells, cols), strokes = [];
  const want = Math.ceil(region.cells.length * pass.cover);
  let done = 0;
  const seeds = [...region.cells].sort(() => rnd() - 0.5);
  const dirAt = (x, y) => {
    const i = Math.min(rows - 1, Math.max(0, y | 0)) * cols + Math.min(cols - 1, Math.max(0, x | 0));
    const w = Math.min(1, field.coherence[i] * 1.6), wr = (1 - w) * (0.4 + axis.elongation);
    const vx = w * Math.cos(2 * field.angle[i]) + wr * Math.cos(2 * axis.angle) + 0.15 * (1 - w), vy = w * Math.sin(2 * field.angle[i]) + wr * Math.sin(2 * axis.angle);
    return 0.5 * Math.atan2(vy, vx);
  };
  const mark = (x, y) => {
    const R = Math.ceil(rc * 0.85);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > rc * rc * 0.72) continue;
      const X = Math.round(x + dx), Y = Math.round(y + dy); if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
      const j = Y * cols + X; if (inRegion(j) && !covered[j]) { covered[j] = 1; done++; }
    }
  };
  for (const s of seeds) {
    if (done >= want || strokes.length > 160) break;
    if (covered[s]) continue;
    const sx = s % cols + 0.5, sy = ((s / cols) | 0) + 0.5, turn = (rnd() - 0.5) * 0.7, bend = (rnd() - 0.5) * 0.12;
    const half = (rc * lerp(pass.len[0], pass.len[1], rnd())) / 2, step = Math.max(0.5, rc * 0.45);
    const trace = sign => {
      const pts = []; let x = sx, y = sy, a = dirAt(x, y) + turn, travelled = 0, prev = null;
      while (travelled < half) {
        let na = dirAt(x, y) + turn; if (prev !== null && Math.cos(na - prev) < 0) na += Math.PI;
        a = prev === null ? na + (sign < 0 ? Math.PI : 0) : prev + Math.atan2(Math.sin(na - prev), Math.cos(na - prev)) * 0.3 + bend * sign;
        const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step, j = Math.floor(ny) * cols + Math.floor(nx);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !inRegion(j)) break;
        x = nx; y = ny; prev = a; travelled += step; pts.push([x, y]);
      }
      return pts;
    };
    let path = [...trace(-1).reverse(), [sx, sy], ...trace(1)];
    if (path.length < 3) { const a = dirAt(sx, sy) + turn, d = rc * 0.6; path = [[sx - Math.cos(a) * d, sy - Math.sin(a) * d], [sx, sy], [sx + Math.cos(a) * d, sy + Math.sin(a) * d]]; }
    path.forEach(([x, y]) => mark(x, y));
    const jitter = 0.85 + 0.3 * rnd(), n = path.length;
    const points = path.map(([x, y], j) => {
      const u = n > 1 ? j / (n - 1) : 0.5, p = 0.28 + 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u * 1.08 - 0.04))), 0.6) * jitter;
      return [+(x0 + x * cu).toFixed(2), +(y0 + y * cu).toFixed(2), +Math.min(1, p).toFixed(3)];
    });
    strokes.push({ stroke: { tool: { ...tool, sizeMm: +dia(radius * (0.82 + 0.36 * rnd())).toFixed(3) }, points } });
  }
  return strokes;
}

/** Fine strokes along the strongest dark edges: eyes, a mouth, a hat brim. */
function details(ctx, Lab, darkLab, count, mixer, rnd) {
  const { cols, rows, cu, x0, y0, field, keep } = ctx, q = quantile(Lab.L.filter((_, i) => keep[i]), 0.35);
  const cand = []; for (let i = 0; i < Lab.L.length; i++) if (keep[i] && Lab.L[i] < q) cand.push(i);
  cand.sort((a, b) => field.mag[b] - field.mag[a]);
  const taken = [], fit = mixer.fit(darkLab, []), out = [];
  for (const i of cand) {
    if (out.length >= count) break;
    const x = i % cols + 0.5, y = ((i / cols) | 0) + 0.5;
    if (taken.some(([tx, ty]) => (tx - x) ** 2 + (ty - y) ** 2 < 9)) continue;
    taken.push([x, y]);
    const a = field.angle[i] + (rnd() - 0.5) * 0.3, len = (2.5 + 3.5 * rnd()) / cu, bend = (rnd() - 0.5) * 0.5;
    const points = [-1, -0.5, 0, 0.5, 1].map((t, j) => {
      const b = a + bend * t, px = x + Math.cos(b) * len * t * 0.5, py = y + Math.sin(b) * len * t * 0.5;
      return [+(x0 + px * cu).toFixed(2), +(y0 + py * cu).toFixed(2), [0.25, 0.6, 0.75, 0.55, 0.2][j]];
    });
    out.push({ stroke: { tool: { tool: 'round', model: 'tuft', sizeMm: +dia(0.8 + 0.5 * rnd()).toFixed(3), water: 0.6, pigment: Object.keys(fit.mixture)[0], mixture: fit.mixture, amount: Math.min(1.2, fit.strength * 1.2) }, points } });
  }
  return out;
}

/** Build the passes' strokes at brush scale `scale`. */
function build(img, preset, sheetW, sheetH, scale) {
  const rnd = seeded(preset.seed ?? 11);
  const { x0, y0, w, h } = placement(img.naturalWidth || img.width, img.naturalHeight || img.height, sheetW, sheetH, preset.margin ?? 0.1);
  const cols = w >= h ? GRID : Math.max(8, Math.round(GRID * w / h)), rows = w >= h ? Math.max(8, Math.round(GRID * h / w)) : GRID, n = cols * rows, cu = w / cols;
  const Lab = labField(sample(img, cols, rows), n), field = orientation(Lab.L, cols, rows, 3), keep = vignette(cols, rows, rnd);
  const paperRGB = Uint8Array.from((SURFACES[preset.surface] ?? SURFACES.cold).colour), mixer = createMixer(preset.palette, paperRGB);
  const paperL = 100 * Math.cbrt(0.2126 * (paperRGB[0] / 255) ** 2.2 + 0.7152 * (paperRGB[1] / 255) ** 2.2 + 0.0722 * (paperRGB[2] / 255) ** 2.2) * 1.16 - 16;
  const Ls = []; for (let i = 0; i < n; i++) if (keep[i]) Ls.push(Lab.L[i]);
  const ctx = { cols, rows, cu, x0, y0, field, keep, scale }, layers = [], steps = [];
  PASSES.forEach((pass, k) => {
    const cut = pass.below === null ? paperL - 5 : quantile(Ls, pass.below), liftL = pass.lift ? quantile(Ls, pass.lift) : -Infinity;
    const mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = keep[i] && Lab.L[i] < cut ? 1 : 0;
    const passLab = { L: Lab.L.map(v => Math.max(v, liftL)), A: Lab.A.map((v, i) => Lab.L[i] < liftL ? v * 0.8 : v), B: Lab.B.map((v, i) => Lab.L[i] < liftL ? v * 0.8 : v) };
    const { labels } = kmeans(passLab, mask, pass.k, rnd, 1.5);
    const { id, regions } = mergeSmall(majority(labels, cols, rows, 2), cols, rows, Math.max(4, Math.round(n * pass.minShare)));
    const layer = Array.from({ length: n }, () => null), covered = new Uint8Array(n);
    // the lightest regions first, as a painter lays the palest wash and works down into the darker ones beside it
    const ordered = regions.filter(r => r.cells.length >= (k === 2 ? 3 : 4)).map(r => {
      const m = [0, 0, 0]; for (const i of r.cells) { m[0] += passLab.L[i]; m[1] += passLab.A[i]; m[2] += passLab.B[i]; }
      return { ...r, lab: m.map(v => v / r.cells.length), index: regions.indexOf(r) };
    }).sort((a, b) => b.lab[0] - a.lab[0]);
    for (const r of ordered) {
      const under = layers.map(L => { const v = new Array(mixer.keys.length).fill(0); for (const i of r.cells) if (L[i]) L[i].forEach((x, j) => { v[j] += x / r.cells.length; }); return v; });
      const fit = mixer.fit(r.lab, under);
      for (const i of r.cells) layer[i] = fit.layer;
      const tool = { tool: 'round', model: 'tuft', water: pass.water, pigment: Object.keys(fit.mixture)[0], mixture: fit.mixture, amount: +Math.min(1.2, Math.max(0.02, fit.strength * pass.gain)).toFixed(3) };
      steps.push(...fillRegion(r, { ...ctx, inRegion: j => id[j] === r.index, covered }, pass, tool, rnd));
    }
    layers.push(layer);
    if (k < PASSES.length - 1) steps.push({ dry: true });
  });
  if (preset.details) {
    const dark = [quantile(Ls, 0.02), 0, 0];
    steps.push(...details(ctx, Lab, dark, preset.details, mixer, rnd));
  }
  steps.push({ settle: 1 });
  return steps;
}

/**
 * A plan for `img` on a sheet of `sheetW` x `sheetH` pixels under `preset` ({ surface, palette, margin, details }).
 * Returns { steps }: { stroke: { tool, points: [[x, y, pressure]] } }, { dry: true } between passes, { settle: s }.
 */
export function planTarget(img, preset, sheetW, sheetH) {
  const palette = { ...preset, palette: preset.palette.filter(k => BY_KEY[k]) };
  let scale = 1, steps = build(img, palette, sheetW, sheetH, scale);
  for (let t = 0; t < 3 && steps.filter(s => s.stroke).length > MAX_STROKES; t++) { scale *= 1.3; steps = build(img, palette, sheetW, sheetH, scale); }
  return { steps };
}
