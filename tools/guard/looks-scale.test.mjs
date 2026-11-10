// Looks and line tracers at brush and shape scale (RULES.md, "Looking and cheating"; art-teacher review, section 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;

test('fix 4: trace-ink draws each line with one nib and one weight, fixed limits, no rule fitted to one plate', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-trace-'));
  try {
    // one thin line whose darkness changes along its length
    const target = path.join(dir, 't.png'), out = path.join(dir, 'lines.json');
    await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="#f0eee8"/><defs><linearGradient id="g"><stop offset="0" stop-color="#101010"/><stop offset="1" stop-color="#707070"/></linearGradient></defs><rect x="5" y="19" width="70" height="1.4" fill="url(#g)"/></svg>')).png().toFile(target);
    const tool = path.join(ROOT, 'bench/v4v5/tools/trace-ink.mjs');
    execFileSync(process.execPath, [tool, target, out], { cwd: ROOT, stdio: 'pipe' });
    const { lines } = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.ok(lines.length > 0, 'the line is traced');
    for (const l of lines) {
      assert.equal(l.widths, undefined, 'no width read point by point');
      assert.equal(l.weights, undefined, 'no weight read point by point');
      assert.ok(l.width > 0 && l.weight > 0);
    }
    assert.throws(() => execFileSync(process.execPath, [tool, target, out, '.08'], { cwd: ROOT, stdio: 'pipe' }), 'the contrast limit is not settable');
    assert.doesNotMatch(fs.readFileSync(tool, 'utf8'), /green|architecture/, 'no clause fitted to one plate');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
