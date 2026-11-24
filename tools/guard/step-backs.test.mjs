// Default mode looks at shape scale only (src/paint/step-backs.mjs): each passage takes one look of its own, no step-back
// is planned (the touch-up and accent rounds were removed in 0.4), and each shape is read once. Strict mode takes no look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const SVG = '<svg width="96" height="72"><rect width="96" height="72" fill="#faf7ef"/><rect x="6" y="6" width="56" height="44" fill="#c98a4a"/><rect x="44" y="28" width="40" height="36" fill="#473c32"/><circle cx="24" cy="54" r="10" fill="#7796b0"/><rect x="70" y="8" width="3" height="3" fill="#201810"/></svg>';

async function paint(dir, extra) {
  const target = path.join(dir, 'target.png'), out = path.join(dir, 'paint-' + extra.join('').replace(/\W/g, ''));
  if (!fs.existsSync(target)) await sharp(Buffer.from(SVG)).png().toFile(target);
  // Segmentation is not under test: --segments off keeps the run free of the SAM python and checkpoint.
  const args = ['tools/paint-plate.mjs', '--allowdirty', '1', '--image', target, '--washplan', target, '--width', '96', '--scale', '1', '--sheetmm', '152.4', '--mode', 'fast', '--gpu', 'off', '--threads', '1',
    '--drawing', 'none', '--frames', '0', '--video', '0', '--segments', 'off', '--out', out, ...extra];
  try { execFileSync(process.execPath, args, { cwd: new URL('../../', import.meta.url), env: { ...process.env, W2_CACHE_DIR: path.join(dir, 'cache') }, stdio: 'pipe', timeout: 580000 }); }
  catch (e) { throw Error(String(e.stdout).split('\n').slice(-20).join('\n') + String(e.stderr)); }
  return { guard: JSON.parse(fs.readFileSync(path.join(out, 'target-guard.json'), 'utf8')), steps: JSON.parse(fs.readFileSync(path.join(out, 'step-backs.json'), 'utf8')), png: fs.readFileSync(path.join(out, 'painting.png')) };
}

test('default mode looks at shape scale only in its planned step-backs (a passage takes no look: its mix is one colour for the shape, from the study); strict takes none', { timeout: 1260000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-backs-'));
  try {
    const d = await paint(dir, []);
    assert.deepEqual(d.steps.planned, [], 'no step-back is planned');
    assert.deepEqual(d.steps.taken, [], 'none is taken');
    assert.equal(d.steps.passageLooks, 0, 'a passage takes no look at the subject');
    assert.equal(d.guard.looks.count, d.steps.shapeLooks, 'every look the guard saw was inside a step-back');
    const s = await paint(dir, ['--notargetlooks', '1']);
    assert.equal(s.guard.looks.count, 0);
    assert.equal(s.steps.shapeLooks + s.steps.passageLooks, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
