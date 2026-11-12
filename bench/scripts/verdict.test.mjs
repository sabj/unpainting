// The V4 and V5 verdict: a finished painting counts as painted, and unread settings, unused options and dropped
// passages are kept as notes. --strict-verdict restores the 0.1 failures. Also the collection path in round45.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderVerdict } from './pipeline/plan-args.mjs';
import { Painting, painterFailure } from './pipeline/painting.mjs';
import sharp from 'sharp';
import { collect, tryEntry } from './pipeline/round45.mjs';

const DROPPED_LINE = '3 passages yielded no brush path and were never painted, carrying 2.5% of the planned mass; the plan counts them delivered\n';
const NONE = { strict: false, total: 0, checks: {} };
const ignored = { paintExit: 3, unused: ['--stonewarm', '--mystery'], extraOptions: ['stonewarm'], dropped: 3, droppedPct: 2.5, continued: NONE };

test('a finished painting with unread settings and dropped passages is painted, with notes', () => {
  const v = renderVerdict(ignored);
  assert.equal(v.exit, 0);
  assert.deepEqual(v.failures, []);
  assert.deepEqual(v.notes.map(n => n.code), [4, 4, 5]);
  assert.match(v.notes[0].reason, /read by nothing: --stonewarm/);
  assert.match(v.notes[1].reason, /nobody asked for: --mystery/);
  assert.match(v.notes[2].reason, /3 dropped \(2\.5%/);
  assert.deepEqual(v.optionCheck, { model: ['stonewarm'], base: [], unknown: ['mystery'] });
});

test('strict verdict turns the same notes back into failures', () => {
  const v = renderVerdict({ ...ignored, strict: true });
  assert.equal(v.exit, 4);
  assert.deepEqual(v.failures.map(f => f.code), [4, 4, 5]);
  assert.deepEqual(v.notes, []);
});

test('a killed painter, another exit code and a missing painting still fail without strict', () => {
  assert.equal(renderVerdict({ paintExit: null }).exit, 137);
  assert.equal(renderVerdict({ paintExit: 2 }).exit, 2);
  assert.equal(renderVerdict({ paintExit: 0, finished: false }).exit, 6);
  const v = renderVerdict({ ...ignored, finished: false });
  assert.equal(v.exit, 6);
  assert.equal(v.notes.length, 3);
});

/** A painting that ended: one segment that exited 3, with unused-options.txt, the dropped-passage line and painting.png. */
function endedPainting(root) {
  const dir = path.join(root, 'painting'), planDir = path.join(root, 'plan');
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'variant.txt'), 'region_w13_lay2\n');
  const p = new Painting({ repo: root, spec: { width: 96, sheetmm: 140 }, target: path.join(root, 't.png'), dir });
  fs.mkdirSync(p.out, { recursive: true });
  fs.writeFileSync(path.join(p.out, 'unused-options.txt'), '--stonewarm\n--mystery\n');
  fs.writeFileSync(path.join(p.out, 'painting.png'), 'png');
  const checked = { ...NONE, strict: true };
  fs.writeFileSync(path.join(p.out, 'continued-checks.json'), JSON.stringify(checked));
  const log = path.join(dir, 'segment-1.log');
  fs.writeFileSync(log, 'small marks: 0 small lights reserved, 4 small darks laid once, last\nmarks: 120 strokes\n' + DROPPED_LINE);
  fs.writeFileSync(path.join(p.out, 'run-card.json'), JSON.stringify({ continuedChecks: checked, args: [], expandedArgs: ['--washjoin','1','--huechroma','30','--lightfamilies','1'] }));
  fs.writeFileSync(path.join(p.out, 'pipeline-plan.json'), JSON.stringify({ plan: { washes: { colour: 'family' } } }));
  const plan = { modelOptions: [], extraOptions: ['stonewarm'], baseOptions: [], templateOptions: [], layering: { applied: [], skipped: {} } };
  p.segments.push({ k: 1, planDir, variant: 'region_w13_lay2', resume: null, args: [], plan, exit: 3, seconds: 4, log });
  p.state = 'done';
  return p;
}

test('Painting.verdict reads unused-options.txt and the log, and keeps the painting', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-'));
  const p = endedPainting(root);
  const v = p.verdict();
  assert.equal(v.exit, 0);
  assert.deepEqual(v.unused, ['--stonewarm', '--mystery']);
  assert.equal(v.notes.length, 3);
  assert.equal(p.verdict({ strict: true }).exit, 4);
  fs.rmSync(root, { recursive: true, force: true });
});

const collectWith = async (root, strictVerdict) => {
  const p = endedPainting(root), raw = path.join(root, `raw-${strictVerdict}`), rawTry = path.join(root, `try-${strictVerdict}`);
  fs.mkdirSync(raw, { recursive: true });
  const session = { painting: p, ckpt: path.join(raw, 'CHECKPOINTS.jsonl'), modelS: () => 60, checkLog: [{ seconds: 30, previewSeconds: 8 }], paintings: 1, capped: false, ended: 'the painting finished' };
  const record = { turns: [], repairTurns: [] };
  return collect({ crop: 'hills', spec: {}, raw, rawTry, ws: root, session, record, outcome: null, paintedBy: 'the model', refusal: null, feedbackFiles: null, selfReviewAt: null, strictVerdict });
};

