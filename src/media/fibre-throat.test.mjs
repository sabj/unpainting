import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { fibreThroat, throatCorrelation } from './fibre-throat.mjs';
import { paperPlanes } from './gpu/paper-planes.mjs';

test('a flat fibre-free paper has no preferred entry pressure', () => {
  const w = 8, h = 8, z = new Float32Array(w * h);
  assert.ok(fibreThroat({ w, h, fibre: z, proud: z, fdx: z, fdy: z }, 2).every(v => v === 0));
});

test('throats follow the paper seed, keep the calibrated spread and reach along fibres for at least 0.6 mm', t => {
  const mm = 0.26, n = Math.round(40 / mm), lengths = [];
  for (const seed of [1, 2, 3]) {
    const p = makePaper(n, n, { seed, mmPerCell: mm });
    assert.deepEqual(p.throat, makePaper(n, n, { seed, mmPerCell: mm }).throat);
    assert.notDeepEqual(p.throat, makePaper(n, n, { seed: seed + 10, mmPerCell: mm }).throat);
    let mean = 0, variance = 0;
    for (const v of p.throat) { assert.ok(Number.isFinite(v) && v >= -0.5 && v <= 0.5); mean += v; variance += v * v; }
    assert.ok(Math.abs(mean / p.n) < 0.002);
    assert.ok(Math.abs(variance / p.n - 1 / 12) < 0.002);
    const c = throatCorrelation(p, p.throat, { maxLag: 12 });
    lengths.push({ seed, alongMm: c.alongLen * mm, acrossMm: c.acrossLen * mm });
    assert.ok(c.alongLen * mm >= 0.6, JSON.stringify(lengths.at(-1)));
    assert.ok(c.alongLen > 2 * c.acrossLen, JSON.stringify(lengths.at(-1)));
    // The painter's prepacked GPU planes must carry the exact same f32 throat.
    const { P3 } = paperPlanes(p, p.n);
    for (let i = 0; i < p.n; i++) assert.equal(P3[4 * i + 1], p.throat[i]);
  }
  t.diagnostic(JSON.stringify(lengths));
});
