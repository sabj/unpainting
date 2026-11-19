// A drawn line's weight follows the subject's own line there: the reading of the line, and the pressure it asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineDarkness, pressureFor, weighStrokes, LIGHT_PRESSURE } from './line-weight.mjs';

// a 200 x 120 plane at 0.25 mm a pixel: paper at 95, and whatever `paint` puts on it
const W = 200, H = 120, PX = 0.25;
const plane = paint => { const L = new Float32Array(W * H).fill(95); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = paint(x, y); if (v != null) L[y * W + x] = v; } return L; };
const row = (y, x0 = 20, x1 = 180) => Array.from({ length: 9 }, (_, k) => [x0 + (x1 - x0) * k / 8, y]);
const band = (y0, y1, v) => (x, y) => (y >= y0 && y < y1 ? v : null);

test('a dark line on bare paper reads its own darkness and width', () => {
  const r = lineDarkness(row(60), plane(band(59, 61, 55)), W, H, PX);   // two pixels, 0.5 mm, 40 L* darker
  assert.ok(Math.abs(r.drop - 40) < 1.5, `drop ${r.drop}`);
  assert.ok(Math.abs(r.on - 55) < 1.5 && Math.abs(r.side - 95) < 0.5, `${r.on} against ${r.side}`);
  assert.ok(r.widthMm > 0.4 && r.widthMm < 0.75, `width ${r.widthMm} mm`);
});

test('a trace a pixel and a half off the subject\'s line still reads it; one two millimetres off does not', () => {
  const L = plane(band(59, 61, 55));
  assert.ok(lineDarkness(row(61.5), L, W, H, PX).drop > 35, 'within the 0.4 mm reach');
  assert.equal(lineDarkness(row(68), L, W, H, PX).drop, 0, '2 mm away is another place');
});

test('a tonal edge with no line on it reads as no line; a line drawn along the edge reads against the darker side', () => {
  const edge = (x, y) => (y >= 60 ? 60 : null);                          // paper above, a wash at 60 below
  assert.ok(lineDarkness(row(60), plane(edge), W, H, PX).drop < 1, 'the dark side of an edge is not a line');
  const outlined = (x, y) => (y >= 59 && y < 61 ? 35 : y >= 61 ? 60 : null);
  const r = lineDarkness(row(60), plane(outlined), W, H, PX);
  assert.ok(Math.abs(r.drop - 25) < 2, `35 against the wash's 60, not the paper's 95: ${r.drop}`);
});

test('the grain of a wash is not a line: a line stands along its run, grain cancels', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const grain = plane(() => 60 + 8 * (rnd() - 0.5));
  assert.ok(lineDarkness(row(60), grain, W, H, PX).drop < 2, `grain of +-4 L* reads ${lineDarkness(row(60), grain, W, H, PX).drop}`);
});

test('a line half on the subject\'s line reads the weaker half: at least half of it must be that dark', () => {
  const L = plane((x, y) => (y >= 59 && y < 61 && x < 85 ? 55 : null));    // the dark line stops at x 85 of 20..180
  assert.ok(lineDarkness(row(60), L, W, H, PX).drop < 1);
  assert.ok(lineDarkness(row(60, 20, 120), L, W, H, PX).drop > 35, 'cut to where two thirds of it lie on the line');
});

test('no path, no reading', () => {
  assert.equal(lineDarkness([[5, 5]], plane(() => null), W, H, PX).drop, 0);
  assert.equal(lineDarkness(row(60), plane(() => null), W, H, PX).drop, 0, 'bare paper');
  assert.ok(Number.isNaN(lineDarkness(row(60), plane(() => null), W, H, PX).widthMm));
});

const TABLE = [{ pressure: 0.2, drop: 2 }, { pressure: 0.4, drop: 5 }, { pressure: 0.7, drop: 10 }, { pressure: 1, drop: 16 }];

test('the pressure is read off the scrap table: light below the light pressure, firmest beyond the pencil', () => {
  assert.equal(LIGHT_PRESSURE, 0.35);
  assert.equal(pressureFor(0, TABLE), 0.35, 'the subject shows no line');
  assert.equal(pressureFor(3, TABLE), 0.35, 'a line fainter than the light pencil\'s own is drawn light, not lighter');
  assert.ok(Math.abs(pressureFor(7.5, TABLE) - 0.55) < 1e-9, 'halfway between two rungs');
  assert.equal(pressureFor(10, TABLE), 0.7);
  assert.equal(pressureFor(40, TABLE), 1, 'darker than the pencil can draw: its firmest, no more');
  assert.equal(pressureFor(0, TABLE, { floor: 0.1 }), 0.1);
  assert.throws(() => pressureFor(5, [TABLE[0]]), /table/);
});

test('a stroke takes its subject line\'s pressure whole, and the pencil\'s own width; other strokes stay as they were', () => {
  const pts = [{ x: 0, y: 0, s: 0.42, nw: 1.1 }, { x: 9, y: 0, s: 0.48, nw: 1.3 }];
  const dark = { points: pts, weight: 0.7, subjectLine: { drop: 10 } }, faint = { points: pts, weight: 0.7, subjectLine: { drop: 1 } };
  const authored = { points: [{ x: 0, y: 5 }, { x: 9, y: 5 }] }, authoredLight = { points: [{ x: 0, y: 9, s: 0.2 }, { x: 9, y: 9, s: 0.5 }], weight: 0.2 };
  const { strokes: [a, b, c, d], stats } = weighStrokes([dark, faint, authored, authoredLight], TABLE);
  assert.equal(a.weight, 0.7);
  assert.deepEqual(a.points, [{ x: 0, y: 0, s: 0.7 }, { x: 9, y: 0, s: 0.7 }], 'one pressure along the line, no contact width of the map\'s');
  assert.equal(b.weight, 0.35);
  assert.deepEqual(b.points, [{ x: 0, y: 0, s: 0.35, nw: 1.1 }, { x: 9, y: 0, s: 0.35, nw: 1.3 }], 'held to the light pressure, widths kept');
  assert.equal(c.weight, 0.35, 'a plan\'s line with no weight was drawn at the light pressure, and still is');
  assert.deepEqual(c.points, authored.points);
  assert.equal(d.weight, 0.2);
  assert.deepEqual(d.points.map(p => p.s), [0.2, 0.35]);
  assert.deepEqual(stats, { strokes: 4, weighed: 1, light: 3, beyond: 0, firmest: 1, pressures: [0.35, 0.35, 0.7] });
  assert.equal(weighStrokes([{ points: pts, subjectLine: { drop: 30 } }], TABLE).stats.beyond, 1, 'a line darker than the pencil is counted');
  assert.equal(dark.points[0].nw, 1.1, 'the input is not changed');
});
