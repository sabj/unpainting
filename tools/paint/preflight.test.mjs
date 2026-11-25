import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFLIGHT_MINUTES, PREFLIGHT_FILE, preflightTask, preflightRow, preflightLine } from './preflight.mjs';

test('a preflight asks three small things and paints nothing; its row says what was seen, never a guess', () => {
  const task = preflightTask('inputs/source.jpg');
  assert.match(task, /Open the picture `inputs\/source\.jpg`/); assert.match(task, /Run `\.\/unpaint plan` once/); assert.match(task, new RegExp(PREFLIGHT_FILE.replace('.', '\\.'))); assert.match(task, /Nothing is painted and nothing is scored/); assert.equal(PREFLIGHT_MINUTES, 2);
  const author = { key: 'neon-m', id: 'gemini-4-neon-medium', cli: 'agy', effort: 'medium' }, kept = { wallSeconds: 71, plans: [{ ok: true }], pictures: { missing: [], said: { 'inputs/source.jpg': 'a tabby cat seen close, looking left' } } };
  const ok = preflightRow({ author, done: { ended: 'done' }, kept, seen: { tokens: 900, costUSD: null }, file: 'It compiles (nothing changed): 173 shapes', logRead: true });
  assert.deepEqual([ok.ok, ok.started, ok.describedThePicture, ok.logShowsRead, ok.ranPlan, ok.wroteTheFile, ok.seconds, ok.said], [true, true, true, true, true, true, 71, 'a tabby cat seen close, looking left']);
  assert.match(preflightLine(ok), /^gemini-4-neon-medium +agy +medium +started yes +described the picture yes +log shows a read yes +ran plan yes +wrote the file yes +71 s +OK$/);
  const codex = preflightRow({ author: { ...author, cli: 'codex' }, done: { ended: 'done' }, kept, seen: {}, file: 'It compiles', logRead: null }); assert.equal(codex.ok, true); assert.match(preflightLine(codex), /log shows a read cannot show/);
  const none = preflightRow({ author, done: { ended: 'not started', error: '`agy` is not installed or not on PATH' }, kept: null, seen: null, file: null, logRead: null });
  assert.equal(none.ok, false); assert.match(preflightLine(none), /started NO .* NOT READY: `agy` is not installed/);
  assert.equal(preflightRow({ author, done: { ended: 'budget reached' }, kept: { ...kept, plans: [] }, seen: {}, file: null, logRead: false }).ok, false);
});
