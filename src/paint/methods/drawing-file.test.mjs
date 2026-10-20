import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inkHand, selectedDrawing, noDrawingDeclared } from './drawing-file.mjs';
import { bindLineTarget } from '../../crop/lines.mjs';

const line = pts => ({ weight: 1, points: pts.map(([x, y]) => ({ x, y, s: 0.6, nw: 2 })) });

test('a stroke sets down with a pooled drop, presses in and lifts off', () => {
  const g = inkHand(line(Array.from({ length: 41 }, (_, k) => [k, 0])));
  const P = g.points;
  assert.ok(P[0].dwell > 0 && P.slice(1).every(q => !q.dwell));
  assert.ok(P[0].s < P[20].s && P[40].s < P[20].s, 'pressure is lower at both ends');
  assert.ok(P[0].nw < P[20].nw && P[40].nw < P[20].nw, 'and so is the contact width');
  assert.equal(P[20].s, 0.6);
  assert.deepEqual(P.map(q => [q.x, q.y]), line(Array.from({ length: 41 }, (_, k) => [k, 0])).points.map(q => [q.x, q.y]));
});

test('the hand slows on a curve and runs faster along a straight', () => {
  const corner = [...Array.from({ length: 21 }, (_, k) => [k, 0]), ...Array.from({ length: 20 }, (_, k) => [20, k + 1])];
  const g = inkHand(line(corner));
  const atCorner = g.points[20].v, straight = g.points[10].v;
  assert.ok(atCorner < straight, `${atCorner} at the corner, ${straight} on the straight`);
  assert.ok(straight > 1.9 - 1.1 * 0.6, 'a straight run is faster than the plain pen');
});

const flagsOf = args => { const opt = (n, d) => { const i = args.lastIndexOf('--' + n); return i >= 0 ? args[i + 1] : d; }; return { opt, num: (n, d) => Number(opt(n, d)) }; };

test('a first pen that selects no line from a named drawing fails the run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-file-'));
  try {
    fs.writeFileSync(path.join(dir, 'empty-lines.json'), JSON.stringify({ image: { w: 100, h: 100 }, lines: [] }));
    const f = flagsOf(['--drawingfile', path.join(dir, 'empty')]);
    assert.throws(() => selectedDrawing({ first: true, w: 100, h: 100, ...f, log: () => {}, walked: 7 }), /selected 0 of 0 lines/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an empty opening file the linked stages marked as meant lays no ink and does not fail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-file-'));
  try {
    fs.writeFileSync(path.join(dir, 'stage-prepink-lines.json'), JSON.stringify({ image: { w: 100, h: 100 }, lines: [], empty: 'the plan has a prep pencil and no prepInk stage' }));
    const logs = [];
    const r = selectedDrawing({ first: true, w: 100, h: 100, ...flagsOf(['--drawingfile', path.join(dir, 'stage-prepink')]), log: m => logs.push(m), walked: 7 });
    assert.deepEqual(r, []);
    assert.match(logs.at(-1), /no opening ink, since the plan has a prep pencil/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a pure-watercolor drawing explicitly declaring no medium lays no opening or closing ink', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-file-'));
  try {
    const base = path.join(dir, 'watercolor');
    fs.writeFileSync(`${base}-lines.json`, JSON.stringify({ image: { w: 300, h: 244 }, lines: [], medium: 'none' }));
    for (const first of [true, false]) {
      const flags = flagsOf([first ? '--drawingfile' : '--drawinglast', base]);
      assert.deepEqual(selectedDrawing({ first, w: 540, h: 439, ...flags, log: () => {}, walked: 7 }), []);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a no-medium declaration wins over the drawing logic, the closing scribble and the target check, for both pens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-file-'));
  try {
    const base = path.join(dir, 'watercolor');
    fs.writeFileSync(`${base}-lines.json`, JSON.stringify({ image: { w: 300, h: 244 }, targetSHA256: 'f'.repeat(64), lines: [], medium: 'none' }));
    const w = 64, h = 52, D = new Float32Array(w * h).fill(2); // a dark field the closing scribble would state
    bindLineTarget({ sha256: '0'.repeat(64), w: 100, h: 100 }); // another target and aspect: the loader would refuse it
    try {
      for (const args of [
        ['--drawingfile', base, '--drawinglogic', '3'],
        ['--drawingfile', base, '--drawinglogic', '2'],
        ['--drawingfile', base],
      ]) {
        const logs = [];
        assert.deepEqual(selectedDrawing({ first: true, w, h, ...flagsOf(args), log: m => logs.push(m), walked: 7, D }), [], args.join(' '));
        assert.match(logs.at(-1), /no opening ink, since the drawing explicitly declares medium none/);
      }
      for (const args of [
        ['--drawinglast', base, '--drawinglastlogic', '3'],
        ['--drawinglast', base, '--drawinglogic', '3'],
        ['--drawinglast', base, '--finishmasses', '1'],
      ]) {
        const logs = [];
        assert.deepEqual(selectedDrawing({ first: false, w, h, ...flagsOf(args), log: m => logs.push(m), walked: 7, D }), [], args.join(' '));
        assert.match(logs.at(-1), /closing pen: no closing ink, since the drawing explicitly declares medium none/);
      }
    } finally { bindLineTarget(null); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('noDrawingDeclared counts only files with no lines; the stage marker only for the opening pen', () => {
  assert.equal(noDrawingDeclared({ lines: [], medium: 'none' }, { first: false }), 'the drawing explicitly declares medium none');
  assert.equal(noDrawingDeclared({ lines: [], empty: 'pencil only' }, { first: true }), 'pencil only');
  assert.equal(noDrawingDeclared({ lines: [], empty: 'pencil only' }, { first: false }), null);
  assert.equal(noDrawingDeclared({ lines: [{ points: [[0, 0]] }], medium: 'none' }), null);
  assert.equal(noDrawingDeclared({ lines: [] }), null);
  assert.equal(noDrawingDeclared({ medium: 'none' }), null);
});

test('a no-medium declaration cannot hide malformed or filtered-out drawing paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-file-'));
  try {
    const base = path.join(dir, 'invalid');
    for (const lines of [[{ points: [[0, 0]] }], [{ role: 'detail', points: [[0, 0], [50, 50]] }]]) {
      fs.writeFileSync(`${base}-lines.json`, JSON.stringify({ image: { w: 100, h: 100 }, lines, medium: 'none' }));
      const flags = flagsOf(['--drawingfile', base, '--drawingskip', 'detail']);
      assert.throws(() => selectedDrawing({ first: true, w: 100, h: 100, ...flags, log: () => {}, walked: 7 }), /selected 0 of 0 lines/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
