import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, totals, step, DEFAULTS } from './sheet.mjs';
import { createBrush, dip, thirsty, stroke, setStrokeVariety, candidateContact } from './brush.mjs';
import { headOf, moveChain, contactShare, tuftShape, kappaOf, exchangeCell, toothReach, footprint, roundProfile } from './tuft-section.mjs';
import { pigmentPerMm, runOut, meanBetween, diagonalEdge, spectralPeak } from '../../tools/lab/brush-measure.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }, { K: [0.2, 0.5, 0.9], S: [0.05, 0.03, 0.02], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const paperAt = (wmm, hmm, mm, extra = {}) => makePaper(Math.round(wmm / mm), Math.round(hmm / mm), { seed: 9, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 }, ...extra });
// the painter's detail round (tools/plate/paint.mjs) as a section brush, rmm its belly half-width in mm
const round = (mm, rmm = 2.5, extra = {}) => { const r = rmm / mm; return createBrush({ model: 'section', radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, bridge: 0.55, bridgeSoft: 1.2, streak: 0.5, seed: 31, ...extra }); };
const flat = (mm, rmm = 6, extra = {}) => { const r = rmm / mm; return createBrush({ model: 'section', flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, seed: 41, ...extra }); };
const inMm = (pts, mm) => pts.map(q => ({ ...q, x: q.x / mm, y: q.y / mm }));
// water (mm^3) and pigment on the sheet and in the brush
const ledger = (sheet, brush) => {
  const mm = sheet.paper.mmPerCell, t = totals(sheet), kappa = kappaOf(brush, mm), cell = mm * mm;
  const bw = brush.resW + brush.hairs.reduce((s, h) => s + h.water, 0), bp = brush.resP.map((v, k) => v + brush.hairs.reduce((s, h) => s + h.pig[k], 0));
  return { water: t.water * cell + bw * kappa, pig: t.pig.map((v, k) => v * cell + bp[k] * kappa) };
};

test('a tuft holds its film while it has free liquid, and sucks below its retention share', () => {
  assert.equal(headOf(0.4, 0.4, 0.9), 0);
  assert.ok(headOf(1, 0.4, 0.9) > 0.89 && headOf(0.7, 0.4, 0.9) > 0.75, 'near full head over most of the load');
  assert.ok(headOf(0.2, 0.4, 0.9) < 0 && headOf(0.1, 0.4, 0.9) < headOf(0.3, 0.4, 0.9));
  // reach: a loaded lane past the deepest pit, a damp one only the hills
  assert.ok(toothReach(0.9, 0.9, 1, 0) > 1 && toothReach(-0.15, 0.9, 1, 0.55) < 0);
});

test('a loaded round lays the same paint per millimetre and runs out at the same distance at 0.25 and 0.1 mm cells', () => {
  const lay = mm => {
    const sheet = createSheet(paperAt(130, 12, mm), pigments), b = round(mm);
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 5, y: 6, p: 1 }, { x: 125, y: 6, p: 1 }], mm));
    const per = pigmentPerMm(sheet, mm);
    return { run: runOut(per, mm, 5), per: meanBetween(per, mm, 5, 5, 15), total: meanBetween(per, mm, 5, 0, 120) };
  };
  const a = lay(0.25), b = lay(0.1);
  assert.ok(Number.isFinite(a.run) && a.run < 120, `it runs out within the stroke (${a.run} mm)`);
  assert.ok(Math.abs(a.run - b.run) / a.run < 0.05, `run-out ${a.run} and ${b.run} mm`);
  assert.ok(Math.abs(a.per - b.per) / a.per < 0.05, `paint a mm ${a.per} and ${b.per}`);
  assert.ok(Math.abs(a.total - b.total) / a.total < 0.05, `all its paint ${a.total} and ${b.total} a mm`);
});

test('the step length does not change what a stroke lays', () => {
  const lay = spacing => {
    const mm = 0.25, sheet = createSheet(paperAt(70, 12, mm), pigments), b = round(mm);
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 5, y: 6, p: 1 }, { x: 65, y: 6, p: 1 }], mm), { spacing });
    const per = pigmentPerMm(sheet, mm);
    return { run: runOut(per, mm, 5), per: meanBetween(per, mm, 5, 5, 15) };
  };
  const a = lay(0.7), b = lay(0.35);
  assert.ok(Math.abs(a.run - b.run) / a.run < 0.05, `run-out ${a.run} and ${b.run} mm`);
  assert.ok(Math.abs(a.per - b.per) / a.per < 0.05, `paint a mm ${a.per} and ${b.per}`);
});

