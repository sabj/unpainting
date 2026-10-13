// scaleLines onto a plan of a different size and aspect: a 100 by 50 source read onto 300 by 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasLines, loadLines, scaleLines, linePaths } from './lines.mjs';

const DOC = {
  image: { w: 100, h: 50 },
  source: 'work/crops/synthetic.webp',
  lines: [
    { points: [[10, 10], [10, 30]], length: 20, strength: 0.4 },      // vertical, 20 source px
    { points: [[0, 40], [40, 40]], length: 40, strength: 0.9 },       // horizontal, 40 source px
    { points: [[5, 5]], length: 0, strength: 1 },                     // a point is not a line
  ],
};

const written = (dir, base, doc) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${base}-lines.json`), JSON.stringify(doc));
  return dir;
};

test('hasLines answers for the file that carries the polylines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-'));
  assert.equal(hasLines('beach-dog', dir), false);
  written(dir, 'beach-dog', DOC);
  assert.equal(hasLines('beach-dog', dir), true);
  assert.equal(linePaths('beach-dog', dir).lines, path.join(dir, 'beach-dog-lines.json'));
  assert.equal(linePaths('beach-dog', dir).map, path.join(dir, 'beach-dog.png'));
});

test('each axis scales on its own, and the length is remeasured on the plan', () => {
  const lines = scaleLines(DOC, 300, 100);                            // x by 3, y by 2
  const horizontal = lines.find(g => g.points[0].y === g.points[1].y);
  const vertical = lines.find(g => g.points[0].x === g.points[1].x);
  assert.deepEqual(horizontal.points, [{ x: 0, y: 80 }, { x: 120, y: 80 }]);
  assert.deepEqual(vertical.points, [{ x: 30, y: 20 }, { x: 30, y: 60 }]);
  assert.equal(horizontal.length, 120);                               // 40 source px by 3
  assert.equal(vertical.length, 40);                                  // 20 source px by 2, and not by 3
});

test('longest first on the plan, with a one-point path dropped and the strength carried', () => {
  const lines = scaleLines(DOC, 300, 100);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].length > lines[1].length);
  assert.equal(lines[0].strength, 0.9);
  // the plan's aspect turns the vertical into the longest line
  const tall = scaleLines(DOC, 100, 500);                             // x by 1, y by 10
  assert.equal(tall[0].length, 200);                                  // the 20 px vertical
  assert.equal(tall[0].strength, 0.4);
});

test('loadLines reads the file, and says so when there is none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-'));
  assert.throws(() => loadLines('beach-head', 300, 100, { dir }), /no line file/);
  written(dir, 'beach-head', DOC);
  const lines = loadLines('beach-head', 300, 100, { dir });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 120);
  assert.equal(lines[0].points.length, 2);
});

test('a line file made for another image or another aspect than the bound target is refused', async () => {
  const { bindLineTarget, lineTargetMismatch } = await import('./lines.mjs');
  try {
    bindLineTarget({ sha256: 'a'.repeat(64), w: 200, h: 100 });
    assert.equal(lineTargetMismatch({ ...DOC, targetSHA256: 'a'.repeat(64) }), null, 'same image, same aspect');
    assert.equal(lineTargetMismatch({ ...DOC, image: { w: 101, h: 50 } }), null, 'rounding between grids is not a stretch');
    assert.match(lineTargetMismatch({ ...DOC, targetSHA256: 'b'.repeat(64) }), /made for image bbbbbbbb/);
    assert.match(lineTargetMismatch({ ...DOC, image: { w: 100, h: 80 } }), /stretched/);
    assert.throws(() => scaleLines({ ...DOC, image: { w: 100, h: 80 } }, 300, 150), /does not belong to this target/);
    bindLineTarget(null);
    assert.equal(lineTargetMismatch({ ...DOC, image: { w: 100, h: 80 } }), null, 'nothing bound, nothing checked');
  } finally { bindLineTarget(null); }
});
