import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ALIASES, SCALES, DEFAULT_FLOOR_SHARE, levelFor, headerFor, headroom, adjustedScore, summarize, subjectTable } from './levels.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} is not ${b}`);
const J = { judgeVersion: 'J2', judgeProfile: 'J2-full' };
const auto = (subject, score, extra = {}) => ({ level: 'Auto', subject, score, commit: 'abc1234', ...J, ...extra });
const m = (level, subject, score, extra = {}) => ({ level, model: 'opus', subject, score, ...J, ...extra });
// made-up numbers
const AUTO = [auto('hills', 6, { progression: 4.2, cheatRisk: 0.1 }), auto('france', 8), auto('ships', 9.5)];
const FULL = [...AUTO,
  m('L1', 'hills', 5), m('L1', 'france', 4), m('L1', 'ships', 6),
  m('L2', 'hills', 7, { progression: 4, cheatRisk: 0.2 }), m('L2', 'france', 8.5), m('L2', 'ships', 9.5),
  m('L3', 'hills', 9, { try: 2 }), m('L3', 'hills', 8, { try: 3, progression: 3.5, cheatRisk: 0.3 }),
  m('L3', 'france', 8, { try: 2 }), m('L3', 'france', 9, { try: 3 }),
  m('L3', 'ships', 9, { try: 2 }), m('L3', 'ships', 10, { try: 3 })];

test('names, sheet headers and the display-only alias map', () => {
  assert.deepEqual(LEVELS.map(l => l.id), ['Auto', 'L1', 'L2', 'L3']);
  assert.equal(headerFor('Auto'), 'Code planner alone');
  assert.equal(headerFor('L1'), 'Freehand, own tries');
  assert.equal(headerFor('L2'), 'Tuning the code planner, one try');
  assert.equal(headerFor('L3'), 'Tuning the code planner, third try');
  assert.deepEqual(ALIASES, { V3: 'L1', V4: 'L2', V5: 'L3' });
  assert.deepEqual(['V1', 'V2', 'V3', 'V4', 'V5'].map(levelFor), [null, null, 'L1', 'L2', 'L3']);
  assert.deepEqual(LEVELS.map(l => l.was), [null, 'V3', 'V4', 'V5']);
});

test('headroom is the top of the scale minus Auto, with a floor', () => {
  assert.equal(DEFAULT_FLOOR_SHARE, 0.2);
  assert.equal(headroom(6), 4);
  assert.equal(headroom(8), 2);
  assert.equal(headroom(9.5), 2, 'floor: 20% of a 0 to 10 scale');
  assert.equal(headroom(10), 2, 'Auto at the top of the scale still leaves the floor');
  assert.equal(headroom(9.5, { floorShare: 0.1 }), 1, 'the floor is a setting');
  assert.equal(headroom(0), 10);
  assert.throws(() => headroom(11), /outside the scale/);
  assert.throws(() => headroom(10, { floorShare: 0 }), /floor/);
});

test('adjusted score is the share of headroom closed, negative when worse than Auto', () => {
  near(adjustedScore(8, 6), 0.5);
  near(adjustedScore(10, 6), 1);
  near(adjustedScore(6, 6), 0);
  near(adjustedScore(4, 6), -0.5);
  near(adjustedScore(0, 6), -1.5);
  near(adjustedScore(10, 10), 0, 'Auto at the top: level with Auto is 0');
  near(adjustedScore(9, 10), -0.5, 'Auto at the top: the floor is the divisor');
  near(adjustedScore(9.7, 9.5), 0.1, 'a small wobble above a strong Auto stays small');
  assert.throws(() => adjustedScore(12, 6), /outside the scale/);
});

