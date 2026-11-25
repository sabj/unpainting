import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, totals, DEFAULTS } from './sheet.mjs';

test('pore water and its pigment follow the same physical diffusion at halved time/grid steps', () => {
  const errors = [];
  for (const [mm, dt] of [[.25, 2], [.1, 2], [.25, 1]]) {
    const L = 2, w = Math.round(L / mm), s = createSheet(makePaper(w, w, { mmPerCell: mm }), [{ rho: .05, omega: 1, gamma: 0 }]);
    s.paper.capacity.fill(1); s.paper.grain.fill(0); s.paper.fdx.fill(0); s.paper.fdy.fill(0);
    const k = Math.PI / L, average = Math.sin(k * mm / 2) / (k * mm / 2);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const i = y * w + x; s.s[i] = .5 + .1 * average * Math.cos(k * (x + .5) * mm); s.P[0][i] = .1 * s.s[i]; }
    s.wetDirty = 1;
    const a = totals(s), o = { ...DEFAULTS, dt, edgeEvap: 0, evap: 0, paperDry: 0, absorb: 0 }, T = 20;
    for (let t = 0; t < T / dt; t++) step(s, o);
    const b = totals(s), D = o.capRate * 10 * .25 ** 2 * .5 / 4;
    let error = 0;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) error += Math.abs(s.s[y * w + x] - (.5 + .1 * average * Math.exp(-D * k * k * T) * Math.cos(k * (x + .5) * mm)));
    errors.push(error / s.n);
    assert.ok(Math.abs(b.water - a.water) / a.water < 1e-5);
    assert.ok(Math.abs(b.pig[0] - a.pig[0]) / a.pig[0] < 1e-5);
  }
  assert.ok(errors.every(e => e < .001), JSON.stringify(errors));
  assert.ok(errors[1] < errors[0], JSON.stringify(errors));
});
