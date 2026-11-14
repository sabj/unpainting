// --subjectmedium: a picture with no pen lines is not drawn in ink.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SUBJECT_MEDIA, subjectMediumOf, drawingForSubject, argvForSubject, subjectMediumNote } from './subject-medium.mjs';
import { expandRecipe } from './recipe.mjs';

const flags = argv => { const m = new Map(); for (let i = 0; i < argv.length;) { const k = argv[i++]; m.set(k, i < argv.length && !argv[i].startsWith('--') ? argv[i++] : true); } return m; };

test('the option takes none, pencil or pen and nothing else', () => {
  assert.deepEqual([...SUBJECT_MEDIA], ['none', 'pencil', 'pen']);
  assert.equal(subjectMediumOf(['--width', '90']), null);
  assert.equal(subjectMediumOf(['--subjectmedium', 'pen', '--subjectmedium', 'pencil']), 'pencil');
  assert.throws(() => subjectMediumOf(['--subjectmedium', 'ink']), /none, pencil, pen/);
  assert.throws(() => subjectMediumOf(['--subjectmedium']), /none, pencil, pen/);
});

test('an ink drawing section on a subject with no pen is removed without substituting graphite', () => {
  for (const medium of ['none', 'pencil']) {
    const r = drawingForSubject({ medium: 'ink', inkColor: 'black', ink: { waterproof: true }, closingLines: 0.6, resolution: 2, amount: 0.5, lines: 'contours' }, medium);
    assert.deepEqual(r, { drawing: { amount: 0.5, lines: 'contours', medium: 'none', closingLines: 0 }, asked: 'ink' });
    assert.equal(drawingForSubject({ medium: 'auto' }, medium).drawing.medium, 'none');
    assert.deepEqual(drawingForSubject({ stages: { prep: {}, finishInk: {} }, weight: 0.4 }, medium), { drawing: { weight: 0.4, medium: 'none', closingLines: 0 }, asked: 'ink' });
  }
});

test('an opening-only graphite drawing, no drawing, a pen subject and a run without the option are left exactly as written', () => {
  const ink = { medium: 'ink', inkColor: 'sepia', closingLines: 0.5 };
  for (const medium of ['pen', null]) assert.equal(drawingForSubject(ink, medium).drawing, ink);
  for (const d of [{ medium: 'graphite', weight: 0.3 }, { medium: 'graphite', closingLines: 0 }, { medium: 'none' }, { amount: 0.4 }, { stages: { prep: {} } }, null]) {
    const r = drawingForSubject(d, 'pencil');
    assert.equal(r.drawing, d); assert.equal(r.asked, null);
  }
  const argv = ['--outlinemedium', 'ink', '--drawing', 'both', '--drawinglast', 'c', '--inkprofile', 'black-ink'];
  for (const medium of ['pen', null]) assert.equal(argvForSubject(argv, medium).argv, argv);
  for (const quiet of [['--outlinemedium', 'graphite', '--drawing', 'first', '--drawingfile', 'o'], ['--drawingfile', 'o'], ['--outlinemedium', 'ink', '--drawing', 'none'], ['--outlinemedium', 'none'], ['--width', '90']]) {
    const r = argvForSubject(quiet, 'pencil');
    assert.equal(r.argv, quiet); assert.equal(r.asked, null);
  }
});

test('ink left in the arguments is removed without graphite substitution, and pen-only options are dropped', () => {
  const r = argvForSubject(['--width', '90', '--outlinemedium', 'ink', '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--inkprofile', 'black-ink', '--washinkfree', '1', '--drawinghand', '1', '--stages', 'prep,finishInk', '--video'], 'none');
  const f = flags(r.argv);
  assert.equal(r.asked, 'ink');
  assert.equal(f.get('--outlinemedium'), 'none');
  assert.equal(f.get('--drawing'), 'none');
  assert.equal(f.get('--drawingfile'), undefined);
  assert.equal(f.get('--stages'), undefined);
  assert.equal(f.get('--width'), '90');
  assert.equal(f.get('--video'), true);
  for (const k of ['--drawinglast', '--inkprofile', '--washinkfree', '--drawinghand']) assert.ok(!f.has(k), k);
  assert.deepEqual(r.dropped, ['--drawingfile', '--drawinglast', '--inkprofile', '--washinkfree', '--drawinghand', '--stages']);
  assert.equal(argvForSubject(['--outlinemedium', 'auto'], 'pencil').asked, 'auto');
  assert.equal(flags(argvForSubject(['--outlinemedium', 'auto'], 'pencil').argv).get('--drawing'), 'none');
  const off = argvForSubject(['--outlinemedium', 'graphite', '--drawing', 'none', '--inkprofile', 'black-ink'], 'pencil', { planAsked: 'ink' });
  assert.equal(flags(off.argv).get('--drawing'), 'none', 'a plan that draws nothing still draws nothing');
  assert.match(subjectMediumNote('pencil', 'ink'), /subject medium pencil: .*ink drawing request is removed, without substituting graphite/);
});