test('win-rate scale: Auto is 0.5 by definition and the adjusted score runs from -1 to +1', () => {
  const opts = { scale: SCALES.winRate };
  near(headroom(0.5, opts), 0.5);
  near(adjustedScore(0.75, 0.5, opts), 0.5);
  near(adjustedScore(1, 0.5, opts), 1);
  near(adjustedScore(0, 0.5, opts), -1);
  const recs = [auto('hills'), auto('france', 0.5), m('L2', 'hills', 0.8), m('L2', 'france', 0.5, { failed: true })];
  const s = summarize(recs.map(r => (r.level === 'Auto' && r.score === undefined ? { ...r, score: null } : r)), opts);
  assert.equal(s.scale, 'winRate');
  near(s.subjects[0].levels.L2.adjusted, 0.6);
  near(s.subjects[1].levels.L2.adjusted, -1, 'a failed painting loses every comparison');
  assert.throws(() => summarize([auto('hills', 0.7), m('L2', 'hills', 0.8)], opts), /0\.5 by definition/);
  assert.throws(() => summarize([auto('hills', null, { failed: true }), m('L2', 'hills', 0.8)], opts), /nothing can be compared/);
});

test('per-model summary: headline, interval, weighted raw mean, L3 third try, best of three, learned', () => {
  const s = summarize(FULL);
  assert.equal(s.model, 'opus');
  assert.deepEqual(s.auto, { commit: 'abc1234', judge: 'J2 J2-full' });
  assert.deepEqual(s.subjects.map(r => r.headroom), [4, 2, 2]);
  assert.deepEqual(s.subjects.map(r => r.floored), [false, false, true]);
  // L2: (7-6)/4, (8.5-8)/2, (9.5-9.5)/2
  near(s.levels.L2.adjusted, (0.25 + 0.25 + 0) / 3);
  near(s.levels.L2.rawMean, 25 / 3);
  near(s.levels.L2.weightedRaw, (7 * 4 + 8.5 * 2 + 9.5 * 2) / 8);
  near(s.levels.L2.autoWeightedRaw, (6 * 4 + 8 * 2 + 9.5 * 2) / 8);
  // L1 is worse than Auto everywhere: (5-6)/4, (4-8)/2, (6-9.5)/2
  near(s.levels.L1.adjusted, (-0.25 - 2 - 1.75) / 3);
  // L3 counts try 3 (8, 9, 10), never the best try (hills try 2 was 9)
  assert.deepEqual(s.subjects.map(r => r.levels.L3.score), [8, 9, 10]);
  assert.deepEqual(s.subjects.map(r => r.levels.L3.best), [{ try: 2, score: 9 }, { try: 3, score: 9 }, { try: 3, score: 10 }]);
  near(s.levels.L3.adjusted, (0.5 + 0.5 + 0.25) / 3);
  near(s.levels.L3.bestOfThreeRawMean, 28 / 3);
  near(s.learned.adjusted, s.levels.L3.adjusted - s.levels.L2.adjusted);
  near(s.learned.raw, (1 + 0.5 + 0.5) / 3);
  for (const v of [s.levels.L1, s.levels.L2, s.levels.L3, s.learned]) {
    assert.equal(v.interval.length, 2);
    assert.ok(v.interval[0] <= v.adjusted + 0.005 && v.adjusted - 0.005 <= v.interval[1]);
  }
  assert.deepEqual(summarize(FULL).levels.L3.interval, s.levels.L3.interval, 'fixed seed: the same interval every time');
  assert.equal(s.levels.L2.header, 'Tuning the code planner, one try');
  assert.equal(summarize([auto('hills', 6), m('L2', 'hills', 7)]).levels.L2.interval, null, 'one subject has no interval');
});

test('the L2 try is the first of the three: it can be the best, and it is never the L3 score', () => {
  const s = summarize([auto('hills', 6), m('L2', 'hills', 9), m('L3', 'hills', 7, { try: 2 }), m('L3', 'hills', 6.5, { try: 3 })]);
  assert.equal(s.subjects[0].levels.L3.score, 6.5);
  assert.deepEqual(s.subjects[0].levels.L3.best, { try: 1, score: 9 });
  near(s.learned.adjusted, (6.5 - 9) / 4);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 9), m('L3', 'hills', 9, { try: 1 })]), /Try 1 is the L2 record/);
  assert.throws(() => summarize([auto('hills', 6), m('L3', 'hills', 9, { try: 3 })]), /no L2 records/);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 9), m('L2', 'hills', 8, { try: 2 })]), /L2 is one try/);
});

