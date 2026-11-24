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
  m('L3', 'hills', 8, { progression: 3.5, cheatRisk: 0.3 }), m('L3', 'france', 9), m('L3', 'ships', 10),
  m('L4', 'hills', 9), m('L4', 'france', 8), m('L4', 'ships', 10)];

test('names, sheet headers and the display-only alias map', () => {
  assert.deepEqual(LEVELS.map(l => l.id), ['Auto', 'L1', 'L2', 'L3', 'L4']);
  assert.equal(headerFor('Auto'), 'Code planner alone');
  assert.equal(headerFor('L1'), 'Picture, format and painting tips');
  assert.equal(headerFor('L2'), 'Prepared studies, drawing, named forms and traced shapes');
  assert.equal(headerFor('L3'), 'L2 plus Auto\'s plan and finished painting');
  assert.equal(headerFor('L4'), 'L3\'s inputs in an open session with tools');
  assert.deepEqual(ALIASES, { V3: 'L1', V4: 'L2', V5: 'L3' });
  assert.deepEqual(['V1', 'V2', 'V3', 'V4', 'V5'].map(levelFor), [null, null, 'L1', 'L2', 'L3']);
  assert.deepEqual(LEVELS.map(l => l.was), [null, 'V3', 'V4', 'V5', null]);
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

test('per-model summary on the whole ladder: headline, interval, weighted raw mean, each retry against the level it retries', () => {
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
  assert.deepEqual(s.subjects.map(r => r.levels.L3.score), [8, 9, 10]);
  near(s.levels.L3.adjusted, (0.5 + 0.5 + 0.25) / 3);
  // level 4 is read as level 3 is: (9-6)/4, (8-8)/2, (10-9.5)/2
  near(s.levels.L4.adjusted, (0.75 + 0 + 0.25) / 3);
  assert.deepEqual(Object.keys(s.levels), ['L1', 'L2', 'L3', 'L4']);
  near(s.steps.L3.adjusted, s.levels.L3.adjusted - s.levels.L2.adjusted); assert.equal(s.steps.L3.from, 'L2');
  near(s.steps.L3.raw, (1 + 0.5 + 0.5) / 3);
  near(s.steps.L4.adjusted, s.levels.L4.adjusted - s.levels.L3.adjusted); assert.equal(s.steps.L4.from, 'L3');
  assert.deepEqual(s.learned, s.steps.L3);
  for (const v of [s.levels.L1, s.levels.L2, s.levels.L3, s.levels.L4, s.steps.L3, s.steps.L4]) {
    assert.equal(v.interval.length, 2);
    assert.ok(v.interval[0] <= v.adjusted + 0.005 && v.adjusted - 0.005 <= v.interval[1]);
  }
  assert.deepEqual(summarize(FULL).levels.L3.interval, s.levels.L3.interval, 'fixed seed: the same interval every time');
  assert.equal(summarize([auto('hills', 6), m('L2', 'hills', 7)]).levels.L2.interval, null, 'one subject has no interval');
});

test('every level is one try; where a test run made several, the last counts and never the best', () => {
  const s = summarize([auto('hills', 6), m('L2', 'hills', 9), m('L3', 'hills', 9, { try: 1 }), m('L3', 'hills', 7, { try: 2 }), m('L3', 'hills', 6.5, { try: 3 })]);
  assert.equal(s.subjects[0].levels.L3.score, 6.5); assert.equal(s.subjects[0].levels.L3.try, 3); assert.equal(s.subjects[0].levels.L3.triesMade, 3);
  assert.equal(s.subjects[0].levels.L3.best, undefined, 'no best-of is kept: the last try is the level\'s painting');
  near(s.steps.L3.adjusted, (6.5 - 9) / 4);
  // levels are independent: L3 or L4 alone summarizes cleanly without earlier levels
  const soloL3 = summarize([auto('hills', 6), m('L3', 'hills', 9)]);
  assert.equal(soloL3.subjects[0].levels.L3.score, 9); assert.equal(soloL3.steps.L3, undefined);
  const soloL4 = summarize([auto('hills', 6), m('L2', 'hills', 9), m('L4', 'hills', 9)]);
  assert.equal(soloL4.subjects[0].levels.L4.score, 9); assert.equal(soloL4.steps.L4, undefined);
  assert.throws(() => summarize([auto('hills', 6), m('L2', 'hills', 9), m('L2', 'hills', 8)]), /two records for the same try/);
});

test('the schedule: the core on the whole ladder, the others at level 2 only; a scheduled picture never drops out', () => {
  // hills is core (L1 to L4); france and ships run at Auto and level 2 only
  const scheduled = { L1: ['hills'], L2: ['hills', 'france', 'ships'], L3: ['hills'], L4: ['hills'] };
  const recs = [...AUTO, m('L1', 'hills', 5), m('L2', 'hills', 7), m('L2', 'france', 8.5), m('L3', 'hills', 8), m('L4', 'hills', null, { failed: true, why: 'the session handed in nothing' })];
  const s = summarize(recs, { scheduled });
  assert.equal(s.levels.L1.subjects, 1, 'level 1 is averaged over the core picture only');
  assert.equal(s.levels.L3.subjects, 1); near(s.levels.L3.adjusted, 0.5);
  assert.equal(s.levels.L2.subjects, 3, 'level 2 over all three');
  assert.equal(s.levels.L2.missing, 1, 'ships was scheduled at level 2 and has no painting: counted');
  near(s.levels.L2.adjusted, (0.25 + 0.25 + (0 - 9.5) / 2) / 3);
  assert.equal(s.subjects[2].levels.L3, undefined, 'ships is not run at level 3: not a failure there');
  assert.equal(s.levels.L4.failed, 1); assert.equal(s.subjects[0].levels.L4.score, 0); assert.equal(s.subjects[0].levels.L4.why, 'the session handed in nothing');
  near(s.levels.L4.adjusted, -1.5);
  assert.equal(s.steps.L4.subjects, 1);
  assert.throws(() => summarize([...recs, m('L3', 'france', 9)], { scheduled }), /opus L3 france is not in the schedule/);
  assert.throws(() => summarize(recs, { scheduled: { ...scheduled, L2: ['hills', 'tyrol'] } }), /tyrol is scheduled at L2 and Auto has no record of it|not in the schedule/);
  const table = subjectTable(s);
  assert.match(table, /\| hills \| 6 \| 5 \| 7 \| 8 \| 0 \(failed\) \|/);
  assert.match(table, /\| ships \| 9\.5 \| not run \| 0 \(no painting\) \| not run \| not run \|/);
  assert.match(table, /3 pictures, 1 failed/);
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
  assert.throws(() => summarize([auto('hills', 6), m('L5', 'hills', 7)]), /unknown level/);
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
  assert.deepEqual([hills.levels.L3.progression, hills.levels.L3.cheatRisk], [3.5, 0.3]);
  assert.equal(hills.levels.L1.progression, null);
});

test('Markdown table per subject', () => {
  const lines = subjectTable(summarize(FULL)).split('\n');
  assert.equal(lines[0], '| Subject | Auto | L1 | L2 | L3 | L4 | Headroom | Adjusted L1 | Adjusted L2 | Adjusted L3 | Adjusted L4 | Progression | Cheat-risk |');
  assert.equal(lines[2], '| hills | 6 | 5 | 7 | 8 | 9 | 4 | -0.25 | +0.25 | +0.5 | +0.75 | Auto 4.2, L1 n/a, L2 4, L3 3.5, L4 n/a | Auto 0.1, L1 n/a, L2 0.2, L3 0.3, L4 n/a |');
  assert.match(lines[4], /^\| ships \| 9\.5 \| 6 \| 9\.5 \| 10 \| 10 \| 2 \(floor\) \| -1\.75 \| 0 \| \+0\.25 \| \+0\.25 \|/);
  assert.match(lines[5], /^\| Mean \|  \| 5 \(3 pictures\) \| 8\.33 \(3 pictures\) \| 9 \(3 pictures\) \| 9 \(3 pictures\) \|  \| -1\.33 \(.* to .*\) \| \+0\.17 \(.*\) \| \+0\.42 \(.*\) \| \+0\.33 \(.*\) \|/);
  assert.ok(lines.every(l => !l.startsWith('|') || l.split('|').length === 15), 'every row has the same columns');
  const text = lines.join('\n');
  assert.match(text, /L3 minus L2, the 3 pictures both ran: \+0\.25 of headroom/);
  assert.match(text, /L4 minus L3, the 3 pictures both ran: -0\.08 of headroom/);
  assert.match(text, /Each level is one fresh, independent session/);
  assert.match(lines.at(-1), /Auto: commit abc1234, judge J2 J2-full\. Progression and cheat-risk are shown beside the score/);
  const failed = subjectTable(summarize([auto('hills', 6), m('L2', 'hills', null, { failed: true })]));
  assert.match(failed, /\| hills \| 6 \| not run \| 0 \(failed\) \| not run \| not run \| 4 \| not run \| -1\.5 \| not run \| not run \|/);
});
