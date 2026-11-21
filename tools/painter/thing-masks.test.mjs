import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadThingMasks, studyThingMasks } from './thing-masks.mjs';

const width = 16, height = 6;

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'named-sam-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const asset = async (name, bytes) => { await writeFile(path.join(dir, name), bytes); return { path: name, sha256: createHash('sha256').update(bytes).digest('hex') }; };
  const png = (grey, channels = 3) => sharp(Buffer.alloc(width * height * channels, grey), { raw: { width, height, channels } }).png().toBuffer();
  const source = await asset('source.png', await png(200)), other = await asset('other.png', await png(90));
  const labels = await asset('labels.json', JSON.stringify({ things: [{ name: 'left form', kind: 'face' }, { name: 'right form' }] }));
  const receiptPath = path.join(dir, 'receipt.json');
  const makeReceipt = async (override = {}) => {
    const pixels = Buffer.from(Array.from({ length: width * height }, (_, i) => (i % width < 8 ? 1 : 2)));
    const mask = await asset('named-sam.png', await sharp(pixels, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png().toBuffer());
    await writeFile(receiptPath, JSON.stringify({ schema: 'named-sam-v1', backend: 'sam', model: 'vit_b', width, height, source, labels, mask, ...override }));
  };
  return { makeReceipt, dir, receiptPath, source: path.join(dir, source.path), other: path.join(dir, other.path), labels: path.join(dir, labels.path) };
}

test('a receipt gives the id map with each form\'s name and kind', async t => {
  const f = await fixture(t); await f.makeReceipt();
  const m = await loadThingMasks(f.receiptPath, f.source, f.labels);
  assert.deepEqual([m.width, m.height, m.ids.length], [width, height, width * height]);
  assert.deepEqual(m.names, ['left form', 'right form']); assert.deepEqual(m.kinds, ['face', null]);
  assert.deepEqual([m.ids[0], m.ids[width - 1]], [1, 2]);
});

test('a receipt whose source hash does not match the picture being painted fails loudly; so do changed labels, a changed mask and wrong dimensions', async t => {
  const f = await fixture(t); await f.makeReceipt();
  await assert.rejects(loadThingMasks(f.receiptPath, f.other, f.labels), /supplied source differs from the receipt/);
  await assert.rejects(loadThingMasks(f.receiptPath, f.source, f.source), /supplied labels differs/);
  await f.makeReceipt({ height: height + 1 });
  await assert.rejects(loadThingMasks(f.receiptPath, f.source), /dimensions must match/);
  await f.makeReceipt({ schema: 'something-else' });
  await assert.rejects(loadThingMasks(f.receiptPath, f.source), /named-sam-v1/);
  await f.makeReceipt();
  await writeFile(path.join(f.dir, 'named-sam.png'), 'changed');
  await assert.rejects(loadThingMasks(f.receiptPath, f.source), /mask hash mismatch/);
});

test('no receipt: no masks (the plan is as before); auto finds only the receipt beside the source', async t => {
  const f = await fixture(t); await f.makeReceipt();
  const options = { root: f.dir, source: f.source, maskOption: 'auto', labelsOption: 'auto', blockIn: true };
  assert.equal(await studyThingMasks(options), null);
  await assert.rejects(studyThingMasks({ ...options, labelsOption: f.labels }), /--things requires/);
  const explicit = await studyThingMasks({ ...options, maskOption: f.receiptPath });
  assert.equal(explicit.names.length, 2);
  await assert.rejects(studyThingMasks({ ...options, source: f.other, maskOption: f.receiptPath }), /supplied source differs/);
  await copyFile(f.receiptPath, f.source + '.named-sam.json');
  assert.deepEqual(await studyThingMasks(options), explicit);
  assert.equal(await studyThingMasks({ ...options, blockIn: false }), null);
  await assert.rejects(studyThingMasks({ ...options, blockIn: false, maskOption: f.receiptPath }), /require a block-in/);
});
