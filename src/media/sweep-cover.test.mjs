import test from "node:test";
import assert from "node:assert/strict";
import { sweepCover } from "./wash.mjs";

// the counting before countUnder: a callback per cell eachCellUnder visits once per sweep
function reference(paths, mask, w, h) {
  let under = 0, cells = 0;
  for (let i = 0; i < w * h; i++) cells += mask[i] ? 1 : 0;
  if (!cells) return 0;
  for (const pts of paths) {
    if (!pts.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x - q.r); y0 = Math.min(y0, q.y - q.r); x1 = Math.max(x1, q.x + q.r); y1 = Math.max(y1, q.y + q.r); }
    x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(w - 1, Math.ceil(x1) + 1); y1 = Math.min(h - 1, Math.ceil(y1) + 1);
    if (!(x1 >= x0 && y1 >= y0)) continue;
    const bw = x1 - x0 + 1, seen = new Uint8Array(bw * (y1 - y0 + 1));
    for (const q of pts) {
      const R = Math.ceil(q.r);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > q.r * q.r) continue;
        const x = Math.round(q.x - 0.5 + dx), y = Math.round(q.y - 0.5 + dy);
        if (x < x0 || y < y0 || x > x1 || y > y1) continue;
        const k = (y - y0) * bw + (x - x0);
        if (!seen[k]) { seen[k] = 1; if (mask[y * w + x]) under++; }
      }
    }
  }
  return under / cells;
}

test("sweepCover matches the per-cell callback count exactly", () => {
  let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 60; trial++) {
    const w = 40 + Math.floor(rnd() * 120), h = 30 + Math.floor(rnd() * 100), mask = new Uint8Array(w * h);
    const cx = rnd() * w, cy = rnd() * h, rad = 5 + rnd() * 40;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = (x - cx) ** 2 + (y - cy) ** 2 < rad * rad || rnd() < 0.05 ? 1 : 0;
    const paths = [];
    for (let p = 0; p < 1 + Math.floor(rnd() * 6); p++) {
      const pts = []; let x = rnd() * w * 1.2 - 0.1 * w, y = rnd() * h * 1.2 - 0.1 * h;
      for (let q = 0; q < 2 + Math.floor(rnd() * 30); q++) { x += (rnd() - 0.5) * 6; y += (rnd() - 0.5) * 6; pts.push({ x, y, r: trial === 7 && q === 3 ? NaN : 0.3 + rnd() * 9.7 }); }
      paths.push(pts);
    }
    paths.push([]);
    assert.equal(sweepCover(paths, mask, w, h), reference(paths, mask, w, h));
  }
});
