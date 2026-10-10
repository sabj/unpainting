// node --test tools/judge/rounds/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { measureRun, selectStages, STAGES, liveStages, selectByPosition, framePositions } from './measure.mjs';
import { presentations, LETTER_POOL } from './present.mjs';
import { readAnswer, calibrate, verdict } from './tally.mjs';

// measure: a synthetic run on a 120 x 160 sheet
const W = 120, H = 160, PAPER = 240;
const sheet = () => ({ data: new Float32Array(W * H).fill(PAPER), width: W, height: H });
const clone = f => ({ ...f, data: Float32Array.from(f.data) });
const line = (f, y, v = 40) => { const g = clone(f); for (let x = 10; x < 110; x++) g.data[y * W + x] = v; return g; };
const wash = (f, x0, x1, y0, y1, dens) => {
  const g = clone(f);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * W + x] = Math.min(g.data[y * W + x], PAPER * (1 - dens));
  return g;
};

function synthetic() {
  const f = [sheet()];
  f.push(line(f.at(-1), 30));                       // 1 pen
  f.push(line(f.at(-1), 60));                       // 2 pen: end of A
  f.push(wash(f.at(-1), 0, W, 0, 80, 0.12));        // 3 first wash, top half
  f.push(wash(f.at(-1), 0, W, 80, H, 0.12));        // 4 first wash, bottom half
  f.push(wash(f.at(-1), 40, 80, 90, 150, 0.6));     // 5 darks at 60% density
  f.push(wash(f.at(-1), 40, 80, 90, 150, 0.9));     // 6 darks full
  f.push(wash(f.at(-1), 0, 40, 0, 80, 0.3));        // 7 late
  return f;
}

test('the one rule finds each stage by what is on the sheet', () => {
  const { idx } = selectStages(measureRun(synthetic()));
  assert.equal(idx.A, 2);
  assert.ok(idx.B >= 3 && idx.B < idx.D, `B ${idx.B} before D ${idx.D}`);
  assert.equal(idx.D, 5);
  assert.equal(idx.I, 7);
  assert.ok(idx.H >= idx.D);
});

test('recording cadence does not move a stage: duplicated frames select the same sheet', () => {
  const f = synthetic();
  const dense = f.flatMap((x, i) => (i ? [x, x, x] : [x]));
  const a = selectStages(measureRun(f)).idx, b = selectStages(measureRun(dense)).idx;
  for (const s of STAGES) assert.deepEqual(dense[b[s]].data, f[a[s]].data, s);
});

test('a run with no pen has no A', () => {
  const f = [sheet()];
  f.push(wash(f[0], 0, W, 0, H, 0.12));
  f.push(wash(f[1], 40, 80, 90, 150, 0.9));
  assert.equal(selectStages(measureRun(f)).idx.A, null);
});

