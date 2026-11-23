import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { revertCounter, DEFAULT_REVERTS } from './reverts.mjs';
import { readSeen, seenAsk, logReads, LEAST_SAID } from './seen.mjs';
import { LEVELS, levelOf, handedAt, DEFAULT_RETRIES } from './levels.mjs';
import { usageOf, usageLine } from './usage.mjs';
import { handedOverRecord, checkHandedOver, checkChoice, filesOf } from './parity.mjs';
import { preparedRoot, preparedKey, prepareCommand, readPrepared, writePrepared, preparedFilm } from './prepared.mjs';
import { SHEET_FILES, spread, orderColour, arrowsSvg, writeWorkSheets } from './work-sheets.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rope-test-'));

test('returns to an earlier choice: counted, a repeat is none, the start counts, and past the allowed number they are refused', () => {
  const r = revertCounter(2, 'auto');
  assert.deepEqual(r.see('a'), { revert: false, refused: false, count: 0 }); assert.equal(r.see('a').revert, false);
  assert.equal(r.see('b').revert, false); assert.deepEqual(r.see('a'), { revert: true, refused: false, count: 1 });
  assert.deepEqual(r.see('auto'), { revert: true, refused: false, count: 2 }, 'going back to the code planner\'s plan is a return too');
  assert.equal(r.barred('b'), true); assert.equal(r.barred('auto'), false, 'where it stands is no return'); assert.equal(r.barred('new'), false);
  assert.deepEqual(r.see('b'), { revert: true, refused: true, count: 2 }); assert.equal(r.see('c').revert, false, 'new work is always taken');
  assert.deepEqual((({ count, allowed, refused }) => [count, allowed, refused])(r.record()), [2, 2, 1]); assert.equal(r.record().log.length, 3); assert.equal(DEFAULT_REVERTS, 20);
});

