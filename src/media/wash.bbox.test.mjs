// The bounding-box work in washPaths, sweepAngle and directedWashPaths, and the flow field cache in brushedWashPaths,
// must match the whole-sheet versions. The fixture holds hashes of whole-sheet planner output on random masks,
// fields and angles. Coordinates are rounded to 1e-6 before hashing: Math.sin and Math.cos may differ
// in the last bit between platforms, and the paths must not.
//   node src/media/wash.bbox.test.mjs                  check
//   WRITE_FIXTURE=1 node src/media/wash.bbox.test.mjs  record the current output as the fixture
import assert from 'node:assert/strict';
import * as now from './wash.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const FIXTURE = new URL('./wash.bbox.fixture.json', import.meta.url);
const WRITE = process.env.WRITE_FIXTURE === '1';
const expected = WRITE ? { hashes: [] } : JSON.parse(fs.readFileSync(FIXTURE));
const round = (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v);
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v, round)).digest('hex');
const check = (actual, t, k, label) => {
  if (WRITE) { (expected.hashes[t] ??= [])[k] = actual; return; }
  assert.equal(actual, expected.hashes[t][k], `${label} ${t}`);
};

let s = 777; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let cases = 0;
for (let t = 0; t < 160; t++) {
  const w = 30 + Math.floor(rnd() * 170), h = 30 + Math.floor(rnd() * 170), m = new Uint8Array(w * h), f = new Float32Array(w * h);
  const cx = rnd() * w, cy = rnd() * h, rx = 3 + rnd() * 40, ry = 3 + rnd() * 40, th = rnd() * 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th), v = -(x - cx) * Math.sin(th) + (y - cy) * Math.cos(th);
    if ((u / rx) ** 2 + (v / ry) ** 2 < 1) m[y * w + x] = 1;
    f[y * w + x] = Math.sin(x * 0.13 + t) * Math.cos(y * 0.07) + 0.3 * rnd();
  }
  if (t % 9 === 0) m.fill(0);
  const opts = { pad: 1.5, minRadius: 1 + (t % 3), minLength: 2, maxRadius: 4 + (t % 12), field: t % 2 ? f : null, seed: 17 + t, overlap: 0.15, walk: t % 4 !== 0, outerDrift: 1.5, angle: t % 5 === 0 ? rnd() * 3 : null, fallbackAngle: t % 7 === 0 ? 0.4 : null };
  check(hash(now.brushedWashPaths(m,w,h,opts)),t,0,'brushedWashPaths case');
  // twice over the same field, as the floor brush does while its budget grows the brush
  check(hash(now.brushedWashPaths(m,w,h,{...opts,maxRadius:opts.maxRadius*1.6})),t,1,'second call');
  check(hash(now.washPaths(m,w,h,opts)),t,2,'washPaths case');
  check(hash(now.sweepAngle(m,f,w,h)),t,3,'sweepAngle case');
  cases++;
}
if (WRITE) fs.writeFileSync(FIXTURE, JSON.stringify({ source: 'src/media/wash.mjs, which matched the pre-optimization planner (15d05cdd^) exactly when recorded', rounding: 1e-6, hashes: expected.hashes }, null, 1) + '\n');
console.log(`wash bbox: ${cases} cases ${WRITE ? 'recorded' : 'match the recorded pre-optimization implementation'}`);
