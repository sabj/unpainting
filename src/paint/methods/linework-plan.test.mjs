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

test('a staged run carries the drawing\'s vector strokes: each stage file has the strokes of the lines it holds', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-'));
  const lines = Array.from({ length: 20 }, (_, i) => ({ seq: i, points: [[10, 10 + 8 * i], [190, 10 + 8 * i]], weight: 0.9, strength: 0.5, width: 2 }));
  fs.writeFileSync(path.join(dir, 'set-lines.json'), JSON.stringify({ image: { w: 200, h: 180 }, inputKind: 'drawing', lines }));
  const sq = (y) => [[[1, y], [19, y], [19, y + 0.3], [1, y + 0.3]]];
  const strokes = lines.map(l => ({ seq: l.seq, line: l.seq, dark: 1, path: [[1, 1], [19, 1]], widths: [0.3, 0.3], outline: sq(1 + 0.8 * l.seq) }));
  fs.writeFileSync(path.join(dir, 'set-vectors.json'), JSON.stringify({ sheetMm: 20, heightMm: 18, medium: 'ink', strokes }));
  const f = flags(['--drawingfile', path.join(dir, 'set'), '--stages', 'prepink,finishink', '--prepinkkeep', '1', '--prepinkadd', '0', '--prepinkamount', '1', '--prepinkdeviate', '0']);
  const info = await planLinework({ ...f, out: dir, root: dir, inkShare: 0, density: null, grid: { w: 200, h: 180 }, edges: () => [], log: () => {} });
  for (const k of ['prepInk', 'finishInk']) {
    const v = JSON.parse(fs.readFileSync(`${info.files[k]}-vectors.json`, 'utf8')), L = JSON.parse(fs.readFileSync(`${info.files[k]}-lines.json`, 'utf8')).lines;
    assert.ok(v.strokes.length > 0 && v.strokes.length <= strokes.length, `${k}: ${v.strokes.length} strokes`);
    const held = new Set(L.map(l => l.seq)); assert.ok(v.strokes.every(s => held.has(s.line)), `${k}: only the strokes of its own lines`);
  }
  // the opening pen's file is the staged one, and it has its vectors beside it
  assert.ok(fs.existsSync(`${f.opt('drawingfile')}-vectors.json`) && fs.existsSync(`${f.opt('drawinglast')}-vectors.json`));
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

