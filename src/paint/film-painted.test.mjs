import test from 'node:test';
import assert from 'node:assert/strict';
import { paintedShare, filmShrinks } from './film-painted.mjs';

const sheet = (painted, of = 100) => { const a = new Uint8Array(of * 3).fill(250); for (let i = 0; i < painted; i++) a.set([200, 120, 60], i * 3); return a; };

test('the painted share is the pixels away from the paper', () => {
  assert.equal(paintedShare(sheet(0), sheet(0)), 0);
  assert.equal(paintedShare(sheet(37), sheet(0)), 0.37);
});

test('a film that shows paint and then loses it is caught; an erase and the finished sheet are not', () => {
  const paper = sheet(0), frames = [{ stage: 'paper' }, { stage: 'drawing' }, { stage: 'paint' }, { stage: 'paint' }, { stage: 'erase' }, { stage: 'paint' }, { stage: 'finished' }];
  const shares = [0, 10, 51, 12, 5, 30, 28].map(k => paintedShare(sheet(k), paper));
  assert.deepEqual(filmShrinks(shares, frames), [{ at: 3, from: 0.51, to: 0.12, stage: 'paint' }]);
  assert.deepEqual(filmShrinks([0, 0.1, 0.2, 0.19, 0.3], frames), [], 'a drop within the tolerance is not a loss');
});
