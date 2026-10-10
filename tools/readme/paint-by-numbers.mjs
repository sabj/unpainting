// The second cheat the guard forbids, run for real so the README can show it: pixel steering, or paint by numbers. It
// replays the painter's own strokes (strokes.json.gz, made by extract-strokes.mjs from the run's mark tape) in the same
// order onto blank paper, but each stroke's paint comes from the photo: every pixel under its footprint is pulled toward
// the target there. This is what the removed --modpaintplanes option did (per-cell residual charge inside a shape; see
// docs/honesty.md). Nothing here is used by the painter.
//
// It builds up the way glazes do. A wide wash pulls only a little (PULL_WIDE) toward a blurred target, so it lays
// broad colour; a small stroke pulls harder (PULL_FINE) toward a sharper one. Fine photo detail arrives with the small
// late strokes, roughly in step with the painter's own progress.
import fs from 'node:fs';
import zlib from 'node:zlib';
import sharp from 'sharp';

const PULL_WIDE = 0.06, PULL_FINE = 0.7; // share of the way to the target at full coverage, for the widest and finest
const R_WIDE = 32, R_FINE = 2;            // stroke radii in sheet cells at those two ends; log-linear in between
const BLUR = [0, 1, 2, 4, 8, 16];         // target blur levels (Gaussian sigma, panel pixels); a stroke reads at ~r/8
export const AREA_WASH = 32;              // a brush stroke wider than this radius (sheet cells) is an area wash

export const KIND = { 0: 'round', 1: 'pen', 2: 'flat' };

export function readStrokes(file) {
  const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  return { ...doc, strokes: doc.strokes.map(([frame, kind, r, ...xy]) => ({ frame, kind: KIND[kind], r: r * doc.unit, xy: xy.map(v => v * doc.unit) })) };
}

// A stroke in brush-ghost.mjs form (sheet cells), for drawing the brush moving along it.
export function ghostStroke(stroke) {
  const points = [];
  for (let j = 0; j < stroke.xy.length; j += 2) points.push({ x: stroke.xy[j], y: stroke.xy[j + 1], p: 1, r: stroke.r });
  return { kind: stroke.kind === 'pen' ? 'pen' : 'brush', flat: stroke.kind === 'flat', area: stroke.kind !== 'pen' && stroke.r > AREA_WASH, points };
}

// The target at each blur level, as Float32 RGB.
export async function blurLevels(target, width, height) {
  return Promise.all(BLUR.map(async sigma => {
    const img = sharp(target, { raw: { width, height, channels: 3 } });
    return Float32Array.from(sigma ? await img.blur(sigma).raw().toBuffer() : target);
  }));
}

function pullOf(r) {
  const t = Math.min(1, Math.max(0, Math.log(r / R_FINE) / Math.log(R_WIDE / R_FINE)));
  return PULL_FINE * (PULL_WIDE / PULL_FINE) ** t;
}

// The stroke's soft footprint: discs of radius r (panel pixels) along its path, stamped at a third of r so the
// subsampled path reads as one continuous stroke. Coverage is 1 - d^2 at distance d (in radii), the highest stamp wins.
function footprint(stroke, k, cover, width, height) {
  const r = Math.max(0.75, stroke.r * k), step = Math.max(0.5, r / 3), pts = [];
  for (let j = 0; j < stroke.xy.length; j += 2) {
    const x = stroke.xy[j] * k, y = stroke.xy[j + 1] * k, prev = pts.at(-1);
    if (prev) {
      const n = Math.floor(Math.hypot(x - prev.x, y - prev.y) / step);
      for (let t = 1; t < n; t++) pts.push({ x: prev.x + (x - prev.x) * t / n, y: prev.y + (y - prev.y) * t / n });
    }
    pts.push({ x, y });
  }
  const box = { x0: width, y0: height, x1: -1, y1: -1 };
  for (const { x, y } of pts) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(width - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(height - 1, Math.ceil(y + r));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const d2 = ((px - x) ** 2 + (py - y) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const i = py * width + px;
      if (1 - d2 > cover[i]) cover[i] = 1 - d2;
    }
    box.x0 = Math.min(box.x0, x0); box.y0 = Math.min(box.y0, y0); box.x1 = Math.max(box.x1, x1); box.y1 = Math.max(box.y1, y1);
  }
  return box;
}

const errorOf = (canvas, target) => canvas.reduce((sum, v, p) => sum + (v - target[p]) ** 2, 0);

// Replays `strokes` (from readStrokes) over `paper` toward the target (`levels` from blurLevels, panel pixels, width x
// height). `runTo(count)` lays strokes until `count` are down and returns { rgba, laid, reads, heat, closed }: `reads`
// counts target reads in sheet cells (panel pixels read, scaled to the sheet), `heat` the reads per panel pixel so far,
// and `closed` the share of the starting squared error against the sharp target removed so far.
export function paintByNumbers({ strokes, sheetWidth, paper, levels, width, height }) {
  const k = width / sheetWidth, cellsPerPixel = 1 / (k * k), sharp0 = levels[0];
  const canvas = Float32Array.from(paper), cover = new Float32Array(width * height), heat = new Uint32Array(width * height);
  const start = errorOf(canvas, sharp0);
  let laid = 0, read = 0;
  return function runTo(count) {
    for (; laid < Math.min(count, strokes.length); laid++) {
      const stroke = strokes[laid], pull = pullOf(stroke.r), sigma = stroke.r * k / 8;
      const level = levels[Math.max(0, BLUR.findLastIndex(s => s <= sigma))];
      const box = footprint(stroke, k, cover, width, height);
      for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
        const i = y * width + x, a = pull * cover[i];
        if (a <= 0) continue;
        cover[i] = 0; heat[i]++; read++;
        for (let c = 0; c < 3; c++) canvas[3 * i + c] += (level[3 * i + c] - canvas[3 * i + c]) * a;
      }
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) rgba[4 * i + c] = Math.round(canvas[3 * i + c]);
      rgba[4 * i + 3] = 255;
    }
    return { rgba, laid, reads: Math.round(read * cellsPerPixel), heat: Uint32Array.from(heat), closed: Math.max(0, 1 - errorOf(canvas, sharp0) / start) };
  };
}
