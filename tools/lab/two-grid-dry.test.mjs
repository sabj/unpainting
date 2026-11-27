import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, step, DEFAULTS } from '../../src/media/sheet.mjs';
import { attachFine, finePour } from '../../src/media/fine-pigment.mjs';
import { carryFine, diffuseFine } from '../../src/media/fine-transport.mjs';
import { dryFine } from './two-grid-dry.mjs';

function fixture() {
  const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
  const pigment = { K: [.46, .29, .05], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85 };
  const s = createSheet(paper(6, 5, .52), [pigment]);
  const F = attachFine(s, paper(24, 20, .13), 4, { ...DEFAULTS, edgeEvap: .0012 });
  for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) deposit(s, y * 6 + x, .3);
  finePour(F, () => true, .12);
  return F;
}
const cpuTransport = { carry: carryFine, diffuse: diffuseFine };

test('awaited two-grid dry uses exactly the ordinary dry schedule and per-step CPU compartments', async () => {
  const cpu = fixture(), async = fixture(), snapshots = [];
  const count = await dryFine(cpu, null, { onStep: t => snapshots.push({ t, dt: cpu.L.dt,
    W: cpu.sheet.W.slice(), s: cpu.sheet.s.slice(), G: cpu.G[0].slice(), P: cpu.P[0].slice(), D: cpu.D[0].slice() }) });
  let observed = 0;
  const asyncCount = await dryFine(async, cpuTransport, { onStep: t => {
    const expected = snapshots[observed++]; assert.equal(t, expected.t); assert.equal(async.L.dt, expected.dt);
    assert.deepEqual(async.sheet.W, expected.W); assert.deepEqual(async.sheet.s, expected.s);
    for (const name of ['G', 'P', 'D']) assert.deepEqual(async[name][0], expected[name]);
  } });
  assert.equal(asyncCount, count); assert.equal(observed, snapshots.length);
  assert.deepEqual(async.layers, cpu.layers);
});

test('an in-flight or failed awaited fine phase cannot be replayed, fixed or covered by another coarse step', async () => {
  const F = fixture(); step(F.sheet, F.o);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = F.stepAsync({ carry: async (...args) => { await gate; carryFine(...args); }, diffuse: diffuseFine });
  assert.throws(() => F.step(), /no coarse step/);
  assert.throws(() => F.fix(), /consume the coarse step/);
  assert.throws(() => step(F.sheet, F.o), /twice without the fine step/);
  release(); await pending; assert.equal(F.L.steps, 0);
  step(F.sheet, F.o);
  await assert.rejects(F.stepAsync({ carry() { throw new Error('device lost'); } }), /device lost/);
  assert.throws(() => F.fix(), /consume the coarse step/);
  assert.throws(() => F.step(), /no coarse step/);
});

test('the awaited dry refuses a step limit without fixing or evaporating the remaining water', async () => {
  const F = fixture();
  await assert.rejects(dryFine(F, cpuTransport, { max: 1 }), /still wet/);
  assert.equal(F.layers.length, 0); assert.ok(F.sheet.W.some(v => v > 0));
});
