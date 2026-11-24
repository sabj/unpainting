import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { fit, drawingSvg, formColour, layout, riskLine, sessionLine, runPanels, runHeader, composeSheet, writeRunSheet, writeGridSheet } from './sheet.mjs';

test('text is cut to its panel', () => {
  assert.equal(fit('short', 400, 16), 'short');
  const cut = fit('a very long caption that cannot fit in a narrow panel at all', 160, 16);
  assert.equal(cut.length, 20); assert.ok(cut.endsWith('…'));
});

test('a drawing is drawn from its vectors: ink black, pencil grey, dropped strokes left out', () => {
  const d = drawingSvg({ sheetMm: 100, heightMm: 50, medium: 'pencil', strokes: [
    { path: [[0, 0], [50, 25]], dark: 1, medium: 'ink', widths: [0.4, 0.4] },
    { path: [[10, 10], [20, 10]], dark: 0.5 },
    { path: [[1, 1], [2, 2]], dark: 1, drop: 'not on a source edge' },
  ] }, 200);
  assert.deepEqual([d.ink, d.pencil, d.dropped, d.height], [1, 1, 1, 100]);
  assert.equal(d.svg.match(/<polyline/g).length, 2);
  assert.match(d.svg, /points="0.0,0.0 100.0,50.0 100.0,50.0" stroke="#111"/); assert.match(d.svg, /stroke="#777"/);
});

test('each named form gets its own colour', () => {
  const c = [1, 2, 3, 4, 5, 6, 7, 8].map(i => formColour(i).join(','));
  assert.equal(new Set(c).size, 8);
  for (const v of formColour(3)) assert.ok(v >= 0 && v <= 255);
});

test('panels of a row share its height and keep their shape; rows stack', () => {
  const L = layout(2, [{ height: 400, panels: [{ w: 1500, h: 1000, captions: 2 }, { w: 1000, h: 2000, captions: 1 }] }, { label: 'strip', height: 100, panels: [{ w: 2000, h: 200, captions: 0 }] }]);
  const [a, b] = L.rows[0].panels;
  assert.deepEqual([a.w, a.h, b.w, b.h], [600, 400, 200, 400]);
  assert.ok(b.x >= a.x + a.w, 'side by side'); assert.equal(a.y, b.y);
  assert.ok(L.rows[1].panels[0].y > a.y + a.h + 2 * 21, 'the next row starts under the captions');
  assert.ok(L.width >= L.rows[1].panels[0].x + 1000); assert.ok(L.height > L.rows[1].panels[0].y + 100);
});

test('cheat-risk is one line with its four parts, or says why there is none', () => {
  assert.equal(riskLine({ level: 'low', risk: 0.12, parts: { progression: 0, copy: 0.1, small: 0.02, pixelFit: 0 }, flags: [] }), 'cheat-risk: LOW 0.12 (order of work 0, copying 0.1, small marks 0.02, pixel fit 0)');
  assert.match(riskLine(null), /not measured/); assert.match(riskLine({ error: 'no frames', level: null }), /could not be measured \(no frames\)/);
});

const run = (dir, over = {}) => ({
  mode: 'plan', studiesMode: 'locked', started: '2026-11-21 22:00 UTC', seconds: 120, exit: 0, failure: null,
  subject: { key: 'dune:', id: 'dune', name: 'dune-dog', source: 'src/dune.png', sourceAbs: path.join(dir, 'a.png'), deviations: [{ what: 'cells across', now: '1200', record: '1500' }] },
  sheet: { widthMm: 280, cells: 1200, cellMm: 0.2333 }, drawing: { stem: 'vec/dune', medium: 'pencil (graphite)', files: [path.join(dir, 'dune-vectors.json')] },
  studies: [{ path: 'st/a.png', abs: path.join(dir, 'b.png'), role: 'block-in (the broad shapes)', floorMm2: 6, read: {} }],
  masks: { receipt: null }, author: { key: 'auto', name: 'auto' }, settings: [], switches: {}, code: { commit: 'db0bb9df1992', dirty: false },
  results: { state: 'plan only', planPreview: path.join(dir, 'b.png'), painting: null, strip: null, cheatRisk: null,
    plan: { shapes: 12, washes: 30, strokes: 400, stages: 4, widestBrushMm: 25.4, studies: [{ shapes: 12, washes: 20, strokes: 300 }] } },
  ...over,
});
async function fixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-sheet-'));
  for (const [f, c] of [['a.png', '#c8d8e8'], ['b.png', '#e8d8c8']]) await sharp({ create: { width: 150, height: 100, channels: 3, background: c } }).png().toFile(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'dune-vectors.json'), JSON.stringify({ sheetMm: 150, heightMm: 100, medium: 'pencil', strokes: [{ path: [[5, 5], [140, 90]], dark: 1 }] }));
  return dir;
}

