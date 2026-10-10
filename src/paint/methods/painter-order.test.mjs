import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passage } from '../../crop/blockin.mjs';
import { bandOf, components, painterOrder, subjectRegions } from './painter-order.mjs';

const W = 20, H = 20, N = W * H;
// a passage over the cells where pred(x, y) holds
const shape = (pred, amount = 0.1) => {
  const ids = new Uint8Array(N); let a = 0; const b = { x0: W, y0: H, x1: -1, y1: -1 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pred(x, y)) { ids[y * W + x] = 1; a++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); }
  const sh = passage(ids, 1, b, amount, a, W); sh.mix = [amount, 0]; return sh;
};
const layer = (value, pigment, shapes) => ({ value, pigment, shapes, mix: [0.1, 0], amount: 0.1, area: shapes.reduce((s, x) => s + x.area, 0) });
// the subject: a block in the middle columns
const SUBJ = Uint8Array.from({ length: N }, (_, i) => (i % W >= 7 && i % W < 13 ? 1 : 0));

test('bandOf puts value 1 in light and splits the ladder at the thresholds', () => {
  assert.equal(bandOf(1, 24), 'light');
  assert.equal(bandOf(6, 24), 'light');
  assert.equal(bandOf(10, 24), 'mid');
  assert.equal(bandOf(20, 24), 'dark');
});

test('components finds two separate blocks', () => {
  const m = Uint8Array.from({ length: N }, (_, i) => (i % W < 3 || i % W > 16 ? 1 : 0));
  const { parts } = components(m, W, { x0: 0, y0: 0, x1: W - 1, y1: H - 1 });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].area, 60);
});

test('painterOrder lays ground light, subject light, mids across pans, darks, keeps area and film mass', () => {
  const all = () => shape(() => true);
  const layers = [layer(1, 0, [all()]), layer(3, 0, [all()]), layer(8, 0, [all()]), layer(1, 1, [all()]), layer(3, 1, [all()]), layer(8, 1, [all()])];
  const film = new Map(); for (const L of layers) for (const sh of L.shapes) film.set(sh, sh.amount * sh.area);
  const before = [...film.values()].reduce((a, b) => a + b, 0);
  const { layers: out, summary } = painterOrder(layers, { subject: SUBJ, w: W, n: N, steps: 8, light: 0.25, dark: 0.6, regions: 2, film });
  const phases = out.map(L => L._order.phase);
  assert.deepEqual([...new Set(phases)], ['ground', 'subject', 'mid', 'dark']);
  // the second pan's light and mid come before the first pan's dark
  const firstDark = out.findIndex(L => L._order.phase === 'dark');
  assert.ok(out.slice(0, firstDark).some(L => L.pigment === 1 && L.value === 3));
  // ground passages lie off the subject, subject passages on it
  for (const L of out) for (const sh of L.shapes) {
    const m = sh.mask; let on = 0, a = 0; for (let i = 0; i < N; i++) if (m[i]) { a++; on += SUBJ[i]; }
    assert.equal(a, sh.area);
    if (L._order.phase === 'ground') assert.equal(on, 0);
    if (L._order.phase === 'subject') assert.equal(on, a);
  }
  const area = summary.reduce((s, p) => s + p.area, 0) * N;
  assert.equal(area, 6 * N);
  let after = 0; for (const L of out) for (const sh of L.shapes) after += film.get(sh);
  assert.ok(Math.abs(after - before) < 1e-9);
  // each ground region ends with a frame
  assert.ok(out.filter(L => L._order.phase === 'ground').some(L => L._order.shoot));
});

test('the ground is split into its regions, top of the sheet first', () => {
  // ground split by the subject into a left and a right strip, each laid as its own part
  const { layers: out } = painterOrder([layer(1, 0, [shape(() => true)])], { subject: SUBJ, w: W, n: N, steps: 8, regions: 1 });
  const ground = out.filter(L => L._order.phase === 'ground').flatMap(L => L.shapes);
  assert.equal(ground.length, 2);
});

test('--ordersubject drawing: the subject cut by its drawing into regions, each laid and filmed in turn', () => {
  // a line across the subject block at row 10 closes off a top and a bottom region
  const lines = [{ points: [{ x: 6, y: 10 }, { x: 14, y: 10 }] }];
  const sr = subjectRegions(SUBJ, lines, { w: W, n: N, max: 6, minShare: 0.04 });
  assert.equal(sr.areas.length, 2);
  assert.equal(sr.areas.reduce((a, b) => a + b, 0), sr.subjArea);
  const film = new Map();
  const layers = [layer(1, 0, [shape(() => true)]), layer(2, 1, [shape(() => true)])];
  for (const L of layers) for (const sh of L.shapes) film.set(sh, sh.amount * sh.area);
  const { layers: out } = painterOrder(layers, { subject: SUBJ, w: W, n: N, steps: 8, regions: 1, film, subjectLabels: sr.label });
  const subj = out.filter(L => L._order.phase === 'subject');
  // region-major: both pans' light values in region 0, then both in region 1, a frame at the end of each
  assert.deepEqual(subj.map(L => L._order.region), [0, 0, 1, 1]);
  assert.deepEqual(subj.map(L => L._order.shoot), [false, true, false, true]);
  let a = 0; for (const L of subj) a += L.area;
  assert.equal(a, 2 * sr.subjArea);
  // without labels the subject is one frame-less group
  const { layers: old } = painterOrder([layer(1, 0, [shape(() => true)])], { subject: SUBJ, w: W, n: N, steps: 8, regions: 1 });
  assert.ok(old.filter(L => L._order.phase === 'subject').every(L => !L._order.shoot));
});
