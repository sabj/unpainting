import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordsOf, summarizeResults, summaryMarkdown, scheduleOf } from './summary04.mjs';
import { loadRunSets } from '../../tools/paint/run-sets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
const row = (id, subject, level, author, combined, more = {}) => ({ id, label: id, subject, auto: author === 'auto', author, level, commit: author === 'auto' ? 'abc12345' : 'def', combined, failed: null,
  likeness: { score: 4, flagged: false }, cheat: null, ...more });
const RESULTS = paintings => ({ written: '2026-11-23 20:00', judge: { label: 'open3-local-3x', panelName: 'open3', reasoning: 'off' }, snapshotScheme: { name: 'progress10' }, weights: { humanness: 2, quality: 1 }, paintings });
// a set of three: a (core, the whole ladder), b and c (Auto and level 2)
const SETS = loadRunSets({ depths: { full: { levels: ['Auto', 'L1', 'L2', 'L3', 'L4'] }, two: { levels: ['Auto', 'L2'] } }, sets: { ext: { pictures: 'all', depth: { core: 'full', others: 'two' } } },
  pictures: [{ id: 'a', title: 'A', group: 'g', core: true }, { id: 'b', title: 'B', group: 'g', core: false }, { id: 'c', title: 'C', group: 'g', core: false }] });
const PAINTINGS = [
  row('a--auto', 'a', 'Auto', 'auto', 50), row('b--auto', 'b', 'Auto', 'auto', 60), row('c--auto', 'c', 'Auto', 'auto', 90),
  row('m--L1--a', 'a', 'L1', 'neon-m', 40), row('a--neon-m', 'a', 'L2', 'neon-m', 60), row('b--neon-m', 'b', 'L2', 'neon-m', 70),
  row('a--neon-m--L3', 'a', 'L3', 'neon-m', 75), row('a--neon-m--L4', 'a', 'L4', 'neon-m', null, { failed: 'nothing handed in' }),
  row('a--sonnet-m', 'a', 'L2', 'sonnet-m', 55, { likeness: { score: 1.2, flagged: true } }),
];

test('the schedule of a run set: which pictures run at which level', () => {
  assert.deepEqual(scheduleOf('ext', SETS), { Auto: ['a', 'b', 'c'], L1: ['a'], L2: ['a', 'b', 'c'], L3: ['a'], L4: ['a'] });
  assert.throws(() => scheduleOf('nope', SETS), /no run set "nope"/);
  // the benchmark's own file: the core five on the whole ladder, all fifteen at Auto and level 2
  const core = scheduleOf('core'), ext = scheduleOf('extended');
  assert.deepEqual([core.L1.length, core.L4.length, ext.Auto.length, ext.L2.length, ext.L3.length], [5, 5, 15, 15, 5]);
});

