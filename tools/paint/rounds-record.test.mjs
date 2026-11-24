// A rounds run leaves what the 0.4 scorer reads (bench/scorer/s04_runs.py): a painter run folder whose usage.json
// says its level and carries the look units and tokens of the rounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { runRounds } from './rounds.mjs';
import { dryModel } from './rounds-call.mjs';
import { standInReplies } from './rounds-standin.mjs';
import { checkAuthored } from './author.mjs';
import { usageOf } from './usage.mjs';

const SCORER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bench', 'scorer'), PY = process.env.BENCH_SCORE_PYTHON || 'python3';
const SHEET = { widthMm: 230, heightMm: 305 };

test('the scorer reads a rounds run: its level, author, painting and usage', async t => {
  if (spawnSync(PY, ['-c', 'import PIL'], { encoding: 'utf8' }).status !== 0) { t.skip(`${PY} cannot import Pillow (set BENCH_SCORE_PYTHON): the scorer's reading of a rounds run is not tested here`); return; }
  const res = await runRounds({ first: { text: 'BRIEF', images: [] }, ask: dryModel({ replies: standInReplies(SHEET) }), sheet: SHEET,
    check: s => checkAuthored(s.script, { sheetWidthMm: SHEET.widthMm }).script,
    compile: async (s, c) => ({ ok: true, rows: c.passages.map(p => ({ stage: p.stage })), table: [], summary: {} }),
    look: async () => ({ ok: true, images: [], text: '', painted: { seconds: 60 } }) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-record-')), run = path.join(dir, 'mittens--dry--L2');
  try {
    fs.mkdirSync(path.join(run, 'plate'), { recursive: true });
    const png = await sharp({ create: { width: 32, height: 40, channels: 3, background: '#d8d0c0' } }).png().toBuffer();
    fs.writeFileSync(path.join(run, 'plate', 'painting.png'), png); fs.writeFileSync(path.join(dir, 'original.png'), png);
    const author = { key: 'dry-rounds', name: 'Scripted stand-in', id: null, cli: 'dry', effort: null, tokensIn: res.tokens.fresh + res.tokens.cached, tokensOut: res.tokens.output, tokens: res.tokens.fresh + res.tokens.cached + res.tokens.output, tokenSplit: { reported: true, freshIn: res.tokens.fresh, cachedIn: res.tokens.cached, out: res.tokens.output } };
    const session = { work: 'rounds', ended: res.ended, level: 'L2', tryNumber: 1, lookUnits: res.lookUnits, looks: res.looks, plans: [], steps: { taken: res.rounds.length } };
    const usage = usageOf({ subject: 'mittens-closeup:', author, level: 'L2', tryNumber: 1, budget: { looks: 3 }, session, final: { seconds: 600, backend: 'gpu', failure: null } });
    fs.writeFileSync(path.join(run, 'usage.json'), JSON.stringify(usage));
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify({ subject: { id: 'mittens-closeup', sourceAbs: path.join(dir, 'original.png') }, author: { ...author, level: 'L2', work: 'rounds' }, code: { commit: 'abcdef0123' }, failure: null }));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ runs: [{ folder: 'mittens--dry--L2', style: 'watercolor; the drawing under it: pencil' }] }));
    const got = spawnSync(PY, ['-c', 'import json, sys, s04_runs; print(json.dumps(s04_runs.entries([sys.argv[1]])))', path.join(dir, 'manifest.json')], { cwd: SCORER, encoding: 'utf8' });
    assert.equal(got.status, 0, got.stderr);
    const [e] = JSON.parse(got.stdout);
    assert.deepEqual([e.level, e.author, e.subject, e.failed, e.auto], ['L2', 'dry-rounds', 'mittens-closeup', null, false]);
    assert.equal(e.painting, path.join(run, 'plate', 'painting.png'));
    assert.equal(e.usage.session.lookUnits.spent, 0.8); assert.equal(e.usage.session.looks, 3); assert.deepEqual(e.usage.session.looksEach.map(l => l.cost), [0.3, 0.2, 0.3]);
    assert.equal(e.usage.model.tokenSplit.reported, true); assert.ok(e.usage.model.tokensOut > 0);
    // a rounds run that failed is kept and counted, never dropped
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify({ subject: { id: 'mittens-closeup' }, author: { ...author, level: 'L2' }, failure: 'no script: two answers in a row could not be used' }));
    const failed = JSON.parse(spawnSync(PY, ['-c', 'import json, sys, s04_runs; print(json.dumps(s04_runs.entries([sys.argv[1]])))', path.join(dir, 'manifest.json')], { cwd: SCORER, encoding: 'utf8' }).stdout)[0];
    assert.match(failed.failed, /no script/); assert.equal(failed.level, 'L2');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
