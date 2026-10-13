import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stagesFromFlags, chooseLineSource, planLinework } from './linework-plan.mjs';

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

test('auto picks source ink on a pen drawing, the sketch on a photograph when it can run, else the walker', () => {
  assert.equal(chooseLineSource('auto', { inkShare: 0.02, sketchAvailable: true }), 'source-ink');
  assert.equal(chooseLineSource('auto', { inkShare: 0.001, sketchAvailable: true }), 'photo-sketch');
  assert.equal(chooseLineSource('auto', { inkShare: 0.001, sketchAvailable: false }), 'none');
  assert.equal(chooseLineSource('photo-sketch', { inkShare: 0.02, sketchAvailable: false }), 'photo-sketch');
  assert.throws(() => chooseLineSource('hed', { inkShare: 0, sketchAvailable: false }), /--linesource/);
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

test('source-ink uses the observed-width copier when Python dependencies are available', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'linework-copy-'));
 try {
  // Fake the external planner, not its image extraction: verify CLI integration and provenance.
  const python=path.join(dir,'python');
  fs.writeFileSync(python, '#!/bin/sh\nif [ "$1" = "-c" ]; then exit 0; fi\nprintf "%s\\n" "$@" > "'+dir+'/called"\n');
  fs.chmodSync(python,0o755);
  const f=flags(['--linesource','source-ink','--image','drawing.png','--sketchpython',python,'--width','720']);
  const info=await planLinework({...f,out:dir,root:dir,inkShare:.02,log:()=>{}});
  assert.equal(info.extractor,'copy-lines');
  assert.equal(f.opt('inkprofile'),'drawing-ink');
  assert.match(fs.readFileSync(path.join(dir,'called'),'utf8'),/copy-lines\.py\n.*drawing\.png\n--out\n.*\n--width\n720/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
