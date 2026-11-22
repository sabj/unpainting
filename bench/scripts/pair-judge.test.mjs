import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyLimits, copyLimitsLine, costChange } from './copy-limits.mjs';
import { parseArgs, readRun, checkPair, decide, table, runPairJudge, parseVersusArgs, riskOf, versusTable, runVersusAuto, gapClosed, targetTable, wholeTable } from './pair-judge.mjs';

const rec = o => ({ hfCorr: 0.5, hfCeiling: 0.645, guard: { guarded: true, violations: 0 }, looks: 0, strokes: 900, sheetMm: 280, width: 1200, height: 1608, smallShare: 0.01, seconds: 170, ...o });
const look = (a, b, winner = null, o = {}) => ({ complete: true, tilesA: a, tilesB: b, ties: 0, p: winner ? 0.01 : 0.5, decided: !!winner, winner, ...o });
const pair = o => ({ name: 'p', heldOut: true, a: {}, b: {}, copyA: copyLimits(rec()), copyB: copyLimits(rec()), cost: { strokes: 1, seconds: 1 }, look: look(1, 11, 'b'), ...o });

test('copyLimits passes a guarded plate under its ceiling and fails each limit on its own', () => {
  assert.equal(copyLimits(rec()).pass, true);
  assert.equal(copyLimits(rec({ hfCorr: 0.645 })).pass, true);
  for (const [o, which] of [[{ hfCorr: 0.646 }, 'hfCorr'], [{ looks: 3 }, 'looks'], [{ guard: { guarded: true, violations: 1 } }, 'guard']]) {
    const r = copyLimits(rec(o));
    assert.equal(r.pass, false);
    assert.deepEqual(Object.entries(r.checks).filter(([, c]) => !c.pass).map(([k]) => k), [which]);
    assert.match(copyLimitsLine(r), new RegExp(`FAIL: ${which}`));
  }
  assert.equal(copyLimits(rec({ hfCorr: 0.6 })).checks.hfCorr.margin, 0.045);
});

test('copyLimits refuses an unguarded run or a missing number: it never passes by default', () => {
  assert.throws(() => copyLimits(rec({ guard: { guarded: false, violations: 0 } })), /guard off/);
  assert.throws(() => copyLimits(rec({ guard: undefined })), /guard/);
  assert.throws(() => copyLimits(rec({ hfCorr: null })), /needs hfCorr/);
  assert.throws(() => copyLimits(rec({ hfCeiling: undefined })), /needs hfCeiling/);
  assert.throws(() => copyLimits(rec({ looks: undefined })), /look count/);
});

test('strokes have an absolute ceiling from the sheet size, and no limit depends on another plate', () => {
  const r = copyLimits(rec());
  assert.equal(r.checks.strokes.limit, 15563);          // 280 x 375.2 mm sheet over 6.75 mm2
  assert.equal(r.checks.strokes.pass, true);
  assert.equal(copyLimits(rec({ strokes: 15563 })).pass, true);
  const over = copyLimits(rec({ strokes: 15564 }));
  assert.equal(over.pass, false);
  assert.match(copyLimitsLine(over), /FAIL: strokes 15564 over 15563/);
  assert.equal(copyLimits(rec({ sheetMm: 140 })).checks.strokes.limit, 3890);   // a quarter of the sheet, a quarter of the strokes
  assert.throws(() => copyLimits(rec({ strokes: null })), /needs the stroke count/);
  assert.throws(() => copyLimits(rec({ sheetMm: undefined })), /sheet size/);
  assert.equal(copyLimits.length, 1);                   // one plate in, nothing to compare it with
});

test('cost is reported per plate and as a change between plates, and never decides', () => {
  const a = copyLimits(rec()), b = copyLimits(rec({ strokes: 1800, seconds: 255, smallShare: null }));
  assert.deepEqual(a.cost, { strokes: 900, strokesPer100Cm2: 85.7, sheetCover: 0.058, smallShare: 0.01, seconds: 170 });
  assert.equal(b.cost.smallShare, null);
  assert.deepEqual(costChange(a, b), { strokes: 2, seconds: 1.5 });
  assert.equal(b.pass, true);                           // twice the strokes is a cost, not a failure
  assert.deepEqual(costChange(a, copyLimits(rec({ seconds: null }))), { strokes: 1, seconds: null });
});