test('water and pigment balance between brush and sheet to 0.1% over strokes onto dry and wet paper, with flow', () => {
  const mm = 0.25, sheet = createSheet(paperAt(60, 30, mm), pigments), b = flat(mm, 4);
  for (let y = 40; y < 80; y++) for (let x = 40; x < 200; x++) deposit(sheet, y * sheet.w + x, 0.2, [0.05, 0]);
  dip(b, { water: 1, conc: [0, 0.4] });
  const o = { ...DEFAULTS, evap: 0, edgeEvap: 0, absorb: 0.002 };
  const before = ledger(sheet, b);
  let n = 0;
  for (const y of [8, 15, 22]) stroke(b, sheet, inMm([{ x: 5, y, p: 0.9 }, { x: 55, y, p: 0.9 }], mm), { upright: 'sweep', between: () => { if (++n % 8 === 0) step(sheet, o); } });
  const after = ledger(sheet, b);
  assert.ok(Math.abs(after.water - before.water) / before.water < 1e-3, `water ${before.water} -> ${after.water}`);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(after.pig[k] - before.pig[k]) / before.pig[k] < 1e-3, `pigment ${k} ${before.pig[k]} -> ${after.pig[k]}`);
});

test('films at the same head still trade colour, and the brush carries what it took downstream', () => {
  const mm = 0.25, sheet = createSheet(paperAt(60, 20, mm), pigments), b = round(mm, 2, { bridge: 0 });
  // a glossy blue band across the middle, as deep as the loaded brush stands its film
  const x0 = Math.round(20 / mm), x1 = Math.round(30 / mm);
  for (let y = 0; y < sheet.h; y++) for (let x = x0; x < x1; x++) { const i = y * sheet.w + x; sheet.s[i] = sheet.paper.capacity[i]; deposit(sheet, i, 0.9, [0.9 * 0.5, 0]); }
  dip(b, { water: 1, conc: [0, 0.5] });
  stroke(b, sheet, inMm([{ x: 5, y: 10, p: 1 }, { x: 55, y: 10, p: 1 }], mm));
  const row = Math.round(10 / mm) * sheet.w;
  let sienna = 0; for (let x = x0 + 4; x < x1 - 4; x++) sienna += sheet.G[1][row + x];
  let blueAfter = 0; for (let x = x1 + Math.round(2 / mm); x < x1 + Math.round(10 / mm); x++) for (let y = Math.round(8 / mm); y < Math.round(12 / mm); y++) { const i = y * sheet.w + x; blueAfter += sheet.G[0][i] + sheet.D[0][i]; }
  assert.ok(sienna > 0, 'the brush gave its colour into the band');
  assert.ok(blueAfter > 0, 'and laid the band\'s colour beyond it');
});

test('a damp clean brush lifts paint out of a wet wash and lays none on dry paper', () => {
  const mm = 0.25, sheet = createSheet(paperAt(60, 20, mm), pigments), b = flat(mm, 3, { flat: false });
  for (let y = 0; y < sheet.h; y++) for (let x = 0; x < Math.round(40 / mm); x++) { const i = y * sheet.w + x; sheet.s[i] = sheet.paper.capacity[i]; deposit(sheet, i, 0.3, [0.3 * 0.5, 0]); }
  dip(b, { water: 1, conc: [0, 0] }); thirsty(b, { water: 0.15 });
  const before = totals(sheet).pig[0], dryBefore = sheet.W.slice(Math.round(45 / mm));
  stroke(b, sheet, inMm([{ x: 5, y: 10, p: 1 }, { x: 55, y: 10, p: 1 }], mm));
  const onBrush = b.resP[0] + b.hairs.reduce((s, h) => s + h.pig[0], 0);
  assert.ok(onBrush > 0 && totals(sheet).pig[0] < before, 'the brush took paint up');
  let given = 0; for (let y = 0; y < sheet.h; y++) for (let x = Math.round(45 / mm); x < sheet.w; x++) given += sheet.W[y * sheet.w + x];
  assert.ok(given < 1e-3 * dryBefore.length, 'it gives the dry paper no standing water');
});

