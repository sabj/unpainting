import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { applyDrawPlan, checkDrawPlan } from './draw-plan-stage.mjs';

const optOf = o => (k, d) => (k in o ? o[k] : d);

test('without --drawplan nothing changes', async () => {
  const argv = [];
  assert.equal(checkDrawPlan({ opt: optOf({}), argv0: [], root: '.' }), false);
  assert.equal(await applyDrawPlan({ opt: optOf({}), argv, root: '.', out: '.', sheetMm: 280, noPenSubject: false }), null);
  assert.deepEqual(argv, []);
});

test('a typed line file, linked stages or an area plan beside --drawplan stops the run', () => {
  for (const [k, v] of [['drawingfile', 'x'], ['drawinglast', 'y'], ['linework', 'auto'], ['stages', 'prepink']])
    assert.throws(() => checkDrawPlan({ opt: optOf({ drawplan: 'p.json' }), argv0: ['--drawplan', 'p.json', `--${k}`, v], root: '.' }), new RegExp(`--${k}`));
  assert.throws(() => checkDrawPlan({ opt: optOf({ drawplan: 'p.json', areaplan: 'a.json' }), argv0: [], root: '.' }), /area plan/);
});

test('a value plan family with a drawingRole stops the run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawplan-')), vp = path.join(dir, 'v.json');
  fs.writeFileSync(vp, JSON.stringify({ families: [{ id: 'dog', drawingRole: 'focal' }] }));
  assert.throws(() => checkDrawPlan({ opt: optOf({ drawplan: 'p.json', valueplan: vp }), argv0: [], root: '.' }), /dog/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--drawplan gives meaning only: it is validated and returned, nothing is selected; no pen, --drawing none or a bad plan stop the run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawplan-')), img = path.join(dir, 't.png'), W = 150, H = 100;
  await sharp(Buffer.alloc(W * H * 3, 240), { raw: { width: W, height: H, channels: 3 } }).png().toFile(img);
  const mm = 280 / W, sha = createHash('sha256').update(fs.readFileSync(img)).digest('hex');
  const plan = { version: 1, target: { sha256: sha, width: W, height: H }, sheet: { widthMm: 280, heightMm: 280 * H / W }, reachMm: 5, medium: 'ink', reason: 'test', leftToWash: [],
    lines: [{ id: 'rail', what: 'the rail', role: 'contour', stage: 'opening', weight: 'medium', path: [[20 * mm, 50 * mm], [130 * mm, 50 * mm]] }] };
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan));
  const o = extra => optOf({ drawplan: path.join(dir, 'plan.json'), image: img, drawing: 'both', ...extra });
  const r = await applyDrawPlan({ opt: o({}), root: '/', sheetMm: 280, noPenSubject: false });
  assert.equal(r.lines[0].id, 'rail');
  await assert.rejects(applyDrawPlan({ opt: o({ subjectmedium: 'none' }), root: '/', sheetMm: 280, noPenSubject: true }), /no pen/);
  await assert.rejects(applyDrawPlan({ opt: o({ drawing: 'none' }), root: '/', sheetMm: 280, noPenSubject: false }), /--drawing is none/);
  await assert.rejects(applyDrawPlan({ opt: o({}), root: '/', sheetMm: 200, noPenSubject: false }), /sheet/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a semantic plan beside the value plan is read by default', async () => {
  const { drawPlanPath } = await import('./draw-plan-stage.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawplan-auto-'));
  try {
    const valueplan = path.join(dir, 'config.json'), file = path.join(dir, 'drawing-plan.json');
    assert.equal(drawPlanPath(optOf({ valueplan }), dir), null);
    fs.writeFileSync(file, '{}');
    assert.equal(drawPlanPath(optOf({ valueplan }), dir), file);
    assert.equal(drawPlanPath(optOf({ valueplan, drawplan: 'none' }), dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
