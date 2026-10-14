import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, setStrict, strictChecks, resetChecks, continuedSummary, continuedLine, writeContinuedChecks, CONTINUED_FILE } from './checks.mjs';

const quiet = fn => { const log = console.log, lines = []; console.log = (...a) => lines.push(a.join(' ')); try { return [fn(), lines]; } finally { console.log = log; } };

test('a passing check does nothing', () => {
  resetChecks();
  assert.equal(check('x', true, { a: 1 }), true);
  assert.equal(continuedSummary().total, 0);
});

test('a failing check is counted, logged and handed to onFail, and the run goes on', () => {
  resetChecks();
  let seen = null;
  const [result, lines] = quiet(() => check('bare-paper contact', false, { cell: 4 }, { onFail: d => { seen = d; } }));
  assert.equal(result, false);
  assert.deepEqual(seen, { cell: 4 });
  assert.deepEqual(lines, ['continued past bare-paper contact {"cell":4}']);
  quiet(() => { check('bare-paper contact', false, { cell: 5 }); check('dry limit', false); });
  const s = continuedSummary();
  assert.equal(s.total, 3);
  assert.equal(s.checks['bare-paper contact'].count, 2);
  assert.deepEqual(s.checks['bare-paper contact'].examples, [{ cell: 4 }, { cell: 5 }]);
  assert.equal(continuedLine(s), 'continued past 3 checks: bare-paper contact x2, dry limit x1');
});

test('examples are capped while the count keeps going', () => {
  resetChecks();
  quiet(() => { for (let i = 0; i < 9; i++) check('c', false, { i }); });
  const c = continuedSummary().checks.c;
  assert.equal(c.count, 9);
  assert.equal(c.examples.length, 5);
});

test('strict turns a failing check back into a stop with the old message', () => {
  resetChecks(); setStrict(true);
  assert.equal(strictChecks(), true);
  let called = false;
  assert.throws(() => check('semantic material gate failed', false, 'sky', { onFail: () => { called = true; } }), /^Error: semantic material gate failed sky$/);
  assert.equal(called, false);
  assert.equal(continuedSummary().total, 0);
  resetChecks();
  assert.equal(strictChecks(), false);
});

test('writeContinuedChecks writes the summary next to the painting and logs the closing line', () => {
  resetChecks();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-'));
  try {
    const [, lines] = quiet(() => { check('a', false, { n: 1 }); return writeContinuedChecks(dir); });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, CONTINUED_FILE), 'utf8'));
    assert.equal(saved.total, 1);
    assert.equal(saved.checks.a.count, 1);
    assert.equal(lines.at(-1), 'continued past 1 checks: a x1');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); resetChecks(); }
});
