import { liftResist, coherent, layersChanged } from '../../src/media/sheet.mjs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const source = execFileSync('git', ['show', '95fd267:src/media/sheet.mjs'], { encoding: 'utf8' });
const start = source.indexOf('export function liftResist('), end = source.indexOf('/** Blot', start);
const original = new Function('coherent', 'layersChanged', 'wrote', 'TAPE', 'return (' + source.slice(start, end).replace('export ', '').trim() + ')')(coherent, layersChanged, () => {}, null);

for (const density of [1, 2]) {
  const w = 1086 * density, h = 1448 * density, n = w * h, K = 8;
  const plane = () => new Float32Array(n).fill(.017);
  const sheet = { n, K, W: plane(), M: new Uint8Array(n).fill(1), G: Array.from({ length: K }, plane), D: Array.from({ length: K }, plane), P: Array.from({ length: K }, plane) };
  const zero = new Float32Array(n), layers = Array.from({ length: 20 }, (_, j) => Array.from({ length: K }, (_, k) => k === j % K ? plane() : zero));
  let getterCalls = 0;
  Object.defineProperty(sheet, 'layers', { get() { getterCalls++; return layers; } });
  const mask = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x > .35 * w && x < .65 * w) || y % 19 < 2) mask[y * w + x] = 1;
  const reset = () => {
    sheet.W.fill(.017); sheet.M.fill(1); for (const plane of [...sheet.G, ...sheet.D, ...sheet.P, ...layers.flat()]) if (plane !== zero) plane.fill(.017);
    sheet.resist = mask; sheet.resistFrom = 2; sheet.resistStrength = null; getterCalls = 0;
  };
  const rows = [];
  for (const byPlane of [false, true]) {
    const times = [];
    for (let trial = 0; trial < 3; trial++) {
      reset(); const start = performance.now();
      if (byPlane) liftResist(sheet, { byPlane: true }); else original(sheet);
      times.push(performance.now() - start);
    }
    const hash = crypto.createHash('sha256');
    for (const p of [sheet.W, sheet.M, ...sheet.G, ...sheet.D, ...sheet.P, ...layers.flat()]) hash.update(new Uint8Array(p.buffer));
    rows.push({ byPlane, milliseconds: times.sort((a, b) => a - b)[1], getterCalls, sha256: hash.digest('hex') });
  }
  assert.equal(rows[0].sha256, rows[1].sha256);
  console.log(JSON.stringify({ density, w, h, before: rows[0], after: rows[1], speedup: rows[0].milliseconds / rows[1].milliseconds }));
}
