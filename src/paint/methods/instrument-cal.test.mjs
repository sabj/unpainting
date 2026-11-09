import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstrumentCal, instrumentKey } from './instrument-cal.mjs';

const GLAZED = { name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, passes: 2 };
const WET_ON_DRY = { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 };
const stock = () => ({
  glazed: { technique: GLAZED, cal: 0.69, graded: { all: 1.47, escape: 0.02, edge: 0.08 } },
  'wet on dry': { technique: WET_ON_DRY, cal: 1.01, graded: { all: 1.04, escape: 0.01, edge: 0.08 } },
});
const counting = reading => { const seen = []; return { seen, measure: T => { seen.push(T); return reading(T); } }; };

test('a stock instrument takes the stock swatch and lays no swatch of its own', () => {
  const { seen, measure } = counting(() => ({ cal: 9 }));
  const cal = createInstrumentCal({ stock: stock(), measure });
  const r = cal.of({ ...GLAZED, dryAfter: true, valuePlan: { id: 'shadow/b4' } });
  assert.equal(r.cal, 0.69);
  assert.deepEqual(r.graded, { all: 1.47, escape: 0.02, edge: 0.08 });
  assert.equal(r.stock, true);
  assert.equal(seen.length, 0);
});

test('a glaze at its own water and pass count gets its own swatch, laid once', () => {
  const { seen, measure } = counting(T => ({ cal: T.water === 0.45 ? 1.68 : 3, graded: { all: 0.6, escape: 0, edge: 0.08 } }));
  const cal = createInstrumentCal({ stock: stock(), measure });
  const planGlaze = { ...GLAZED, water: 0.45, passes: 1 };
  const first = cal.of(planGlaze), again = cal.of({ ...planGlaze, valuePlan: { id: 'shadow/b5' } });
  assert.equal(first.cal, 1.68);
  assert.equal(first.stock, false);
  assert.deepEqual(first.graded, { all: 0.6, escape: 0, edge: 0.08 });
  assert.equal(again.cal, 1.68);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].water, 0.45);
  assert.equal(seen[0].passes, 1);
});

test('each of water, passes, wet mixing, tooth reach and the wet bed makes a different instrument', () => {
  const base = instrumentKey(GLAZED);
  for (const change of [{ water: 0.45 }, { passes: 1 }, { wetMix: 0.55 }, { bridge: 0.78 }, { bridgeSoft: 2.2 }, { intoWet: true }, { name: 'wet on dry' }])
    assert.notEqual(instrumentKey({ ...GLAZED, ...change }), base, JSON.stringify(change));
  assert.equal(instrumentKey({ ...GLAZED, dryAfter: false, valuePlan: {} }), base);
});

test('a technique with no stock swatch of its name is measured, not charged 1', () => {
  const { seen, measure } = counting(() => ({ cal: 2.5 }));
  const cal = createInstrumentCal({ stock: stock(), measure });
  const r = cal.of({ name: 'dry on wet', water: 0.3, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, passes: 1 });
  assert.equal(r.cal, 2.5);
  assert.equal(r.graded, null);
  assert.equal(seen.length, 1);
});

test('a technique without a load or a pass count fails loudly', () => {
  const cal = createInstrumentCal({ stock: stock(), measure: () => ({ cal: 1 }) });
  assert.throws(() => cal.of({ ...GLAZED, water: undefined }), /no finite water/);
  assert.throws(() => cal.of({ ...GLAZED, passes: 1.5 }), /whole number of passes/);
  assert.throws(() => cal.of({ ...GLAZED, name: '' }), /needs a name/);
});

test('a swatch that gives no charge factor fails loudly', () => {
  for (const bad of [null, {}, { cal: 0 }, { cal: NaN }, { cal: Infinity }]) {
    const cal = createInstrumentCal({ stock: stock(), measure: () => bad });
    assert.throws(() => cal.of({ ...GLAZED, water: 0.45 }), /gave no charge factor/);
  }
});

test('kept readings are reused and listed', () => {
  const first = createInstrumentCal({ stock: stock(), measure: () => ({ cal: 1.68, graded: { all: 0.6, escape: 0, edge: 0.08 } }) });
  first.of({ ...GLAZED, water: 0.45, passes: 1 });
  const { seen, measure } = counting(() => ({ cal: 7 }));
  const second = createInstrumentCal({ stock: stock(), measure });
  second.load(first.entries());
  assert.equal(second.of({ ...GLAZED, water: 0.45, passes: 1 }).cal, 1.68);
  assert.equal(seen.length, 0);
  assert.equal(second.entries().length, 1);
});

test('byName is the stock swatch of the name whatever the load, and 1 for an unknown name', () => {
  const cal = createInstrumentCal({ stock: stock(), measure: () => { throw new Error('not measured'); } });
  assert.equal(cal.byName('glazed').cal, 0.69);
  assert.equal(cal.byName('wet-edge continuation').cal, 1);
  assert.equal(cal.byName('wet-edge continuation').graded, null);
});

test('a measured instrument is logged once with what sets it apart from the stock swatch of its name', () => {
  const lines = [];
  const cal = createInstrumentCal({ stock: stock(), measure: () => ({ cal: 1.68 }), log: l => lines.push(l) });
  cal.of({ ...GLAZED, water: 0.45, passes: 1 });
  cal.of({ ...GLAZED, water: 0.45, passes: 1 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '  glazed at water 0.45, passes 1: its own swatch charges 1.68x (the stock glazed swatch, water 0.58, passes 2: 0.69x)');
});
