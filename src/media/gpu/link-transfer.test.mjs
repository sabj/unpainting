import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuLink } from './link.mjs';

function fixture(instrument = true) {
  const w = 8, h = 8, n = w * h, K = 1, planes = 7;
  const sheet = { w, h, n, K, layers: [], steps: 0, W: new Float32Array(n), s: new Float32Array(n),
    M: new Uint8Array(n), ever: new Uint8Array(n), G: [new Float32Array(n)], P: [new Float32Array(n)], D: [new Float32Array(n)] };
  const trace = [], gpu = new Float32Array(n * planes);
  let link;
  const dispatch = msg => {
    trace.push({ op: msg.op, rect: msg.rect && [...msg.rect] });
    if (msg.op === 'step') for (let i = 0; i < n; i++) gpu[i] *= .9;
    if (msg.op === 'up' || msg.op === 'down') {
      const [x, y, rw, rh] = msg.rect, a = rw * rh;
      for (let p = 0; p < planes; p++) for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) {
        const gi = p * n + (y + dy) * w + x + dx, ri = p * a + dy * rw + dx;
        if (msg.op === 'up') gpu[gi] = (msg.data ?? link.rectData)[ri];
        else link.rectData[ri] = gpu[gi];
      }
    }
  };
  link = new GpuLink({ postMessage: dispatch }, { rectData: new Float32Array(n * planes) }, sheet);
  link.call = dispatch;
  if (!instrument) link.recordTransfer = () => {};
  return { sheet, link, gpu, trace };
}
const run = f => {
  const { sheet: sh, link: l } = f;
  l.stale = true; l.fresh.stale();
  l.beginStroke(sh, [1, 1, 4, 4]);
  sh.W[18] = .5; sh.G[0][18] = .2;
  l.step(sh, {});
  sh.W[19] += .3;
  l.step(sh, {});
  l.endStroke(sh);
  l.syncAll(sh);
};
test('scalar transfer attribution preserves transport order and every sheet plane', () => {
  const before = fixture(false), after = fixture(); run(before); run(after);
  assert.deepEqual(after.trace, before.trace);
  assert.deepEqual(after.gpu, before.gpu);
  for (const k of ['W', 's', 'M', 'ever', 'G', 'P', 'D', 'steps']) assert.deepEqual(after.sheet[k], before.sheet[k]);
  const s = after.link.stats, phases = Object.values(s.transferPhases);
  assert.equal(s.cpuStrokes, 1); assert.equal(s.cpuStrokeFlows, 2); assert.equal(s.cpuStrokeRectCells, 16);
  assert.equal(s.transferPhases['cpu-stroke-entry'].down, 1);
  assert.equal(s.transferPhases['cpu-stroke-flow'].up, 2);
  assert.equal(s.transferPhases['cpu-stroke-flow'].down, 2);
  assert.equal(s.transferPhases['cpu-stroke-end'].up, 1);
  assert.equal(s.transferPhases['outside-stroke'].down, 1);
  for (const k of ['up', 'down', 'upBytes', 'downBytes']) assert.equal(phases.reduce((a, p) => a + p[k], 0), s[k]);
  assert.equal(after.link.transferPhase, 'outside-stroke');
});
test('flow attribution scope is restored after transport throws', () => {
  const f = fixture(); f.link.stroke = [0, 0, 2, 2];
  f.link.up = () => { throw new Error('transport failed'); };
  assert.throws(() => f.link.step(f.sheet, {}), /transport failed/);
  assert.equal(f.link.transferPhase, 'outside-stroke');
});
