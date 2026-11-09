// Subject-identity scan (tools/guard/subject-scan.mjs): painting and harness code may not name a benchmark subject,
// hold a target hash, or branch on an image or sheet size, unless the hit is listed in
// tools/guard/subject-scan-allow.json with a reason. overfit.test.mjs covers the painter's own subject ids; this
// scan covers the names, hashes and sizes it does not, and the tuned folder it skips.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource, scanRepo, loadAllow, compareToAllow } from '../../tools/guard/subject-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rules = text => scanSource(text).map(h => h.rule);

test('flags a benchmark name used as a literal, key, property or parameter', () => {
  assert.deepEqual(rules(`if (task === 'mittens') x();`), ['name']);
  assert.deepEqual(rules(`const T = { trumbull: 0.152 };`), ['name']);
  assert.deepEqual(rules(`run(spec.trumbull);`), ['name']);
  assert.deepEqual(rules(`id.startsWith('subject-c.cat.')`), ['name']);
  assert.deepEqual(rules(`const k = ['hills', 'sargent'];`), ['name']);
});

test('flags a target hash and an image-size branch', () => {
  assert.deepEqual(rules(`const H = '0123456789abcdef0123456789abcdef';`), ['hash']);
  assert.deepEqual(rules(`if (w === 1224 && h === 1620) fit();`), ['size']);
  assert.deepEqual(rules(`if (1200 === width) fit();`), ['size']);
  assert.deepEqual(rules(`if (sheetmm === 158) fit();`), ['size']);
});

test('ignores comments, ordinary words and unrelated numbers', () => {
  assert.deepEqual(rules(`// fitted on Trumbull and Mittens\nconst a = 1; /* h36a */`), []);
  assert.deepEqual(rules(`const rolling = hills.length; if (w === n) go(); if (w > 1000) go();`), []);
  assert.deepEqual(rules(`const url = 'https://x.test/a'; // mittens`), []);
});

test('reports the line and a snippet', () => {
  const [hit] = scanSource(`a();\n\nif (name === 'trumbull') b();`);
  assert.equal(hit.line, 3);
  assert.match(hit.snippet, /trumbull/);
});

test('the allow list is exact: a new hit or a stale entry fails', () => {
  const allow = [{ file: 'a.mjs', rule: 'name', count: 1, reason: 'r' }];
  assert.deepEqual(compareToAllow([{ file: 'a.mjs', rule: 'name', line: 1 }], allow), { unlisted: [], stale: [] });
  assert.equal(compareToAllow([{ file: 'a.mjs', rule: 'name', line: 1 }, { file: 'a.mjs', rule: 'name', line: 2 }], allow).unlisted.length, 1);
  assert.equal(compareToAllow([], allow).stale.length, 1);
  assert.equal(compareToAllow([{ file: 'b.mjs', rule: 'hash', line: 4 }], allow).unlisted.length, 1);
});

test('every allow entry carries a reason', () => {
  for (const e of loadAllow(ROOT)) assert.ok(typeof e.reason === 'string' && e.reason.length > 20, `${e.file} ${e.rule}`);
});

test('painting and harness code holds no unreviewed subject name, hash or size branch', () => {
  const { unlisted, stale } = compareToAllow(scanRepo(ROOT), loadAllow(ROOT));
  assert.deepEqual(unlisted, [], 'new subject-identifying code: remove it or list it with a reason');
  assert.deepEqual(stale, [], 'allow entries that no longer match anything');
});

test('tuned modules do not pick regions by a subject-id prefix', () => {
  const dir = path.join(ROOT, 'src/paint/tuned');
  const found = [];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.mjs') && !n.endsWith('.test.mjs')))
    scanSource(fs.readFileSync(path.join(dir, f), 'utf8')).forEach(h => { if (/subject-[a-e]/.test(h.snippet)) found.push(`${f}:${h.line}`); });
  assert.deepEqual(found, []);
});
