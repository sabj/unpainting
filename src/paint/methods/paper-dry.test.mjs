import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePaper, measurePaperDry } from './wetdry.mjs';

test('whole-sheet dry certificate matches full measurements and reads only paper', () => {
  const sheet = { w: 3, h: 2, n: 6, W: Float32Array.from([0, .003, .002, 0, 0, 0]),
    s: Float32Array.from([0, 0, .03, 0, 0, 0]), paper: { capacity: new Float32Array(6).fill(1) } };
  const expected = measurePaper(sheet, [0, 1, 2, 3, 4, 5]);
  let reads = 0;
  sheet._gpu = { ensurePaperFresh(target, rect, paperOnly) {
    assert.equal(target, sheet); assert.deepEqual(rect, [0, 0, 3, 2]); assert.equal(paperOnly, true); reads++;
  }, ensureFresh() { assert.fail('pigment readback'); } };
  const actual = measurePaperDry(sheet);
  const { waterP95, ...gate } = expected;
  assert.deepEqual(actual, gate);
  assert.equal(actual.dry, false, 'pore saturation must still reject a dry surface');
  sheet.s.fill(0);
  assert.equal(measurePaperDry(sheet).dry, true);
  sheet.W[5] = NaN;
  assert.throws(() => measurePaperDry(sheet), /Non-finite/);
  assert.equal(reads, 3);
});

test('same-instant groups preserve individual statistics with one readback', async () => {
  const {measurePaperBatch}=await import('./wetdry.mjs');
  const sheet={w:3,h:2,n:6,W:Float32Array.from([.3,.1,0,.01,.004,.006]),s:new Float32Array(6),paper:{capacity:new Float32Array(6).fill(1)}};
  const groups=[{cells:[0,1,1,4]},{cells:[2,5],stats:'gate'},{cells:[],stats:'gate'}];
  const expected=groups.map(({cells,stats})=>measurePaper(sheet,cells,true,{stats}));
  let calls=0; sheet._gpu={ensurePaperFresh(s,r,only){calls++;assert.equal(only,true);assert.deepEqual(r,[0,0,3,2]);}};
  assert.deepEqual(measurePaperBatch(sheet,groups,true),expected); assert.equal(calls,1);
  assert.equal('waterP95' in expected[1],false); assert.equal('waterP95' in expected[2],false);
});