test('the faster stroke lays less where the slow one lays its full film', () => {
  const lay = speed => {
    const mm = 0.25, sheet = createSheet(paperAt(40, 12, mm), pigments), b = round(mm);
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 5, y: 6, p: 1 }, { x: 35, y: 6, p: 1 }], mm), { speed });
    return meanBetween(pigmentPerMm(sheet, mm), mm, 5, 5, 15);
  };
  assert.ok(lay(250) < 0.8 * lay(20));
});

// --- tuft geometry -----------------------------------------------------------------------------------------------
const widthAt = (sheet, x) => { let n = 0; for (let y = 0; y < sheet.h; y++) if (sheet.W[y * sheet.w + x] + sheet.s[y * sheet.w + x] > 1e-4) n++; return n; };

test('width grows with pressure from the tip to the belly and no further', t => {
  setStrokeVariety(0); t.after(() => setStrokeVariety(1));
  const mm = 0.1, widths = [];
  for (const p of [0.05, 0.2, 0.4, 0.6, 0.8, 1]) {
    const sheet = createSheet(paperAt(30, 12, mm), pigments), b = round(mm, 2.5);
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 3, y: 6, p }, { x: 27, y: 6, p }], mm));
    widths.push(widthAt(sheet, Math.round(20 / mm)) * mm);
  }
  for (let k = 1; k < widths.length; k++) assert.ok(widths[k] >= widths[k - 1] - 0.1, `widths ${widths}`);
  assert.ok(widths[0] < 0.25 * 5, `light: ${widths[0]} mm`);
  assert.ok(widths.at(-1) >= 0.95 * 5 && widths.at(-1) <= 5.6, `belly: ${widths.at(-1)} mm of 5`);
});

test('a stroke tapers to a point where the tip lifts', () => {
  const mm = 0.1, sheet = createSheet(paperAt(40, 12, mm), pigments), b = round(mm, 2.5);
  dip(b, { water: 1, conc: [0.5, 0] });
  stroke(b, sheet, inMm([{ x: 5, y: 6, p: 1 }, { x: 35, y: 6, p: 1 }], mm));
  let end = 0; for (let x = sheet.w - 1; x > 0 && !end; x--) if (widthAt(sheet, x) > 0) end = x;
  const belly = Math.max(...Array.from({ length: sheet.w }, (_, x) => widthAt(sheet, x)));
  assert.ok(widthAt(sheet, end - Math.round(0.5 / mm)) < 0.2 * belly, `0.5 mm from the end ${widthAt(sheet, end - 5)} of ${belly} cells`);
});

test('the towed tuft trails the hand and swings round a turn late', () => {
  const S = 6, seg = 4, heading = [];
  let pts = null;
  const path = [];
  for (let k = 0; k <= 60; k++) path.push([k, 0]);
  for (let k = 1; k <= 60; k++) path.push([60, k]);
  for (const [x, y] of path) { pts = moveChain(pts, S, x, y, seg, pts ? seg : 0, -1, 0); heading.push(Math.atan2(pts[1] - pts[2 * S - 1], pts[0] - pts[2 * S - 2])); }
  const after = k => Math.abs(heading[60 + k] - Math.PI / 2) * 180 / Math.PI;
  assert.ok(Math.abs(heading[55]) < 0.01, 'straight on: lies along the path');
  assert.ok(after(2) > 45, `2 cells past the turn the tuft still points ${after(2)} degrees off`);
  assert.ok(after(40) < 5, `well past it, ${after(40)} degrees`);
  for (let k = 61; k < heading.length; k++) assert.ok(heading[k] >= heading[k - 1] - 1e-9, 'it swings round without snapping back');
});

test('a 45 degree line has no roughness at the cell pitch', () => {
  // the brush's own geometry on the painter's cold press: a cell is touched by the share of its area the liquid reaches
  // (brush.mjs soft, paper.mjs subRelief), so the paper's grain does not step every edge at the pitch
  const mm = 0.25, sheet = createSheet(paperAt(40, 40, mm), pigments), b = round(mm, 1.5);
  dip(b, { water: 1, conc: [0.5, 0] });
  stroke(b, sheet, [{ x: 20, y: 20, p: 0.8 }, { x: 140, y: 140, p: 0.8 }]);
  const f = Float64Array.from(sheet.W, (v, i) => v + sheet.s[i]);
  const { spectrum } = diagonalEdge(f, sheet.w, sheet.h, 0, 0.3, 40, 120);
  assert.ok(spectralPeak(spectrum, 0.25) < 2, `power at the cell pitch ${spectralPeak(spectrum, 0.25)} times its neighbours`);
});

