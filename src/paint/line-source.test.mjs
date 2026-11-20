import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lineSource } from './line-source.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-source-'));
const write = (name, doc) => { fs.writeFileSync(path.join(dir, `${name}-lines.json`), JSON.stringify(doc)); return path.join(dir, name); };
const prepared = write('prepared', { inputKind: 'drawing', medium: 'ink', image: { w: 10, h: 10 }, lines: [] });
const plan = write('plan', { image: { w: 10, h: 10 }, lines: [] });

test('no drawing file: no line, said loudly, never an extraction', () => {
  const r = lineSource({ drawing: 'first' });
  assert.equal(r.source, 'none');
  assert.equal(r.drawing, 'none');
  assert.match(r.warning, /NO LINE.*removed in 0.4/);
  assert.deepEqual(lineSource({ drawing: 'none' }), { source: 'none', drawing: 'none', file: null, warning: null });
});

test('a prepared drawing and plan lines are the two line sources', () => {
  assert.equal(lineSource({ drawing: 'first', drawingFile: prepared }).source, 'prepared drawing');
  assert.equal(lineSource({ drawing: 'first', drawingFile: plan }).source, 'plan lines');
  assert.throws(() => lineSource({ drawing: 'first', drawingFile: path.join(dir, 'missing') }), /no line file/);
});

test('a closing pen needs a closing file or a finish stage; without one it is skipped, loudly', () => {
  const r = lineSource({ drawing: 'both', drawingFile: prepared });
  assert.equal(r.drawing, 'first');
  assert.match(r.warning, /NO CLOSING LINE/);
  assert.equal(lineSource({ drawing: 'both', drawingFile: prepared, stages: 'prepink,finishink' }).warning, null);
  assert.equal(lineSource({ drawing: 'both', drawingFile: prepared, drawingLast: plan }).drawing, 'both');
});
