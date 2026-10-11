// The structure planner's output (tools/seg/structure-lines.py) is an ordinary --drawingfile: the pen reads its
// three weights per point. The fixture is a trimmed plan of a synthetic facade (two lines per tier).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLines } from '../../src/crop/lines.mjs';
import { selectedDrawing } from '../../src/paint/methods/drawing-file.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const stem = path.join(here, 'fixtures', 'structure-facade');
const doc = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
const opts = { drawingfile: stem, drawstroke: '.35' };
const opt = (k, d) => (k in opts ? opts[k] : d);
const num = (k, d) => (k in opts ? Number(opts[k]) : d);

test('structure plan lines keep their role, per-point width and weight', () => {
  const lines = loadLines(stem, 320, 210, { keepOrder: true });
  assert.equal(lines.length, doc.lines.length);
  for (const g of lines) {
    assert.ok(['structure', 'opening', 'ornament'].includes(g.role));
    assert.ok(g.points.every(q => Number.isFinite(q.width) && Number.isFinite(q.weight)));
  }
});

test('the pen draws structure heavier than openings and openings heavier than ornament', () => {
  const strokes = selectedDrawing({ first: true, w: 320, h: 210, opt, num, log: () => {}, walked: 0 });
  assert.ok(strokes.length >= doc.lines.length);
  const byRole = role => doc.lines.filter(g => g.tier === role).flatMap(g => g.widths);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(byRole('structure')) > mean(byRole('opening')));
  assert.ok(mean(byRole('opening')) > mean(byRole('ornament')));
  const nibs = strokes.flatMap(s => s.points.map(q => q.nw)).filter(Number.isFinite);
  assert.ok(nibs.length > 0 && Math.max(...nibs) > Math.min(...nibs));
});
