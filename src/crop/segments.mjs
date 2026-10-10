// The label map tools/seg/segments.py wrote, brought to the plan's grid: a label per cell, a mask per region, and
// the outlines for the first ink. Nearest neighbour on the way down, never an average: a label is a name.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DEFAULT_DIR = 'work/segments';

// A bare name is looked up in the segment directory; anything with a slash is taken as the path prefix itself.
export function segmentPaths(base, dir = DEFAULT_DIR) {
  const stem = base.includes('/') ? base : path.join(dir, base);
  return { labels: `${stem}.png`, legend: `${stem}.json`, contours: `${stem}-contours.json` };
}

export function hasSegments(base, dir = DEFAULT_DIR) {
  const p = segmentPaths(base, dir);
  return fs.existsSync(p.labels) && fs.existsSync(p.legend);
}

// Contours are written in source pixels. The plan is a different grid, and x and y rarely scale by the same amount,
// so each axis is carried separately and the simplification tolerance takes the smaller of the two.
export function scaleContours(contours, w, h) {
  const src = contours?.image || { w, h };
  const sx = w / src.w, sy = h / src.h;
  const pt = ([x, y]) => [x * sx, y * sy];
  return {
    image: { w, h },
    epsilon: (contours.epsilon || 0) * Math.min(sx, sy),
    regions: (contours.regions || []).map(r => ({ ...r, polygons: (r.polygons || []).map(p => p.map(pt)) })),
    boundaries: (contours.boundaries || []).map(b => ({ ...b, points: (b.points || []).map(pt) })),
  };
}

// One mask per region, built in a single pass over the cells: this runs before every sheet.
function masksFrom(labels, regions) {
  const byId = new Map(regions.map(r => [r.id, new Uint8Array(labels.length)]));
  for (let i = 0; i < labels.length; i++) {
    const m = byId.get(labels[i]);
    if (m) m[i] = 1;
  }
  return byId;
}

export async function loadSegments(base, w, h, { dir = DEFAULT_DIR } = {}) {
  const p = segmentPaths(base, dir);
  if (!fs.existsSync(p.labels)) throw new Error(`segments: no label map at ${p.labels}`);
  if (!fs.existsSync(p.legend)) throw new Error(`segments: no legend at ${p.legend}`);
  const legendFile = JSON.parse(fs.readFileSync(p.legend, 'utf8'));
  const { data, info } = await sharp(p.labels)
    .resize(w, h, { fit: 'fill', kernel: 'nearest' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== w || info.height !== h) {
    throw new Error(`segments: ${p.labels} came back ${info.width}x${info.height}, wanted ${w}x${h}`);
  }
  const labels = new Uint8Array(data.buffer, data.byteOffset, w * h);
  const legend = legendFile.legend || {};
  // The legend is the authority on what a label means; a region the resize dropped entirely still belongs in the list,
  // with an empty mask and an area of zero, so a caller can tell "no sky here" from "this source has no sky".
  const source = legendFile.regions || Object.entries(legend).map(([id, name]) => ({ id: Number(id), name }));
  const regions = source.map(r => ({ ...r, id: Number(r.id), foreground: !!r.foreground }));
  const masks = masksFrom(labels, regions);
  let contours = { image: { w, h }, epsilon: 0, regions: [], boundaries: [] };
  if (fs.existsSync(p.contours)) contours = scaleContours(JSON.parse(fs.readFileSync(p.contours, 'utf8')), w, h);
  return {
    width: w,
    height: h,
    labels: Uint8Array.from(labels),
    legend,
    regions: regions.map(r => {
      const mask = masks.get(r.id) || new Uint8Array(w * h);
      let n = 0;
      for (let i = 0; i < mask.length; i++) n += mask[i];
      return { id: r.id, name: r.name, foreground: r.foreground, area: n / mask.length, mask };
    }),
    contours,
  };
}

// The outlines a stage draws first, longest first. A boundary along the sheet's own edge is the crop, and the catch-all
// 'background' label bounds nothing a person would draw. Both are dropped; a boundary is cut at the border and the
// pieces kept.
export function silhouettes(contours, { between, border = 2 } = {}) {
  const want = between ? new Set(between) : null;
  const { w, h } = contours.image || { w: Infinity, h: Infinity };
  const len = pts => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  // a segment of the polyline lies along the border when both its ends sit on the same edge of the sheet; a line that
  // merely reaches the edge (a horizon drawn from margin to margin) is kept whole
  const side = ([x, y]) => (x < border ? 'l' : x >= w - border ? 'r' : y < border ? 't' : y >= h - border ? 'b' : '');
  const pieces = pts => { const out = []; let cur = [pts[0]]; for (let i = 1; i < pts.length; i++) { const s0 = side(pts[i - 1]), s1 = side(pts[i]); if (s0 && s0 === s1) { if (cur.length >= 2) out.push(cur); cur = [pts[i]]; } else cur.push(pts[i]); } if (cur.length >= 2) out.push(cur); return out; };
  return (contours.boundaries || [])
    .filter(b => !b.between.includes('background'))
    .filter(b => !want || b.between.some(n => want.has(n)))
    .flatMap(b => pieces(b.points || []).map(points => ({ ...b, points, length: len(points) })))
    .sort((a, b) => b.length - a.length);
}
