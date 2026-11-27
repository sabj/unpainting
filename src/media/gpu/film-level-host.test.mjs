import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLevel, levelBudget, adaptLevel, levelBuffers, selectLevelRegime } from './film-level-host.mjs';
import { GpuSheet, SRC, analyse } from './stepfull.mjs';

const o = { level: 1, meniscusMm: 0.5 }, mm = 0.3;
const names = lv => { const out = []; encodeLevel((name, groups, constants, indirectOffset) => out.push([name, constants, indirectOffset]), o, mm, lv, 8); return out; };
const status = (levelSteps, recovered = 0) => { const v = new Uint32Array(12); v[8] = levelSteps; v[9] = recovered; return v; };

test('a CG iteration is lv_cg_a, lv_cg_c and lv_cg_d, followed by lv_cg_continue with the last parity', () => {
  const lv = levelBudget(); lv.iters = 5;
  const run = names(lv).map(([n]) => n);
  assert.equal(run.filter(n => n === 'lv_cg_a').length, 5); assert.equal(run.filter(n => n === 'lv_cg_c').length, 5);
  assert.equal(run.filter(n => n === 'lv_cg_b').length, 0); assert.equal(run.filter(n => n === 'lv_cg_d').length, 5);
  const all = names(lv), a = all.filter(([n]) => n === 'lv_cg_a').map(([, c]) => c);
  assert.deepEqual(a.map(c => [c.LVPAR, c.LVK0 ?? 0]), [[0, 1], [1, 0], [0, 0], [1, 0], [0, 0]]);
  const ds = all.filter(([n]) => n === 'lv_cg_d');
  assert.equal(ds.at(-1)[1].LVPAR, 0);
  assert.equal(all.find(([n]) => n === 'lv_cg_continue')[1], ds.at(-1)[1]);
  assert.deepEqual(run.slice(run.lastIndexOf('lv_cg_d'), run.indexOf('lv_out') + 1), ['lv_cg_d', 'lv_cg_continue', 'lv_flux', 'lv_out']);
  assert.equal(a[1], a[3], 'the overrides objects are made once, so the sheet finds the pipeline by the object');
});

test('a completed continuation grows the parallel budget from the work actually needed', () => {
  const lv = levelBudget(); lv.iters = 2;
  const v = status(1); v[3] = 35; v[7] = 1; v[10] = 1;
  assert.equal(adaptLevel(lv, v), true);
  assert.equal(lv.iters, 48);
  assert.equal(lv.total.continued, 1); assert.equal(lv.total.short, 0);
});

test('an unconverged or broken solve fails the status read and poisons later reads', () => {
  const lv = levelBudget(), v = status(1); v[3] = 8192; v[4] = 1; v[7] = 1; v[10] = 1;
  assert.throws(() => adaptLevel(lv, v), /failed to converge \(1 boxes, 8192 iterations; safety limit 8192\)/);
  assert.equal(lv.total.short, 1); assert.equal(lv.total.continued, 1);
  assert.throws(() => adaptLevel(lv, status(0)), /failed to converge/);
  assert.equal(lv.total.short, 1, 'a repeated read cannot clear or recount the failure');
});

test('idle and whole-sheet download report a failed solver before returning its state', async () => {
  const calls = [], error = new Error('GPU film levelling failed to converge');
  const host = { flushStrokes() { calls.push('flush'); }, device: { queue: { async onSubmittedWorkDone() { calls.push('done'); } } },
    async lvAdapt() { calls.push('status'); throw error; } };
  await assert.rejects(GpuSheet.prototype.idle.call(host), e => e === error);
  assert.deepEqual(calls, ['flush', 'done', 'status']);
  calls.length = 0;
  await assert.rejects(GpuSheet.prototype.download.call(host, {}), e => e === error);
  assert.deepEqual(calls, ['status']);
});

