import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke, candidateContact } from '../../src/media/brush.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { createWetTrace } from './wet-trace.mjs';

const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const sienna = boxPigment(BOX.find(p => p.key === 'sienna'));
const W = 64, H = 48;
const lane = y => [{ x: 8, y, r: 4, p: 1 }, { x: 56, y, r: 4, p: 1 }];

// two lanes of one passage lapped by a little, flowing between them, then a dry, then a third lane
function paint(trace, contact = candidateContact) {
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
  const t = trace ? createWetTrace({ file: trace, sheet, contact }) : null;
  const go = (b, pts) => (t ? t.stroke(b, sheet, pts, {}, (bb, s, p, o) => stroke(bb, s, p, o)) : stroke(b, sheet, pts, {}));
  t?.passage({ pass: 1, shape: 0, technique: 'wet on dry', move: 'wet on dry', value: 1 });
  for (const y of [14, 21]) {
    t?.lane();
    const b = createBrush({ flat: true, radius: 4, bristles: 12, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: y });
    dip(b, { water: 0.62, conc: [0.6] }); t?.dipped(b, true);
    go(b, lane(y));
    for (let q = 0; q < 20; q++) step(sheet, O);
  }
  if (t) t.dry([sheet, 20000, O, { levelMax: 140, dt: 14 }], (...a) => dry(...a)); else dry(sheet, 20000, O, { levelMax: 140, dt: 14 });
  t?.lane();
  const b = createBrush({ flat: true, radius: 4, bristles: 12, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 3 });
  dip(b, { water: 0.62, conc: [0.6] }); t?.dipped(b, true);
  go(b, lane(28));
  t?.close();
  return sheet;
}

test('the wet trace reads the sheet and never changes it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wet-trace-')), file = path.join(dir, 't.jsonl');
  const a = paint(null), b = paint(file), c = paint(file, null);
  for (const k of ['W', 's', 'M']) assert.deepEqual(Buffer.from(c[k].buffer), Buffer.from(a[k].buffer), `${k} with the measured footprint`);
  for (const k of ['W', 's', 'M', 'ever']) assert.deepEqual(Buffer.from(b[k].buffer), Buffer.from(a[k].buffer), k);
  assert.deepEqual(Buffer.from(b.G[0].buffer), Buffer.from(a.G[0].buffer));
  assert.equal(JSON.stringify(b.layers.map(l => Array.from(l[0] ?? []).reduce((s, v) => s + v, 0))), JSON.stringify(a.layers.map(l => Array.from(l[0] ?? []).reduce((s, v) => s + v, 0))));
  fs.rmSync(dir, { recursive: true });
});

test('the wet trace finds the lapped lane beside a stroke, its age on the sheet clock, and a dry between them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wet-trace-')), file = path.join(dir, 't.jsonl');
  paint(file);
  const recs = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const s = recs.filter(r => r.k === 's'), d = recs.filter(r => r.k === 'd');
  assert.ok(s.every(r => r.footprint === 'contact'), 'the footprint is the predicted contact');
  assert.equal(s.length, 3); assert.equal(d.length, 1);
  assert.equal(s[0].nb, null, 'the first lane has no neighbour');
  assert.equal(s[1].nb.id, 0, 'the second lane laps the first');
  assert.ok(Math.abs(s[1].nb.dt - 20 * O.dt) < 1e-6, `20 flow steps of dt ${O.dt} between them: ${s[1].nb.dt}`);
  assert.equal(s[1].nb.driedSince, false);
  assert.ok(s[1].nb.landW > 0 && s[1].nb.meanW > 0, 'the neighbour left water at the seam and some stands there when the next lane comes');
  assert.equal(s[2].nb.id, 1); assert.equal(s[2].nb.driedSince, true, 'the dry came between');
  assert.equal(s[2].nb.film, 0, 'after a dry no seam cell holds a film');
  assert.ok(d[0].before.filmCells > 0 && d[0].after.wetCells === 0, 'the dry took the standing water off');
  fs.rmSync(dir, { recursive: true });
});
