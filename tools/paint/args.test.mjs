import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './args.mjs';

test('one subject and a mode, with the defaults', () => {
  const r = parseArgs(['kasha-watercolor', 'plan']);
  assert.deepEqual(r, { subjects: [{ id: 'kasha-watercolor', variant: null }], mode: 'plan', prepare: false, authors: ['auto'], studies: 'locked', work: 'session', level: 'L2', tryNumber: 1, previous: null, critique: null, looks: null, wallMinutes: null, graceMinutes: null, reverts: null, from: null, lines: null, sets: [], jobs: null, out: null, dryRun: false, open: true });
});

test('several subjects, authors, settings and a variant', () => {
  const r = parseArgs(['mittens-closeup,h36:approved', 'paint', '--author', 'auto,opus', '--set', 'width=900', '--set', 'study2.clusters=20', '--out', 'x', '--dry-run', '--no-open']);
  assert.deepEqual(r.subjects, [{ id: 'mittens-closeup', variant: null }, { id: 'h36', variant: 'approved' }]);
  assert.deepEqual(r.authors, ['auto', 'opus']);
  assert.deepEqual(r.sets, [['width', '900'], ['study2.clusters', '20']]);
  assert.equal(r.out, 'x'); assert.equal(r.dryRun, true); assert.equal(r.open, false);
});

test('what is wrong is said', () => {
  assert.equal(parseArgs(['a,all', 'paint', '--jobs', '4']).jobs, 4);
  assert.throws(() => parseArgs(['all', 'paint', '--jobs', '0']), /--jobs/);
  assert.throws(() => parseArgs(['all', 'paint', '--jobs', 'two']), /--jobs/);
  assert.throws(() => parseArgs(['kasha']), /plan, paint or prepare/);
  assert.throws(() => parseArgs(['kasha', 'render']), /plan, paint or prepare, not "render"/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--fast']), /unknown option --fast/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'width']), /key=value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'a=1', '--set', 'a=2']), /twice/);
  assert.throws(() => parseArgs(['kasha,kasha', 'plan']), /twice/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--author']), /needs a value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'open']), /locked or author/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'author']), /needs a model/);
});

test('the budget of a try, the level and the try are settings; prepare is a word of its own; --minutes is gone and says so', () => {
  const r = parseArgs(['mittens', 'paint', '--author', 'opus', '--level', 'L4', '--try', '5', '--previous', 'runs/try4', '--critique', 'words.txt', '--looks', '250', '--wallminutes', '90', '--graceminutes', '5', '--reverts', '3']);
  assert.deepEqual([r.level, r.tryNumber, r.previous, r.critique, r.looks, r.wallMinutes, r.graceMinutes, r.reverts, r.prepare], ['L4', 5, 'runs/try4', 'words.txt', 250, 90, 5, 3, false]);
  assert.deepEqual((({ mode, prepare, level }) => [mode, prepare, level])(parseArgs(['mittens', 'prepare'])), ['plan', true, 'L2']);
  assert.deepEqual((({ mode, prepare }) => [mode, prepare])(parseArgs(['mittens', 'prepare', '--level', 'L4'])), ['paint', true], 'level 4 prepares the automatic painting too');
  assert.throws(() => parseArgs(['mittens', 'prepare', '--author', 'opus']), /prepare makes the automatic plan .* it takes no --author/);
  assert.throws(() => parseArgs(['mittens', 'plan', '--minutes', '85']), /--minutes is gone: a session's own minutes are measured, not capped.*--wallminutes/);
  assert.throws(() => parseArgs(['mittens', 'plan', '--level', 'L5']), /--level is L2, L3 or L4/); assert.throws(() => parseArgs(['mittens', 'plan', '--looks', '0']), /--looks: a whole number, 1 to/);
});
