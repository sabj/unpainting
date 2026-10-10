import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, totals, dry, DEFAULTS } from './sheet.mjs';
import { createBrush, dip, stroke, thirsty, setStrokeVariety } from './brush.mjs';
import { brushFor, TECHNIQUES } from '../paint/methods/lay.mjs';
// exact-geometry contracts of the planned stroke: run with no stroke variety and no damp-paint merge
const classic = t => { setStrokeVariety(0); t.after(() => setStrokeVariety(1)); };

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const inventory = (sheet, brush) => {
  const t = totals(sheet);
  return [t.water + brush.resW + brush.hairs.reduce((sum, hr) => sum + hr.water, 0),
    t.pig[0] + brush.resP[0] + brush.hairs.reduce((sum, hr) => sum + hr.pig[0], 0)];
};

test('a loaded brush mixes pigment into standing water without creating water or pigment', () => {
  const sheet = createSheet(makePaper(64, 64), pigments);
  for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) deposit(sheet, y * 64 + x, 0.8, [0.02]);
  const brush = createBrush({ flat: true, radius: 12, wetMix: 0.7, capacity: 60 });
  dip(brush, { water: 1, conc: [0.9] });
  const before = inventory(sheet, brush);
  stroke(brush, sheet, [{ x: 32, y: 12, p: 1, r: 8 }, { x: 34, y: 50, p: 1, r: 14 }], { upright: true });
  const after = inventory(sheet, brush);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(after[k] - before[k]) < 1e-4);
  assert.ok(sheet.G[0][32 * 64 + 32] > 0.02);
  for (const field of [sheet.W, sheet.G[0], sheet.D[0]]) assert.ok(field.every(v => Number.isFinite(v) && v >= 0));
});

test('a clean wet brush takes pigment from the film and conserves the combined inventory', () => {
  const sheet = createSheet(makePaper(64, 64), pigments);
  for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) deposit(sheet, y * 64 + x, 0.8, [0.5]);
  const brush = createBrush({ flat: true, radius: 12, wetMix: 0.7, capacity: 60 });
  dip(brush, { water: 1, conc: [0] });
  const before = inventory(sheet, brush);
  stroke(brush, sheet, [{ x: 32, y: 12, p: 1 }, { x: 32, y: 50, p: 1 }]);
  const after = inventory(sheet, brush);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(after[k] - before[k]) < 1e-4);
  assert.ok(brush.hairs.some(hr => hr.pig[0] > 0));
  assert.ok(sheet.G[0][32 * 64 + 32] < 0.5);
});

test('a brush held upright to its sweep lays its width along a row, as it does down the sheet', () => {
  const lay = path => {
    const sheet = createSheet(makePaper(64, 64), pigments), brush = createBrush({ flat: true, radius: 8, splay: 0 });
    dip(brush, { water: 1, conc: [0.9] });
    stroke(brush, sheet, path, { upright: 'sweep', lift: false });
    return i => sheet.G[0][i] + sheet.D[0][i] > 0;
  };
  const level = lay([{ x: 8, y: 32, p: 1, r: 6 }, { x: 56, y: 32, p: 1, r: 6 }]);
  const down = lay([{ x: 32, y: 8, p: 1, r: 6 }, { x: 32, y: 56, p: 1, r: 6 }]);
  let rows = 0, cols = 0;
  for (let k = 0; k < 64; k++) { if (level(k * 64 + 32)) rows++; if (down(32 * 64 + k)) cols++; }
  assert.ok(cols >= 11, `down the sheet it lays ${cols} cells across`);
  assert.ok(rows >= cols - 1, `along a row it lays ${rows} cells across`);
});

test('a narrowed flat brush leaves the planned dry margin untouched', t => {
  classic(t);
  const sheet = createSheet(makePaper(64, 64), pigments);
  const brush = createBrush({ flat: true, radius: 24, splay: 0 });
  dip(brush, { water: 1, conc: [0.9] });
  stroke(brush, sheet, [{ x: 32, y: 10, p: 1, r: 6 }, { x: 32, y: 50, p: 1, r: 6 }], { upright: true, lift: false });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x < 25 || x > 38) {
    assert.equal(sheet.G[0][y * 64 + x] + sheet.D[0][y * 64 + x], 0);
  }
  assert.ok(totals(sheet).pig[0] > 0);
});


