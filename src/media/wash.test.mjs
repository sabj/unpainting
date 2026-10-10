// Sweeps have to run along the passage, not always across the sheet. Every picture here is a shape whose direction
// is not in doubt, and the test asks which way the paths came out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { washPaths, directedWashPaths, brushedWashPaths, sweepAngle, gradientSweepAngle, openEdgeShare, prewetArea, sweepCover, sweepCount, containPaths } from './wash.mjs';

const W = 120, H = 120, N = W * H;
const blank = () => new Uint8Array(N);
/** A bar of the given length and thickness through the middle, turned by `deg`. */
const bar = (long, thick, deg) => {
  const m = blank(), a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - W / 2, dy = y - H / 2;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) < long / 2 && Math.abs(v) < thick / 2) m[y * W + x] = 1;
  }
  return m;
};
/** Mean path direction in degrees, computed from end-to-end vectors. */
const pathAngle = paths => {
  let sx = 0, sy = 0;
  for (const p of paths) {
    if (p.length < 2) continue;
    let dx = p[p.length - 1].x - p[0].x, dy = p[p.length - 1].y - p[0].y;
    if (dx < 0) { dx = -dx; dy = -dy; }          // a sweep has no head or tail
    const m = Math.hypot(dx, dy) || 1;
    sx += dx / m; sy += dy / m;
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI;
};
const near = (a, b, tol) => Math.abs(((a - b + 540) % 180) - 90) > 90 - tol;

test('a bar lying across the sheet is swept along it, not down it', () => {
  // the row scanner would lay one sweep straight down a horizontal bar, across the passage
  const m = bar(90, 16, 0);
  const across = pathAngle(washPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 }));
  const along = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 }));
  assert.ok(near(across, 90, 25), `the row scanner runs across it: ${across.toFixed(0)} degrees`);
  assert.ok(near(along, 0, 25), `and the directed one runs along it: ${along.toFixed(0)} degrees`);
});

test('a passage wider than the biggest brush is covered by several sweeps, not one stamp', () => {
  const m = blank();
  for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1;   // 80 cells across
  const one = washPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 });
  const many = brushedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, maxRadius: 12, wobble: 0 });
  assert.ok(one.length <= 2, `the row scanner uses one sweep: ${one.length}`);
  assert.ok(Math.max(...one.flat().map(p => p.r)) > 30, 'as wide as the passage');
  assert.ok(many.length >= 4, `a real brush needs several: ${many.length}`);
  assert.ok(Math.max(...many.flat().map(p => p.r)) <= 12.01, 'none of them wider than the brush');
});

test('the sweeps of a wide passage together cover it', () => {
  const m = blank();
  for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1;
  const covered = new Uint8Array(N);
  for (const p of brushedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, maxRadius: 12, wobble: 0 })) {
    for (const q of p) for (let dy = -q.r; dy <= q.r; dy++) for (let dx = -q.r; dx <= q.r; dx++) {
      const x = Math.round(q.x + dx), y = Math.round(q.y + dy);
      if (dx * dx + dy * dy <= q.r * q.r && x >= 0 && y >= 0 && x < W && y < H) covered[y * W + x] = 1;
    }
  }
  let on = 0, area = 0;
  for (let i = 0; i < N; i++) if (m[i]) { area++; on += covered[i]; }
  assert.ok(on / area > 0.9, `${(100 * on / area).toFixed(0)}% of the passage is reached`);
});

test('a brush does not keep one width down a stroke', () => {
  const m = bar(90, 20, 0);
  const paths = brushedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, maxRadius: 8, wobble: 0.2, seed: 3 });
  const varied = paths.filter(p => { const rs = p.map(q => q.r); return Math.max(...rs) - Math.min(...rs) > 0.4; });
  assert.ok(varied.length > 0, 'its width breathes as it goes');
});

test('a bar at forty five degrees is swept at forty five degrees', () => {
  const along = pathAngle(directedWashPaths(bar(90, 16, 45), W, H, { pad: 1, minRadius: 1, minLength: 3 }));
  assert.ok(near(along, 45, 25), `${along.toFixed(0)} degrees`);
});

test('a round passage with no length of its own follows the picture inside it', () => {
  const m = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 60) ** 2 + (y - 60) ** 2 < 34 * 34) m[y * W + x] = 1;
  // stripes running down the sheet: the structure inside says vertical even though the shape says nothing
  const field = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) field[y * W + x] = 0.3 + 0.2 * (Math.floor(x / 6) % 2);
  // sweepAngle returns the turn that brings the sweep direction to vertical, so the direction itself is that plus a
  // quarter; the stripes run down the sheet, so it should come back near 90
  const dir = ((sweepAngle(m, field, W, H) * 180) / Math.PI) + 90;
  assert.ok(near(dir, 90, 25), `along the stripes: ${dir.toFixed(0)} degrees`);
});

