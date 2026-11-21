import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './args.mjs';

test('one subject and a mode, with the defaults', () => {
  const r = parseArgs(['kasha-watercolor', 'plan']);
  assert.deepEqual(r, { subjects: [{ id: 'kasha-watercolor', variant: null }], mode: 'plan', authors: ['auto'], studies: 'locked', sets: [], out: null, dryRun: false, open: true });
});

test('several subjects, authors, settings and a variant', () => {
  const r = parseArgs(['mittens-closeup,h36:approved', 'paint', '--author', 'auto,opus', '--set', 'width=900', '--set', 'study2.clusters=20', '--out', 'x', '--dry-run', '--no-open']);
  assert.deepEqual(r.subjects, [{ id: 'mittens-closeup', variant: null }, { id: 'h36', variant: 'approved' }]);
  assert.deepEqual(r.authors, ['auto', 'opus']);
  assert.deepEqual(r.sets, [['width', '900'], ['study2.clusters', '20']]);
  assert.equal(r.out, 'x'); assert.equal(r.dryRun, true); assert.equal(r.open, false);
});

test('what is wrong is said', () => {
  assert.throws(() => parseArgs(['kasha']), /plan or paint/);
  assert.throws(() => parseArgs(['kasha', 'render']), /plan or paint, not "render"/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--fast']), /unknown option --fast/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'width']), /key=value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'a=1', '--set', 'a=2']), /twice/);
  assert.throws(() => parseArgs(['kasha,kasha', 'plan']), /twice/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--author']), /needs a value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'open']), /locked or author/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'author']), /needs a model/);
});
