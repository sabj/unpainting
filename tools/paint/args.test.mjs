import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './args.mjs';

test('one subject and a mode, with the defaults', () => {
  const r = parseArgs(['kasha-watercolor', 'plan']);
  assert.deepEqual(r, { subjects: [{ id: 'kasha-watercolor', variant: null }], mode: 'plan', prepare: false, preflight: false, look: false, until: null, region: null, authors: ['auto'], studies: 'locked', work: 'session', level: 'L2', tryNumber: 1, retries: 1, previous: null, looks: null, wallMinutes: null, graceMinutes: null, steps: null, reverts: null, from: null, lines: null, sets: [], jobs: null, out: null, dryRun: false, open: false });
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
  assert.throws(() => parseArgs(['kasha']), /plan, paint or prepare|plan, paint, prepare or look/);
  assert.throws(() => parseArgs(['kasha', 'render']), /plan, paint, prepare, look or preflight, not "render"/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--fast']), /unknown option --fast/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'width']), /key=value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--set', 'a=1', '--set', 'a=2']), /twice/);
  assert.throws(() => parseArgs(['kasha,kasha', 'plan']), /twice/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--author']), /needs a value/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'open']), /locked or author/);
  assert.throws(() => parseArgs(['kasha', 'plan', '--studies', 'author']), /needs a model/);
});

test('the budget of a try, the level and its retries are settings; prepare and look are words of their own; what is gone says so', () => {
  const r = parseArgs(['mittens', 'paint', '--author', 'astra', '--level', 'L4', '--retries', '3', '--try', '2', '--previous', 'runs/l4-try1', '--looks', '7.5', '--wallminutes', '90', '--graceminutes', '5', '--reverts', '3']);
  assert.deepEqual([r.level, r.retries, r.tryNumber, r.previous, r.looks, r.wallMinutes, r.graceMinutes, r.reverts, r.prepare, r.look], ['L4', 3, 2, 'runs/l4-try1', 7.5, 90, 5, 3, false, false]);
  assert.deepEqual((({ mode, prepare, level }) => [mode, prepare, level])(parseArgs(['mittens', 'prepare'])), ['plan', true, 'L2']);
  assert.deepEqual((({ mode, prepare }) => [mode, prepare])(parseArgs(['mittens', 'prepare', '--level', 'L4'])), ['paint', true], 'level 4 prepares the automatic painting too');
  assert.deepEqual((({ look, until, region, mode }) => [look, until, region, mode])(parseArgs(['mittens', 'look', '--author', 'choice:kept', '--until', '2', '--region', '10,10,90,80'])), [true, 2, '10,10,90,80', 'plan']);
  assert.equal(parseArgs(['mittens', 'preflight', '--author', 'neon-m,hydrogen-m']).preflight, true); assert.throws(() => parseArgs(['mittens', 'preflight']), /preflight checks models through the session harness/);
  assert.throws(() => parseArgs(['mittens', 'look']), /look paints one look of a kept choice.*--author choice:/); assert.throws(() => parseArgs(['mittens', 'plan', '--until', '2']), /--until and --region belong to the word look/);
  assert.throws(() => parseArgs(['mittens', 'prepare', '--author', 'opus']), /prepare makes the automatic plan .* it takes no --author/);
  assert.throws(() => parseArgs(['mittens', 'plan', '--minutes', '85']), /--minutes is gone: a session's own minutes are measured, not capped.*--wallminutes/);
  assert.throws(() => parseArgs(['mittens', 'plan', '--critique', 'w.txt']), /--critique is gone: no critique, score or verdict is handed to a model at any level/);
  assert.throws(() => parseArgs(['mittens', 'plan', '--level', 'L5']), /--level is L2, L3 or L4/); assert.throws(() => parseArgs(['mittens', 'plan', '--looks', '0']), /--looks: the rendering budget of a try in units/);
});

test('no window is opened unless --open is given', () => {
  assert.equal(parseArgs(['mittens-closeup', 'paint']).open, false, 'a run that says nothing opens nothing');
  assert.equal(parseArgs(['mittens-closeup', 'paint', '--open']).open, true);
  assert.equal(parseArgs(['mittens-closeup', 'paint', '--no-open']).open, false, 'the old word is still accepted');
  assert.equal(parseArgs(['mittens-closeup', 'paint', '--open', '--no-open']).open, false);
});