test('a drawing that asks for no medium, or for graphite, on a subject with no pen is opening only: no closing lines', () => {
  for (const medium of ['none', 'pencil']) {
    for (const given of [['--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c'], ['--outlinemedium', 'graphite', '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--drawinghand', '1'], ['--drawing', 'last', '--drawingfile', 'o']]) {
      const r = argvForSubject(given, medium), f = flags(r.argv);
      assert.equal(r.asked, 'graphite');
      assert.equal(f.get('--drawing'), 'first');
      assert.equal(f.get('--drawingfile'), 'o');
      assert.ok(!f.has('--drawinglast') && !f.has('--drawinghand'));
      assert.ok(!f.has('--outlinemedium') || f.get('--outlinemedium') === 'graphite');
    }
    assert.deepEqual(drawingForSubject({ medium: 'graphite', closingLines: 0.5, weight: 0.3 }, medium), { drawing: { medium: 'graphite', closingLines: 0, weight: 0.3 }, asked: 'graphite' });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subject-medium-'));
  try {
    const plan = path.join(dir, 'config.json');
    fs.writeFileSync(plan, JSON.stringify({}));
    const r = expandRecipe({ argv: ['--recipe', 'none', '--valueplan', plan, '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--subjectmedium', 'pencil'], root: dir }), f = flags(r.argv);
    assert.equal(f.get('--drawing'), 'first');
    assert.ok(!f.has('--drawinglast'));
    assert.equal(r.subjectMedium.asked, 'graphite');
    fs.writeFileSync(plan, JSON.stringify({ drawing: { medium: 'graphite', closingLines: 0.5 } }));
    const g = flags(expandRecipe({ argv: ['--recipe', 'none', '--valueplan', plan, '--drawingfile', 'o', '--drawinglast', 'c', '--subjectmedium', 'none'], root: dir }).argv);
    assert.equal(g.get('--drawing'), 'first');
    assert.ok(!g.has('--drawinglast') && !g.has('--closingedgemin'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('recipe none: a value plan that asks for ink cannot put ink on a subject with no pen, whatever the other arguments say', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subject-medium-'));
  try {
    const plan = path.join(dir, 'config.json');
    fs.writeFileSync(plan, JSON.stringify({ drawing: { medium: 'ink', inkColor: 'black', closingLines: 0.5 } }));
    const base = ['--recipe', 'none', '--valueplan', plan, '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--outlinemedium', 'graphite'];
    const before = flags(expandRecipe({ argv: base, root: dir }).argv);
    assert.equal(before.get('--outlinemedium'), 'ink', 'without the option the plan section wins, as before');
    assert.equal(before.get('--drawing'), 'both');
    assert.deepEqual(expandRecipe({ argv: [...base, '--subjectmedium', 'pen'], root: dir }).argv.filter(a => a !== '--subjectmedium' && a !== 'pen'), expandRecipe({ argv: base, root: dir }).argv);
    for (const medium of ['none', 'pencil']) {
      const r = expandRecipe({ argv: [...base, '--subjectmedium', medium], root: dir }), f = flags(r.argv);
      assert.equal(f.get('--outlinemedium'), 'none');
      assert.equal(f.get('--drawing'), 'none');
      assert.equal(f.get('--drawingfile'), undefined);
      assert.equal(f.get('--subjectmedium'), medium);
      for (const k of ['--drawinglast', '--inkprofile', '--closingedgemin']) assert.ok(!f.has(k), k);
      assert.equal(r.subjectMedium.asked, 'ink');
    }
    fs.writeFileSync(plan, JSON.stringify({ drawing: { medium: 'none' } }));
    assert.equal(flags(expandRecipe({ argv: [...base, '--subjectmedium', 'pencil'], root: dir }).argv).get('--drawing'), 'none');
    fs.writeFileSync(plan, JSON.stringify({}));
    const ext = expandRecipe({ argv: ['--recipe', 'none', '--valueplan', plan, '--outlinemedium', 'ink', '--drawing', 'both', '--drawinglast', 'c', '--subjectmedium', 'pencil'], root: dir });
    assert.equal(flags(ext.argv).get('--outlinemedium'), 'none');
    assert.equal(ext.subjectMedium.asked, 'ink');
    assert.equal(expandRecipe({ argv: base, root: dir }).subjectMedium, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the subject reads as pen by its declared medium, else by its measured pen line at the outline threshold', async () => {
  const { readsAsPen } = await import('./subject-medium.mjs');
  assert.equal(readsAsPen({ argv: ['--subjectmedium', 'pen'], penShare: 0, threshold: 0.5 }), true);
  assert.equal(readsAsPen({ argv: ['--subjectmedium', 'pencil'], penShare: 0.05, threshold: 0.5 }), false);
  assert.equal(readsAsPen({ argv: [], penShare: 0.00559, threshold: 0.5 }), true);
  assert.equal(readsAsPen({ argv: [], penShare: 0.00084, threshold: 0.5 }), false);
});