// The live-site sequences are private photo-derived files; this check runs only where they are present.
const LIVE_MANIFEST = new URL('../../../work/references/manifest.json', import.meta.url);
test('the live stages come from the v3 manifest, over 0 percent, at their percent, the finish last', { skip: !fs.existsSync(LIVE_MANIFEST) && 'private work/references not in this clone' }, () => {
  const m = JSON.parse(fs.readFileSync(new URL('../../../work/references/manifest.json', import.meta.url), 'utf8'));
  const st = liveStages(m.subjects["subject-d"]);
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(new URL("./subjects.json", import.meta.url), "utf8")))) if (!k.startsWith("_")) assert.ok(fs.existsSync(new URL(`../../../${v.art}`, import.meta.url)), v.art);
  assert.deepEqual(st.map(s => s.name), ['010', '025', '040', '055', '070', '085', '100']);
  assert.equal(st[1].position, 0.25);
  assert.equal(st.at(-1).position, 1);
  assert.equal(st[0].file, 'work/references/subject-d-stage-010.png');
  for (const s of st) assert.ok(fs.existsSync(new URL(`../../../${s.file}`, import.meta.url)), s.file);
  const subjects = JSON.parse(fs.readFileSync(new URL('./subjects.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(subjects).filter(k => !k.startsWith('_')).sort(), ['subject-a', 'subject-b', 'subject-c', 'subject-d']);
  for (const [k, v] of Object.entries(subjects)) if (!k.startsWith('_')) assert.ok(m.subjects[v.manifest], k);
});

test('each live stage takes the frame nearest its position, the finish the last frame', () => {
  const pos = framePositions([{ position: 0 }, { position: 0.1 }, { position: 0.3 }, { position: 0.5 }, { position: 0.9 }]);
  const { idx } = selectByPosition(pos, [{ name: '020', position: 0.28 }, { name: '050', position: 0.4 }, { name: '100', position: 1 }]);
  assert.equal(idx['020'], 2);
  assert.equal(idx['050'], 3);
  assert.equal(idx['100'], 4);
  assert.deepEqual(framePositions([{}, {}, {}]), [0, 0.5, 1]);
});

const seq = xs => { let i = 0; return n => xs[i++ % xs.length] % n; };
const RUNS = ['candidate', 'control', 'control-copy', 'positive', 'negative'];
const JUDGES = [{ family: 'claude' }, { family: 'claude' }, { family: 'gpt' }, { family: 'gpt' }];

test('each judge has its own letters, and a family pair sees mirrored orders', () => {
  const ps = presentations(RUNS, JUDGES, seq([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9]));
  for (const p of ps) {
    const letters = Object.values(p.letter);
    assert.equal(new Set(letters).size, RUNS.length);
    for (const l of letters) assert.ok(LETTER_POOL.includes(l) && !'ABDHI'.includes(l));
    assert.equal(p.pairs.length, (RUNS.length * (RUNS.length - 1)) / 2);
    assert.deepEqual([...p.order].sort(), [...RUNS].sort());
  }
  assert.deepEqual(ps[1].order, [...ps[0].order].reverse());
  assert.deepEqual(ps[3].order, [...ps[2].order].reverse());
  assert.notDeepEqual(ps[0].order, ps[2].order);
});

function fixture(scores = {}) {
  const judge = { id: 'p1', letter: { candidate: 'C', control: 'F', 'control-copy': 'G', positive: 'K', negative: 'L' },
    pairs: [['candidate', 'control'], ['positive', 'negative'], ['control', 'control-copy']] };
  const key = { stages: STAGES, runs: Object.fromEntries(RUNS.map(r => [r, { stages: Object.fromEntries(STAGES.map(s => [s, { frame: 'x' }])) }])) };
  const base = { candidate: 3, control: 3, 'control-copy': 3, positive: 5, negative: 1, ...scores };
  const answer = {
    packet: 'p1',
    stages: RUNS.flatMap(r => STAGES.map(s => ({ stage: s, run: judge.letter[r], fidelity: base[r], tells: [], worst: { where: 'x', what: 'x' }, note: 'x' }))),
    runs: RUNS.map(r => ({ run: judge.letter[r], process: base[r], finish: base[r], note: 'x' })),
    pairs: judge.pairs.map(([a, b]) => ({ left: judge.letter[a], right: judge.letter[b], process: 'tie', finish: judge.letter[a] })),
  };
  return { judge, key, answer };
}

test('a complete answer reads, and its controls calibrate', () => {
  const { judge, key, answer } = fixture();
  const r = readAnswer(answer, judge, key);
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.byRole.positive.primary, 10);
  assert.deepEqual(calibrate(r.byRole), { posOverNeg: true, identical: true, gap: 0, valid: true });
});

test('duplicates, omissions, swapped pairs and broken caps are rejected', () => {
  const cases = [
    a => a.stages.push({ ...a.stages[0] }),
    a => a.stages.pop(),
    a => a.runs.pop(),
    a => { a.pairs[0] = { ...a.pairs[0], left: a.pairs[0].right, right: a.pairs[0].left }; },
    a => a.pairs.push({ ...a.pairs[0] }),
    a => { a.stages[0].fidelity = 4; a.stages[0].tells = [{ tell: 'c', severity: 'severe' }]; },
    a => { a.packet = 'other'; },
    a => { a.runs[0].finish = 6; },
  ];
  for (const [i, change] of cases.entries()) {
    const { judge, key, answer } = fixture();
    change(answer);
    assert.equal(readAnswer(answer, judge, key).ok, false, `case ${i}`);
  }
});

test('a judge that cannot tell the identical pair apart within 1 is not valid', () => {
  const { judge, key, answer } = fixture({ 'control-copy': 1 });
  assert.equal(calibrate(readAnswer(answer, judge, key).byRole).valid, false);
});

test('a win needs four valid judges and two thirds of them', () => {
  const j = (c, k) => ({ calibration: { valid: true }, byRole: { candidate: { primary: c }, control: { primary: k } } });
  assert.equal(verdict([j(6, 5), j(6, 5), j(6, 5)]).call, 'inconclusive');
  assert.equal(verdict([j(6, 5), j(6, 5), j(6, 5), j(6, 5)]).call, 'win');
  assert.equal(verdict([j(6, 5), j(6, 5), j(6, 5), j(5, 5)]).call, 'inconclusive');
  assert.equal(verdict([j(4, 5), j(4, 5), j(4, 5), j(4, 5), j(6, 5), j(4, 5)]).call, 'loss');
});