test('collection: a painting with only notes is painted, copied for the scorer, thumbnailed and keeps its notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-'));
  const r = await collectWith(root, false);
  assert.equal(r.painted, true);
  assert.equal(r.pipeline.outcome, 'painted');
  assert.equal(r.pipeline.failure, null);
  assert.equal(r.pipeline.notes.length, 3);
  assert.equal(r.pipeline.strictVerdict, false);
  assert.deepEqual(r.pipeline.optionCheck.unknown, ['mystery']);
  assert.equal(r.pipeline.droppedPassages, 3);
  assert.ok(fs.existsSync(path.join(r.out, 'final.png')));
  assert.equal(r.strokes, 120);
  assert.deepEqual(r.pipeline.cost, { checks: 1, checkSeconds: 30, previewSeconds: 8, renders: 1, renderSeconds: r.pipeline.renderSeconds });
  await sharp({ create: { width: 96, height: 80, channels: 3, background: '#d8cfb8' } }).png().toFile(path.join(r.out, 'final.png'));
  const tryDir = path.join(root, 'try-folder');
  fs.mkdirSync(tryDir);
  const e = await tryEntry({ tryDir, r });
  assert.equal(e.entry.images.final, 'hills.webp');
  assert.ok(fs.existsSync(path.join(tryDir, 'hills.webp')));
  assert.equal(e.entry.pipeline.notes.length, 3);
  assert.equal(e.entry.score, null);
  const s = await collectWith(root, true);
  assert.equal(s.painted, false);
  assert.equal(s.pipeline.outcome, 'render-failed');
  assert.deepEqual(s.pipeline.failure.failures.map(f => f.code), [4, 4, 5]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a painter failure is reported with its own reason, and an empty log still gives one', () => {
  const crash = ['wet-bed preparation for passage sky/1', 'file:///x/passage-plan.mjs:86', 'Error: wet bed has zero contact cells', '    at prepare (x)', ''].join('\n');
  assert.equal(painterFailure(crash, 1), 'Error: wet bed has zero contact cells');
  assert.equal(painterFailure('first\nlast words\n', 2), 'the painter exited 2; its last line was: last words');
  assert.equal(painterFailure('', 137), 'the painter exited 137 with no output');
});

// A painting that continued past failed physical or plan checks (src/media/checks.mjs, continued-checks.json) is not a
// clean painting: the verdict says so loudly, the run record keeps the checks, and --strict-verdict fails it.
const CONTINUED = { strict: false, total: 23, checks: { 'Sheet is still wet after dry() limit': { count: 23, examples: [] } } };

test('continued physics checks: painted but not clean, a loud note naming each check, failed under strict', () => {
  const v = renderVerdict({ paintExit: 3, continued: CONTINUED });
  assert.equal(v.exit, 0, 'the painting still counts as painted');
  assert.equal(v.clean, false);
  assert.deepEqual(v.continuedChecks, CONTINUED);
  const n = v.notes.find(x => x.code === 7);
  assert.match(n.reason, /^CONTINUED PAST 23 FAILED CHECKS: Sheet is still wet after dry\(\) limit x23/);
  const s = renderVerdict({ paintExit: 3, continued: CONTINUED, strict: true });
  assert.equal(s.exit, 7);
  assert.equal(s.clean, false);
});

test('no continued checks: clean; a missing record is not clean either', () => {
  const ok = renderVerdict({ paintExit: 0, continued: { strict: false, total: 0, checks: {} } });
  assert.equal(ok.clean, true);
  assert.deepEqual(ok.notes, []);
  const unknown = renderVerdict({ paintExit: 0 });
  assert.equal(unknown.clean, false, 'a run that wrote no continued-checks.json cannot be called clean');
  assert.match(unknown.notes.find(x => x.code === 7).reason, /no continued-checks\.json/);
});

test('Painting.verdict and the collection record carry continued-checks.json', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-cont-'));
  const p = endedPainting(root);
  fs.writeFileSync(path.join(p.out, 'continued-checks.json'), JSON.stringify(CONTINUED));
  const pCard = path.join(p.out, 'run-card.json');
  fs.writeFileSync(pCard, JSON.stringify({...JSON.parse(fs.readFileSync(pCard)),continuedChecks:CONTINUED}));
  const v = p.verdict();
  assert.equal(v.clean, false);
  assert.equal(v.continuedChecks.total, 23);
  assert.notEqual(v.exit, 0, 'diagnostic continuation fails the required paper-state contract');
  fs.rmSync(root, { recursive: true, force: true });
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-cont-'));
  const p2 = endedPainting(root2), raw = path.join(root2, 'raw'), rawTry = path.join(root2, 'try');
  fs.writeFileSync(path.join(p2.out, 'continued-checks.json'), JSON.stringify(CONTINUED));
  const p2Card = path.join(p2.out, 'run-card.json');
  fs.writeFileSync(p2Card, JSON.stringify({...JSON.parse(fs.readFileSync(p2Card)),continuedChecks:CONTINUED}));
  fs.mkdirSync(raw, { recursive: true });
  const session = { painting: p2, ckpt: path.join(raw, 'CHECKPOINTS.jsonl'), modelS: () => 60, checkLog: [{ seconds: 30, previewSeconds: 8 }], paintings: 1, capped: false, ended: 'the painting finished' };
  const r = await collect({ crop: 'hills', spec: {}, raw, rawTry, ws: root2, session, record: { turns: [], repairTurns: [] }, outcome: null, paintedBy: 'the model', refusal: null, feedbackFiles: null, selfReviewAt: null, strictVerdict: false });
  assert.equal(r.pipeline.clean, false);
  assert.equal(r.pipeline.continuedChecks.total, 23);
  fs.rmSync(root2, { recursive: true, force: true });
});
