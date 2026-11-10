import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionReads, isOffByDefault, scanOptions, checkLedger, OPTION_ROOTS } from './option-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEDGER = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/paint/option-ledger.json'), 'utf8'));

test('option reads are found with their defaults', () => {
  const reads = optionReads(`const A = num('alpha', 0) > 0, B = opt('beta', 'auto'), C = opt('gamma'), D = num('delta', ON ? 1 : 0), E = o.num( 'eps' , 2.5 );`);
  assert.deepEqual(reads.map(r => [r.name, r.default.kind, r.default.value]), [
    ['alpha', 'literal', '0'], ['beta', 'literal', 'auto'], ['gamma', 'none', undefined], ['delta', 'computed', undefined], ['eps', 'literal', '2.5'],
  ]);
});

test('off by default: no default, zero, an empty or negative word, or a default the check cannot read', () => {
  const off = d => isOffByDefault({ default: d });
  for (const value of ['0', '0.0', '', 'off', 'none', 'false', 'null']) assert.equal(off({ kind: 'literal', value }), true, value);
  assert.equal(off({ kind: 'none' }), true);
  assert.equal(off({ kind: 'computed' }), true);
  for (const value of ['1', '6', '0.45', 'auto', 'sam', 'light,mid,shadow']) assert.equal(off({ kind: 'literal', value }), false, value);
});

test('a new option that is off unless typed fails the ledger check; one that is on passes; a deleted one must leave the ledger', () => {
  const found = new Map([
    ['old', [{ file: 'a.mjs', default: { kind: 'literal', value: '0' } }]],
    ['newoff', [{ file: 'a.mjs', default: { kind: 'literal', value: '0' } }]],
    ['newon', [{ file: 'a.mjs', default: { kind: 'literal', value: '3' } }]],
    ['newguess', [{ file: 'b.mjs', default: { kind: 'computed' } }]],
  ]);
  const r = checkLedger(found, ['old', 'gone']);
  assert.deepEqual(r.added.map(a => a.name), ['newoff', 'newguess']);
  assert.deepEqual(r.stale, ['gone']);
});

test('no new default-off flags: every painter option outside the ledger is on by default, and the ledger holds no deleted option', () => {
  const found = scanOptions(ROOT);
  assert.ok(found.size > 500, `the scan found only ${found.size} options under ${OPTION_ROOTS.join(', ')}`);
  const { added, stale } = checkLedger(found, LEDGER.options);
  assert.deepEqual(added.map(a => `--${a.name} (${a.file}): ${a.why}`), [],
    'A new option that is off unless typed. A change is proven and becomes the behaviour, or it stays on a branch (CONTRIBUTING.md, No new default-off flags). Do not add the name to src/paint/option-ledger.json.');
  assert.deepEqual(stale, [], 'These options are no longer read anywhere: remove them from src/paint/option-ledger.json.');
  assert.deepEqual(LEDGER.options, [...LEDGER.options].sort(), 'the ledger is kept sorted');
});