test('a failed painting scores the bottom of the scale, never blank', () => {
  const s = summarize([auto('hills', 6), auto('france', 8), m('L2', 'hills', null, { failed: true }), m('L2', 'france', 9)]);
  const c = s.subjects[0].levels.L2;
  assert.equal(c.score, 0); assert.equal(c.failed, true);
  near(c.adjusted, -1.5);
  assert.equal(s.levels.L2.failed, 1);
  near(s.levels.L2.adjusted, (-1.5 + 0.5) / 2);
  // a subject the model entered the level for but has no painting of counts the same way
  const gap = summarize([auto('hills', 6), auto('france', 8), m('L2', 'france', 9)]);
  assert.equal(gap.subjects[0].levels.L2.score, 0);
  assert.equal(gap.subjects[0].levels.L2.missing, true);
  assert.equal(gap.levels.L2.subjects, 2);
  // Auto can fail too: its subject then has the whole scale as headroom
  const autoFailed = summarize([auto('hills', null, { failed: true }), m('L2', 'hills', 5)]);
  assert.equal(autoFailed.subjects[0].headroom, 10);
  near(autoFailed.subjects[0].levels.L2.adjusted, 0.5);
  // a painting that exists but was not fully judged is not a failed painting: refuse
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', null)]), /not marked failed/);
  assert.throws(() => summarize([auto('hills', null), m('L2', 'hills', 5)]), /not marked failed/);
});

test('fewer than three L3 tries: the missing third try scores the bottom, the best is still shown', () => {
  const s = summarize([auto('hills', 6), auto('france', 8),
    m('L2', 'hills', 7), m('L2', 'france', 8.5),
    m('L3', 'hills', 8, { try: 2 }),
    m('L3', 'france', 8, { try: 2 }), m('L3', 'france', 9, { try: 3 })]);
  const hills = s.subjects[0].levels.L3;
  assert.equal(hills.score, 0); assert.equal(hills.failed, true); assert.equal(hills.missing, true);
  assert.equal(hills.triesMade, 2);
  assert.deepEqual(hills.best, { try: 2, score: 8 });
  assert.equal(s.subjects[1].levels.L3.triesMade, 3);
  near(s.levels.L3.adjusted, (-1.5 + 0.5) / 2);
  assert.match(subjectTable(s), /0 \(no painting\), best of three 8/);
});

test('refuses Auto records from different commits or judges, and says why', () => {
  const mixed = [auto('hills', 6), auto('france', 8, { commit: 'def5678' }), m('L2', 'hills', 7), m('L2', 'france', 8)];
  assert.throws(() => summarize(mixed), /different commits: abc1234, def5678\. Headroom is measured from Auto.*one frozen commit/);
  assert.throws(() => summarize([auto('hills', 6), auto('france', 8, { judgeVersion: 'J1', judgeProfile: 'J1-full' }), m('L2', 'hills', 7)]), /different judges.*not comparable/);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 7, { judgeVersion: 'J1', judgeProfile: 'J1-full' })]), /scored by J1 J1-full and Auto by J2 J2-full/);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 7, { judgeProfile: 'J2-lite' })]), /not comparable/);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 7, { autoCommit: 'def5678' })]), /run against Auto at def5678.*from abc1234/);
  assert.doesNotThrow(() => summarize([auto('hills', 6), m('L2', 'hills', 7, { autoCommit: 'abc1234' })]));
  assert.throws(() => summarize([auto('hills', 6, { commit: undefined }), m('L2', 'hills', 7)]), /no commit/);
  assert.throws(() => summarize([auto('hills', 6), auto('hills', 7), m('L2', 'hills', 7)]), /two Auto records/);
  assert.throws(() => summarize([m('L2', 'hills', 7)]), /no Auto records/);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'ships', 7)]), /no Auto painting of that subject/);
});