test('light only after a read with steps and no level tile, and nothing written since', () => {
  const lv = levelBudget();
  names(lv); adaptLevel(lv, status(0)); assert.equal(lv.light, false, 'not for a caller that does not say when it writes');
  lv.tracksWrites = true; names(lv); adaptLevel(lv, status(0)); assert.equal(lv.light, true);
  const quiet = names(lv);
  assert.equal(quiet.filter(([n]) => n === 'lv_cg_a').length, 1, 'light steps keep a minimal solve and same-step continuation');
  assert.equal(quiet.filter(([n]) => n === 'lv_s1').length, 0);
  assert.equal(quiet.find(([n]) => n === 'lv_transport_continue')[1].LVROUND, 0);
  assert.equal(quiet.find(([n]) => n === 'lv_transport_continue')[2], 12);
  assert.equal(lv.lightSteps, 1);
  adaptLevel(lv, status(1, 1)); assert.equal(lv.light, false, 'a level tile found on a light step turns it back on');
  assert.equal(lv.total.recovered, 1);
  names(lv); adaptLevel(lv, status(0), true); assert.equal(lv.light, false, 'a write since the steps were encoded');
  adaptLevel(lv, status(0)); assert.equal(lv.light, false, 'a read with no steps since says nothing');
});

test('light dispatches use this step\'s GPU gate; ordinary dispatches stay direct', () => {
  const lv = levelBudget(); lv.iters = 3; lv.subs = 2; lv.light = true;
  const gated = names(lv);
  assert.deepEqual(gated.slice(0, 2).map(([n, , offset]) => [n, offset]), [['lv_tiles', undefined], ['lv_boxes', undefined]]);
  assert.equal(gated[1][1].LVLIGHT, 1);
  for (const [name, , offset] of gated.slice(2)) {
    if (name === 'lv_s1' || name === 'lv_s2') continue;
    assert.equal(offset, name === 'lv_subs' ? undefined : ['lv_cg0', 'lv_cg_d', 'lv_cg_continue', 'lv_transport_continue'].includes(name) ? 12 : 0, name);
  }
  lv.light = false;
  assert.ok(names(lv).filter(([n]) => !['lv_s1', 'lv_s2'].includes(n)).every(([, , offset]) => offset === undefined));
  assert.equal(levelBuffers(16, 16, 256, 1, true).LVI, 792);
  // An indirect buffer cannot also be a storage binding in that dispatch. Only the direct producers use LVI.
  const info = analyse(SRC), gate = info.decl.find(d => d.name === 'LVI').binding;
  assert.deepEqual(info.entries.filter(n => info.uses(n).includes(gate)), ['lv_boxes', 'lv_subs']);
  for (const name of info.entries.filter(n => n.startsWith('lv_') || n.startsWith('ef_'))) {
    assert.ok(info.uses(name).filter(b => b !== 0).length <= 10, `${name} fits Metal's storage bindings`);
  }
});

test('the sheet uses indirect offsets including zero, and light backrun uses indirect offset zero', () => {
  const calls = [], lv = levelBudget(); lv.light = true; lv.iters = 1; lv.subs = 1;
  const host = { lv, b: { LVX: {}, LVI: 'current-step-gate' }, persistent: true, workers: 4, epoch: 0, o, lvMm: () => mm,
    lvPipe: name => name, p: new Proxy({}, { get: (_, key) => key }), bg: new Proxy({}, { get: (_, key) => key }) };
  const pass = { setPipeline(name) { this.name = name; }, setBindGroup() {},
    dispatchWorkgroups(groups) { calls.push([this.name, 'direct', groups]); },
    dispatchWorkgroupsIndirect(buffer, offset) { calls.push([this.name, buffer, offset]); } };
  GpuSheet.prototype.lvEncode.call(host, pass);
  assert.deepEqual(calls.find(([n]) => n === 'lv_init'), ['lv_init', 'current-step-gate', 0]);
  assert.deepEqual(calls.find(([n]) => n === 'lv_cg0'), ['lv_cg0', 'current-step-gate', 12]);
  assert.deepEqual(calls.find(([n]) => n === 'lv_br_a'), ['lv_br_a', 'current-step-gate', 0]);
});

test('a drying tail cannot hold light mode or cap a growing solver budget', () => {
  const lv = levelBudget(); lv.tracksWrites = true; lv.light = true; lv.hold = true; lv.cap = 16; lv.iters = 16;
  names(lv); const v = status(1, 1); v[3] = 16; v[10] = 1; v[7] = 1;
  adaptLevel(lv, v);
  assert.equal(lv.light, false);
  assert.ok(lv.iters >= 24);
  assert.equal(lv.total.recovered, 1);
});