for (const dryBetween of [false, true]) for (const sameBrush of [false, true]) {
  test(`lifted contact does not depend on idle sampler ticks: dry=${dryBetween}, sameBrush=${sameBrush}`, () => {
    const paint = idleTicks => {
      const sheet = createSheet(makePaper(64, 64, { seed: 9 }), pigments);
      let brush;
      for (let pass = 0; pass < 2; pass++) {
        if (!brush || !sameBrush) brush = createBrush({ flat: true, radius: 3, capacity: 100,
          belly: 12, feed: 0.4, bridge: 1, splay: 0, seed: 31 });
        dip(brush, { water: 0.7, conc: [0.4] });
        if (pass) {
          if (dryBetween) dry(sheet, 1000, DEFAULTS);
          sheet.clock += idleTicks;
        }
        const before = inventory(sheet, brush)[1];
        stroke(brush, sheet, [{ x: 24, y: 30, p: 1 }, { x: 26, y: 30, p: 1 }], { upright: 'sweep' });
        assert.ok(Math.abs(inventory(sheet, brush)[1] - before) < 1e-5);
      }
      return sheet;
    };
    const immediate = paint(0), delayed = paint(20);
    for (const field of ['W', 'G', 'D', 's', 'P']) assert.deepEqual(immediate[field], delayed[field]);
  });
}

test('splitting an uninterrupted brush path does not change its contact or pigment', t => {
  classic(t);
  const paint = chunks => {
    const sheet = createSheet(makePaper(64, 64, { seed: 9 }), pigments);
    const brush = createBrush({ flat: true, radius: 3, capacity: 100, belly: 12,
      feed: 0.4, bridge: 1, splay: 0, seed: 31 });
    dip(brush, { water: 0.7, conc: [0.4] });
    for (const [from, to] of chunks) stroke(brush, sheet,
      [{ x: from, y: 30, p: 1 }, { x: to, y: 30, p: 1 }], { upright: 'sweep', lift: false });
    return sheet;
  };
  const whole = paint([[14, 40]]), chunked = paint([[14, 18], [18, 22], [22, 40]]);
  for (const field of ['W', 'G', 'D', 's', 'P']) assert.deepEqual(chunked[field], whole[field]);
});


test('switching brushes starts a new contact even when the previous stroke stays down', () => {
  const paint = idleTicks => {
    const sheet = createSheet(makePaper(64, 64, { seed: 9 }), pigments);
    for (let pass = 0; pass < 2; pass++) {
      const brush = createBrush({ flat: true, radius: 3, capacity: 100, belly: 12,
        feed: 0.4, bridge: 1, splay: 0, seed: 31 });
      dip(brush, { water: 0.7, conc: [0.4] });
      if (pass) sheet.clock += idleTicks;
      stroke(brush, sheet, [{ x: 24, y: 30, p: 1 }, { x: 26, y: 30, p: 1 }],
        { upright: 'sweep', lift: false });
    }
    return sheet;
  };
  const immediate = paint(0), delayed = paint(20);
  for (const field of ['W', 'G', 'D', 's', 'P']) assert.deepEqual(immediate[field], delayed[field]);
});

test('a thirsty brush lifts pigment off a wet wash instead of laying more on it', () => {
  const sheet = createSheet(makePaper(64, 64, { seed: 4 }), pigments);
  for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) deposit(sheet, y * 64 + x, 0.8, [0.05]);
  step(sheet);
  const brush = createBrush({ flat: true, radius: 8, capacity: 60, splay: 0 });
  dip(brush, { water: 1, conc: [0.9] });   // loaded with strong paint, then squeezed out on the rag
  thirsty(brush);
  assert.ok(brush.hairs.every(hr => hr.pig[0] === 0));
  const underThePath = () => {
    let t = 0;
    for (let y = 12; y <= 50; y++) for (let x = 26; x <= 38; x++) { const i = y * 64 + x; t += sheet.G[0][i] + sheet.P[0][i] + sheet.D[0][i]; }
    return t;
  };
  const before = underThePath(), had = inventory(sheet, brush);
  stroke(brush, sheet, [{ x: 32, y: 12, p: 1 }, { x: 32, y: 50, p: 1 }], { upright: true });
  const after = underThePath();
  assert.ok(after < before, `the path holds ${after} pigment, up from ${before}`);
  assert.ok(brush.hairs.some(hr => hr.pig[0] > 0), 'the brush picked nothing up');
  const now = inventory(sheet, brush);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(now[k] - had[k]) < 1e-4);
});