test('decide accepts only a decided win for B with clean copy checks and a held-out subject', () => {
  const win = { complete: true, tilesA: 3, tilesB: 21, p: 0.0003, winner: 'b' };
  assert.deepEqual(decide([pair(), pair({ name: 'q', heldOut: false })], win), { accept: true, reasons: [] });
  const why = (pairs, pooled) => decide(pairs, pooled).reasons.join(' | ');
  assert.match(why([pair({ heldOut: false })], win), /no held-out subject/);
  assert.match(why([pair({ copyB: copyLimits(rec({ hfCorr: 0.7 })) })], win), /B fails the copy checks \(FAIL: hfCorr 0.7 over 0.645\)/);
  assert.match(why([pair()], { complete: true, tilesA: 6, tilesB: 6, p: 1, winner: null }), /no decided preference/);
  assert.match(why([pair()], { complete: true, tilesA: 11, tilesB: 1, p: 0.006, winner: 'a' }), /judges prefer A/);
  assert.match(why([pair(), pair({ name: 'worse', look: look(12, 0, 'a') })], win), /worse: decided for A/);
  assert.match(why([pair({ look: { complete: false } })], { complete: false }), /not judged completely: p/);
  assert.match(why([], null), /no pairs/);
  // A failing the copy checks is reported in the table and does not block B
  assert.equal(decide([pair({ copyA: copyLimits(rec({ hfCorr: 0.7 })) })], win).accept, true);
});

test('parseArgs refuses unknown options and odd call counts', () => {
  assert.throws(() => parseArgs(['--manifest', 'm', '--out', 'o', '--target', 't']), /unknown option --target/);
  assert.throws(() => parseArgs(['--manifest', 'm']), /usage/);
  assert.throws(() => parseArgs(['--manifest', 'm', '--out', 'o', '--calls', '3']), /even/);
  assert.throws(() => parseArgs(['--manifest', 'm', '--out']), /needs a value/);
  assert.deepEqual(parseArgs(['--manifest', 'm', '--out', 'o', '--sheet', '--no-vision']), { manifest: 'm', out: 'o', python: null, calls: 2, seed: 1, sheet: true, vision: false });
});

function runDir(root, name, { hfCorr = 0.5, looks = 0, mode = 'gentle', width = 1200, sheetMm = 280, drop = null } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    'painting.png': 'png',
    'run-card.json': JSON.stringify({ codeSHA: 'abc', subject: 'dog', seconds: 171, provenance: { geometry: { sheetMm } }, dimensions: { paintWidth: width, paintHeight: 1608 } }),
    'cheat-risk.json': JSON.stringify({ strokes: 900, smallShare: 0.02, hfCorr, hfCeiling: 0.645 }),
    'target-guard.json': JSON.stringify({ mode, violations: 0, looks: { count: looks } }),
  };
  for (const [f, body] of Object.entries(files)) if (f !== drop) fs.writeFileSync(path.join(dir, f), body);
  return dir;
}

test('readRun reads the painter records and refuses a run that lacks one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  try {
    const r = readRun(runDir(root, 'ok'));
    assert.deepEqual([r.sheetMm, r.width, r.height, r.hfCorr, r.looks, r.guard.guarded, r.strokes, r.smallShare, r.seconds], [280, 1200, 1608, 0.5, 0, true, 900, 0.02, 171]);
    assert.equal(readRun(runDir(root, 'off', { mode: 'off' })).guard.guarded, false);
    for (const f of ['painting.png', 'run-card.json', 'cheat-risk.json', 'target-guard.json']) assert.throws(() => readRun(runDir(root, 'no-' + f, { drop: f })), new RegExp(`no ${f}`));
    fs.writeFileSync(path.join(root, 'ok', 'run-card.json'), '{}');
    assert.throws(() => readRun(path.join(root, 'ok')), /no sheet width/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkPair refuses plates that do not line up', () => {
  const a = { width: 1200, height: 1608, sheetMm: 280 }, e = { name: 'n', a: 'x', b: 'y', style: 's' };
  checkPair(e, a, { ...a });
  assert.throws(() => checkPair(e, a, { ...a, width: 600 }), /differ in size/);
  assert.throws(() => checkPair(e, a, { ...a, sheetMm: 200 }), /sheets differ/);
  assert.throws(() => checkPair({ ...e, style: undefined }, a, a), /"style" is missing/);
});