test('a plan run: source, drawing, study, wash plan, and a panel that says it is a plan preview, not painted', async () => {
  const dir = await fixtures();
  try {
    const r = run(dir), panels = runPanels(r, { source: r.subject.sourceAbs, drawing: r.subject.sourceAbs, plan: r.results.planPreview, painting: r.subject.sourceAbs });
    assert.deepEqual(panels.map(p => p.title), ['Source', 'Opening drawing (pencil)', 'Study 1: block-in', 'Wash plan: auto', 'Plan preview, not painted']);
    assert.equal(panels[4].alert, 'NOT PAINTED'); assert.match(panels[3].captions.join(' '), /12 shapes, 30 washes, 400 strokes.*widest wash brush 25.4 mm/);
    assert.match(panels[2].captions[1], /gave 12 shapes/);
    const h = runHeader(r); assert.equal(h[0], 'dune (dune-dog) · plan preview, not painted · auto'); assert.doesNotMatch(h.join(' '), /CPU|GPU|db0bb9df/, 'no machine, no commit hash: those are in run.json'); assert.ok(h.some(l => /^DIFFERS.*cells across 1200/.test(l)));
    const out = await writeRunSheet(r, path.join(dir, 'sheet.jpg'), { height: 120 }), m = await sharp(out.file).metadata();
    assert.equal(m.format, 'jpeg'); assert.ok(m.width > 5 * 180 && m.height > 120);
    const unfinished = runPanels(run(dir, { mode: 'paint', results: { ...r.results, state: 'unfinished' } }), {}).at(-1);
    assert.equal(unfinished.alert, 'UNFINISHED'); assert.equal(unfinished.title, 'Painting: UNFINISHED');
    assert.equal(runPanels(run(dir, { mode: 'paint', results: { ...r.results, state: 'finished' } }), {}).at(-1).alert, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a grid: subjects down, authors across', async () => {
  const dir = await fixtures();
  try {
    const mk = (id, a) => run(dir, { subject: { ...run(dir).subject, key: id + ':', id }, author: { key: a, name: a } });
    const two = await writeGridSheet([mk('dune', 'auto'), mk('cat', 'auto')], path.join(dir, 'g1.jpg'), { height: 100 });
    const one = await composeSheet({ header: ['x'], rows: [{ height: 100, panels: [{ title: 't', captions: [], image: path.join(dir, 'a.png') }] }], file: path.join(dir, 'one.jpg') });
    assert.ok(two.height > 2 * 100 && two.height > one.height, 'one row for each subject');
    const cross = await writeGridSheet([mk('dune', 'auto'), mk('dune', 'opus'), mk('cat', 'auto'), mk('cat', 'opus')], path.join(dir, 'g2.jpg'), { height: 100 });
    // plan mode, two authors: source and one wash plan for each author
    assert.ok(cross.width >= 3 * 150 && cross.width < 5 * 150, `three panels across, got ${cross.width}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a working session is said in one plain line: what it handed over, looks, minutes, tool calls', () => {
  const base = { looks: [{}, {}], looksMost: 4, ownMinutes: 31.4, minutesMost: 85, toolCallsTotal: 57, ended: 'done' };
  assert.equal(sessionLine({ session: { ...base, submitted: { kind: 'settings', settings: { 'study1.shapes': '60', floors: '8,4,2' } } } }), 'changed 2 planner settings: study1.shapes=60, floors=8,4,2 · 2 looks · 31 min its own · 57 tool calls');
  assert.match(sessionLine({ session: { ...base, submitted: { kind: 'settings', settings: {} } } }), /^changed nothing: this is the code planner's plan · /);
  assert.match(sessionLine({ session: { ...base, submitted: { kind: 'plan', settings: {}, edit: { auto: 120, untouched: 90, untouchedShare: 0.75, changed: 12, moved: 2, merged: 3, mergedFrom: 14, dropped: 2, added: 4 } } } }), /^edited the code planner's plan: 90 of its 120 washes untouched \(75%\), 12 changed, 2 moved, 14 merged into 3, 2 left out, 4 of its own added · /);
  assert.match(sessionLine({ passages: 21, session: { ...base, wallMinutes: 61.2, ended: 'reached the benchmark\'s resource budget', budgetReached: { what: '60 minutes of wall time' }, submitted: { kind: 'script', settings: {} } } }), /^wrote its own script \(21 passages\) · 2 looks · 61 min on the clock, 31 min its own · REACHED THE BUDGET \(60 minutes of wall time\) · 57 tool calls$/);
  assert.equal(sessionLine({}), 'working session: not run');
});