const meteredStroke = (loadWater, { wet = false, water = 0.62 } = {}) => {
  const sheet = createSheet(makePaper(360, 48, { seed: 9 }), pigments);
  if (wet) for (let i = 0; i < sheet.n; i++) deposit(sheet, i, 0.3, [0]);
  const brush = createBrush({ flat: true, radius: 3, bristles: 12, loadWater,
    depositDepth: 0.2, bridge: 0.78, bridgeSoft: 2.2, splay: 0, wetMix: 0.55 });
  dip(brush, { water, conc: [0.4] });
  const before = inventory(sheet, brush);
  const carried = brush.resW + brush.hairs.reduce((a, hr) => a + hr.water, 0);
  assert.ok(Math.abs(carried - loadWater * water) < 1e-8, 'dip must honour the physical volume');
  stroke(brush, sheet, [{ x: 8, y: 24, p: 1 }, { x: 350, y: 24, p: 1 }]);
  const after = inventory(sheet, brush);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(after[k] - before[k]) < 1e-4, `inventory ${k}`);
  return { sheet, brush };
};

test('a larger metered load extends the stroke without deepening its film', t => {
  classic(t);
  const a = meteredStroke(200), b = meteredStroke(400);
  const depth = (s, x) => s.W[24 * s.w + x] + s.s[24 * s.w + x];
  for (let x = 12; x < 60; x++) {
    assert.ok(Math.abs(depth(a.sheet, x) - 0.2) < 1e-6, `continuous film at ${x}`);
    assert.ok(Math.abs(depth(a.sheet, x) - depth(b.sheet, x)) < 1e-6);
  }
  const lastFull = s => { let end = 0; for (let x = 8; x < 350; x++) if (depth(s, x) > 0.19) end = x; return end; };
  assert.ok(lastFull(b.sheet) > lastFull(a.sheet) * 1.7);
  assert.ok(depth(b.sheet, 348) < 0.01, 'finite reservoir must run dry');
  assert.ok(a.brush.resW < 0.01, `only a retained lift-off bead remains: ${a.brush.resW}`);
});

test('metered wet-on-dry strokes stay local through active sheet physics', () => {
  const { sheet } = meteredStroke(400);
  const initial = totals(sheet).pig[0];
  for (let i = 0; i < 100; i++) step(sheet);
  let outside = 0;
  for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) if (y < 19 || y > 28) {
    const i = y * sheet.w + x;
    outside += sheet.G[0][i] + sheet.D[0][i] + sheet.P[0][i];
  }
  assert.ok(outside / initial < 0.01, `escaped pigment fraction ${outside / initial}`);
  assert.ok(Math.abs(totals(sheet).pig[0] - initial) < 1e-4);
  assert.ok(totals(sheet).water < 248, 'evaporation and pore drying remain active');
});

test('metered brush still mixes with wet paper and a blotted tip still breaks up', () => {
  const wet = meteredStroke(400, { wet: true });
  assert.ok(wet.sheet.G[0].some(v => v > 0), 'wet mixing remains active');
  const dry = meteredStroke(400, { water: 0.15 });
  let gaps = 0;
  for (let x = 12; x < 60; x++) if (dry.sheet.D[0][24 * dry.sheet.w + x] < 1e-8) gaps++;
  assert.ok(gaps > 0, 'a deliberately blotted brush retains tooth skipping');
});


test('zero metering options preserve legacy stroke fields exactly', () => {
  const paint = opts => {
    const sheet = createSheet(makePaper(64, 64, { seed: 9 }), pigments);
    const brush = createBrush({ flat: true, radius: 4, bridge: 0.78, ...opts });
    dip(brush, { water: 0.62, conc: [0.4] });
    stroke(brush, sheet, [{ x: 12, y: 30, p: 1 }, { x: 52, y: 30, p: 1 }]);
    return sheet;
  };
  const a = paint({}), b = paint({ loadWater: 0, depositDepth: 0 });
  for (const field of ['W', 'G', 'D', 's', 'P']) assert.deepEqual(a[field], b[field]);
});

