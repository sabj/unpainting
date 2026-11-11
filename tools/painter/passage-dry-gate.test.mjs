import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, setClip, dry, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke, candidateContact } from '../../src/media/brush.mjs';
import { measurePaper } from '../../src/paint/methods/wetdry.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { wetOnDryGate, passageReach, GATE_RING } from './passage-dry-gate.mjs';

// The painter's wet-on-dry flat wash brush and dip (tools/plate/paint.mjs), on a CPU sheet.
const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const sienna = boxPigment(BOX.find(p => p.key === 'sienna'));
const W = 72, H = 56, R = 4;
const brush = seed => createBrush({ flat: true, radius: R, bristles: 12, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, seed });
const lane = y => [{ x: 10, y, r: R, p: 1 }, { x: 62, y, r: R, p: 1 }];
const rect = (x0, y0, x1, y1) => { const m = new Uint8Array(W * H); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };

// One passage laid lane by lane through the gate, as the stroke wrapper does: the contact the gate reads, the wash's own
// contact (cleared by a dry), and a dry of the whole sheet when the gate asks for one.
function layPassage(sheet, ys, { texture = false, own = new Set() } = {}) {
  const passage = { start: true }, events = [];
  for (const [k, y] of ys.entries()) {
    const b = brush(11 + k), pts = lane(y);
    dip(b, { water: 0.62, conc: [0.6] });
    const c = candidateContact(b, sheet, pts, { upright: 'sweep', clip: null, neighborRadius: GATE_RING, includeTouched: false });
    const cells = c.cells.filter(i => !sheet.clip || sheet.clip[i]), neighbors = c.neighborIndices;
    const touches = c.cells.some(i => c.primaryMask[i] && own.has(i));
    const before = passageSeam(sheet, own, cells, neighbors);
    const g = wetOnDryGate({ cells, neighbors, own: { touches, has: i => own.has(i) }, texture, observeCells: [...cells, ...neighbors],
      passage: passage.start ? { start: true, reach: passageReach(sheet.clip, W, H) } : { start: false, reach: passageReach(sheet.clip, W, H) },
      measure: cs => measurePaper(sheet, cs, false, { stats: 'gate' }), dry: () => { dry(sheet, 30000, O, { levelMax: 140, dt: 14 }); own.clear(); } });
    passage.start = false;
    events.push({ lane: k, dried: g.dried, seamFilmBefore: before, seamFilmAt: passageSeam(sheet, own, cells, neighbors) });
    stroke(b, sheet, pts, { upright: 'sweep' });
    for (const i of c.cells) own.add(i);
  }
  return events;
}
// share of the cells beside the new stroke (its contact and ring) that the wash already holds as a film
function passageSeam(sheet, own, cells, neighbors) {
  let n = 0, f = 0;
  for (const i of [...cells, ...neighbors]) if (own.has(i)) { n++; if (sheet.W[i] >= DEFAULTS.filmDepth) f++; }
  return n ? f / n : null;
}

// the painter's lane step: 0.8 of a lane's width (--skylanestep .8)
const lanes = (y0, y1) => { const ys = []; for (let y = y0; y <= y1; y += 1.6 * R) ys.push(y); return ys; };

test('a passage beside another wash still wet waits for it once, before its first lane, never between its lanes', () => {
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
  // another passage, laid just now and still wet, a few cells below this one's clip
  const other = brush(3); dip(other, { water: 0.62, conc: [0.6] }); stroke(other, sheet, lane(48), { upright: 'sweep' });
  setClip(sheet, rect(6, 6, 66, 42));
  const ev = layPassage(sheet, lanes(10, 38));
  assert.ok(ev.length >= 5);
  assert.equal(ev[0].dried, true, 'the first lane waits for the neighbouring wash');
  assert.deepEqual(ev.slice(1).map(e => e.dried), ev.slice(1).map(() => false), 'and no later lane is held for a dry');
});

test('a lane is not held for a dry because the passage\'s own wash has spread past where its brush touched', () => {
  // a stub sheet: the last lane's water has run one cell past its predicted contact (cell 5); nothing else is wet
  const wetCells = new Set([4, 5]), own = new Set([4]);
  let dries = 0;
  const g = wetOnDryGate({ cells: [6, 7], neighbors: [5, 8], own: { touches: false, has: i => own.has(i) }, texture: false, observeCells: [5, 6, 7, 8],
    passage: { start: false, reach: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    measure: cs => ({ dry: !cs.some(i => wetCells.has(i)), waterMax: 0.05, saturationMax: 0.9 }), dry: () => { dries++; wetCells.clear(); } });
  assert.equal(g.dried, false); assert.equal(dries, 0);
});

test('a texture passage keeps its check before every stroke', () => {
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
  setClip(sheet, rect(6, 6, 66, 50));
  const ev = layPassage(sheet, [12, 12 + 2 * R], { texture: true });
  assert.equal(ev[1].dried, true, 'a texture mark beside wet paint waits for the dry');
});

test('the passage reach is its clip and the gate ring round it', () => {
  const clip = rect(10, 10, 12, 12), cells = new Set(passageReach(clip, W, H));
  assert.ok(cells.has(10 * W + 10) && cells.has(11 * W + 11));
  assert.ok(cells.has((10 - GATE_RING) * W + 10) && !cells.has((10 - GATE_RING - 1) * W + 10));
  assert.equal(passageReach(null, W, H), null);
});
