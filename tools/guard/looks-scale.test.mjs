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

test('fix 5: closing-ink and --linesupport keep or drop each line whole, never cut point by point', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-closing-'));
  try {
    // a target with one dark line along row 20; one planned line runs three quarters along it, one a quarter
    const target = path.join(dir, 't.png'), src = path.join(dir, 'in.json'), out = path.join(dir, 'out.json');
    await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="#f0eee8"/><rect x="0" y="19.5" width="80" height="1" fill="#202020"/></svg>')).png().toFile(target);
    const pts = (on, total = 40) => Array.from({ length: total }, (_, k) => [10 + k * 1.5, k < on ? 20 : 30]);
    fs.writeFileSync(src, JSON.stringify({ image: { w: 80, h: 40 }, lines: [{ points: pts(30), width: 2, weight: 0.8 }, { points: pts(10), width: 2, weight: 0.8 }] }));
    execFileSync(process.execPath, [path.join(ROOT, 'bench/v4v5/tools/closing-ink.mjs'), src, target, '0,0,80,40', out], { cwd: ROOT, stdio: 'pipe' });
    const { lines } = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(lines.length, 1, 'the mostly supported line is kept, the mostly unsupported one dropped');
    assert.equal(lines[0].points.length, 40, 'kept whole, not cut where support lapses');
    assert.equal(lines[0].weights, undefined, 'one weight per line');
    const { holdLinesToTarget } = await import('../../src/paint/methods/ink-lines.mjs');
    const w = 80, h = 40, L = new Float32Array(w * h).fill(90); for (let x = 0; x < w; x++) L[20 * w + x] = 30;
    const r = holdLinesToTarget([{ points: pts(30).map(([x, y]) => [x, y + 0.5]) }], L, w, h, { threshold: 6 });
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0].points.length, 40, '--linesupport keeps the line whole');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