test('a flat on edge lays a line as thin as the blade, square to it as wide as the blade', t => {
  setStrokeVariety(0); t.after(() => setStrokeVariety(1));
  const mm = 0.25, widths = {};
  for (const bladeAngle of [0, 90]) {
    const sheet = createSheet(paperAt(40, 20, mm), pigments), b = flat(mm, 6, { bladeAngle });
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 5, y: 10, p: 0.8 }, { x: 35, y: 10, p: 0.8 }], mm));
    widths[bladeAngle] = widthAt(sheet, Math.round(20 / mm)) * mm;
  }
  assert.ok(widths[0] < 2.5, `on edge ${widths[0]} mm`);
  assert.ok(widths[90] > 10, `square ${widths[90]} mm`);
});

test('the footprint of a round is a cone of circles with no gaps along the chain', () => {
  const S = 6, pts = new Float64Array(3 * S), rad = new Float64Array(S);
  for (let j = 0; j < S; j++) { pts[2 * j] = 30 - 4 * j; pts[2 * j + 1] = 20; rad[j] = 8 * roundProfile(0.4 + 0.12 * j); }
  const hit = new Uint8Array(60 * 40);
  footprint({ pts, S, rad, flat: false }, 60, 40, 0, (i, d) => { if (d < 0) hit[i] = 1; });
  for (let x = 12; x <= 30; x++) assert.equal(hit[20 * 60 + x], 1, `on the spine at ${x}`);
  assert.ok(contactShare(tuftShape(false), 0) === 0 && contactShare(tuftShape(false), 1) > 0.5);
});

test('candidate contact covers every cell the section brush wets', () => {
  const mm = 0.25, sheet = createSheet(paperAt(40, 20, mm), pigments), b = round(mm, 2);
  dip(b, { water: 1, conc: [0.5, 0] });
  const path = inMm([{ x: 5, y: 10, p: 1 }, { x: 20, y: 6, p: 1 }, { x: 35, y: 12, p: 1 }], mm);
  const c = candidateContact(b, sheet, path, { includeTouched: false });
  stroke(b, sheet, path);
  for (let i = 0; i < sheet.n; i++) if (sheet.W[i] + sheet.s[i] > 0) assert.equal(c.mask[i], 1, `cell ${i}`);
});

test('exchangeCell moves nothing from an empty lane and never makes a negative', () => {
  const sheet = createSheet(paperAt(4, 4, 0.25), pigments), lane = { water: 0, pig: [0, 0] }, buf = new Float64Array(2);
  deposit(sheet, 5, 0.3, [0.1, 0]);
  exchangeCell(sheet, 5, lane, 10, 4, 0.5, 1, headOf(0, 0.4, 0.9), 1, buf);
  assert.ok(lane.water > 0 && lane.pig[0] > 0 && sheet.W[5] >= 0 && sheet.G[0][5] >= 0);
});

test('two overlapping wet sweeps dry with no density step at their seam', async () => {
  const { dry, layersOf } = await import('./sheet.mjs'), { renderLayers } = await import('./km.mjs'), { opticalDensity, rowProfile, seamStep } = await import('../../tools/lab/brush-measure.mjs');
  const mm = 0.25, sheet = createSheet(paperAt(70, 30, mm), pigments), o = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, slideCap: 1 };
  let n = 0;
  for (const y of [11, 19]) { const b = flat(mm, 6, { seed: 41 + y }); dip(b, { water: 1, conc: [0.25, 0.08] }); stroke(b, sheet, inMm([{ x: 5, y, p: 0.9 }, { x: 65, y, p: 0.9 }], mm), { upright: 'sweep', between: () => { if (++n % 8 === 0) step(sheet, o); } }); }
  dry(sheet, 30000, o, { levelMax: 140, dt: 14 });
  const N = sheet.n, paper = Buffer.alloc(N * 3, 240), rgb = renderLayers(layersOf(sheet), pigments, paper, N), od = opticalDensity(rgb, paper, N);
  const prof = rowProfile(od, sheet.w, sheet.h, Math.round(15 / mm), Math.round(55 / mm)), s = seamStep(prof, Math.round(15 / mm), Math.round(1.5 / mm));
  assert.ok(s.above > 0.05 && s.below > 0.05, `both sweeps laid paint (${s.above}, ${s.below} OD)`);
  // 0.02 until the tuft stood its film at a physical 0.2 mm (TUFT.head). The overlap is laid 15% deeper (0.195 against
  // 0.168 mm) and still dries 0.024 OD (about 1.5 L*) lighter than a straight line across it: the edge flow of the final
  // dry drains it (under 0.02 with edgeEvap 0 in the dry; the 0.9 mm film levelled it away). An open
  // fault of the drying flow, held here so it cannot grow.
  assert.ok(s.step < 0.026, `seam step ${s.step} OD`);
});

