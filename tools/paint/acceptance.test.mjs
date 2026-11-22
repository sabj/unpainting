import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parityRow, handoffRow, table } from './acceptance.mjs';
import { handedOverRecord } from './parity.mjs';
import { SHEET_FILES } from './work-sheets.mjs';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function run({ retry = false, said = true, sheets = true, named = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-test-')), folder = path.join(dir, 'author', 'folder'); fs.mkdirSync(path.join(folder, 'previous'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'script.json'), '{"passages":[1]}'); fs.writeFileSync(path.join(folder, 'my-lines.json'), '{"own":[]}');
  const submitted = { kind: 'script', what: 'own script with its choice of lines', script: 'script.json', settings: {}, tools: { lines: 'my-lines.json' } }, pics = Object.values(SHEET_FILES).map(f => `previous/${f}`);
  if (retry && sheets) for (const f of pics) fs.writeFileSync(path.join(folder, f), 'jpg');
  const sha = t => crypto.createHash('sha256').update(t).digest('hex');
  fs.mkdirSync(path.join(dir, 'prev', 'plate'), { recursive: true }); fs.writeFileSync(path.join(dir, 'prev', 'plate', 'painting.png'), 'the previous painting');
  fs.writeFileSync(path.join(dir, 'author', 'session-prompt.txt'), named ? pics.map(f => `- \`${f}\`: a sheet`).join('\n') : 'Paint this picture.');
  fs.writeFileSync(path.join(dir, 'author', 'handed-over.json'), JSON.stringify(handedOverRecord(folder, submitted)));
  const record = { mode: 'paint', failure: null, results: { state: 'finished' }, subject: { id: 'mittens-closeup' }, author: { name: 'Astra', parity: { same: true, compared: ['script', 'lines'] }, ...(retry ? { previousTry: { from: 'l2', painting: path.join(dir, 'prev', 'plate', 'painting.png'), paintingSha256: sha('the previous painting') }, handed: [{ folder: 'previous', files: Object.values(SHEET_FILES).map(name => ({ name, sha256: sha('jpg') })) }] } : {}),
    session: { level: retry ? 'L3' : 'L2', submitted, assessment: retry ? { written: true } : null, pictures: retry ? { handed: pics, said: said ? Object.fromEntries(pics.map(f => [f, 'the ear is lost in a dark wash'])) : {}, logShowsRead: Object.fromEntries(pics.map(f => [f, null])) } : null } } };
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(record)); return dir;
}

test('point 3: a final has a parity row when its kept folder holds, hash for hash, what the session handed over; a changed or missing file fails the row', () => {
  const ok = run();
  try {
    assert.deepEqual((({ ok, why, files, level, what }) => ({ ok, why, files, level, what }))(parityRow(ok)), { ok: true, why: null, files: 'script, lines', level: 'L2', what: 'own script with its choice of lines' });
    fs.writeFileSync(path.join(ok, 'author', 'folder', 'my-lines.json'), '{"own":[1]}'); assert.match(parityRow(ok).why, /my-lines\.json \(its lines\) is not the file the session handed over/);
    fs.rmSync(path.join(ok, 'author', 'handed-over.json')); assert.match(parityRow(ok).why, /no handed-over\.json/);
    assert.match(parityRow(path.join(ok, 'nowhere')).why, /no run\.json/);
  } finally { fs.rmSync(ok, { recursive: true, force: true }); }
});

test('point 4: a retry\'s row holds when its folder has the three sheets and the model wrote a line on each; what the log can show is said, never guessed', () => {
  const a = run({ retry: true }), b = run({ retry: true, said: false }), c = run({ retry: true, sheets: false }), d = run();
  try {
    assert.deepEqual((({ ok, sheets, described, log, assessment }) => ({ ok, sheets, described, log, assessment }))(handoffRow(a)), { ok: true, sheets: '3 of 3', described: '3 of 3', log: 'this command\'s log cannot show a read', assessment: 'written' });
    assert.match(handoffRow(b).why, /no line of the model's own in seen\.md for previous\/final-beside-subject\.jpg/); assert.match(handoffRow(c).why, /the retry's folder lacks, or holds another file than was handed \(by hash\): previous\/final-beside-subject\.jpg/);
    const e = run({ retry: true, named: false }); assert.match(handoffRow(e).why, /first message .* does not name previous\/final-beside-subject\.jpg/); fs.rmSync(e, { recursive: true, force: true });
    assert.deepEqual([handoffRow(a).firstMessage, handoffRow(a).previousPainting], ['3 of 3 named', 'same by hash']);
    // a sheet swapped after it was handed, or a previous painting painted again since, fails the row
    const f = run({ retry: true }); fs.writeFileSync(path.join(f, 'prev', 'plate', 'painting.png'), 'another painting'); assert.match(handoffRow(f).why, /is not the one the sheets were made from/);
    fs.writeFileSync(path.join(f, 'author', 'folder', 'previous', SHEET_FILES.replay), 'swapped'); assert.match(handoffRow(f).why, /holds another file than was handed \(by hash\): previous\/replay-sheet/); fs.rmSync(f, { recursive: true, force: true });
    assert.equal(handoffRow(d), null, 'a first go is no retry');
    assert.equal(table([{ a: 1, b: 'xy' }, { a: 22, b: 'z' }], ['a', 'b']), 'a   b \n1   xy\n22  z ');
    // the script: one table for each point, exit 1 when a row fails
    const out = execFileSync('node', [path.join(HERE, 'acceptance.mjs'), a, d], { encoding: 'utf8' });
    assert.match(out, /3\. What is chosen is painted: 2 of 2 finals/); assert.match(out, /4\. Later tries receive their previous painting, replay and arrows: 1 of 1 retries/);
    assert.throws(() => execFileSync('node', [path.join(HERE, 'acceptance.mjs'), a, b], { encoding: 'utf8', stdio: 'pipe' }), e => e.status === 1 && /FAIL: no line of the model's own/.test(e.stdout));
  } finally { for (const x of [a, b, c, d]) fs.rmSync(x, { recursive: true, force: true }); }
});