// stroke variety
const varietySheet = () => createSheet(makePaper(120, 60, { seed: 5, mmPerCell: 0.2 }), [{ K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09], rho: 0.01, omega: 3.1, gamma: 0.91 }]);
const flatBrush = () => createBrush({ flat: true, radius: 8, bristles: 16, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: 11 });
const across = y => Array.from({ length: 41 }, (_, k) => ({ x: 10 + 2.5 * k, y, p: 0.9 }));
const mass = sheet => { const t = new Float64Array(sheet.w * sheet.h); for (let i = 0; i < t.length; i++) t[i] = sheet.D[0][i] + sheet.G[0][i]; return t; };
test('stroke variety is deterministic for a seed', () => {
  const run = () => { const sheet = varietySheet(), b = flatBrush(); for (const y of [20, 32]) { dip(b, { water: 0.62, conc: [0.35] }); stroke(b, sheet, across(y)); } return mass(sheet); };
  assert.deepEqual(run(), run());
});
test('two strokes from the same brush and load are not the same rectangle', () => {
  const sheet = varietySheet(), b = flatBrush();
  for (const y of [15, 45]) { dip(b, { water: 0.62, conc: [0.35] }); stroke(b, sheet, across(y)); }
  const m = mass(sheet), edge = y0 => { const e = []; for (let x = 30; x < 90; x++) { let y = y0 - 14; while (y < y0 && m[y * sheet.w + x] <= 0.01) y++; e.push(y - y0); } return e; };
  const a = edge(15), b2 = edge(45);
  assert.notDeepEqual(a, b2, 'the two top edges follow different lines');
  const sd = e => { const mu = e.reduce((s, v) => s + v, 0) / e.length; return Math.sqrt(e.reduce((s, v) => s + (v - mu) ** 2, 0) / e.length); };
  assert.ok(sd(a) > 0.3, `the edge is not ruled straight (sd ${sd(a).toFixed(2)} cells)`);
});
test('a same-load overlap on damp paint trades paint instead of stacking a second coat', t => {
  // 6 mm wet-on-dry flat strokes 5 mm apart at 4.655 cells per mm
  t.after(() => setStrokeVariety(1));
  const T = TECHNIQUES['wet on dry'], cpm = 4.655;
  const lay = merge => {
    setStrokeVariety(0, { merge });
    const sheet = createSheet(makePaper(140, 80, { seed: 31, mmPerCell: 1 / cpm }), [{ K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09], rho: 0.01, omega: 3.1, gamma: 0.91 }]);
    for (const y of [25, 25 + 5 * cpm]) {
      const b = brushFor(3 * cpm, T, 11); dip(b, { water: T.water, conc: [0.35] });
      stroke(b, sheet, Array.from({ length: 50 }, (_, k) => ({ x: 10 + 2.4 * k, y, p: 0.9 })), { upright: 'sweep', between: k => { if (k % 2 === 0) step(sheet); } });
      for (let k = 0; k < 6; k++) step(sheet);
    }
    const m = mass(sheet), row = y => { let s = 0; for (let x = 40; x < 100; x++) s += m[y * sheet.w + x]; return s; };
    return (row(36) + row(37)) / (row(25) + row(26));
  };
  const stacked = lay(0), merged = lay(1);
  assert.ok(stacked > 1.3, `without the merge the overlap is a second coat (${stacked.toFixed(2)})`);
  assert.ok(merged < stacked - 0.07, `with it the seam is weaker (${merged.toFixed(2)} vs ${stacked.toFixed(2)})`);
});
test('paint charged into a glossy film mixes out into it (filmDiffuse); on dry paper nothing changes', () => {
  const run = (prewet, filmDiffuse) => {
    const O = { ...DEFAULTS, filmDiffuse }, sheet = varietySheet(), wet = flatBrush(), b = createBrush({ radius: 3, bristles: 9, capacity: 60, seed: 4 });
    if (prewet) for (const y of [20, 30, 40]) { dip(wet, { water: 0.9, conc: [0] }); stroke(wet, sheet, across(y)); }
    dip(b, { water: 0.85, conc: [0.6] }); stroke(b, sheet, Array.from({ length: 11 }, (_, k) => ({ x: 45 + 3 * k, y: 30, p: 0.8 })), { between: k => { if (k % 2 === 0) step(sheet, O); } });
    for (let k = 0; k < 120; k++) step(sheet, O);
    const m = mass(sheet); let near = 0, far = 0;
    for (let x = 50; x < 70; x++) { for (let y = 28; y <= 32; y++) near += m[y * sheet.w + x]; for (const y of [22, 23, 37, 38]) far += m[y * sheet.w + x]; }
    return { far: far / near, m };
  };
  const on = run(true, 0.2), off = run(true, 0);
  assert.ok(on.far > 1.5 * off.far, `paint reaches 1.5 mm out on a glossy film (${on.far.toFixed(4)} vs ${off.far.toFixed(4)} without)`);
  const d1 = run(false, 0.2).far, d0 = run(false, 0).far;
  assert.ok(Math.abs(d1 - d0) < 1e-3 && d1 < 0.01, `on dry paper the paint stays in its own stroke (${d1.toFixed(4)} vs ${d0.toFixed(4)})`);
});
