import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { plannerChoice, parseReply, PLANNER_PROMPT } from './drawing-planner.mjs';

const target = async dir => { const f = path.join(dir, 't.png'); await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c0a080' } }).png().toFile(f); return f; };

test('the prompt names no subject, and a reply is read as a checked stage choice', () => {
  assert.doesNotMatch(PLANNER_PROMPT, /mittens|yale|flatiron|ship|trumbull|cat|dog|portrait/i);
  assert.deepEqual(parseReply('```json\n{"graphitePrep":"full","inkPrep":"none","inkFinish":"ink","reasons":{"inkPrep":"soft"}}\n```').choice, { graphitePrep: 'full', inkPrep: 'none', inkFinish: 'ink' });
  assert.throws(() => parseReply('{"graphitePrep":"lots","inkPrep":"none","inkFinish":"ink"}'), /graphitePrep/);
});

test('the answer is fetched once, then read from the cache; without a key or with a bad answer the rule decides', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-planner-'));
  try {
    const image = await target(dir);
    let calls = 0;
    const fetcher = async (url, init) => { calls++; assert.match(JSON.parse(init.body).messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"graphitePrep":"light","inkPrep":"ink","inkFinish":"none","reasons":{}}' } }], usage: { cost: 0.001 } }) }; };
    const a = await plannerChoice({ image, root: dir, key: 'k', fetcher });
    assert.deepEqual(a.choice, { graphitePrep: 'light', inkPrep: 'ink', inkFinish: 'none' });
    assert.equal(a.cached, false);
    const b = await plannerChoice({ image, root: dir, key: null, fetcher });
    assert.equal(b.cached, true);
    assert.equal(calls, 1);
    fs.rmSync(path.join(dir, 'work'), { recursive: true, force: true });
    assert.match((await plannerChoice({ image, root: dir, key: null, fetcher })).unavailable, /no OPENROUTER_API_KEY/);
    const bad = await plannerChoice({ image, root: dir, key: 'k', fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'no' } }] }) }) });
    assert.ok(bad.unavailable);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
