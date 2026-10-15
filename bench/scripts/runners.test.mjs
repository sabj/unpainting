// node --test bench/scripts/runners.test.mjs   (npm run bench:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { museUsage, agyUsage, agyConversation, command, turnCommand } from './runners.mjs';

const usageLine = (input, output, family = 'provider') => JSON.stringify({
  payload: { event: { kind: 'goal_usage_attribution', record: { usage_family: family, quantity: { input_tokens: input, output_tokens: output } } } },
});

/** A raw folder and a Muse sessions root holding one session log at <root>/<project>/<id>/session.jsonl. */
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-usage-'));
  const raw = path.join(tmp, 'raw'), root = path.join(tmp, 'sessions'), id = 'abc-123';
  const dir = path.join(root, 'project', id);
  fs.mkdirSync(raw, { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(raw, 'muse-session.txt'), id + '\n');
  const log = path.join(dir, 'session.jsonl');
  return { raw, root, append: lines => fs.appendFileSync(log, lines.join('\n') + '\n') };
}

test('museUsage sums provider records only', () => {
  const f = fixture();
  f.append([usageLine(100, 20), usageLine(5, 5, 'tool'), JSON.stringify({ payload: { event: { kind: 'other' } } }), usageLine(30, 10)]);
  assert.deepEqual(museUsage(f.raw, f.root), { tokens: 160, costUSD: null });
});

test('museUsage returns only tokens added since the last call on a resumed session', () => {
  const f = fixture();
  f.append([usageLine(100, 20)]);
  assert.equal(museUsage(f.raw, f.root).tokens, 120);
  f.append([usageLine(50, 10)]);
  assert.equal(museUsage(f.raw, f.root).tokens, 60);
  assert.equal(museUsage(f.raw, f.root).tokens, null);
});

test('museUsage is null without a session id or a matching log', () => {
  const f = fixture();
  assert.deepEqual(museUsage(f.raw, path.join(f.root, 'missing')), { tokens: null, costUSD: null });
  fs.rmSync(path.join(f.raw, 'muse-session.txt'));
  assert.deepEqual(museUsage(f.raw, f.root), { tokens: null, costUSD: null });
});

const agy = { key: 'argon', name: 'Gemini 4 Argon', id: 'gemini-4-argon-high', effort: 'high', runner: 'agy' };
const agyResult = (input, output, thinking) => JSON.stringify({ event: 'result', result: { conversation_id: 'c-1', usage: { input_tokens: input, output_tokens: output, thinking_tokens: thinking } } });

test('agy: V1 names the target images for the file viewer and adds their folder', () => {
  const c = command(agy, { ws: '/ws', viewDir: '/view', raw: '/raw', crops: ['hills', 'mittens'], text: 'Read the brief.', sessionCapMin: 85 });
  assert.equal(c.cmd, 'agy');
  assert.equal(c.stdinFile, undefined);
  const text = c.args[c.args.indexOf('-p') + 1];
  assert.match(text, /\/view\/hills\.png/);
  assert.match(text, /\/view\/mittens\.png/);
  assert.deepEqual(c.args.slice(c.args.indexOf('--add-dir'), c.args.indexOf('--add-dir') + 2), ['--add-dir', '/view']);
  for (const f of ['--output-format', 'stream-json', '--dangerously-skip-permissions', '--print-timeout', '0']) assert.ok(c.args.includes(f));
  assert.ok(!c.args.includes('--disable-slash-commands'), 'V2 skills need slash commands');
});

test('agy: a later turn resumes the conversation', () => {
  const first = turnCommand(agy, { ws: '/ws', raw: '/raw', text: 'paint', images: ['/raw/view/hills.png'], sessionId: null, resume: false });
  assert.ok(!first.args.includes('--conversation'));
  assert.ok(first.args.includes('/raw/view'));
  const next = turnCommand(agy, { ws: '/ws', raw: '/raw', text: 'again', images: [], sessionId: 'c-1', resume: true });
  assert.deepEqual(next.args.slice(-2), ['--conversation', 'c-1']);
});

test('agy: conversation id from init; tokens counted once across resumed turns', () => {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-usage-'));
  const ev = n => path.join(raw, `events-${n}.jsonl`);
  fs.writeFileSync(ev(1), JSON.stringify({ event: 'init', conversation_id: 'c-1' }) + '\n' + agyResult(1000, 50, 20) + '\n');
  assert.equal(agyConversation(ev(1)), 'c-1');
  assert.equal(agyUsage(ev(1)).tokens, 1070);
  fs.writeFileSync(ev(2), agyResult(1600, 80, 30) + '\n');
  assert.equal(agyUsage(ev(2)).tokens, 640);
  fs.writeFileSync(ev(3), JSON.stringify({ event: 'step_update' }) + '\n');
  assert.equal(agyUsage(ev(3)).tokens, null);
});