test('the parallel budgets come down to recent demand, with floors of four CG iterations and one transport round', () => {
  const read = (lv, iterations) => { const v = new Uint32Array(12); v[3] = iterations; v[5] = 4; v[7] = 1; v[11] = 1; adaptLevel(lv, v); };
  const lv = levelBudget();
  for (let i = 0; i < 4; i++) read(lv, 1);
  assert.equal(lv.iters, 4); assert.equal(lv.subs, 6);
  const lw = levelBudget(1024); for (let i = 0; i < 3; i++) read(lw, 20);
  assert.equal(lw.subs, 8, 'large pools retain parallel transport headroom');
  assert.equal(lw.iters, 25, "it only comes down here");
  read(lw, 26); assert.ok(lw.iters >= 34, 'a solve near the budget grows it');
});


test('every transport budget finishes its current request before backrun, without changing its denominator', () => {
  for (const budget of [1, 8, 64]) {
    const lv = levelBudget(); lv.iters = 1; lv.subs = budget;
    const schedule = names(lv), rounds = schedule.filter(([n]) => n === 'lv_s1' || n === 'lv_s2');
    assert.equal(rounds.length, 2 * budget);
    for (let r = 0; r < budget; r++) {
      assert.deepEqual(rounds.slice(2 * r, 2 * r + 2).map(([n, c, offset]) => [n, c.LVROUND, offset]),
        [['lv_s1', r, undefined], ['lv_s2', r, undefined]]);
    }
    assert.ok(schedule.findIndex(([n]) => n === 'lv_subs') < schedule.findIndex(([n]) => n === 'lv_s1'));
    const continuation = schedule.findIndex(([n]) => n === 'lv_transport_continue');
    if (budget < 64) {
      assert.equal(schedule[continuation][1].LVROUND, budget);
      assert.equal(schedule[continuation][2], undefined);
      assert.equal(schedule[continuation - 1][0], 'lv_s2');
      assert.equal(schedule[continuation + 1][0], 'lv_br_a');
    } else assert.equal(continuation, -1);
    assert.equal(schedule.at(-1)[0], 'lv_br_a');
    const info = analyse(SRC);
    for (const [name, , offset] of schedule) {
      if (offset === undefined) continue;
      assert.ok(offset + 12 <= levelBuffers(16, 16, 256, 1, true).LVI, name);
      assert.ok(!info.uses(name).includes(59), `${name} does not bind its indirect buffer`);
    }
  }
});

test('a light recovery does not double a larger normal budget it never exhausted', () => {
  const lv = levelBudget(1024); lv.iters = 48; const v = status(1, 1); v[3] = 26; v[7] = 1; v[10] = 1;
  adaptLevel(lv, v); assert.equal(lv.iters, 48);
});


test('large sheets start with parallel transport headroom and can still shrink from measured demand', () => {
  const lv = levelBudget(768); assert.equal(lv.subs, 16);
  for (let i = 0; i < 3; i++) { const v = status(1); v[3] = 10; v[5] = 2; v[7] = 1; adaptLevel(lv, v); }
  assert.equal(lv.subs, 8);
  lv.light = true;
  const run = names(lv); assert.equal(run.filter(([n]) => n === 'lv_s1').length, 0);
  assert.equal(run.find(([n]) => n === 'lv_transport_continue')[1].LVROUND, 0);
  assert.equal(run.find(([n]) => n === 'lv_transport_continue')[2], 12);
});


test('a costly old wash does not hold the parallel budgets above four completed cheap batches', () => {
  const lv = levelBudget(768);
  const read = (iterations, rounds) => { const v = status(1); v[3] = iterations; v[5] = rounds; v[7] = 1; adaptLevel(lv, v); };
  read(120, 32); assert.equal(lv.iters, 154);
  for (let i = 0; i < 4; i++) read(2, 1);
  assert.equal(lv.iters, 5); assert.equal(lv.subs, 8);
  // A sudden harder step is still completed by the GPU continuation and grows the next parallel budget.
  read(50, 30); assert.ok(lv.iters >= 67); assert.ok(lv.subs >= 39);
});


