import test from 'node:test';
import assert from 'node:assert/strict';
import { passage } from '../../crop/blockin.mjs';
import { readSubjectOrder, boxRanks, snapToSegments, subjectField, cutBySubject, orderBySubject, OVERLAP } from './subject-order.mjs';

const W = 40, H = 20, N = W * H;
const families = [{ id: 'sky', bounds: [0, 0, 1, 0.5] }, { id: 'boat', bounds: [0.4, 0.5, 0.6, 1] }];

// a value-plan layer of one whole-sheet passage (or the cells `keep` picks), as planLightToDark makes them
function layer(step, value, phase, keep = () => true) {
  const ids = new Int32Array(N), G = new Float32Array(N).fill(0.5); let area = 0;
  for (let i = 0; i < N; i++) if (keep(i)) { ids[i] = 1; area++; }
  const sh = passage(ids, 1, { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }, 0.5, area, W);
  sh.graded = G; sh._valuePlan = { id: `${phase}/${step}/p0/r0/s1`, edges: { hardCells: [0, N - 1], softCells: [] } };
  return { value, pigment: 0, shapes: [sh], mix: [1], amount: 0.5, area, _order: { phase: 'ground', region: 0, shoot: true }, _valuePhase: phase };
}
const ladder = () => [layer('b1', 1, 'light'), layer('b2L0', 2, 'mid'), layer('b2L1', 2, 'mid'), layer('b4', 4, 'shadow')];
const field = () => subjectField({ subjectOrder: [{ id: 'sky', families: ['sky'] }, { id: 'boat', families: ['boat'] }, { id: 'rest' }], families, labels: null, w: W, h: H });

test('subjectOrder resolves families to boxes and refuses unknown families', () => {
  const o = readSubjectOrder([{ id: 'boat', families: ['boat'] }, { id: 'sea', bounds: [[0, 0.5, 1, 1]] }], families);
  assert.deepEqual(o.subjects.map(s => [s.id, s.rank, s.boxes.length]), [['boat', 0, 1], ['sea', 1, 1]]);
  assert.equal(o.restRank, 2);
  assert.throws(() => readSubjectOrder([{ id: 'x', families: ['nope'] }], families), /no family nope/);
  assert.throws(() => readSubjectOrder([{ id: 'x' }], families), /name families or bounds/);
  assert.throws(() => readSubjectOrder([], families), /non-empty/);
});

test('a cell belongs to the smallest box that holds it', () => {
  const o = readSubjectOrder([{ id: 'sea', bounds: [[0, 0.5, 1, 1]] }, { id: 'boat', families: ['boat'] }], families);
  const r = boxRanks(o, W, H);
  assert.equal(r[15 * W + 20], 1);   // inside the boat box, which also lies in the sea
  assert.equal(r[15 * W + 2], 0);    // sea only
  assert.equal(r[2 * W + 2], 2);     // neither: the rest
});

test('a subject edge settles on the nearest colour edge, not the box edge', () => {
  const rank = new Uint8Array(N), labels = new Uint16Array(N);
  for (let i = 0; i < N; i++) { if ((i % W) < 10) rank[i] = 1; labels[i] = (i % W) < 12 ? 1 : 2; }
  const out = snapToSegments(rank, labels, W, H, 2);
  for (let i = 0; i < N; i++) assert.equal(out[i], (i % W) < 12 ? 1 : 0, `cell ${i % W},${i / W | 0}`);
});

test('a box narrower than the margin keeps its middle as seeds', () => {
  const rank = new Uint8Array(N), labels = new Uint16Array(N).fill(1);
  for (let i = 0; i < N; i++) if ((i % W) >= 19 && (i % W) < 22) rank[i] = 1;
  const out = snapToSegments(rank, labels, W, H, 2);
  assert.ok(out.some(r => r === 1));
  assert.ok(out.every(r => r < 2));
});

test('strength 0 keeps the whole-sheet bands untouched', () => {
  const L = ladder();
  const r = orderBySubject(L, { field: field(), strength: 0, w: W, n: N });
  assert.equal(r.layers, L);
  assert.equal(r.summary, null);
});

test('strength 1: each subject runs light to dark before the next, rest last', () => {
  const r = orderBySubject(ladder(), { field: field(), strength: 1, w: W, n: N });
  assert.deepEqual(r.order, ['sky:b1', 'sky:b2L0', 'sky:b2L1', 'boat:b1', 'sky:b4', 'boat:b2L0', 'boat:b2L1', 'rest:b1', 'boat:b4', 'rest:b2L0', 'rest:b2L1', 'rest:b4']
    .filter(s => r.order.includes(s)));
  const ranks = r.layers.map(L => L._subject.rank);
  // mostly subject by subject: the overlap lets a subject's last glaze follow the next subject's first wash
  assert.ok(OVERLAP < 1);
  for (const s of [0, 1, 2]) { const steps = r.layers.filter(L => L._subject.rank === s).map(L => L.value); assert.deepEqual(steps, [...steps].sort((a, b) => a - b)); }
  assert.equal(ranks[0], 0);
  assert.equal(ranks.at(-1), 2);
});

test('strength 0.5 overlaps subjects: the second starts before the first has finished', () => {
  const r = orderBySubject(ladder(), { field: field(), strength: 0.5, w: W, n: N });
  const firstBoat = r.layers.findIndex(L => L._subject.rank === 1), lastSky = r.layers.findLastIndex(L => L._subject.rank === 0);
  assert.ok(firstBoat < lastSky);
  assert.equal(r.layers[0]._subject.name, 'sky');
});

test('cutting keeps every cell once and the plan mass; parts carry only their own edges', () => {
  const f = field(), L = layer('b1', 1, 'light'), sh = L.shapes[0];
  const ids = new Int32Array(N); let id = 0;
  const parts = cutBySubject(sh, ids, () => ++id, { ...f, w: W, phase: 'light' });
  assert.equal(parts.length, 3);
  assert.equal(parts.reduce((a, p) => a + p.sh.area, 0), N);
  const mass = parts.reduce((a, p) => a + p.sh.amount * p.sh.area, 0);
  assert.ok(Math.abs(mass - 0.5 * N) < 1e-3);
  const all = parts.flatMap(p => p.sh._valuePlan.edges.hardCells).sort((a, b) => a - b);
  assert.deepEqual(all, [0, N - 1]);
  for (const p of parts) { const m = p.sh.mask; for (let i = 0; i < N; i++) if (m[i]) assert.equal(f.rank[i], p.rank); }
});

test('a shadow glaze stays whole unless a large part lies in another subject', () => {
  const f = field();
  // a shadow mostly in the sky with a small tail in the boat
  const L = layer('b4', 4, 'shadow', i => (i / W | 0) < 10 || ((i / W | 0) < 12 && (i % W) >= 17 && (i % W) < 23));
  const parts = cutBySubject(L.shapes[0], new Int32Array(N), (() => { let k = 0; return () => ++k; })(), { ...f, w: W, phase: 'shadow' });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].rank, 0);
  assert.equal(parts[0].sh, L.shapes[0]);
});