test('a round passage with nothing to follow is left to the plain scanner', () => {
  const m = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 60) ** 2 + (y - 60) ** 2 < 30 * 30) m[y * W + x] = 1;
  assert.equal(sweepAngle(m, new Float32Array(N), W, H), 0, 'no direction is invented from nothing');
});

test('the paths still lie inside the passage after being turned and brought back', () => {
  const m = bar(80, 20, 60);
  const paths = directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 });
  assert.ok(paths.length, 'it lays something');
  let inside = 0, total = 0;
  for (const p of paths) for (const q of p) {
    const x = Math.round(q.x - 0.5), y = Math.round(q.y - 0.5);
    total++;
    if (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]) inside++;
  }
  assert.ok(inside / total > 0.9, `${(100 * inside / total).toFixed(0)}% of the path sits on the passage`);
});


test('a walked sweep stays in the passage it was given', () => {
  // two bars with a gap between them: a sweep in one must not wander into the other
  const m = blank();
  for (let y = 30; y < 50; y++) for (let x = 15; x < 105; x++) m[y * W + x] = 1;
  const field = new Float32Array(N);
  for (let i = 0; i < N; i++) field[i] = m[i] ? 0.4 : 0;
  const paths = brushedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, maxRadius: 8, field, wobble: 0, seed: 5 });
  let inside = 0, total = 0;
  for (const p of paths) for (const q of p) {
    const x = Math.round(q.x - 0.5), y = Math.round(q.y - 0.5);
    total++;
    if (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]) inside++;
  }
  assert.ok(inside / total > 0.92, `${(100 * inside / total).toFixed(0)}% of the walked path is on the passage`);
});

test('the same passage on a bigger sheet takes the same number of sweeps when the brush grows with it', () => {
  // a brush is a share of the sheet, so sweep count does not grow with resolution
  const count = side => {
    const m = new Uint8Array(side * side);
    for (let y = side * 0.25; y < side * 0.75; y++) for (let x = side * 0.2; x < side * 0.8; x++) m[(y | 0) * side + (x | 0)] = 1;
    return brushedWashPaths(m, side, side, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: 0.076 * side, wobble: 0, seed: 3 }).length;
  };
  const small = count(120), big = count(360);
  assert.ok(big <= small * 1.6, `120 cells wide takes ${small} sweeps, 360 takes ${big}`);
});

