import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gpuPaints, refuseExtraGpuPaint, gpuPaintCount, cacheDirFor, switchesOf, segEnvFor, mainCheckoutOf, segPythonFor, collectResults } from './run.mjs';

const PS = ` 101 node --max-old-space-size=18432 tools/paint-plate.mjs --gpu on --image a.png
 102 /opt/bin/node tools/paint-plate.mjs --image b.png
 103 node --max-old-space-size=13312 tools/paint-plate.mjs --gpu off --valuepreviewonly 1
 104 zsh -c node tools/paint-plate.mjs --gpu on
 105 node tools/paint/cli.mjs kasha paint`;

test('GPU paintings are painter processes that are not --gpu off; one over --jobs is refused', () => {
  assert.deepEqual(gpuPaints(PS).map(p => p.pid), [101, 102]);
  assert.throws(() => refuseExtraGpuPaint(2, PS), /2 GPU paintings are already running \(pids 101, 102\)/);
  assert.equal(refuseExtraGpuPaint(4, PS), 2); assert.equal(gpuPaintCount(PS), 2);
  assert.equal(refuseExtraGpuPaint(2, PS.split('\n').slice(1).join('\n')), 1);
});

test('the cache folder is keyed on the experiment switches', () => {
  const a = cacheDirFor('/c', {}), b = cacheDirFor('/c', { X_NO_CHARGES: '1' }), c = cacheDirFor('/c', { X_NO_CHARGES: '0' });
  assert.equal(a, path.join('/c', 'paint-plain')); assert.notEqual(b, a); assert.notEqual(b, c);
  assert.equal(cacheDirFor('/c', { X_NO_CHARGES: '1' }), b);
  assert.deepEqual(switchesOf({ X_B: '2', PATH: '/bin', X_A: '1', x_lower: 'no' }), { X_A: '1', X_B: '2' });
});

test('segmentation is found in the main checkout or a sibling when the worktree has none; nothing is invented', () => {
  const root = '/repo/work/lead', has = new Set(['/repo/.venv-seg/bin/python', '/repo/work/other/work/models/sam_vit_b_01ec64.pth']);
  const env = segEnvFor(root, {}, f => has.has(f), () => ['/repo/work/lead', '/repo/work/other']);
  assert.deepEqual(env, { PAINTER_SEG_PYTHON: '/repo/.venv-seg/bin/python', PAINTER_SAM_CHECKPOINT: '/repo/work/other/work/models/sam_vit_b_01ec64.pth' });
  assert.deepEqual(segEnvFor(root, { PAINTER_SEG_PYTHON: '/p', PAINTER_SAM_CHECKPOINT: '/c' }, f => has.has(f), () => []), {});
  assert.deepEqual(segEnvFor(root, {}, () => false, () => []), {});
});

test('a worktree at any depth finds its main checkout through git, and segmentation there', () => {
  const root = '/repo/.claude/worktrees/fix', files = { '/repo/.claude/worktrees/fix/.git': 'gitdir: /repo/.git/worktrees/fix\n', '/repo/.git/worktrees/fix/commondir': '../..\n' };
  const read = f => { if (!(f in files)) throw new Error(`no ${f}`); return files[f]; };
  assert.equal(mainCheckoutOf(root, read), '/repo');
  assert.equal(mainCheckoutOf('/repo', read), null, 'a main checkout, whose .git is a folder');
  const has = new Set(['/repo/.venv-seg/bin/python']);
  assert.deepEqual(segEnvFor(root, {}, f => has.has(f), () => [], r => mainCheckoutOf(r, read)), { PAINTER_SEG_PYTHON: '/repo/.venv-seg/bin/python' });
  assert.deepEqual(segEnvFor(root, {}, () => false, () => [], r => mainCheckoutOf(r, read)), {});
});

test('the segmentation python: the environment\'s, else the checkout\'s own place when none is found', () => {
  assert.equal(segPythonFor('/nowhere/at/all', { PAINTER_SEG_PYTHON: '/p' }), '/p');
  assert.equal(segPythonFor('/nowhere/at/all', {}), '/nowhere/at/all/.venv-seg/bin/python');
});

test('what a run folder holds is read back: a plan, a finished painting, an unfinished one', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-run-'));
  try {
    assert.equal(collectResults(d, 'plan').state, 'no plan');
    fs.writeFileSync(path.join(d, 'value-plan.json'), JSON.stringify({ summary: { shapes: 12, washes: 30, plannedStrokes: 400, stages: 4, layersOfStudy: [{ study: 'a.png', minMm2: 6, shapes: 12, washes: 20, strokes: 300 }] }, passes: [{ widestBrushMm: 7 }, { widestBrushMm: 25.4 }, {}] }));
    for (const n of [0, 2, 10]) fs.writeFileSync(path.join(d, `x-stage-${n}.png`), '');
    const plan = collectResults(d, 'plan');
    assert.equal(plan.state, 'plan only'); assert.equal(path.basename(plan.planPreview), 'x-stage-10.png');
    assert.deepEqual([plan.plan.shapes, plan.plan.washes, plan.plan.strokes, plan.plan.widestBrushMm], [12, 30, 400, 25.4]);
    assert.equal(plan.cheatRisk, null);
    fs.writeFileSync(path.join(d, 'f0003.jpg'), '');
    const part = collectResults(d, 'paint');
    assert.equal(part.state, 'unfinished'); assert.equal(path.basename(part.painting), 'f0003.jpg');
    fs.writeFileSync(path.join(d, 'painting.png'), ''); fs.mkdirSync(path.join(d, 'stages')); fs.writeFileSync(path.join(d, 'stages', 'strip.jpg'), '');
    fs.writeFileSync(path.join(d, 'cheat-risk.json'), JSON.stringify({ level: 'low', risk: 0.1, parts: { progression: 0, copy: 0.1, small: 0, pixelFit: 0 }, flags: [] }));
    const done = collectResults(d, 'paint');
    assert.equal(done.state, 'finished'); assert.equal(path.basename(done.painting), 'painting.png'); assert.ok(done.strip);
    assert.deepEqual(done.cheatRisk.parts, { progression: 0, copy: 0.1, small: 0, pixelFit: 0 });
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
