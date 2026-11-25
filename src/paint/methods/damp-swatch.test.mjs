import test from 'node:test';
import assert from 'node:assert/strict';
import { isDampPassage, underOf, liftShare, dampScrap, dampCharge, DAMP_CHANNEL } from './damp-swatch.mjs';
import { scrapDelivery, swatchMask, swatchLanes, SWATCH } from './scrap-swatch.mjs';
import { markDelivery, markLayout, representativeMark, markKey, isMarkPassage } from './mark-swatch.mjs';
import { thickness } from '../../media/sheet.mjs';

const script = { passage: 'p2', into: 'p1', wait: 'damp', underShare: 0.9, underFilm: 0.6 };

test('only a painting script\'s passage that lies in its sitting\'s wet paint is tried on a damp scrap; the code planner\'s is not', () => {
  assert.equal(isDampPassage({ _valuePlan: { move: 'beside damp', script } }, 0.5), true);
  assert.equal(isDampPassage({ _valuePlan: { move: 'wet on wet', script } }, 0.5), true, 'dropped into the wash before it, or a charge');
  assert.equal(isDampPassage({ _valuePlan: { move: 'beside damp' } }, 0.5), false, 'the code planner\'s soft join keeps its dry-paper swatch');
  assert.equal(isDampPassage({ _valuePlan: { move: 'wet on wet', script: { ...script, underShare: 0 } } }, 0.5), false, 'a wash into its own bed of clean water');
  assert.equal(isDampPassage({ _valuePlan: { move: 'beside damp', script: { ...script, underShare: 0.2 } } }, 0.5), false, 'it only touches the wash before it');
  assert.equal(isDampPassage({ _valuePlan: { move: 'beside damp', script: { ...script, underShare: 0.2 } } }, 0.1), true, 'the share is a setting');
  assert.equal(isDampPassage({ _valuePlan: { move: 'wet on dry', script } }, 0.5), false);
  assert.equal(isDampPassage({}, 0.5), false); assert.equal(isDampPassage(null, 0.5), false);
  assert.throws(() => isDampPassage({}, 0), /above 0/);
});

test('the wet paint under a passage is reckoned against the passage\'s own film', () => {
  assert.ok(Math.abs(underOf({ mix: [0.2, 0.1], _valuePlan: { script } }) - 0.6 * 0.9 / 0.3) < 1e-9);
  assert.equal(underOf({ mix: [0.2], _valuePlan: { script: { passage: 'p1' } } }), 0);
  assert.equal(underOf({ mix: [0.2], _valuePlan: {} }), 0); assert.equal(underOf({ mix: [0], _valuePlan: { script } }), 0);
});

test('what the brush took up of the wash: its loss over the wash under the passage\'s footprint, never below 0', () => {
  assert.ok(Math.abs(liftShare(100, 80) - 0.2) < 1e-9);
  assert.ok(Math.abs(liftShare(100, 98, 0.1) - 0.2) < 1e-9, 'a mark over a tenth of the wash');
  assert.equal(liftShare(100, 101), 0); assert.equal(liftShare(0, 0), 0);
});

test('only strokes, touches and lines are mark passages; the code planner\'s kinds of wash are not', () => {
  const strokes = [{ radiusMm: 2, points: [[0, 0, 1], [4, 0, 1]] }];
  for (const kind of ['strokes', 'touches', 'lines']) assert.equal(isMarkPassage({ _valuePlan: { kind, strokes } }), true, kind);
  for (const kind of ['wash', 'first wash', 'wash over', 'accent', 'charge']) assert.equal(isMarkPassage({ _valuePlan: { kind, strokes } }), false, kind);
});

test('the charge into wet paint makes up what the brush takes up of the wash, held to a setting times the dry-paper factor', () => {
  assert.deepEqual(dampCharge(0.5, { dry: 1.2, most: 6 }), { cal: 2, limited: false });
  assert.deepEqual(dampCharge(0.5, { lift: 0.25, under: 2, dry: 1.2, most: 6 }), { cal: 3, limited: false }, 'a wash twice as strong under it: half as much again to lay');
  assert.deepEqual(dampCharge(0.5, { lift: 0.25, under: 20, dry: 1.2, most: 6 }), { cal: 1.2 * 6, limited: true }, 'a pale passage into a strong wash');
  assert.deepEqual(dampCharge(0.05, { dry: 1.5, most: 6 }), { cal: 9, limited: true });
  assert.deepEqual(dampCharge(0, { dry: 1, most: 4 }), { cal: 4, limited: true }, 'a swatch that laid nothing is charged the most, never left at 1');
  assert.equal(dampCharge(2, { dry: 1, most: 4 }).cal, 0.5);
  assert.throws(() => dampCharge(0.5, { dry: 1 }), /must be a number/);
  assert.throws(() => dampCharge(0.5, { dry: 0, most: 4 }), /positive/);
  assert.throws(() => dampCharge(NaN, { dry: 1, most: 4 }), /no reading/);
});