test('a passage laid twice over is under two sweeps, and one laid once under one', () => {
  const m = blank();
  for (let y = 50; y < 70; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1;
  const lane = Array.from({ length: 41 }, (_, i) => ({ x: 20 + i * 2 + 0.5, y: 60.5, r: 11 }));
  const once = sweepCover([lane], m, W, H), twice = sweepCover([lane, lane], m, W, H);
  assert.ok(Math.abs(once - 1) < 0.1, `one sweep: ${once.toFixed(2)}`);
  assert.ok(Math.abs(twice - 2) < 0.2, `two sweeps: ${twice.toFixed(2)}`);
});

test('the sweeps over each cell are counted where they overlap and nowhere else, and average to the cover', () => {
  const m = blank();
  for (let y = 40; y < 80; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1;
  // two level lanes of radius 8, centres 12 rows apart: they overlap in the rows between them
  const lane = y => Array.from({ length: 41 }, (_, i) => ({ x: 20 + i * 2 + 0.5, y: y + 0.5, r: 8 }));
  const paths = [lane(54), lane(66)], count = sweepCount(paths, W, H);
  assert.equal(count[60 * W + 60], 2, 'between the two lanes, both lie over the cell');
  assert.equal(count[48 * W + 60], 1, 'above the lower lane, only the upper one');
  assert.equal(count[72 * W + 60], 1, 'and below the upper, only the lower');
  assert.equal(count[20 * W + 60], 0, 'and far from both, neither');
  // a lane that passes over a cell twice counts once
  assert.equal(sweepCount([[...lane(54), ...lane(54)]], W, H)[54 * W + 60], 1);
  let sum = 0, cells = 0; for (let i = 0; i < N; i++) if (m[i]) { sum += count[i]; cells++; }
  assert.ok(Math.abs(sum / cells - sweepCover(paths, m, W, H)) < 1e-9, 'the mean count over the passage is its cover');
});

test('a narrow passage gets a brush nearly as wide as itself when the pad is a share', () => {
  const m = blank();
  for (let y = 20; y < 100; y++) for (let x = 58; x < 63; x++) m[y * W + x] = 1;          // five cells wide
  const r = paths => Math.max(...paths.flat().map(p => p.r));
  const fixed = r(washPaths(m, W, H, { pad: 1.5, minRadius: 0.5, minLength: 3 }));
  const shared = r(washPaths(m, W, H, { pad: 1.5, padShare: 0.15, minRadius: 0.5, minLength: 3 }));
  assert.ok(fixed <= 1.01, `a fixed pad leaves a brush of ${fixed}`);
  assert.ok(shared > 2, `a shared pad leaves ${shared.toFixed(2)} of the 2.5 there is`);
  const wide = blank();
  for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) wide[y * W + x] = 1;
  assert.equal(r(washPaths(wide, W, H, { pad: 1.5, padShare: 0.15, minRadius: 0.5, minLength: 3 })), r(washPaths(wide, W, H, { pad: 1.5, minRadius: 0.5, minLength: 3 })), 'a wide passage is unchanged');
});

test('a sweep wholly off the sheet covers nothing and does not throw', () => {
  const m = blank(); for (let i = 0; i < N; i++) m[i] = 1;
  const off = [{ x: -400, y: -400, r: 5 }, { x: -390, y: -400, r: 5 }];
  assert.equal(sweepCover([off], m, W, H), 0);
});

test('a contained sweep never lays its brush outside the passage', async () => {
  const { distanceToZero } = await import('../raster.js');
  // a ragged passage: a diamond, whose rows narrow above and below every centre
  const m = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.abs(x - 60) + Math.abs(y - 60) < 40) m[y * W + x] = 1;
  const outsideShare = paths => {
    let inside = 0, outside = 0;
    for (const pts of paths) for (const q of pts) for (let dy = -Math.ceil(q.r); dy <= q.r; dy++) for (let dx = -Math.ceil(q.r); dx <= q.r; dx++) {
      if (dx * dx + dy * dy > q.r * q.r) continue;
      const x = Math.floor(q.x + dx), y = Math.floor(q.y + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      m[y * W + x] ? inside++ : outside++;
    }
    return outside / Math.max(1, inside + outside);
  };
  const raw = washPaths(m, W, H, { pad: 1.5, minRadius: 1, minLength: 3 });
  const held = containPaths(raw, distanceToZero(m, W, H), W, H, { minRadius: 1, minLength: 3 });
  assert.ok(outsideShare(raw) > 0.1, `the scanline sweep spills: ${(100 * outsideShare(raw)).toFixed(0)}%`);
  assert.ok(outsideShare(held) < 0.02, `the contained one does not: ${(100 * outsideShare(held)).toFixed(1)}%`);
  assert.ok(held.length > 0, 'and it still paints the passage');
});

test('a lane down a narrow flat passage keeps to its centre, so holding it inside does not narrow its brush', async () => {
  const { distanceToZero } = await import('../raster.js');
  // a bar 20 cells high takes one lane of radius 10 less the pad; the lane must stay centred
  const m = blank(), field = new Float32Array(N);
  for (let y = 50; y < 70; y++) for (let x = 5; x < 115; x++) { m[y * W + x] = 1; field[y * W + x] = 0.3; }
  const lanes = brushedWashPaths(m, W, H, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: 15, field, seed: 17 });
  assert.equal(lanes.length, 1, 'one lane is as wide as the bar');
  const held = containPaths(lanes, distanceToZero(m, W, H), W, H, { minRadius: 0.8, minLength: 2, slack: 0.5 });
  const rs = held.flat().map(p => p.r).sort((a, b) => a - b), median = rs[rs.length >> 1];
  assert.ok(median > 6.5, `the held brush is ${median.toFixed(1)} of the 8.5 the lane was given`);
});

test('a passage with no direction of its own is swept the way the hand takes it, not always along the rows', () => {
  const m = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 60) ** 2 + (y - 60) ** 2 < 34 * 34) m[y * W + x] = 1;
  const plain = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 }));
  const handed = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, fallbackAngle: Math.PI / 4 }));
  assert.ok(Math.abs(((plain - handed + 540) % 180) - 90) < 70, `the hand's angle turns the sweeps: ${plain.toFixed(0)} against ${handed.toFixed(0)} degrees`);
});

