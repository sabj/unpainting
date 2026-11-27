import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageWriteQueue } from './image-write-queue.mjs';

test('image write queue bounds concurrency and waits for every task on flush', async () => {
  const q = createImageWriteQueue({ concurrency: 2 });
  let active = 0, peak = 0;
  const done = [];
  for (let i = 0; i < 6; i++) {
    q.enqueue(async () => {
      active++;
      if (active > peak) peak = active;
      await new Promise(r => setTimeout(r, 10));
      done.push(i);
      active--;
      return i * 10;
    });
  }
  await q.flush();
  assert.equal(peak, 2);
  assert.equal(done.length, 6);
  assert.equal(q.size, 6);
});

test('image write queue propagates failures loudly on individual handle and flush', async () => {
  const q = createImageWriteQueue({ concurrency: 2 });
  const ok = q.enqueue(async () => 'ok');
  const bad = q.enqueue(async () => { throw new Error('encode failed'); });
  assert.equal(await ok, 'ok');
  await assert.rejects(bad, /encode failed/);
  await assert.rejects(q.flush(), /encode failed/);
});
