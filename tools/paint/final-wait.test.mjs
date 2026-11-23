import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitTicker, WaitLimit, paintWithRetries, keptNote, FINAL_WAIT_HOURS, EXIT_KEPT } from './final-wait.mjs';
import { keepSessionFiles } from './kept-files.mjs';
import { gpuPlace } from './queue.mjs';

test('a waiting final says so once a minute and stops only past its stated limit', () => {
  let t = 0; const said = [];
  const tick = waitTicker({ what: 'a place to paint the final', say: x => said.push(x), now: () => t, limitMs: 10 * 60000 });
  for (t = 0; t <= 10 * 60000; t += 15000) tick('2 GPU paintings are running');
  assert.equal(said.length, 10);
  assert.match(said[0], /^waiting 1 min for a place to paint the final \(2 GPU paintings are running\); waits up to 6 h, then stops with the session kept$/);
  t += 15000; assert.throws(() => tick('x'), WaitLimit);
  assert.equal(FINAL_WAIT_HOURS, 6); assert.equal(EXIT_KEPT, 4);
});

test('a final waits for a GPU place on this Mac instead of being refused', async () => {
  const counts = [2, 2, 2, 1], ticks = [];
  const n = await gpuPlace({ most: 2, running: () => counts.shift(), sleep: async () => {}, tick: why => ticks.push(why) });
  assert.equal(n, 1); assert.deepEqual(ticks, ['2 GPU paintings are running', '2 GPU paintings are running', '2 GPU paintings are running']);
});

test('a worker failure is painted again; a painting\'s own failure and success are not', async () => {
  const said = [], cleared = [];
  let n = 0;
  const got = await paintWithRetries(async () => (++n < 3 ? { failure: `gone ${n}`, workerFailure: true } : { failure: null }), { tries: 3, say: x => said.push(x), clear: () => cleared.push(n), sleep: async () => {} });
  assert.equal(got.failure, null); assert.equal(n, 3); assert.deepEqual(cleared, [1, 2]); assert.equal(got.tries.length, 3);
  assert.match(said[0], /worker failed \(try 1 of 3\): gone 1/);
  n = 0;
  const own = await paintWithRetries(async () => { n++; return { failure: 'the painter ended with exit 1', workerFailure: false }; }, { sleep: async () => {} });
  assert.equal(n, 1); assert.equal(own.failure, 'the painter ended with exit 1');
  n = 0;
  const all = await paintWithRetries(async () => { n++; return { failure: 'gone', workerFailure: true }; }, { tries: 3, sleep: async () => {} });
  assert.equal(n, 3); assert.equal(all.failure, 'gone');
  assert.equal(keptNote({ subject: 'mittens-closeup', author: 'neon-m', keptRun: '/r/neon-L2' }), 'the session is kept and handed in; paint its final later with: npm run paint -- mittens-closeup paint --author neon-m --from /r/neon-L2');
});

test('a final painted with --from keeps the session\'s own files, never over its own', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-files-')), from = path.join(d, 'a', 'author'), to = path.join(d, 'b', 'author');
  for (const [f, t] of [['folder/choice.json', '{"kind":"script"}'], ['folder/script.json', '{}'], ['folder/my-lines.json', '[]'], ['looks/1/beside.png', 'x'], ['handed-over.json', '{}'], ['S.commands.txt', 'ls']]) { fs.mkdirSync(path.dirname(path.join(from, f)), { recursive: true }); fs.writeFileSync(path.join(from, f), t); }
  fs.mkdirSync(to, { recursive: true }); fs.writeFileSync(path.join(to, 'S.commands.txt'), 'mine');
  assert.deepEqual(keepSessionFiles(from, to), ['folder', 'looks', 'handed-over.json', 'S.commands.txt']);
  for (const f of ['folder/choice.json', 'folder/script.json', 'folder/my-lines.json', 'looks/1/beside.png']) assert.equal(fs.readFileSync(path.join(to, f), 'utf8'), fs.readFileSync(path.join(from, f), 'utf8'));
  assert.equal(fs.readFileSync(path.join(to, 'S.commands.txt'), 'utf8'), 'mine');
  assert.throws(() => keepSessionFiles(path.join(d, 'none'), to), /no folder\/choice\.json/);
});
