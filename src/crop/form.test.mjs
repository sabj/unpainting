import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleForms, fitForm, planForms, orderForms, splitByWidth } from './form.mjs';
const line = (x, y, X, Y, n = 21) => ({ points: Array.from({ length: n }, (_, i) => ({ x: x + (X - x) * i / (n - 1), y: y + (Y - y) * i / (n - 1), w: 2 })) });
const oval = (a = 30, b = 16, start = 0, end = Math.PI * 2, n = 121) => ({ points: Array.from({ length: n }, (_, i) => { const t = start + (end - start) * i / (n - 1); return { x: 64 + a * Math.cos(t), y: 64 + b * Math.sin(t), w: 2 }; }) });
test('junction continues straight through rather than turning into the branch', () => {
  const forms = assembleForms([line(5, 30, 30, 30), line(30, 30, 60, 30), line(30, 30, 30, 55)]);
  assert.equal(forms.length, 2); assert.ok(forms.some(s => s.length > 54));
});
test('bridges curved evidence and closes a broken ellipse without joining adjacent parallels', () => {
  const parts = [oval(30, 16, 0.08, 3.06), oval(30, 16, 3.22, 6.20)];
  const forms = assembleForms(parts, { gap: 8 });
  assert.equal(forms.length, 1); assert.equal(forms[0].closed, true);
  assert.equal(assembleForms([line(10, 10, 60, 10), line(10, 14, 60, 14)]).length, 2);
});
test('rotated noisy ellipse becomes a genuine ellipse within tolerance', () => {
  const s = oval(); s.points = s.points.map((p, i) => { const x = p.x - 64, y = p.y - 64; return { x: 64 + x * 0.8 - y * 0.6 + 0.2 * Math.sin(i * 2), y: 64 + x * 0.6 + y * 0.8 }; });
  const f = fitForm({ ...s, closed: true }, { tolerance: 1 });
  assert.equal(f.fit.type, 'ellipse'); assert.ok(f.fit.error <= 1); assert.ok(f.fit.controls.length <= 5);
});
test('open circular arc fits an arc and S curve uses a sparse spline', () => {
  assert.equal(fitForm(oval(25, 25, 0, 2.2), { tolerance: 0.5, reach: Infinity }).fit.type, 'arc');
  const s = line(0, 30, 100, 30, 101); s.points.forEach(p => { p.y += 12 * Math.sin(p.x * Math.PI * 2 / 100); });
  const f = fitForm(s, { tolerance: 1, reach: Infinity }); assert.equal(f.fit.type, 'spline'); assert.ok(f.fit.controls.length <= 12); assert.ok(f.fit.error <= 1);
});
test('a long sweep is allowed further from the evidence than a short accent', () => {
  const wobble = (n, L) => { const s = line(0, 40, L, 40, n); s.points.forEach((p, i) => { p.y += 1.8 * Math.sin(i * 0.9); }); return s; };
  const s = wobble(120, 120);
  assert.equal(fitForm(s, { tolerance: 1, reach: Infinity }).fit.type, 'trace');   // held to a pixel it keeps the wobble
  const swept = fitForm(s, { tolerance: 1, reach: 90 });                           // allowed its length, it becomes a sweep
  assert.notEqual(swept.fit.type, 'trace'); assert.ok(swept.fit.error > 1 && swept.fit.error <= 2.4);
  assert.ok(fitForm(wobble(30, 30), { tolerance: 1, reach: 90 }).fit.error < 1);   // a short mark earns its curve at a pixel
});
test('a failed sparse fit retains the evidence rather than inventing a contour', () => {
  const s = line(0, 0, 100, 0, 101); s.points.forEach((p, i) => { p.y = i % 2 * 8; });
  const f = fitForm(s, { tolerance: 0.01, maxControls: 4 }); assert.equal(f.fit.type, 'trace'); assert.deepEqual(f.points, s.points);
});
test('anchors precede attached contours and texture independent of raster order', () => {
  const anchor = { ...oval(10, 7), closed: true, strength: 2, id: 'eye' }, contour = { ...line(74, 64, 100, 110), strength: 1, id: 'head' }, texture = { ...line(2, 2, 10, 3), strength: 0.1, kind: { type: 'texture' }, id: 'texture' };
  const ordered = orderForms([texture, contour, anchor], { width: 128, height: 128 });
  assert.deepEqual(ordered.map(s => s.id), ['eye', 'head', 'texture']); assert.equal(ordered[0].intent, 'anchor');
});
test('a rim broken by what crosses it is still an anchor, by how far it turns', () => {
  const rim = { ...oval(28, 26, 0.3, 5.4), strength: 1, id: 'lens' }, sweep = { ...line(10, 20, 118, 40), strength: 1, id: 'jaw' };
  const ordered = orderForms([sweep, rim], { width: 128, height: 128 });
  assert.deepEqual(ordered.map(s => s.id), ['lens', 'jaw']);
  assert.equal(ordered[0].intent, 'anchor'); assert.equal(ordered[1].intent, 'contour');
  assert.ok(ordered[0].roundness > 0.75 && ordered[1].roundness < 0.1);
  // a quarter of a turn is a corner in a contour, not a rim
  assert.equal(orderForms([{ ...oval(28, 26, 0, 1.5), strength: 1 }], { width: 128, height: 128 })[0].intent, 'contour');
});
test('planning is deterministic, budgeted and leaves inputs untouched', () => {
  const raw = [oval(), line(10, 10, 40, 10)], before = structuredClone(raw), options = { width: 128, height: 128, budget: 1 };
  assert.deepEqual(planForms(raw, options), planForms(raw, options)); assert.equal(planForms(raw, options).length, 1); assert.deepEqual(raw, before);
  assert.deepEqual(planForms([], options), []);
});
test('a form that runs from hairline into a loaded mark is cut where the instrument changes', () => {
  const P = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 20, w: i < 30 ? 1.2 : 7 }));
  const cut = splitByWidth({ points: P, closed: true }, { threshold: 4, minRun: 6 });
  const median = s => [...s.points].map(p => p.w).sort((a, b) => a - b)[s.points.length >> 1];
  assert.equal(cut.length, 2); assert.ok(median(cut[0]) < 4 && median(cut[1]) > 4);
  assert.deepEqual(cut[0].points.at(-1), cut[1].points[0]);   // the joint is drawn twice, so no gap opens at the change
  assert.equal(cut[0].closed, false); assert.ok(cut[0].length > 20 && cut[1].length > 20);
  // an even mark is left whole, and a moment of broadness too short to draw does not make a chip
  assert.equal(splitByWidth({ points: P.map(p => ({ ...p, w: 1.2 })) }, { threshold: 4 }).length, 1);
  const blip = P.map((p, i) => ({ ...p, w: i > 28 && i < 32 ? 7 : 1.2 }));
  assert.equal(splitByWidth({ points: blip }, { threshold: 4, minRun: 8 }).length, 1);
});
