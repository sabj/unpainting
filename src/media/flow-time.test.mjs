import test from 'node:test';
import assert from 'node:assert/strict';
import { flowTime } from './flow-time.mjs';

const o = { dt: .1, flow: .05, flowIters: 2, diffuse: .002, filmDiffuse: .02 };
test('integrated face conductance scales with time and inverse cell area', () => {
  for (const mm of [.1, .25, .3, 1]) for (const dt of [.05, .1, 1, 14]) {
    const s = flowTime({ paper: { mmPerCell: mm } }, { ...o, dt });
    assert.ok(Math.abs(s.iters * s.fraction - dt * .25 ** 2 / (2 * mm ** 2) * o.flowIters) < 1e-10);
    assert.ok(s.fraction * Math.max(o.flow * 1.5, o.diffuse + o.filmDiffuse) <= .2 + 1e-12);
  }
});
test('zero iterations disables transport; explicit cell width overrides the paper', () => {
  assert.deepEqual(flowTime({ paper: { mmPerCell: .1 } }, { ...o, flowIters: 0 }), { iters: 0, fraction: 0 });
  assert.deepEqual(flowTime({ paper: { mmPerCell: .1 } }, { ...o, mmPerCell: .25 }), flowTime({ paper: { mmPerCell: .25 } }, o));
});

test('pore diffusion preserves all elapsed transport time at both native densities', async () => {
  const { poreTime } = await import('./flow-time.mjs');
  for (const mm of [.1, .25, .3]) for (const dt of [.1, 1, 2, 14]) {
    const p = poreTime({ paper: { mmPerCell: mm } }, { dt, capRate: .05 });
    assert.ok(p.fraction <= 2 / 3);
    assert.ok(Math.abs(p.iters * p.fraction - .05 * dt * 10 * (.25 / mm) ** 2) < 1e-12);
  }
});
