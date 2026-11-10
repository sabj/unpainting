import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyLimits, copyLimitsLine } from './copy-limits.mjs';
import { parseArgs, readRun, checkPair, decide, table, runPairJudge } from './pair-judge.mjs';

const rec = o => ({ hfCorr: 0.5, hfCeiling: 0.645, guard: { guarded: true, violations: 0 }, looks: 0, ...o });
const look = (a, b, winner = null, o = {}) => ({ complete: true, tilesA: a, tilesB: b, ties: 0, p: winner ? 0.01 : 0.5, decided: !!winner, winner, ...o });
const pair = o => ({ name: 'p', heldOut: true, a: {}, b: {}, copyA: copyLimits(rec()), copyB: copyLimits(rec()), look: look(1, 11, 'b'), ...o });

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
    'run-card.json': JSON.stringify({ codeSHA: 'abc', subject: 'dog', provenance: { geometry: { sheetMm } }, dimensions: { paintWidth: width, paintHeight: 1608 } }),
    'cheat-risk.json': JSON.stringify({ strokes: 900, hfCorr, hfCeiling: 0.645 }),
    'target-guard.json': JSON.stringify({ mode, violations: 0, looks: { count: looks } }),
  };
  for (const [f, body] of Object.entries(files)) if (f !== drop) fs.writeFileSync(path.join(dir, f), body);
  return dir;
}

test('readRun reads the painter records and refuses a run that lacks one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  try {
    const r = readRun(runDir(root, 'ok'));
    assert.deepEqual([r.sheetMm, r.width, r.height, r.hfCorr, r.looks, r.guard.guarded, r.strokes], [280, 1200, 1608, 0.5, 0, true, 900]);
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
