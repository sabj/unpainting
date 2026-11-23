import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet } from './stepfull.mjs';

test("the edge feed's rounds come down to half as many again as the most the last reads used, no fewer than 4", () => {
  const writes = [], h = { ef: { rounds: 16 }, b: { EFB: {} }, device: { queue: { writeBuffer: (b, off, v) => writes.push([off, [...v]]) } },
    efWriteRounds: GpuSheet.prototype.efWriteRounds };
  const shrink = (used, down = true) => GpuSheet.prototype.efShrink.call(h, used, down);
  shrink(2); shrink(3); shrink(1); assert.equal(h.ef.rounds, 16, 'not before 4 reads');
  shrink(2); assert.equal(h.ef.rounds, 5);
  assert.deepEqual(writes.filter(([off]) => off === 12).length, 4, 'the most used is cleared after every read');
  for (let i = 0; i < 16; i++) shrink(1); assert.equal(h.ef.rounds, 4);
  h.ef.rounds = 8; shrink(1, false); assert.equal(h.ef.rounds, 8, 'not on a read that grew them');
});
