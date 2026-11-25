import test from 'node:test';
import assert from 'node:assert/strict';
import { linesByRole, lineRole, roleFamilies } from './family-roles.mjs';

const line = (x0, y0, x1, y1) => ({ points: Array.from({ length: 11 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 10, y: y0 + (y1 - y0) * k / 10 })) });
const fams = [
  { id: 'dog', bounds: [0, 0, 1, 1], drawingRole: 'structural' },
  { id: 'ear', bounds: [0, 0.5, 0.4, 1], drawingRole: 'none' },
  { id: 'eye', bounds: [0.5, 0.2, 0.7, 0.3], drawingRole: 'focal' },
  { id: 'sky', bounds: [0, 0, 1, 0.1] },
];

test('a family with role none gets no lines; the smallest family under a line decides', () => {
  const ear = line(10, 60, 30, 90), body = line(50, 50, 90, 50);
  const r = linesByRole([ear, body], fams, { w: 100, h: 100, stage: 'opening' });
  assert.deepEqual(r.lines, [body]);
  assert.deepEqual(r.dropped, { none: 1 });
});

test('opening keeps scaffold and structural, closing keeps structural and focal (the area plan words)', () => {
  const eye = line(52, 22, 68, 28);
  assert.equal(lineRole(roleFamilies(fams), eye, 100, 100), 'focal');
  assert.equal(linesByRole([eye], fams, { w: 100, h: 100, stage: 'opening' }).lines.length, 0);
  assert.equal(linesByRole([eye], fams, { w: 100, h: 100, stage: 'closing' }).lines.length, 1);
  const scaffold = [{ id: 'a', bounds: [0, 0, 1, 1], drawingRole: 'scaffold' }];
  assert.equal(linesByRole([eye], scaffold, { w: 100, h: 100, stage: 'opening' }).lines.length, 1);
  assert.equal(linesByRole([eye], scaffold, { w: 100, h: 100, stage: 'closing' }).lines.length, 0);
});

test('a plan that states no role changes nothing; a line is never cut', () => {
  const ls = [line(10, 60, 30, 90), line(0, 0, 99, 99)];
  assert.equal(linesByRole(ls, [{ id: 'x', bounds: [0, 0, 1, 1] }], { w: 100, h: 100, stage: 'closing' }).lines, ls);
  const half = line(30, 70, 70, 70); // half in the ear (none), half in the dog: most of it decides, whole
  const r = linesByRole([half], fams, { w: 100, h: 100, stage: 'opening' });
  assert.equal(r.lines.length + Object.values(r.dropped).reduce((a, b) => a + b, 0), 1);
  if (r.lines.length) assert.equal(r.lines[0], half);
});

test('an unknown role or a role without bounds is refused', () => {
  assert.throws(() => roleFamilies([{ id: 'a', bounds: [0, 0, 1, 1], drawingRole: 'outline' }]), /drawingRole/);
  assert.throws(() => roleFamilies([{ id: 'a', drawingRole: 'none' }]), /bounds/);
});