test('distance relaxation alternates two planes and lowers the meniscus only on the last pass', () => {
  for (const reach of [1, 2, 3, 6, 7]) {
    const schedule = [];
    const record = () => encodeLevel((name, groups, constants) => {
      if (name === 'lv_dist') schedule.push(constants);
    }, { ...o, meniscusMm: reach * 0.25 }, 0.25, levelBudget(), 4);
    record();
    const passes = Math.max(1, reach - 1);
    assert.deepEqual(schedule.map(c => [c.LVPAR, c.LVMEN]),
      Array.from({ length: passes }, (_, r) => [r & 1, Number(r === passes - 1)]));
    const first = schedule[0]; schedule.length = 0; record();
    assert.equal(schedule[0], first, 'the pipeline override objects stay cached');
  }
});

test('box overflow fails the status read and stays failed even after later discovery', () => {
  const lv = levelBudget(), v = status(0); v[2] = 1;
  assert.throws(() => adaptLevel(lv, v), /exceeded 1024 disconnected wet components/);
  assert.throws(() => adaptLevel(lv, status(0)), /exceeded 1024/);
});


test('stroke, level and fast budgets learn after two reads and survive repeated dt transitions', () => {
  const lv = levelBudget(4096);
  const train = (dt, iterations, subs) => {
    selectLevelRegime(lv, dt);
    for (let r = 0; r < 2; r++) {
      names(lv); const v = status(1); v[3] = iterations; v[5] = subs; v[7] = 1; adaptLevel(lv, v);
    }
    return [lv.iters, lv.subs, lv.recent];
  };
  selectLevelRegime(lv, .1); assert.equal(lv.iters, 12);
  const stroke = train(.1, 5, 2), level = train(1, 10, 4), fast = train(2, 7, 6);
  for (let r = 0; r < 4; r++) for (const [dt, expected] of [[.1, stroke], [1, level], [2, fast]]) {
    selectLevelRegime(lv, dt); assert.deepEqual([lv.iters, lv.subs, lv.recent], expected);
  }
  assert.deepEqual(stroke.slice(0, 2), [8, 8]);
  assert.deepEqual(level.slice(0, 2), [14, 8]);
  assert.deepEqual(fast.slice(0, 2), [11, 9]);
  const count = names(lv).filter(([n]) => n.startsWith('lv_cg_') && n !== 'lv_cg_continue').length;
  assert.equal(count, 33, 'fast regime retains its learned budget instead of resetting to 48 iterations');
});

test('delayed and mixed status reads cannot shrink the wrong dt regime', () => {
  const lv = levelBudget(4096);
  selectLevelRegime(lv, .1); names(lv);
  selectLevelRegime(lv, 1);
  const v = status(1); v[3] = 20; v[5] = 9; v[7] = 1;
  adaptLevel(lv, v);
  assert.equal(lv.iters, 24, 'pending stroke work does not train level');
  assert.equal(lv.regimes.stroke.iters, 29);
  assert.equal(lv.regimes.stroke.subs, 16);
  names(lv); selectLevelRegime(lv, .1); names(lv);
  const mixed = status(2); mixed[3] = 1; mixed[5] = 1; mixed[7] = 2;
  adaptLevel(lv, mixed);
  assert.equal(lv.iters, 29, 'mixed maxima cannot teach a smaller stroke budget');
  assert.equal(lv.recent.length, 1, 'mixed statistics do not enter either history');
  selectLevelRegime(lv, 1); assert.equal(lv.iters, 24); assert.deepEqual(lv.recent, []);
});


test('level and fast start at 24 CG iterations and clearly quiet solves shrink on their first read', () => {
  const lv = levelBudget(4096);
  for (const dt of [1, 2]) {
    selectLevelRegime(lv, dt); assert.equal(lv.iters, 24);
    const v = status(1); v[3] = 5; v[5] = 2; v[7] = 1;
    names(lv); adaptLevel(lv, v); assert.equal(lv.iters, 8);
    assert.equal(names({ ...lv, pendingRegimes: new Set() }).filter(([n]) => ['lv_cg_a', 'lv_cg_c', 'lv_cg_d'].includes(n)).length, 24);
  }
});