test('runPairJudge passes the sheet width and both paintings to pairs.py, never a target, and writes the verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  try {
    const manifest = path.join(root, 'pairs.json'), out = path.join(root, 'out');
    fs.writeFileSync(manifest, JSON.stringify([
      { name: 'dog paint', a: runDir(root, 'a1'), b: runDir(root, 'b1'), style: 'wash', heldOut: true },
      { name: 'cat', a: runDir(root, 'a2'), b: runDir(root, 'b2', { hfCorr: 0.7 }), style: 'wash' },
    ]));
    const calls = [];
    const run = (py, args) => {
      calls.push([py, ...args]);
      const result = args.includes('--pool') ? { complete: true, tilesA: 2, tilesB: 22, ties: 0, p: 0.0001, decided: true, winner: 'b' } : look(1, 11, 'b', { errors: {} });
      const o = args.indexOf('--out');
      if (o >= 0) fs.writeFileSync(args[o + 1], JSON.stringify(result));
      return { status: 0, stdout: JSON.stringify(result), stderr: '' };
    };
    const r = runPairJudge(['--manifest', manifest, '--out', out, '--python', 'py3', '--sheet'], { run });
    assert.equal(calls.length, 3);
    assert.equal(calls[0][0], 'py3');
    assert.ok(calls[0][1].endsWith(path.join('scorer', 'pairs.py')));
    const arg = (c, k) => c[c.indexOf(k) + 1];
    assert.equal(arg(calls[0], '--plate-mm'), '280');
    assert.equal(arg(calls[0], '--a'), path.join(root, 'a1', 'painting.png'));
    assert.equal(arg(calls[0], '--sheet'), path.join(out, 'sheet-dog-paint'));
    assert.ok(calls.every(c => !c.some(x => /target/i.test(x))));
    assert.deepEqual(calls[2].slice(2), ['--pool', path.join(out, 'dog-paint.json'), path.join(out, 'cat.json')]);
    assert.equal(r.decision.accept, false);
    assert.match(r.decision.reasons.join(), /cat: B fails the copy checks/);
    const v = JSON.parse(fs.readFileSync(path.join(out, 'verdict.json'), 'utf8'));
    assert.equal(v.pairs[1].copyB.pass, false);
    assert.equal(v.pooled.winner, 'b');
    assert.match(fs.readFileSync(path.join(out, 'verdict.md'), 'utf8'), /NOT ACCEPTED: cat: B fails/);
    assert.match(table(r.pairs, r.pooled, r.decision), /\| dog paint \| yes \| 11 \| 1 \|/);
    assert.match(r.md, /900 \(6% of 15563\) \| 900 \(6% of 15563\), 1x A \|/);
    assert.deepEqual(v.pairs[0].cost, { strokes: 1, seconds: 1 });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runPairJudge stops on a judge failure and reports an incomplete judgement without accepting', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  try {
    const manifest = path.join(root, 'pairs.json');
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'dog', a: runDir(root, 'a'), b: runDir(root, 'b'), style: 'wash', heldOut: true }]));
    const argv = ['--manifest', manifest, '--out', path.join(root, 'out')];
    assert.throws(() => runPairJudge(argv, { run: () => ({ status: 1, stdout: '', stderr: 'TOGETHER_API_KEY is not set' }) }), /pairs.py failed \(exit 1\): TOGETHER_API_KEY is not set/);
    assert.throws(() => runPairJudge(argv, { run: () => ({ error: new Error('ENOENT') }) }), /could not start/);
    const r = runPairJudge(argv, { run: (py, args) => ({ status: args.includes('--pool') ? 0 : 3, stdout: JSON.stringify({ complete: false }), stderr: '' }) });
    assert.equal(r.decision.accept, false);
    assert.match(r.decision.reasons.join(), /not judged completely: dog/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---- versus-auto: one painting against the Auto painting of its subject ----------------------------------------

const lookVs = (o = {}) => ({ complete: true, judgeVersion: 'J3', winRate: 0.233, interval: [0.118, 0.409], tiles: 30, decided: true, reading: 'loses to Auto',
  repeatability: { measured: true, tileAgreement: 0.9, winRateRange: 0.033 }, judgeAgreement: [{ mean: 0.8 }, { mean: 0.7 }], ...o });
const prog = { earlyMean: 4.5, mean: 4.33, judgeVersion: 'J3' };

function plateDir(root, name, risk = { risk: 0.23, level: 'low', parts: { progression: 0.5 } }, strip = true) {
  const dir = runDir(root, name);
  fs.writeFileSync(path.join(dir, 'cheat-risk.json'), JSON.stringify({ strokes: 547, smallShare: 0, hfCorr: 0.031, hfCeiling: 0.645, ...risk }));
  if (strip) { fs.mkdirSync(path.join(dir, 'stages')); fs.writeFileSync(path.join(dir, 'stages', 'strip.jpg'), 'jpg'); }
  return dir;
}

test('parseVersusArgs has its own options and refuses the rest', () => {
  assert.deepEqual(parseVersusArgs(['--manifest', 'm', '--out', 'o']), { manifest: 'm', out: 'o', python: null, repeats: 2, seed: 1, progression: true, tiles: true });
  assert.equal(parseVersusArgs(['--manifest', 'm', '--out', 'o', '--repeats', '1', '--no-progression']).progression, false);
  assert.throws(() => parseVersusArgs(['--manifest', 'm', '--out', 'o', '--repeats', '0']), /--repeats/);
  assert.throws(() => parseVersusArgs(['--manifest', 'm', '--out', 'o', '--sheet']), /unknown option --sheet/);
  assert.throws(() => parseVersusArgs(['--out', 'o']), /usage: pair-judge.mjs versus-auto/);
});

test('riskOf reports the plate\'s own cheat-risk record and refuses one without a score', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  try {
    assert.deepEqual(riskOf(plateDir(root, 'p', { risk: 0.4, level: 'medium', review: false, flags: ['darks first'] })),
      { risk: 0.4, level: 'medium', review: false, parts: null, flags: ['darks first'], hfCorr: 0.031, strokes: 547, smallShare: 0 });
    assert.throws(() => riskOf(runDir(root, 'bare')), /no risk score/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runVersusAuto scores each painting against Auto and lists progression and cheat risk beside it, unmixed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  try {
    const manifest = path.join(root, 'versus.json'), out = path.join(root, 'out');
    const auto = plateDir(root, 'auto'), argon = plateDir(root, 'argon', { risk: 0.61, level: 'high' }), neon = plateDir(root, 'neon');
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat / argon', auto, painting: argon, style: 'wash' }, { name: 'cat / neon', auto, painting: neon, style: 'wash' }]));
    const calls = [];
    const run = (py, args) => {
      calls.push([py, ...args]);
      return { status: 0, stdout: JSON.stringify(args[0].endsWith('versus.py') ? lookVs() : prog), stderr: '' };
    };
    const r = runVersusAuto(['--manifest', manifest, '--out', out, '--python', 'py3', '--repeats', '2', '--seed', '7'], { run });
    const scripts = calls.map(c => path.basename(c[1]));
    assert.deepEqual(scripts, ['progression.py', 'versus.py', 'progression.py', 'versus.py', 'progression.py']);   // Auto's strip once
    const arg = (c, k) => c[c.indexOf(k) + 1];
    assert.equal(arg(calls[1], '--auto'), path.join(auto, 'painting.png'));
    assert.equal(arg(calls[1], '--image'), path.join(argon, 'painting.png'));
    assert.deepEqual([arg(calls[1], '--plate-mm'), arg(calls[1], '--repeats'), arg(calls[1], '--seed')], ['280', '2', '7']);
    assert.equal(arg(calls[2], '--sheet'), path.join(argon, 'stages', 'strip.jpg'));
    assert.ok(calls.every(c => !c.some(x => /target/i.test(x))));
    assert.equal(r.complete, true);
    assert.deepEqual(r.rows.map(x => [x.name, x.auto]), [['dog (Auto)', true], ['cat / argon', false], ['cat / neon', false]]);
    assert.match(r.md, /\| dog \(Auto\) \| Auto \| {2}\| {2}\| {2}\| {2}\| {2}\| {2}\| 4.5 \/ 4.33 \| 0.23 \(low\) \| 0.031 \| 547 \|/);
    assert.match(r.md, /\| cat \/ argon \| 23% \| 12% to 41% \| loses to Auto \| 30 \| 3 points \| 90% \| 75% \| 4.5 \/ 4.33 \| 0.61 \(high\) \| 0.031 \| 547 \|/);
    const saved = JSON.parse(fs.readFileSync(path.join(out, 'versus.json'), 'utf8'));
    assert.equal(saved.rows[1].look.winRate, 0.233);          // the win rate is the look alone
    assert.equal(saved.rows[1].risk.risk, 0.61);
    assert.equal(saved.rows[1].progression.earlyMean, 4.5);
    assert.match(fs.readFileSync(path.join(out, 'versus.md'), 'utf8'), /# Win rate against Auto/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runVersusAuto fails loudly on a missing strip, a judge failure or plates that do not line up, and reports an incomplete look', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  try {
    const manifest = path.join(root, 'versus.json'), out = path.join(root, 'out');
    const auto = plateDir(root, 'auto'), p = plateDir(root, 'p', undefined, false);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat', auto, painting: p, style: 'wash' }]));
    const ok = (py, args) => ({ status: 0, stdout: JSON.stringify(args[0].endsWith('versus.py') ? lookVs() : prog), stderr: '' });
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run: ok }), /no stages\/strip.jpg/);
    const r = runVersusAuto(['--manifest', manifest, '--out', out, '--no-progression'], { run: ok });
    assert.match(r.md, /\| cat \| 23% .* \| not run \| 0.23 \(low\)/);
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out, '--no-progression'], { run: () => ({ status: 1, stdout: '', stderr: 'local call failed' }) }), /versus.py failed \(exit 1\): local call failed/);
    const part = runVersusAuto(['--manifest', manifest, '--out', out, '--no-progression'], { run: () => ({ status: 3, stdout: JSON.stringify({ complete: false, winRate: null, interval: null }), stderr: '' }) });
    assert.equal(part.complete, false);
    assert.match(part.md, /\| cat \| - \| - \| not judged \|/);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat', auto, painting: runDir(root, 'small', { width: 600 }), style: 'wash' }]));
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run: ok }), /differ in size/);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat', auto, style: 'wash' }]));
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run: ok }), /"painting" is missing/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('versusTable says when progression was not judged', () => {
  const md = versusTable([{ name: 'x', auto: false, look: lookVs({ repeatability: { measured: false } }), risk: { risk: 0.1, level: 'low', hfCorr: 0.02, strokes: 9 }, progression: { earlyMean: null } }]);
  assert.match(md, /not measured \| - \| 75% \| not judged \| 0.1 \(low\) \| 0.02 \| 9 \|/);
});

