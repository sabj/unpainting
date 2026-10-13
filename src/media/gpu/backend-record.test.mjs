import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backendLine, assertSameBackend } from './backend-record.mjs';
import { attachGpu } from './link.mjs';
import { createSheet, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';

const GPU = { mode: 'auto', backend: 'gpu', fallback: false, adapter: 'webgpu (Dawn)', adapterEvidence: { adapterInfo: { vendor: 'apple', architecture: 'metal-3', device: '', description: 'Apple M4' } } };
const FALLBACK = { mode: 'auto', backend: 'cpu', fallback: true, reason: 'no WebGPU adapter (no suitable backends found)' };
const OFF = { mode: 'off', backend: 'cpu', fallback: false, reason: '--gpu off' };

function run(info) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-'));
  if (info) fs.writeFileSync(path.join(dir, 'backend.json'), JSON.stringify(info));
  return dir;
}

test('one summary line names the backend, the adapter and any fallback', () => {
  assert.equal(backendLine(GPU), 'sheet backend: gpu (webgpu (Dawn), apple metal-3 Apple M4; --gpu auto)');
  assert.equal(backendLine(FALLBACK), 'sheet backend: cpu, FALLBACK from --gpu auto: no WebGPU adapter (no suitable backends found)');
  assert.equal(backendLine(OFF), 'sheet backend: cpu (--gpu off)');
});

test('runs on different backends are refused unless the check is a deliberate parity check', () => {
  const g = run(GPU), c = run(FALLBACK), g2 = run(GPU), none = run(null), warnings = [];
  assert.equal(assertSameBackend([g, g2]), true);
  assert.throws(() => assertSameBackend([g, c]), /refusing to compare: the runs used different sheet backends .*FALLBACK/);
  assert.throws(() => assertSameBackend([run({ ...GPU, adapterEvidence: { adapterInfo: { vendor: 'nvidia', description: 'NVIDIA L40S' } } }), g]), /different sheet backends/);
  assert.equal(assertSameBackend([g, c], { allowMixed: true, log: m => warnings.push(m) }), false);
  assert.equal(assertSameBackend([g, none], { log: m => warnings.push(m) }), true);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /no backend\.json/);
});

// --gpu auto with no adapter (a Dawn backend this machine lacks): the CPU fallback is a warning, and the run's record says
// it fell back.
test('the CPU fallback is loud and recorded as a fallback', () => {
  const prior = process.env.DAWN_FLAGS;
  process.env.DAWN_FLAGS = 'backend=d3d12';
  try {
    const logs = [], sheet = createSheet(makePaper(8, 8, { seed: 1 }), [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }]);
    const info = attachGpu(sheet, { ...DEFAULTS }, { mode: 'auto', log: m => logs.push(m) });
    if (info.backend === 'gpu') { sheet._gpu.close(); console.log('# skipped: this machine has a d3d12 adapter'); return; }
    assert.equal(info.fallback, true);
    assert.match(logs.join('\n'), /^WARNING: the GPU sheet is unavailable .*paints differently from the GPU sheet/m);
    assert.match(backendLine(info), /^sheet backend: cpu, FALLBACK from --gpu auto: /);
  } finally { if (prior === undefined) delete process.env.DAWN_FLAGS; else process.env.DAWN_FLAGS = prior; }
});
