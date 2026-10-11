import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepCount, sweepCover, setSweepIntervals } from './wash.mjs';

function compare(paths, mask, w, h) {
  setSweepIntervals(false);
  const count = sweepCount(paths, w, h), cover = sweepCover(paths, mask, w, h);
  try {
    setSweepIntervals(true);
    assert.deepEqual(sweepCount(paths, w, h), count);
    assert.equal(sweepCover(paths, mask, w, h), cover);
  } finally { setSweepIntervals(false); }
}

test('row unions preserve sweep cells and masked overlap across random geometry', () => {
  let state = 4129;
  const rnd = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let trial = 0; trial < 300; trial++) {
    const w = 8 + Math.floor(rnd() * 130), h = 8 + Math.floor(rnd() * 100);
    const mask = Uint8Array.from({ length: w * h }, () => rnd() < .7 ? 1 : 0);
    const paths = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => {
      let x = (rnd() * 1.6 - .3) * w, y = (rnd() * 1.6 - .3) * h;
      return Array.from({ length: Math.floor(rnd() * 60) }, () => {
        x += (rnd() - .5) * 20; y += (rnd() - .5) * 20;
        return { x, y, r: rnd() * 20 };
      });
    });
    compare(paths, mask, w, h);
  }
});

test('row unions preserve half-integer ties, disc boundaries and empty sweeps', () => {
  const w = 41, h = 37, mask = Uint8Array.from({ length: w * h }, (_, i) => i % 7 !== 0 ? 1 : 0);
  const coordinates = [-10, -1, -Number.EPSILON, 0, Number.EPSILON, .5, 1 - Number.EPSILON, 1, 1 + Number.EPSILON, 20, 20 - 8 * Number.EPSILON, 20 + 16 * Number.EPSILON, 50];
  const radii = [-2, -.2, 0, .2, 1, Math.sqrt(2), 3, 3 - Number.EPSILON, Math.sqrt(13), 16.1];
  for (const x of coordinates) for (const r of radii) {
    compare([[], [{ x, y: 12.5, r }], [{ x, y: 3, r }, { x: x + 1.2, y: 12, r }]], mask, w, h);
  }
  compare([[{ x: NaN, y: 1, r: 2 }], [{ x: 2, y: 1, r: NaN }]], mask, w, h);
  compare([[{ x: 12.3, y: 4.1, r: 7 }]], new Uint8Array(w * h), w, h);
});

test('row unions keep overlap counts saturated at Uint16 capacity', () => {
  compare(Array(65540).fill([{ x: 1, y: 1, r: 0 }]), new Uint8Array(9).fill(1), 3, 3);
});
