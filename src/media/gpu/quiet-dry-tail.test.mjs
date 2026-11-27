import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet, openGpu } from './stepfull.mjs';
import { finishQuietDryTail } from './quiet-dry-tail.mjs';
import { createSheet, DEFAULTS, quietDryTail, totals } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';

test('the real GPU pore-only gate agrees with the CPU, keeps mass and refuses every mobile state', async t => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  let device;
  try { ({ device } = await openGpu(webgpu.create([]))); }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); return; }
  try {
    for (const kind of ['quiet', 'film', 'mask', 'capillary', 'sealed']) {
      const s = createSheet(makePaper(24, 20, { seed: 7 }), [{ K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 }]);
      s.ever.fill(1); s.P[0].fill(.03);
      s.G[0].fill(.007);
      for (let i = 0; i < s.n; i++) s.s[i] = .25 * s.paper.capacity[i];
      if (kind === 'film') s.W[10] = .003;
      if (kind === 'mask') s.M[10] = 1;
      if (kind === 'capillary') s.s[s.n - 1] = .8 * s.paper.capacity[s.n - 1];
      const o = { ...DEFAULTS, paperDry: kind === 'sealed' ? 0 : DEFAULTS.paperDry }, before = totals(s);
      const g = await GpuSheet.create(device, s, o);
      try {
        const expected = quietDryTail(s, o);
        g.measureWetCounters();
        const probe = await g.readDryChunk(null, { quietCheck: true, readLevel: true });
        assert.equal(probe.level.length, 12, 'packed eligibility does not leak into level diagnostics');
        if (probe.c[6] === 0 && probe.c[7] === 0) assert.equal(probe.quietBlocked === 0, expected, kind);
        const actual = await finishQuietDryTail(g);
        assert.equal(actual, expected, kind);
        assert.equal(actual, kind === 'quiet', kind);
        const reference = structuredClone({ W: s.W, s: s.s, M: s.M, G: s.G, P: s.P, D: s.D });
        await g.download(s);
        assert.deepEqual({ W: s.W, s: s.s, M: s.M, G: s.G, P: s.P, D: s.D }, reference, kind);
        const after = totals(s);
        assert.ok(Math.abs(after.pig[0] - before.pig[0]) < 1e-5 * before.pig[0], kind);
        if (actual) assert.equal(after.water, 0);
        else assert.equal(after.water, before.water, kind);
      } finally { g.destroy(); }
    }
  } finally { device.destroy(); }
});