test('handed pictures: a line each in seen.md; what a command\'s log can show of a read, and where it cannot', () => {
  const files = ['previous/final-beside-subject.jpg', 'auto-painting/replay-sheet-frames-in-order.jpg'];
  assert.deepEqual(readSeen(null, files).missing, files);
  const got = readSeen('previous/final-beside-subject.jpg: the cat is too dark and the ear is lost\n- `replay-sheet-frames-in-order.jpg`: the face was laid before the wall, in three sittings\n', files);
  assert.equal(got.ok, true); assert.match(got.said[files[1]], /three sittings/);
  assert.deepEqual(readSeen(`previous/final-beside-subject.jpg: ${'x'.repeat(LEAST_SAID - 1)}`, files).missing, files, 'a few letters are not a look');
  assert.match(seenAsk(files), /write one line on each into `seen\.md`, as `FILE: what the picture shows/);
  assert.deepEqual(logReads('claude', ['Read /tmp/unpaint-session-x/previous/final-beside-subject.jpg', 'ls'], files), { [files[0]]: true, [files[1]]: false });
  assert.deepEqual(logReads('agy', ['view_file /s/auto-painting/replay-sheet-frames-in-order.jpg'], files), { [files[0]]: false, [files[1]]: true });
  assert.deepEqual(logReads('codex', ['sips -g pixelWidth previous/final-beside-subject.jpg'], files), { [files[0]]: null, [files[1]]: null }, 'codex\'s log cannot show a picture being read: null, never a guess');
});

test('a level is a named setting: L2 one go without the code\'s plan, L3 a retry from the L2 result, L4 a retry from the L3 result with Auto\'s painting and the traced shapes, never the code\'s plan; no critique at any level', () => {
  assert.deepEqual(Object.keys(LEVELS), ['L2', 'L3', 'L4']); assert.throws(() => levelOf('L9'), /one of L2, L3, L4/); assert.equal(DEFAULT_RETRIES, 1);
  assert.deepEqual(handedAt(levelOf('L2'), {}), { previous: false, plan: false, auto: false, shapes: false }, 'L2 gets the code planner\'s inputs, not its plan');
  assert.deepEqual(handedAt(levelOf('L3'), { previous: 'l2-run' }), { previous: true, plan: false, auto: false, shapes: false }, 'L3 gets its own previous painting and nothing of the code\'s');
  assert.deepEqual(handedAt(levelOf('L4'), { previous: 'l3-run' }), { previous: true, plan: false, auto: true, shapes: true }, 'L4 gets Auto\'s finished painting and the traced shapes, never the code\'s plan');
  assert.ok(Object.values(LEVELS).every(l => l.codePlan === false), 'no level hands over the code\'s plan');
  assert.deepEqual(handedAt(levelOf('L3'), { tryNumber: 3, retries: 3, previous: 'run' }), { previous: true, plan: false, auto: false, shapes: false }, 'the number of retries is a setting');
  assert.throws(() => handedAt(levelOf('L2'), { previous: 'run' }), /L2 is one go from the prepared inputs/); assert.throws(() => handedAt(levelOf('L2'), { tryNumber: 2 }), /L2 is one go/);
  assert.throws(() => handedAt(levelOf('L3'), {}), /L3 is a retry: it starts from the model's own L2 result\. Name that run's folder with --previous/); assert.throws(() => handedAt(levelOf('L4'), {}), /starts from the model's own L3 result/);
  assert.throws(() => handedAt(levelOf('L3'), { tryNumber: 2, previous: 'run' }), /try 2: this benchmark gives 1 retry at a level \(--retries sets it\)/);
  assert.ok(Object.values(LEVELS).every(l => !/critique|score|verdict/i.test(JSON.stringify(Object.keys(l)))));
});

test('usage: what a session cost, measured; the budget and whether it was reached; the final\'s minutes beside it', () => {
  const session = { ended: 'reached the benchmark\'s resource budget', wallMinutes: 70.2, ownMinutes: 18.5, waitMinutes: 51.7, budgetReached: { what: '60 minutes of wall time', atWallMinutes: 60, looks: 4 }, toolCallsTotal: 81, toolCalls: { shell: 60, 'unpaint look': 4 },
    lookUnits: { spent: 2.3, budget: 5 }, assessment: { asked: true, written: true, text: 'the ear is lost' }, looks: [{ look: 1, cost: 0.3, ask: { until: 1, region: null }, painted: { seconds: 420 } }, { painted: { seconds: 480 } }, { painted: { seconds: 300 } }, { painted: {} }], plans: [{ ok: true, seconds: 60 }, { ok: false, seconds: 30 }], selfReviews: [{ written: true }], reverts: { count: 2, allowed: 20, refused: 0 }, warningsGiven: 5, pictures: { handed: ['a.jpg', 'b.jpg'], said: { 'a.jpg': 'x' } } };
  const u = usageOf({ subject: 'mittens:', author: { key: 'opus', name: 'Opus', id: 'm', cli: 'claude', tokens: 1500, tokensIn: 1200, tokensOut: 300, costUSD: 4.25 }, level: 'L4', tryNumber: 2, budget: { looks: 100, wallMinutes: 60, graceMinutes: 10, reverts: 20 }, session,
    final: { seconds: 2400, backend: 'gpu', failure: null }, plan: { washes: 40, strokes: 900, dryings: 6, passages: 31 }, prepared: { plan: true, painting: true, from: 'p' }, commit: 'abc' });
  const { looksEach, ...rest } = u.session; assert.deepEqual(looksEach[0], { look: 1, cost: 0.3, until: 1, region: null, machineSeconds: 420, render: null });
  assert.deepEqual(rest, { ended: 'reached the benchmark\'s resource budget', wallMinutes: 70.2, ownMinutes: 18.5, waitMinutes: 51.7, steps: null, cutOffBySafetyStop: false, looks: 4, lookUnits: { spent: 2.3, budget: 5 }, plans: 2, plansRefused: 1, toolCalls: 81, toolCallsByKind: { shell: 60, 'unpaint look': 4 }, selfReviews: 1, assessmentWritten: true, reverts: { count: 2, allowed: 20, refused: 0 }, warningsGiven: 5, picturesHanded: ['a.jpg', 'b.jpg'], picturesDescribed: 1 });
  assert.deepEqual(u.model, { tokensIn: 1200, tokensOut: 300, tokens: 1500, costUSD: 4.25, costFrom: 'reported by the command' });
  assert.deepEqual([u.machine.lookGpuMinutes, u.machine.lookPaintings, u.machine.planCpuMinutes, u.machine.finalGpuMinutes], [20, 3, 1.5, 40]); assert.deepEqual(u.work, { washes: 40, strokes: 900, dryings: 6, passages: 31 });
  assert.equal(u.budget.reached.what, '60 minutes of wall time'); assert.match(u.budget.note, /Recorded, not a failure/); assert.equal(u.prepared.plan, true); assert.deepEqual([u.level, u.try], ['L4', 2]);
  assert.match(usageLine(u), /4 looks for 2\.3 of 5 rendering units, \? of \? steps \(20 GPU min\), 2 plans, 70.2 wall min \(18.5 its own\), 81 tool calls, 1500 tokens, \$4.25, 2 returns to an earlier choice; final 40 GPU min; REACHED THE BENCHMARK'S RESOURCE BUDGET/);
  const quiet = usageOf({ subject: 's', author: { key: 'astra', name: 'Astra' }, level: 'L2', tryNumber: 1, budget: {}, session: { ended: 'done' } });
  assert.equal(quiet.budget.reached, null); assert.equal(quiet.model.costFrom, 'not reported by this command'); assert.equal(quiet.machine.finalGpuMinutes, null);
  // a plan with erase passages counts them in its work, beside its washes and strokes
  const erased = usageOf({ subject: 's', author: { key: 'astra', name: 'Astra' }, level: 'L2', tryNumber: 1, budget: {}, session: { ended: 'done' }, plan: { washes: 3, strokes: 20, dryings: 2, passages: 5, erases: { passages: 2, strokes: 4, said: 'x' } } });
  assert.deepEqual(erased.work.erases, { passages: 2, strokes: 4 });
});

test('parity: what was handed over is written down with the hash of each file, and a kept folder that differs is refused', () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, 'script.json'), '{"a":1}'); fs.writeFileSync(path.join(dir, 'my-lines.json'), '{"own":[]}');
    const sub = { kind: 'script', what: 'own script with its choice of lines', script: 'script.json', settings: {}, tools: { lines: 'my-lines.json', medium: 'pen' } };
    assert.deepEqual(filesOf(sub), [['script', 'script.json'], ['lines', 'my-lines.json']]);
    const rec = handedOverRecord(dir, sub, { commit: 'abc' });
    assert.equal(rec.files.script.sha256.length, 64); assert.equal(rec.medium, 'pen'); assert.equal(rec.commit, 'abc');
    assert.deepEqual(checkHandedOver(dir, rec), { same: true, compared: ['script', 'lines'] });
    checkChoice(rec, { kind: 'script', sets: [], tools: { medium: 'pen' } }); assert.throws(() => checkChoice(rec, { kind: 'script', sets: [], tools: {} }), /is not the one the session handed over/);
    fs.writeFileSync(path.join(dir, 'my-lines.json'), '{"own":[1]}'); assert.throws(() => checkHandedOver(dir, rec), /my-lines\.json \(its lines\) is not the file the session handed over.*Nothing is painted in its place/);
    fs.rmSync(path.join(dir, 'script.json')); assert.throws(() => checkHandedOver(dir, rec), /script\.json \(its script\) is missing/); assert.throws(() => handedOverRecord(dir, sub), /script\.json \(its script\) is not in the kept folder/);
    assert.equal(checkHandedOver(dir, null).same, null, 'a session kept before the record: said, not passed off as checked');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepared inputs: kept for a subject, a commit and the run\'s settings; a session without them is told the command', () => {
  const root = tmp();
  try {
    assert.equal(preparedRoot('/subjects', {}), path.resolve('/subjects/prepared')); assert.equal(preparedRoot('/subjects', { UNPAINT_PREPARED: '/elsewhere' }), path.resolve('/elsewhere'));
    assert.equal(preparedKey({ id: 'mittens', commit: 'abcdef0123456789' }), path.join('mittens', 'abcdef01'));
    assert.match(preparedKey({ id: 'h36', variant: 'approved', commit: 'abcdef0123456789', dirty: true, diffSha256: '99887766554433', sets: [['floors', '8,4,2'], ['frames', '48']] }), /^h36-approved\/abcdef01-dirty-99887766-set-[0-9a-f]{8}$/);
    assert.equal(preparedKey({ id: 'a', commit: 'abcdef0123', sets: [['frames', '48'], ['video', '1']] }), path.join('a', 'abcdef01'), 'the film\'s settings do not change the plan');
    assert.throws(() => preparedKey({ id: 'a', commit: null }), /kept for a commit/);
    const command = prepareCommand({ subject: 'mittens', level: 'L4', sets: [['floors', '8,4,2']] }); assert.equal(command, 'npm run paint -- mittens prepare --level L4 --set floors=8,4,2');
    const folder = path.join(root, 'mittens', 'abcdef01');
    assert.throws(() => readPrepared(folder, { command }), /the automatic plan of this subject is not prepared .* a session never makes it on its own clock\. Make it once with:\n {2}npm run paint -- mittens prepare --level L4/);
    writePrepared(folder, { commit: 'abcdef01', plan: { seconds: 80 }, painting: null }); fs.mkdirSync(path.join(folder, 'plan'));
    assert.throws(() => readPrepared(folder, { command }), /the subject's rendering unit \(one full look of the automatic plan, counted\) is not prepared/);
    writePrepared(folder, { commit: 'abcdef01', plan: { seconds: 80 }, unit: { look: 300, plan: 960 }, painting: null });
    assert.throws(() => readPrepared(folder, { command }), /its value-plan\.json/);
    for (const f of ['value-plan.json', 'plan-to-edit.json']) fs.writeFileSync(path.join(folder, 'plan', f), '{}');
    assert.equal(readPrepared(folder, { command }).painting, null); assert.throws(() => readPrepared(folder, { painting: true, command }), /the block-in study's flat shapes as data \(level 4 hands them to the session\) is not prepared/); fs.writeFileSync(path.join(folder, 'shapes.json'), '{}');
    assert.throws(() => readPrepared(folder, { painting: true, command }), /the plan's washes as data \(level 4 hands them to the session\)/); fs.writeFileSync(path.join(folder, 'washes.json'), '{}');
    assert.throws(() => readPrepared(folder, { painting: true, command }), /the automatic painter's full-size painting of this subject \(level 4 hands it to the session\) is not prepared/);
    writePrepared(folder, { commit: 'abcdef01', plan: { seconds: 80 }, unit: { look: 300, plan: 960 }, painting: { seconds: 900 } }); fs.mkdirSync(path.join(folder, 'painting')); fs.writeFileSync(path.join(folder, 'painting', 'run.json'), '{}');
    assert.throws(() => readPrepared(folder, { painting: true, command }), /the automatic painting's final-beside-subject\.jpg/);
    fs.mkdirSync(path.join(folder, 'sheets')); for (const f of Object.values(SHEET_FILES)) fs.writeFileSync(path.join(folder, 'sheets', f), 'x');
    assert.deepEqual(readPrepared(folder, { painting: true, command }).painting.sheets.map(s => s.name), Object.values(SHEET_FILES));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the sheets of a finished painting: beside the subject, the frames in order, every stroke as an arrow; a folder that is no finished painting is refused', async () => {
  const run = tmp(), to = tmp();
  try {
    const plate = path.join(run, 'plate'); fs.mkdirSync(plate);
    const img = (file, c) => sharp({ create: { width: 80, height: 60, channels: 3, background: c } }).png().toFile(file);
    await img(path.join(plate, 'painting.png'), '#bb8844'); await img(path.join(run, 'source.png'), '#224466'); for (let i = 0; i < 5; i++) await img(path.join(plate, `f000${i}.png`), '#ffffff');
    const plan = { passes: [{ strokes: [{ points: [[10, 10, 0.3], [40, 12, 0.6], [70, 20, 0.2]] }, { points: [[5, 5, 1]] }] }, { strokes: [{ points: [[20, 50, 0.5], [60, 50, 0.5]] }] }] };
    fs.writeFileSync(path.join(plate, 'value-plan.json'), JSON.stringify(plan));
    const record = { mode: 'paint', failure: null, subject: { sourceAbs: path.join(run, 'source.png') }, sheet: { widthMm: 80, heightMm: 60 } };
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify(record));
    const files = await writeWorkSheets(run, to, { whose: 'your previous' });
    assert.deepEqual(files.map(f => f.name), [SHEET_FILES.beside, SHEET_FILES.replay, SHEET_FILES.arrows]); assert.ok(files.every(f => f.picture && fs.statSync(f.from).size > 100)); assert.match(files[0].what, /your previous painting as it dried, at full size, on the left; the subject on the right/);
    const m = await sharp(files[0].from).metadata(); assert.ok(m.width > 2 * 80 * (m.height / 60) - 2, 'two sheets side by side');
    assert.ok(!files.some(f => /score|verdict|judge|metric/i.test(f.name + f.what)));
    const a = arrowsSvg(plan, { widthMm: 80, heightMm: 60, width: 800 }); assert.equal(a.strokes, 2, 'a stroke of one point has no direction'); assert.equal((a.svg.match(/<polygon/g) ?? []).length, 2); assert.match(a.svg, /hsl\(240, 85%, 42%\)[\s\S]*hsl\(0, 85%, 42%\)/, 'first blue, last red');
    assert.equal(orderColour(0.5), 'hsl(120, 85%, 42%)'); assert.deepEqual(spread([1, 2, 3, 4, 5, 6, 7], 3), [1, 4, 7]);
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify({ ...record, mode: 'plan' })); await assert.rejects(writeWorkSheets(run, to, { whose: 'x' }), /a plan only, not a painting/);
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify({ ...record, failure: 'the GPU left' })); await assert.rejects(writeWorkSheets(run, to, { whose: 'x' }), /the painting failed \(the GPU left\)/);
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify(record)); for (let i = 1; i < 5; i++) fs.rmSync(path.join(plate, `f000${i}.png`)); await assert.rejects(writeWorkSheets(run, to, { whose: 'x' }), /replay sheet: 1 frames/);
    // the painter keeps its film's frames as webp (f0000.webp ...): they are frames of the replay too
    fs.rmSync(path.join(plate, 'f0000.png')); for (let i = 0; i < 4; i++) await sharp({ create: { width: 80, height: 60, channels: 3, background: '#ffffff' } }).webp().toFile(path.join(plate, `f000${i}.webp`));
    assert.equal((await writeWorkSheets(run, to, { whose: 'x' }))[1].name, SHEET_FILES.replay);
  } finally { for (const d of [run, to]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a level 4 prepare paints the automatic painting with its frames kept, and the prepared key does not change for it', () => {
  assert.deepEqual(preparedFilm(levelOf('L4')), [['video', '1'], ['frames', '48']]); assert.deepEqual(preparedFilm(levelOf('L2')), []);
  const key = sets => preparedKey({ id: 'm', commit: 'abc', sets });
  assert.equal(key(preparedFilm(levelOf('L4'))), key([]));
});
