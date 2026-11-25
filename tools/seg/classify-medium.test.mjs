import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { segPythonFor } from '../paint/run.mjs';

// Step 0 on synthetic pictures (classify-medium-cases.py): a pen line drawing with washes is ink, washes over a pencil
// drawing are pencil, a pure wash is none; a drawing that invents a background and a frame fails the fidelity check;
// a fitted stroke on a source line is ink, on a source edge a graphite lay-in, on blank paper dropped (tag-medium.py).
// (the segmentation python as the painter finds it: a git worktree without its own uses its main checkout's)
const root = fileURLToPath(new URL('../../', import.meta.url)), python = segPythonFor(root);

test('classify-medium.py and drawing-fidelity.py: ink, pencil and none told apart; an invented background rejected', () => {
  assert.ok(fs.existsSync(python), `the segmentation Python environment is missing (${python}); run npm run doctor`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-'));
  try {
    const r = JSON.parse(execFileSync(python, ['tools/seg/classify-medium-cases.py', dir], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop());
    assert.equal(r.ink, 'ink');
    assert.equal(r.pencil, 'pencil');
    assert.equal(r.none, 'none');
    assert.equal(r.fidelity_clean, true);
    assert.equal(r.fidelity_bad, false);
    assert.deepEqual(r.tag, ['ink', 'graphite', 'drop']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