test('every level of every model against Auto; a failed run and a scheduled picture never painted both count as 0', () => {
  const sum = summarizeResults(RESULTS(PAINTINGS), { schedule: scheduleOf('ext', SETS) });
  assert.deepEqual(sum.models.map(m => m.model), ['neon-m', 'sonnet-m']);
  const [neon, sonnet] = sum.models;
  assert.deepEqual(Object.keys(neon.levels), ['L1', 'L2', 'L3', 'L4']);
  near(neon.levels.L1.adjusted, (40 - 50) / 50);
  // level 2 over all three scheduled pictures: c was never painted, so it is 0, not left out
  assert.deepEqual([neon.levels.L2.subjects, neon.levels.L2.missing, neon.levels.L2.failed], [3, 1, 1]);
  near(neon.levels.L2.adjusted, ((60 - 50) / 50 + (70 - 60) / 40 + (0 - 90) / 20) / 3);
  near(neon.levels.L3.adjusted, (75 - 50) / 50);
  // level 4's run failed: counted as the bottom of the scale, with its reason
  assert.deepEqual([neon.levels.L4.subjects, neon.levels.L4.failed], [1, 1]); near(neon.levels.L4.adjusted, -1);
  assert.deepEqual(sum.failed, [{ id: 'a--neon-m--L4', model: 'neon-m', level: 'L4', subject: 'a', why: 'nothing handed in' }]);
  // a model that only ran one picture of level 2 is held to the same three
  assert.equal(sonnet.levels.L2.subjects, 3); assert.equal(sonnet.levels.L2.missing, 2);
  assert.deepEqual(sum.flagged, ['a--sonnet-m (likeness 1.2 of 5)']);
  const md = summaryMarkdown(RESULTS(PAINTINGS), sum, { setName: 'ext' });
  assert.match(md, /Judges: \*\*open3-local-3x\*\* \(panel open3, reasoning off\); human-ness scheme progress10/);
  assert.match(md, /\| neon-m \| -0\.2 \|/); assert.match(md, /1, 1 failed/);
  assert.match(md, /- neon-m L4, a: nothing handed in/); assert.match(md, /## Likeness at the bottom of the scale/);
  assert.match(md, /Each level is one fresh, independent session/);
  assert.match(md, /\| c \| 90 \| not run \| 0 \(no painting\) \| not run \| not run \|/);
});

test('a 0.5.1 summary prints the gated score and the studies-only L2', () => {
  const results = { ...RESULTS(PAINTINGS), profile: '0.5.1', combinedMode: 'gated', gateFloor: 65 };
  const md = summaryMarkdown(results, summarizeResults(results));
  assert.match(md, /^# 0\.5\.1 summary/);
  assert.match(md, /Q × min\(1, H \/ 65\)/);
  assert.match(md, /\*\*L2\*\*.*three unnumbered colour studies/);
  assert.doesNotMatch(md, /2 parts human-ness|L2: \+ prepared studies, drawing/);
});

test('what cannot be summed is refused by name', () => {
  const sched = scheduleOf('ext', SETS);
  assert.throws(() => summarizeResults(RESULTS(PAINTINGS.filter(p => p.id !== 'c--auto')), { schedule: sched }), /Auto is scheduled and not among the results for c/);
  // judged, but a judge was short of its readings: no combined figure, and it is not passed off as a failed run or as 0
  const short = PAINTINGS.map(p => (p.id === 'b--neon-m' ? { ...p, combined: null } : p));
  assert.throws(() => summarizeResults(RESULTS(short), { schedule: sched }), /neon-m L2 b has no valid score .* and is not marked failed/);
  assert.throws(() => recordsOf(RESULTS([{ ...PAINTINGS[4], level: null }])), /does not say its level/);
  // a painting outside the schedule is listed and never averaged in
  const extra = summarizeResults(RESULTS([...PAINTINGS, row('b--neon-m--L3', 'b', 'L3', 'neon-m', 99)]), { schedule: sched });
  assert.deepEqual(extra.outside, ['b--neon-m--L3 (L3, b)']); assert.equal(extra.models[0].levels.L3.subjects, 1);
  // without a schedule every picture Auto painted is expected at every level entered
  const open = summarizeResults(RESULTS(PAINTINGS));
  assert.equal(open.models[0].levels.L3.subjects, 3); assert.equal(open.models[0].levels.L3.missing, 2);
});

test('npm run bench:summary04 writes SUMMARY.md beside the results, and says how to use it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary04-'));
  try {
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(RESULTS(PAINTINGS)));
    const r = spawnSync(process.execPath, ['bench/scripts/summary04.mjs', path.join(dir, 'results.json')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /2 models, 1 failed run counted/);
    assert.match(fs.readFileSync(path.join(dir, 'SUMMARY.md'), 'utf8'), /^# 0\.4 summary/);
    const bad = spawnSync(process.execPath, ['bench/scripts/summary04.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(bad.status, 2); assert.match(bad.stderr, /usage: npm run bench:summary04/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
