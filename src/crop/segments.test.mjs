// Resized labels stay labels: no new value between bands, the masks partition the sheet, outlines land in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadSegments, scaleContours, segmentPaths, silhouettes } from './segments.mjs';

const W = 8, H = 6;
// sky over sea over sand, two rows each, and a line between each pair
const field = Uint8Array.from({ length: W * H }, (_, i) => 1 + Math.floor((i / W) / 2));

async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-'));
  await sharp(Buffer.from(field), { raw: { width: W, height: H, channels: 1 } }).png().toFile(path.join(dir, 's.png'));
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({
    image: { w: W, h: H },
    legend: { 1: 'sky', 2: 'sea', 3: 'sand' },
    regions: [
      { id: 1, name: 'sky', foreground: false, area: 1 / 3, bbox: [0, 0, W, 2], lab: [90, -1, 2] },
      { id: 2, name: 'sea', foreground: false, area: 1 / 3, bbox: [0, 2, W, 2], lab: [70, -3, -6] },
      { id: 3, name: 'sand', foreground: true, area: 1 / 3, bbox: [0, 4, W, 2], lab: [80, 1, 20] },
    ],
  }));
  fs.writeFileSync(path.join(dir, 's-contours.json'), JSON.stringify({
    image: { w: W, h: H }, epsilon: 2,
    regions: [{ id: 2, name: 'sea', polygons: [[[0, 2], [W, 2], [W, 4], [0, 4]]] }],
    boundaries: [{ between: ['sky', 'sea'], labels: [1, 2], closed: false, points: [[0, 2], [W, 2]] }],
  }));
  return dir;
}

test('three bands survive the resize as three labels, and the masks partition the sheet', async () => {
  const dir = await fixture();
  const w = 24, h = 18;
  const seg = await loadSegments('s', w, h, { dir });
  assert.deepEqual([...new Set(seg.labels)].sort(), [1, 2, 3]);
  assert.equal(seg.labels.length, w * h);
  assert.equal(seg.legend['2'], 'sea');
  assert.deepEqual(seg.regions.map(r => r.name), ['sky', 'sea', 'sand']);
  const covered = new Uint8Array(w * h);
  for (const r of seg.regions) {
    assert.ok(Math.abs(r.area - 1 / 3) < 0.02, `${r.name} covers ${r.area}`);
    for (let i = 0; i < covered.length; i++) covered[i] += r.mask[i];
  }
  assert.ok(covered.every(v => v === 1), 'every cell belongs to exactly one region');
  // the bands are still in order: the top row is sky and the bottom row is sand
  assert.equal(seg.labels[0], 1);
  assert.equal(seg.labels[w * h - 1], 3);
  assert.equal(seg.regions[2].foreground, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('contours are carried to the new grid, each axis by its own factor', async () => {
  const dir = await fixture();
  const seg = await loadSegments('s', 24, 18, { dir });
  assert.deepEqual(seg.contours.image, { w: 24, h: 18 });
  assert.deepEqual(seg.contours.regions[0].polygons[0], [[0, 6], [24, 6], [24, 12], [0, 12]]);
  assert.equal(seg.contours.epsilon, 2 * 3);
  const [line] = silhouettes(seg.contours, { between: ['sea'] });
  assert.deepEqual(line.between, ['sky', 'sea']);
  assert.deepEqual(line.points, [[0, 6], [24, 6]]);
  assert.equal(line.length, 24);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('paths and a missing map', async () => {
  assert.deepEqual(segmentPaths('beach', 'work/segments'), {
    labels: 'work/segments/beach.png', legend: 'work/segments/beach.json',
    contours: 'work/segments/beach-contours.json',
  });
  await assert.rejects(() => loadSegments('nope', 4, 4, { dir: os.tmpdir() }), /no label map/);
});

test('scaleContours leaves the source untouched', () => {
  const src = { image: { w: 10, h: 10 }, epsilon: 1, regions: [{ id: 1, name: 'sky', polygons: [[[1, 1]]] }], boundaries: [] };
  const out = scaleContours(src, 20, 20);
  assert.deepEqual(out.regions[0].polygons[0], [[2, 2]]);
  assert.deepEqual(src.regions[0].polygons[0], [[1, 1]]);
});
