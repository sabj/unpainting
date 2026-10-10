// The allocation-free unmix returns exactly the recorded reference amounts.
//   node src/crop/pigments.unmix.test.mjs
import assert from 'node:assert/strict';
import { unmix } from './pigments.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const expected=JSON.parse(fs.readFileSync(new URL('./pigments.unmix.fixture.json',import.meta.url)));
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

let s = 99; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let t = 0; t < 40; t++) {
  const n = 500 + Math.floor(rnd() * 3000), k = 2 + (t % 6);
  const D = t % 2 ? new Float32Array(n * 3) : new Float64Array(n * 3); for (let i = 0; i < n * 3; i++) D[i] = rnd() * 1.5;
  const pigs = Array.from({ length: k }, () => { const v = [rnd(), rnd(), rnd()], m = Math.hypot(...v); return v.map(c => c / m); });
  const it = [30, 12, 60][t % 3];
  assert.equal(hash(unmix(D,n,pigs,{iterations:it})),expected.hashes[t],`case ${t}`);
}
console.log('unmix: 40 cases identical to the recorded pre-optimization implementation');
