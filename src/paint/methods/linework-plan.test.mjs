import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stagesFromFlags, planLinework } from './linework-plan.mjs';

const flags = argv => ({ argv, opt: (n, d) => { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }, num: (n, d) => Number(flags(argv).opt(n, d)) });

test('no --stages plans the pens as before', () => {
  const f = flags([]);
  assert.equal(stagesFromFlags(f.opt, f.num), null);
  assert.equal(stagesFromFlags(flags(['--stages', 'none']).opt, f.num), null);
});

test('--stages reads each stage and its options', () => {
  const f = flags(['--stages', 'prep,prepink,finishink', '--prepamount', '0.4', '--prepinkfrom', 'prep', '--finishselect', 'darks', '--finishmethod', 'architecture']);
  const s = stagesFromFlags(f.opt, f.num);
  assert.equal(s.prep.amount, 0.4);
  assert.equal(s.prepInk.from, 'prep');
  assert.equal(s.prepInk.keep, 0.8);
  assert.equal(s.finishInk.select, 'darks');
  assert.equal(s.finishInk.method, 'architecture');
  assert.throws(() => stagesFromFlags(flags(['--stages', 'sketch']).opt, f.num), /--stages/);
});

test('stages over a given line file write the stage files and point the pens at them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-'));
  const lines = Array.from({ length: 20 }, (_, i) => ({ points: [[10, 10 + 8 * i], [190, 10 + 8 * i]], weight: 0.9, strength: 0.5 }));
  fs.writeFileSync(path.join(dir, 'set-lines.json'), JSON.stringify({ image: { w: 200, h: 180 }, lines }));
  const f = flags(['--drawingfile', path.join(dir, 'set'), '--stages', 'prep,prepink,finishink']);
  const info = await planLinework({ ...f, out: dir, root: dir, inkShare: 0, density: null, grid: { w: 200, h: 180 }, edges: () => [], log: () => {} });
  assert.equal(info.source, 'file');
  for (const k of ['prep', 'prepInk', 'finishInk']) assert(fs.existsSync(`${info.files[k]}-lines.json`));
  assert.equal(f.opt('drawingfile'), info.files.prepInk);
  assert.equal(f.opt('drawinglast'), info.files.finishInk);
  assert.equal(f.opt('drawing'), 'both');
  assert.equal(f.opt('outlinemedium'), 'ink');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a prep pencil with no prepInk stage gives the opening pen an empty file marked as meant', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-prep-'));
  try {
    const lines = Array.from({ length: 20 }, (_, i) => ({ points: [[10, 10 + 8 * i], [190, 10 + 8 * i]], weight: 0.9, strength: 0.5 }));
    fs.writeFileSync(path.join(dir, 'set-lines.json'), JSON.stringify({ image: { w: 200, h: 180 }, lines }));
    const f = flags(['--drawingfile', path.join(dir, 'set'), '--stages', 'prep,finishink']);
    const info = await planLinework({ ...f, out: dir, root: dir, inkShare: 0, density: null, grid: { w: 200, h: 180 }, edges: () => [], log: () => {} });
    const doc = JSON.parse(fs.readFileSync(`${info.files.prepInk}-lines.json`, 'utf8'));
    assert.deepEqual(doc.lines, []);
    assert.match(doc.empty, /no prepInk stage/);
    assert.equal(f.opt('drawingfile'), info.files.prepInk);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

