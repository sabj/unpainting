// Formerly an open defect: the study plan's charged-in wet washes failed the wet-bed check on the small 64 to 96 cell test
// sheets. Fixed in the plan (study-washes.mjs: a touch dropped wet needs at least 40 sheet cells of footprint, else it is
// left out); the integration tests lay the plain study again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// (time limit: a hang is still caught; on a busy machine the same run takes five times its idle time)
test('a study plan with charged-in wet washes paints a 64-cell sheet without failing the wet-bed check', { timeout: 960_000 }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'study-wet-bed-'));
  try {
    const r = spawnSync(process.execPath, ['tools/paint-plate.mjs', '--recipe', 'none', '--image', 'bench/v2/targets/hills.png',
      '--washplan', 'bench/v2/targets/hills.png', '--width', '64', '--scale', '1', '--sheetmm', '80', '--drawing', 'none',
      '--mode', 'fast', '--video', '0', '--gpu', 'off', '--seed', '0', '--segments', 'off', '--allowdirty', '1', '--out', path.join(out, 'plate')],
      { cwd: ROOT, encoding: 'utf8', timeout: 900_000 });
    assert.equal(r.status, 0, r.error?.message ?? (r.stderr || r.stdout).slice(-800));
    assert.ok(fs.existsSync(path.join(out, 'plate', 'painting.png')));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