test('a mark tried in damp is keyed apart from the same mark on dry paper', () => {
  const m = representativeMark([{ radiusMm: 2, points: [[0, 0, 0.5], [6, 0, 0.9], [12, 0, 0.3]] }]);
  assert.notEqual(markKey(m), markKey({ ...m, damp: true }));
  assert.equal(markKey({ ...m, damp: false }), markKey(m));
});

// stand-in instruments: a brush lays a fixed film of its own channel on every cell under its path, and keeps count
function instruments() {
  const calls = [];
  const dip = (b, load) => { b.load = load; };
  const stroke = (b, scrap, pts) => {
    calls.push({ conc: [...b.load.conc], points: pts.length });
    const r = Math.max(...pts.map(p => p.r));
    for (let q = 0; q < pts.length; q++) {
      const a = pts[q], c = pts[Math.min(pts.length - 1, q + 1)], n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y)));
      for (let j = 0; j <= n; j++) {
        const px = a.x + (c.x - a.x) * j / n, py = a.y + (c.y - a.y) * j / n;
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(scrap.h - 1, Math.ceil(py + r)); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(scrap.w - 1, Math.ceil(px + r)); x++)
          for (let k = 0; k < scrap.K; k++) if (b.load.conc[k] > 0) scrap.D[k][y * scrap.w + x] = b.load.conc[k] / 10;
      }
    }
  };
  return { calls, env: { pigment: { name: 'test', K: [1, 1, 1], S: [0.1, 0.1, 0.1] }, physics: {}, paperOptions: { seed: 5 }, upright: true, water: T => T.water, dip, stroke, step: () => {}, dry: () => {}, paintBrush: () => ({}), waterBrush: () => ({}) } };
}

test('the wash goes down first in its own channel and is waited on; the passage is laid after it and read in its own channel', () => {
  const { calls, env } = instruments(), order = [];
  const mask = swatchMask(), paths = swatchLanes(6);
  const wash = { name: 'wet on wet', water: 0.88, passes: 1, intoWet: false }, own = { name: 'wet on dry', water: 0.62, passes: 1 };
  const scrap = dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions,
    lay: s => { order.push('wash'); assert.equal(scrapDelivery(wash, { ...env, mask, paths, charge: 3, scrap: s, channel: DAMP_CHANNEL.under, finish: false }), null); },
    wait: (s, cells) => { order.push('wait'); assert.equal(cells.length, (SWATCH.x1 - SWATCH.x0) * (SWATCH.y1 - SWATCH.y0)); assert.equal(s.K, 2); } });
  const washCalls = calls.length;
  assert.ok(washCalls > 0); assert.ok(calls.every(c => c.conc[0] === 3 && c.conc[1] === 0), 'the wash is charged in the first channel only');
  const r = scrapDelivery(own, { ...env, mask, paths, charge: SWATCH.want * 10, scrap, channel: DAMP_CHANNEL.own });
  assert.deepEqual(order, ['wash', 'wait']);
  assert.ok(calls.slice(washCalls).every(c => c.conc[0] === 0 && c.conc[1] === SWATCH.want * 10), 'the passage is charged in the second channel only');
  assert.ok(Math.abs(r.delivered - 1) < 1e-6, `the passage's own paint is read, not the wash under it: ${r.delivered}`);
  assert.ok(thickness(scrap)[DAMP_CHANNEL.under].some(v => v > 0));
});

test('a mark is tried over the damp wash the same way', () => {
  const { calls, env } = instruments();
  const L = markLayout(representativeMark([{ radiusMm: 1.5, points: [[0, 0, 1], [8, 0, 1]] }]), 0.26);
  const scrap = dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions, lay: s => scrapDelivery({ name: 'wet on wet', water: 0.88, passes: 1 }, { ...env, mask: swatchMask(), paths: swatchLanes(6), charge: 3, scrap: s, channel: DAMP_CHANNEL.under, finish: false }), wait: () => {} });
  const before = calls.length;
  const r = markDelivery({ name: 'wet on dry', water: 0.62, passes: 1 }, { ...env, mask: L.mask, paths: L.paths, charge: SWATCH.want * 10, scrap, channel: DAMP_CHANNEL.own });
  assert.equal(calls.length - before, L.copies);
  assert.ok(calls.slice(before).every(c => c.conc[0] === 0 && c.conc[1] > 0));
  assert.ok(Math.abs(r.covered - 1) < 1e-6 && r.coverage === 1, JSON.stringify(r));
  assert.ok(r.mass >= 1, 'the mark\'s own paint over the whole scrap, the wash under it left out');
});

test('without a scrap given, a swatch is laid on its own one-pigment scrap as before', () => {
  const { calls, env } = instruments();
  const r = scrapDelivery({ name: 'wet on dry', water: 0.62, passes: 1 }, { ...env, mask: swatchMask(), paths: swatchLanes(6), charge: SWATCH.want * 10 });
  assert.ok(calls.every(c => c.conc.length === 1)); assert.ok(Math.abs(r.delivered - 1) < 1e-6);
});
