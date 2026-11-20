import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

// A small whole run of the painter with a prepared drawing in two ink stages (the wash recipe's prepink and finishink):
// both pens lay the drawing's vector strokes, carried into each stage file, and a drawing with no vectors stops the run.
const run = (args, cwd) => execFileSync(process.execPath, ['tools/paint-plate.mjs', '--allowdirty', '1', '--width', '48', '--scale', '1', '--sheetmm', '48', '--mode', 'fast', '--gpu', 'off', '--threads', '1', '--feedback', '0', '--notargetlooks', '1', '--targetguard', 'strict', '--frames', '0', '--video', '0', '--segments', 'off', ...args], { cwd, stdio: 'pipe', timeout: 240000 }).toString();

test('a two-stage pen run lays the drawing\'s vector strokes in both stages; no vectors, no run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-vectors-run-')), cwd = new URL('../../../', import.meta.url);
  try {
    const target = path.join(dir, 'target.png'), out = path.join(dir, 'paint'), stem = path.join(dir, 'set');
    await sharp(Buffer.from('<svg width="48" height="36"><rect width="48" height="36" fill="#faf7ef"/><rect x="6" y="6" width="30" height="22" fill="#9db0c0"/></svg>')).png().toFile(target);
    const lines = Array.from({ length: 6 }, (_, i) => ({ seq: i, points: [[6, 6 + 4 * i], [40, 6 + 4 * i]], width: 1, weight: 1, role: 'pen stroke', length: 34 }));
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify({ image: { w: 48, h: 36 }, inputKind: 'drawing', medium: 'ink', lines }));
    const strokes = lines.map(l => ({ seq: l.seq, line: l.seq, dark: 1, path: [[6.5, 6.5 + 4 * l.seq], [40.5, 6.5 + 4 * l.seq]], widths: [0.6, 0.6], outline: [[[6, 6.2 + 4 * l.seq], [41, 6.2 + 4 * l.seq], [41, 6.8 + 4 * l.seq], [6, 6.8 + 4 * l.seq]]] }));
    fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify({ sheetMm: 48, heightMm: 36, medium: 'ink', fills: 'marked', strokes }));
    const log = run(['--image', target, '--washplan', target, '--drawingfile', stem, '--inkrecipe', 'wash', '--stages', 'prepink,finishink', '--prepinkkeep', '1', '--prepinkadd', '0', '--prepinkdeviate', '0', '--out', out], cwd);
    const laid = log.split('\n').filter(l => l.startsWith('ink vectors:'));
    assert.equal(laid.length, 2, `both pens lay vectors:\n${log.split('\n').slice(-30).join('\n')}`);
    assert.ok(fs.existsSync(path.join(out, 'ink-vectors.json')) && fs.existsSync(path.join(out, 'ink-vectors-closing.json')));
    fs.rmSync(`${stem}-vectors.json`);
    assert.throws(() => run(['--image', target, '--washplan', target, '--drawingfile', stem, '--inkrecipe', 'wash', '--out', out + '2'], cwd), /no vector strokes beside it/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