test('a graded wash is swept down its gradient, even where its shape is wider than it is tall', () => {
  // a sky: 110 wide by 50 tall, paling from top to bottom. Its shape alone sends the sweeps level.
  const m = blank();
  for (let y = 5; y < 55; y++) for (let x = 5; x < 115; x++) m[y * W + x] = 1;
  const sky = Float32Array.from({ length: N }, (_, i) => (m[i] ? 1 - ((i / W) | 0) / 60 : 0));
  const byShape = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3 }));
  assert.ok(near(byShape, 0, 20), `its shape runs the sweeps level: ${byShape.toFixed(0)} degrees`);
  const down = gradientSweepAngle(sky, m, W, H);
  const graded = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, angle: down }));
  assert.ok(near(graded, 90, 20), `down the gradient they run down the sheet: ${graded.toFixed(0)} degrees`);
  // and the hand's own angle, which stands in for a passage with no direction, does not overrule one that was given
  const handed = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, angle: down, fallbackAngle: Math.PI / 4 }));
  assert.ok(near(handed, 90, 20), `given a direction, the hand keeps it: ${handed.toFixed(0)} degrees`);
  // a ramp running left to right turns them the other way
  const side = Float32Array.from({ length: N }, (_, i) => (m[i] ? (i % W) / W : 0));
  const sideways = pathAngle(directedWashPaths(m, W, H, { pad: 1, minRadius: 1, minLength: 3, angle: gradientSweepAngle(side, m, W, H) }));
  assert.ok(near(sideways, 0, 20), `a ramp across the sheet is swept across it: ${sideways.toFixed(0)} degrees`);
  assert.equal(gradientSweepAngle(new Float32Array(N), m, W, H), null, 'and a flat field has no direction to give');
});

test('a passage in the middle of the sheet is all open edge; one against the border is open only where it meets paper', () => {
  const mid = blank();
  for (let y = 35; y < 85; y++) for (let x = 35; x < 85; x++) mid[y * W + x] = 1;
  assert.ok(Math.abs(openEdgeShare(mid, W, H) - 196 / 2500) < 1e-9, `a 50-cell square: ${openEdgeShare(mid, W, H).toFixed(4)}`);
  // the top 60 rows of the sheet: only its foot, 120 cells of 7200, can lose what runs past it
  const sky = blank();
  for (let y = 0; y < 60; y++) for (let x = 0; x < W; x++) sky[y * W + x] = 1;
  assert.ok(Math.abs(openEdgeShare(sky, W, H) - 120 / 7200) < 1e-9, `a sky across the top: ${openEdgeShare(sky, W, H).toFixed(4)}`);
  assert.equal(openEdgeShare(blank(), W, H), 0);
});

test('clean water before a graded wash runs past its pale foot onto pale paper, and stops at anything darker', () => {
  // a sky over the top 40 rows paling to 0.05, then paper (0) except a dark post (0.8) standing against the sky's foot
  const m = blank(), D = new Float32Array(N);
  for (let y = 0; y < 40; y++) for (let x = 0; x < W; x++) { m[y * W + x] = 1; D[y * W + x] = 0.05 + 0.5 * (1 - y / 40); }
  for (let y = 40; y < 70; y++) for (let x = 50; x < 60; x++) D[y * W + x] = 0.8;
  // and a thin dark line three cells below the foot, with pale paper again beyond it
  for (let x = 0; x < 30; x++) D[43 * W + x] = 0.8;
  const wet = prewetArea(m, D, W, H, { reach: 6 });
  for (let i = 0; i < N; i++) if (m[i]) assert.equal(wet[i], 1, 'the passage itself is wetted');
  assert.equal(wet[45 * W + 90], 1, 'pale paper five cells below the foot is wetted');
  assert.equal(wet[47 * W + 90], 0, 'and seven cells below is not');
  assert.equal(wet[41 * W + 55], 0, 'the dark post against the foot stays dry');
  assert.equal(wet[42 * W + 10], 1, 'paper above the dark line is wetted');
  assert.equal(wet[44 * W + 10], 0, 'and the water does not step over the line onto the paper beyond it');
  assert.equal(prewetArea(m, D, W, H, { reach: 0 }), m, 'no reach, no change');
});

test('--firstwash: a sweep whose points are inside but whose segment crosses a notch is cut there', async () => {
  const { distanceToZero } = await import('../raster.js');
  // two blocks joined only along the bottom: a U, with paper between the arms
  const m = blank();
  for (let y = 20; y < 100; y++) for (let x = 10; x < 110; x++) if (y > 80 || x < 45 || x > 75) m[y * W + x] = 1;
  const lane = [{ x: 25, y: 40, r: 3, p: 1 }, { x: 27, y: 40, r: 3, p: 1 }, { x: 29, y: 40, r: 3, p: 1 }, { x: 31, y: 40, r: 3, p: 1 },
    { x: 90, y: 40, r: 3, p: 1 }, { x: 92, y: 40, r: 3, p: 1 }, { x: 94, y: 40, r: 3, p: 1 }, { x: 96, y: 40, r: 3, p: 1 }];
  const dist = distanceToZero(m, W, H);
  const old = containPaths([lane], dist, W, H, { minRadius: 1, minLength: 2 });
  assert.equal(old.length, 1, 'points only: the jump across the notch survives');
  const held = containPaths([lane], dist, W, H, { minRadius: 1, minLength: 2, segments: true });
  assert.equal(held.length, 2);
  for (const run of held) for (let k = 1; k < run.length; k++) assert.ok(Math.abs(run[k].x - run[k - 1].x) < 10);
});
