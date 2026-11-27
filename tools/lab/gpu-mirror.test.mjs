import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './sync-site-media.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const uniforms = code => [...code.match(/const UF = \[([\s\S]*?)\.map\(k => \[k, 'f'\]\)\];/)[0].matchAll(/'([A-Za-z0-9]+)'/g)].map(m => m[1]);
// the drying and absorption lines of phase 1 (their pigment loops walk the pigments differently)
const phase1Block = wgsl => {
  const start = wgsl.indexOf('let wv = max(0.0, W[i] - u.dt');
  return wgsl.slice(start, wgsl.indexOf('var wn = wv;', start)).replace(/\s+/g, ' ').trim();
};

test("the lab's WebGPU uniform block keeps the painter's 0.3.1 sheet options (mmPerCell, edgeFlowDepth)", () => {
  const lab = uniforms(read('demos/lab/gpu/gpu-sheet.js'));
  for (const k of ['mmPerCell', 'edgeFlowDepth']) assert.ok(lab.includes(k), `lab uniforms lack ${k}`);
  // every option the CLI's block carries after pinFibre, except its CLI-only scheduler pads, is in the lab's block
  const cli = uniforms(read('src/media/gpu/stepfull.mjs')), after = cli.slice(cli.indexOf('pinFibre') + 1).filter(k => !/^pad[B-E]$/.test(k));
  for (const k of after) assert.ok(lab.includes(k), `lab uniforms lack ${k}`);
});

test("the lab's WebGPU sheet dries a pinned edge by the painter's edge feed, not a local rule", async () => {
  const lab = read('demos/lab/gpu/gpu-wgsl.js'), cli = read('src/media/gpu/stepfull.wgsl');
  // Exact mode (phase1) keeps no local edge rule; Lab may define a separate ef_realtime kernel for interactive mode.
  assert.ok(!/localDryFraction|edgeEvap/.test(phase1Block(lab)) && !/localDryFraction|edgeEvap/.test(cli), 'no local edge rule in exact phase1 or CLI');
  assert.equal(phase1Block(lab), phase1Block(cli));
  assert.match(lab, /edgeFeedWgsl\(/);
  const { WGSL } = await import('../../demos/lab/gpu/gpu-wgsl.js');
  for (const k of ['fn ef_prep', 'fn ef_apply', 'fn ef_watch', 'fn cap_commit']) assert.ok(WGSL.includes(k), `lab kernels lack ${k}`);
  const host = read('demos/lab/gpu/gpu-sheet.js');
  for (const k of ['flowTime(', 'poreTime(', 'edgeGeometry(', 'wetBoxes(']) assert.ok(host.includes(k), `lab sheet lacks ${k}`);
});

test("the lab hands the sheet's real cell size to its WebGPU sheet and keeps the default edge depth", () => {
  const code = read('demos/lab/gpu/gpu-sheet.js');
  assert.match(code, /mmPerCell: sheet\.paper\?\.mmPerCell/);
  assert.match(code, /edgeFlowDepth: o\.edgeFlowDepth \?\? 0\.06/);
});

test('every file under demos/lab/media is generated from src/media or a named lab-only file', () => {
  const LAB_ONLY = new Set(['dryer.js', 'lab-media.js', 'mixing.js', 'papers.js', 'pigments.js']);
  const base = path.join(ROOT, 'demos', 'lab', 'media'), made = generate();
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const orphans = walk(base).map(f => path.relative(base, f).split(path.sep).join('/')).filter(r => !made.has(r) && !LAB_ONLY.has(r));
  assert.deepEqual(orphans, [], 'stale copies the sync no longer produces (the browser never loads them)');
});


test('Paint Lab consumes the parallel round arguments and continues before backrun', async () => {
  const { GpuSheet } = await import('../../demos/lab/gpu/gpu-sheet.js');
  const { levelBudget } = await import('../../src/media/gpu/film-level-host.mjs');
  const calls = [], pass = {
    setPipeline(name) { this.name = name; }, setBindGroup() {}, end() {},
    dispatchWorkgroups(groups) { calls.push([this.name, 'direct', groups]); },
    dispatchWorkgroupsIndirect(buffer, offset) { calls.push([this.name, buffer, offset]); },
  };
  const host = { o: { dt: .1, level: 1, optimized: false }, K: 1, n: 256, ntiles: 1, cap: 1, timeChunks: 1,
    flowTime: { iters: 0 }, poreTime: { iters: 0 }, act: [0], lv: { ...levelBudget(), iters: 1, subs: 1 },
    b: { LVI: 'round-arguments' }, p: new Proxy({}, { get: (_, key) => key }), bg: {},
  };
  GpuSheet.prototype.encodeSteps.call(host, { beginComputePass: () => pass }, 1);
  const rounds = calls.filter(([name]) => /^lv_s[12]#/.test(name));
  assert.equal(rounds.length, 2);
  for (let r = 0; r < 1; r++) for (let k = 0; k < 2; k++) {
    assert.deepEqual(rounds[2 * r + k].slice(1), ['direct', 1]);
  }
  assert.deepEqual(calls.find(([name]) => name === 'lv_subs'), ['lv_subs', 'direct', 1]);
  const more = calls.findIndex(([name]) => name === 'lv_transport_continue#{"LVROUND":1}');
  assert.ok(more > calls.findIndex(([name]) => name.startsWith('lv_s2#')));
  assert.ok(more < calls.findIndex(([name]) => name === 'lv_br_a'));
  assert.deepEqual(calls[more].slice(1), ['direct', host.lv.boxes]);
});