test('old round names are never mixed in, and models are summarized one at a time', () => {
  assert.throws(() => summarize([auto('hills', 6), m('V4', 'hills', 7)]), /labelled V4.*never recomputed or mixed/);
  assert.throws(() => summarize([auto('hills', 6), m('V1', 'hills', 7)]), /labelled V1/);
  assert.throws(() => summarize([auto('hills', 6), m('L4', 'hills', 7)]), /unknown level/);
  const two = [auto('hills', 6), m('L2', 'hills', 7), m('L2', 'hills', 8, { model: 'astra' })];
  assert.throws(() => summarize(two), /more than one model/);
  near(summarize(two, { model: 'astra' }).levels.L2.adjusted, 0.5);
  assert.throws(() => summarize(two, { model: 'sol' }), /no model records for sol/);
});

test('L1 counts its last try', () => {
  const s = summarize([auto('hills', 6), m('L1', 'hills', 9, { try: 1 }), m('L1', 'hills', 7, { try: 2 })]);
  assert.equal(s.subjects[0].levels.L1.score, 7);
  assert.equal(s.subjects[0].levels.L1.try, 2);
  assert.equal(s.learned, null);
  assert.equal(s.levels.L2, undefined);
});

test('side indexes are carried per painting and never change a score', () => {
  const strip = r => ({ ...r, progression: undefined, cheatRisk: undefined });
  const a = summarize(FULL), b = summarize(FULL.map(strip));
  assert.deepEqual(a.levels, b.levels);
  assert.deepEqual(a.learned, b.learned);
  const hills = a.subjects[0];
  assert.deepEqual([hills.auto.progression, hills.auto.cheatRisk], [4.2, 0.1]);
  assert.deepEqual([hills.levels.L2.progression, hills.levels.L2.cheatRisk], [4, 0.2]);
  assert.deepEqual([hills.levels.L3.progression, hills.levels.L3.cheatRisk], [3.5, 0.3], 'the third try, the one that is scored');
  assert.equal(hills.levels.L1.progression, null);
});

test('Markdown table per subject', () => {
  const lines = subjectTable(summarize(FULL)).split('\n');
  assert.equal(lines[0], '| Subject | Auto | L1 | L2 | L3 (third try) | Headroom | Adjusted L1 | Adjusted L2 | Adjusted L3 | Progression | Cheat-risk |');
  assert.equal(lines[2], '| hills | 6 | 5 | 7 | 8, best of three 9 | 4 | -0.25 | +0.25 | +0.5 | Auto 4.2, L1 n/a, L2 4, L3 3.5 | Auto 0.1, L1 n/a, L2 0.2, L3 0.3 |');
  assert.match(lines[4], /^\| ships \| 9\.5 \| 6 \| 9\.5 \| 10, best of three 10 \| 2 \(floor\) \| -1\.75 \| 0 \| \+0\.25 \|/);
  assert.match(lines[5], /^\| Mean \|  \| 5 \| 8\.33 \| 9 \|  \| -1\.33 \(.* to .*\) \| \+0\.17 \(.*\) \| \+0\.42 \(.*\) \|/);
  assert.ok(lines.every(l => !l.startsWith('|') || l.split('|').length === 13), 'every row has the same columns');
  assert.match(lines.at(-3), /^Learned \(L3 minus L2, same subjects\): \+0\.25 of headroom/);
  assert.match(lines.at(-1), /Auto: commit abc1234, judge J2 J2-full\. Progression and cheat-risk are shown beside the score/);
  const failed = subjectTable(summarize([auto('hills', 6), m('L2', 'hills', null, { failed: true })]));
  assert.match(failed, /\| hills \| 6 \| not run \| 0 \(failed\) \| not run \| 4 \| not run \| -1\.5 \| not run \|/);
});
