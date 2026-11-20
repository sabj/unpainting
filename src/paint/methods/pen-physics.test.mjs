import test from 'node:test';
import assert from 'node:assert/strict';
import { penPhysics, nibStroke, lineOutline, MAX_SHIFT_MM } from './pen-physics.mjs';

const line = (seq, len, w = 0.3) => { const path = [], widths = []; for (let x = 0; x <= len; x += 0.5) { path.push([10 + x, 20]); widths.push(w); } return { seq, dark: 1, drawn: 'path', path, widths, outline: [lineOutline(path, widths)] }; };
const blot = { seq: 9, dark: 1, fill: true, path: [[1, 1], [2, 2]], widths: [1, 1], outline: [[[1, 1], [3, 1], [3, 3], [1, 3]]] };

test('dial 0 is exact: the same document', () => {
  const doc = { strokes: [line(0, 40), blot] };
  assert.equal(penPhysics(doc, 0), doc);
  assert.throws(() => penPhysics(doc, 1.5), /0 to 1/);
});

test('above 0: same strokes in the same order, shapes that are not path-drawn lines untouched, seeded', () => {
  const doc = { strokes: [line(0, 40), blot, line(2, 4)] }, a = penPhysics(doc, 1, 7), b = penPhysics(doc, 1, 7), c = penPhysics(doc, 1, 8);
  assert.deepEqual(a.strokes.map(s => s.seq), [0, 9, 2]);
  assert.equal(a.strokes[1], blot);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.strokes[0].path, c.strokes[0].path);
});

test('bounded: no point moves more than 0.3 mm, the width stays within 0.6 to 1.2 of the drawn one, the overshoot is short', () => {
  for (const amount of [0.5, 1]) for (let seed = 1; seed < 30; seed++) {
    const src = line(seed, 10 + seed * 4), s = nibStroke(src, amount, seed);
    for (let k = 0; k < src.path.length; k++) {
      assert.ok(Math.hypot(s.path[k][0] - src.path[k][0], s.path[k][1] - src.path[k][1]) <= 0.15 * amount + 1e-3);
      assert.ok(s.widths[k] >= 0.6 * src.widths[k] - 1e-3 && s.widths[k] <= 1.2 * src.widths[k] + 1e-3);
    }
    assert.ok(s.path.length <= src.path.length + 1);
    const e = s.path[s.path.length - 1], q = src.path[src.path.length - 1];
    assert.ok(Math.hypot(e[0] - q[0], e[1] - q[1]) <= MAX_SHIFT_MM);
    assert.ok(s.dark <= src.dark && s.dark >= 0.85 * src.dark - 1e-3);
  }
});

test('a long stroke starves towards its end; a short one does not pale', () => {
  let thin = 0;
  for (let seed = 1; seed <= 20; seed++) { const s = nibStroke(line(seed, 100), 1, seed), n = s.widths.length; thin += s.widths[n - 3] < s.widths[Math.floor(n / 4)] ? 1 : 0; assert.ok(s.dark < 1); }
  assert.ok(thin >= 17);
  assert.equal(nibStroke(line(1, 10), 1, 1).dark, 1);
});
