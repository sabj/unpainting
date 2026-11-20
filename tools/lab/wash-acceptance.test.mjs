import test from 'node:test';
import assert from 'node:assert/strict';
import { bloomFront, discProfile, squareRims, discContrast } from './wash-acceptance.mjs';

test('bloom crinkle measurement removes an off-centre fitted circle, retains scalloping', () => {
  const w = 400, mm = .1;
  for (const amplitude of [0, .5]) {
    const od = Float64Array.from({ length: w * w }, (_, i) => {
      const x = (i % w + .5 - w / 2) * mm - .3, y = (((i / w) | 0) + .5 - w / 2) * mm + .2;
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      return .1 + .1 * Math.exp(-.5 * ((r - 8 - amplitude * Math.sin(5 * a)) / .35) ** 2);
    });
    const m = bloomFront(od, w, w, mm);
    assert.ok(m.contrast > 1.2);
    assert.ok(amplitude ? m.radiusRms > .2 : m.radiusRms < .03, JSON.stringify(m));
  }
});

test('disc profile catches a depleted annulus and accepts a flat interior', () => {
  const w = 140, mm = .25;
  for (const depleted of [false, true]) {
    const od = Float64Array.from({ length: w * w }, (_, i) => {
      const r = Math.hypot((i % w + .5 - w / 2) * mm, (((i / w) | 0) + .5 - w / 2) * mm);
      return depleted && r > 11 && r < 13 ? .8 : 1;
    });
    const m = discProfile(od, w, w, mm);
    assert.equal(m.flatness <= .05, !depleted);
  }
});

test('four-side rim measurement rejects a single weak side beyond 15%', () => {
  const w = 120, mm = .5;
  for (const weak of [false, true]) {
    const od = Float64Array.from({ length: w * w }, (_, i) => {
      const x = i % w, y = (i / w) | 0;
      if (x < 20 || x >= 100 || y < 20 || y >= 100) return 0;
      return weak && x < 22 ? .6 : 1;
    });
    assert.equal(squareRims(od, w, w, mm).deviation <= .15, !weak);
  }
});

test('the prescribed disc annulus measures an analytic radial density field in physical millimetres', () => {
  const alpha = .002, expected = (1 + alpha * (15 ** 2 + 14 ** 2) / 2) / (1 + alpha * 12 ** 2 / 2);
  for (const mm of [.25, .1]) {
    const w = Math.round(36 / mm), od = Float64Array.from({length:w*w},(_,i)=>1 + alpha * (((i%w+.5-w/2)*mm)**2 + ((((i/w)|0)+.5-w/2)*mm)**2 + mm*mm/6));
    assert.ok(Math.abs(discContrast(od,w,w,mm).contrast / expected - 1) < .002);
  }
});
