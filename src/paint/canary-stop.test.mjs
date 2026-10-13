import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('a native CPU canary stops after one real paint pass', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-canary-'));
  const out = path.join(tmp, 'plate');
  try {
    const run = spawnSync(process.execPath, [
      'tools/paint-plate.mjs', '--image', 'examples/targets/white-ships.jpg',
      '--out', out, '--width', '96', '--scale', '1', '--sheetmm', '152.4',
      '--recipe', 'none', '--mode', 'fast', '--gpu', 'off',
      '--drawing', 'none', '--draw', '0', '--video', '0', '--frames', '1',
      '--targetguard', 'strict', '--canarystop', '1',
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /canary checkpoint after pass 1/);
    const report = JSON.parse(fs.readFileSync(path.join(out, 'canary.json'), 'utf8'));
    assert.equal(report.pass, 1);
    assert.ok(report.plannedPasses > 1);
    assert.ok(fs.statSync(path.join(out, report.image)).size > 0);
    assert.equal(fs.existsSync(path.join(out, 'painting.png')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("canary pass numbers must be 0 or a planned pass", async () => {
  const { canaryStopPass } = await import("./canary-stop.mjs");
  assert.equal(canaryStopPass(0, 5), 0);
  assert.equal(canaryStopPass(5, 5), 5);
  for (const bad of [-1, 6, 1.5, NaN]) assert.throws(() => canaryStopPass(bad, 5), /canarystop/);
});
