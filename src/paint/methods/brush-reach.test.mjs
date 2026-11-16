import test from 'node:test';
import assert from 'node:assert/strict';
import { unreachedParts } from './brush-reach.mjs';

test('a pocket off the sweep is found; a plane the sweep covers leaves nothing', () => {
  const w = 40, h = 30, n = w * h, mask = new Uint8Array(n);
  // a band along the top (y 0-7) and a pocket hanging down at the right (x 30-39, y 8-24)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < 8 || (x >= 30 && y < 25)) mask[y * w + x] = 1;
  const sweep = [[{ x: 0, y: 4, r: 4.5 }, { x: 39, y: 4, r: 4.5 }]];
  const parts = unreachedParts(mask, w, h, sweep, 20);
  assert.equal(parts.length, 1);
  assert.ok(parts[0].every(i => i % w >= 30 && (i / w | 0) >= 8), 'the unreached part is the pocket');
  assert.ok(parts[0].length >= 140);
  const band = Uint8Array.from(mask, (v, i) => ((i / w | 0) < 8 ? v : 0));
  assert.equal(unreachedParts(band, w, h, sweep, 20).length, 0);
});