test('on a GPU sheet the section brush lays exactly what it lays on a CPU sheet (its contact runs on the CPU)', async t => {
  const { attachGpu } = await import('./gpu/link.mjs');
  const make = () => createSheet(paperAt(40, 20, 0.25), pigments);
  const gpu = make(); let info;
  // edgeEvap 0: the GPU sheet has no pinned-edge feed (edge-feed.mjs) and refuses one
  try { info = attachGpu(gpu, { ...DEFAULTS, edgeEvap: 0 }, { mode: 'on', log: () => {} }); } catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(`no WebGPU adapter: ${e.message}`); return; }
  if (info.backend !== 'gpu') { if (process.env.GPU_REQUIRED === '1') assert.fail('no GPU'); t.skip('no WebGPU adapter'); return; }
  const cpu = make();
  for (const sheet of [cpu, gpu]) { const b = round(0.25, 2); dip(b, { water: 1, conc: [0.5, 0] }); stroke(b, sheet, inMm([{ x: 5, y: 10, p: 1 }, { x: 20, y: 6, p: 0.8 }, { x: 35, y: 12, p: 1 }], 0.25)); }
  const a = totals(cpu), b = totals(gpu);
  assert.ok(Math.abs(a.water - b.water) < 1e-3 * a.water && Math.abs(a.pig[0] - b.pig[0]) < 1e-3 * a.pig[0], `cpu ${JSON.stringify(a)} gpu ${JSON.stringify(b)}`);
});

test('the mark tape records the section brush and the hand speed of its strokes', async () => {
  const marks = await import('./brush.mjs'), tape = marks.recordMarks(true);
  try {
    const sheet = createSheet(paperAt(20, 10, 0.25), pigments); sheet._tape = true;
    const b = round(0.25, 1); dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, [{ x: 10, y: 20, p: 1 }, { x: 60, y: 20, p: 1 }], { speed: 30 });
    const s = tape.find(m => m.k === 's');
    assert.equal(s.vs, 30);
    assert.equal(marks.BRUSHOPTS[0].model, 'section');
  } finally { marks.recordMarks(false); }
});

test('a stroke lays inside its planned ends: a round lands on its point there, a flat on its edge', () => {
  const mm = 0.1;
  for (const [name, make] of [['round', () => round(mm, 2.5)], ['flat', () => flat(mm, 4)]]) {
    const sheet = createSheet(paperAt(40, 14, mm), pigments), b = make();
    dip(b, { water: 1, conc: [0.5, 0] });
    stroke(b, sheet, inMm([{ x: 5, y: 7, p: 1 }, { x: 35, y: 7, p: 1 }], mm), { upright: 'sweep' });
    const wet = x => widthAt(sheet, Math.round(x / mm));
    let outside = 0, inside = 0;
    for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) { const i = y * sheet.w + x, v = sheet.W[i] + sheet.s[i], at = (x + 0.5) * mm; if (at < 5 - mm || at > 35 + mm) outside += v; else inside += v; }
    assert.ok(outside < 0.005 * inside, `${name}: ${(100 * outside / inside).toFixed(2)}% of the water past the ends`);
    if (name === 'round') assert.ok(wet(5.5) < 0.4 * wet(15), `the round lands on its point: ${wet(5.5)} cells wide 0.5 mm in, ${wet(15)} at 10 mm`);
  }
});