test('gapClosed reads a painting against Auto\'s own distance from the target', () => {
  assert.equal(gapClosed(0.1, 0.1), 0);
  assert.equal(gapClosed(0.3, 0.1), 0.5);
  assert.equal(gapClosed(0.5, 0.1), 1);
  assert.equal(gapClosed(0.02, 0.1), -0.2);
  assert.equal(gapClosed(0.4, 0.5), null);       // Auto level with the target: no gap to close
  assert.equal(gapClosed(null, 0.1), null);
});

test('runVersusAuto with a target scores Auto and the painting against it on both questions, and a failed try is a loss', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  try {
    const manifest = path.join(root, 'versus.json'), out = path.join(root, 'out'), target = path.join(root, 'target.png');
    fs.writeFileSync(target, 'png');
    const auto = plateDir(root, 'auto'), p = plateDir(root, 'p');
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat / p', auto, painting: p, style: 'wash', target }, { name: 'cat / dead', auto, failed: true, style: 'wash', target }]));
    const q = (winRate, softWinRate, wins) => ({ complete: true, winRate, softWinRate, interval: [0, 0.2], tiles: 30, reading: 'loses to the target', repeats: [{ wins, losses: 30 - wins, ties: 0 }] });
    const calls = [];
    const run = (py, args) => {
      calls.push(args);
      const isAuto = args[args.indexOf('--image') + 1] === path.join(auto, 'painting.png');
      const body = !args[0].endsWith('versus.py') ? prog : args.includes('--target')
        ? { complete: true, questions: isAuto ? { subject: q(0.1, 0.2, 3), craft: q(0, 0.1, 0) } : { subject: q(0.033, 0.05, 1), craft: q(0, 0.3, 0) } } : lookVs();
      return { status: 0, stdout: JSON.stringify(body), stderr: '' };
    };
    const r = runVersusAuto(['--manifest', manifest, '--out', out], { run });
    const targets = calls.filter(c => c.includes('--target'));
    assert.equal(targets.length, 2);                                   // Auto once, the painting once, the failed try never
    assert.ok(targets.every(c => c[c.indexOf('--target') + 1] === target && !c.includes('--auto')));
    const [autoRow, pRow, dead] = r.rows;
    assert.equal(autoRow.target.subject.winRate, 0.1);
    assert.deepEqual(pRow.gap, { subject: -0.5, craft: 0.5 });          // (0.05-0.2)/(0.5-0.2), (0.3-0.1)/(0.5-0.1)
    assert.equal(dead.look.winRate, 0);
    assert.equal(dead.look.reading, 'failed: counted as a loss');
    assert.deepEqual(dead.gap, { subject: -0.667, craft: -0.25 });
    assert.match(r.md, /\| cat \/ dead \| 0% \| - \| failed: counted as a loss \| - \|/);
    assert.match(r.md, /## Against the target/);
    assert.match(targetTable(r.rows), /\| dog \(Auto\) \| 3 \/ 27 \/ 0 \| 10% \(0% to 20%\) \| 20% \| Auto \| 0 \/ 30 \/ 0 \| 0% \(0% to 20%\) \| 10% \| Auto \|/);
    assert.match(targetTable(r.rows), /\| cat \/ p \| 1 \/ 29 \/ 0 \| 3% \(0% to 20%\) \| 5% \| -50% \| 0 \/ 30 \/ 0 \| 0% \(0% to 20%\) \| 30% \| 50% \|/);
    assert.match(targetTable(r.rows), /\| cat \/ dead \| failed \| 0% \| 0% \| -67% \|/);
    assert.equal(r.complete, true);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat / p', auto, painting: p, style: 'wash', target: path.join(root, 'gone.png') }]));
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run }), /no target at/);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'x', auto, painting: p, failed: true, style: 'wash' }]));
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run }), /a failed try has no "painting"/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runVersusAuto with a source adds the whole-sheet comparison on two questions, and --no-tiles leaves the tiles out', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  try {
    const manifest = path.join(root, 'versus.json'), out = path.join(root, 'out'), source = path.join(root, 'source.png');
    fs.writeFileSync(source, 'png');
    const auto = plateDir(root, 'auto'), p = plateDir(root, 'p');
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'cat / pale', auto, painting: p, style: 'wash', source }, { name: 'cat / dead', auto, failed: true, style: 'wash', source }]));
    const whole = { complete: true, questions: { faithful: { complete: true, forAuto: 2, forPainting: 0, ties: 0, painting: 0.12 }, skill: { complete: true, forAuto: 0, forPainting: 2, ties: 0, painting: 0.81 } } };
    const calls = [];
    const run = (py, args) => { calls.push(args); return { status: 0, stdout: JSON.stringify(args[0].endsWith('whole.py') ? whole : args[0].endsWith('versus.py') ? lookVs() : prog), stderr: '' }; };
    const r = runVersusAuto(['--manifest', manifest, '--out', out, '--no-tiles'], { run });
    assert.deepEqual(calls.map(c => path.basename(c[0])), ['progression.py', 'whole.py', 'progression.py']);
    const w = calls[1], arg = k => w[w.indexOf(k) + 1];
    assert.deepEqual([arg('--source'), arg('--auto'), arg('--image')], [source, path.join(auto, 'painting.png'), path.join(p, 'painting.png')]);
    assert.equal(r.rows[1].look, null);
    assert.match(r.md, /\| cat \/ pale \| not run \|/);
    assert.match(wholeTable(r.rows), /\| cat \/ pale \| 2 \/ 0 \/ 0 \| 12% \| 0 \/ 2 \/ 0 \| 81% \|/);      // faithful and skill stay apart
    assert.match(wholeTable(r.rows), /\| cat \/ dead \| failed \| 0% \| failed \| 0% \|/);
    assert.equal(r.complete, true);
    const both = runVersusAuto(['--manifest', manifest, '--out', out], { run });
    assert.equal(both.rows[1].look.winRate, 0.233);
    fs.writeFileSync(manifest, JSON.stringify([{ name: 'x', auto, painting: p, style: 'wash', source: path.join(root, 'gone.png') }]));
    assert.throws(() => runVersusAuto(['--manifest', manifest, '--out', out], { run }), /no source at/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
