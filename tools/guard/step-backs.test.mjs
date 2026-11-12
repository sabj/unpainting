// Default mode looks only at its planned step-backs (src/paint/step-backs.mjs): a painting takes no more step-backs than
// it planned before the first mark, each shape is read once, and no look is taken outside a step-back (no passage
// charge look, no second touch-up round that looks again at what the first corrected). Strict mode takes none.
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
  const args = ['tools/paint-plate.mjs', '--allowdirty', '1', '--image', target, '--width', '96', '--scale', '1', '--sheetmm', '152.4', '--mode', 'fast', '--gpu', 'off', '--threads', '1',
    '--drawing', 'none', '--touchpoints', '2', '--finaldarks', '1', '--frames', '0', '--video', '0', '--segments', 'off', '--out', out, ...extra];
  try { execFileSync(process.execPath, args, { cwd: new URL('../../', import.meta.url), env: { ...process.env, W2_CACHE_DIR: path.join(dir, 'cache') }, stdio: 'pipe', timeout: 240000 }); }
  catch (e) { throw Error(String(e.stdout).split('\n').slice(-20).join('\n') + String(e.stderr)); }
  return { guard: JSON.parse(fs.readFileSync(path.join(out, 'target-guard.json'), 'utf8')), steps: JSON.parse(fs.readFileSync(path.join(out, 'step-backs.json'), 'utf8')), png: fs.readFileSync(path.join(out, 'painting.png')) };
}

test('default mode takes no more looks than its planned step-backs; strict takes none', { timeout: 600000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-backs-'));
  try {
    const d = await paint(dir, []);
    assert.deepEqual(d.steps.planned.map(p => p.id), ['washes', 'accents'], 'planned before painting from --touchpoints and --finaldarks');
    assert.ok(d.steps.taken.length <= d.steps.planned.length, 'no step-back beyond the plan');
    const ids = d.steps.taken.map(t => t.id);
    assert.equal(ids[0], 'washes');
    assert.ok(ids.every(id => d.steps.planned.some(p => p.id === id)) && new Set(ids).size === ids.length, `each taken once and planned: ${ids}`);
    assert.ok(d.steps.shapeLooks > 0, 'default mode does look at its step-backs');
    assert.equal(d.guard.looks.count, d.steps.shapeLooks, 'every look the guard saw was inside a step-back');
    const labels = d.guard.looks.entries.map(e => e.label);
    assert.equal(new Set(labels).size, labels.length, 'each shape is read once');
    assert.ok(labels.every(l => /^(touch|darks)\//.test(l)), `only step-back reads: ${labels.join(' ')}`);
    const s = await paint(dir, ['--notargetlooks', '1']);
    assert.equal(s.guard.looks.count, 0);
    assert.equal(s.steps.shapeLooks, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
