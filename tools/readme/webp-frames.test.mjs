import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { contentBox, encodeAnimation } from './webp-frames.mjs';

const PAPER = { r: 240, g: 235, b: 220 };
// A dark square moving across paper, one PNG per frame; noise makes the frames hard to compress.
async function frames(dir, n, { noise = false } = {}) {
  const files = [];
  for (let i = 0; i < n; i++) {
    const file = path.join(dir, `f${i}.png`), x = 20 + i * 20;
    const square = { input: { create: { width: 20, height: 20, channels: 3, background: { r: 40, g: 30, b: 20 } } }, left: x, top: 50 };
    const layers = [square];
    if (noise) {
      const grain = Buffer.alloc(200 * 150 * 3);
      for (let k = 0; k < grain.length; k++) grain[k] = (k * 7919 + i * 104729) % 251;
      layers.unshift({ input: grain, raw: { width: 200, height: 150, channels: 3 }, left: 0, top: 0 });
    }
    await sharp({ create: { width: 200, height: 150, channels: 3, background: PAPER } }).composite(layers).png().toFile(file);
    files.push(file);
  }
  return files;
}

test('contentBox spans the moving mark in every frame, padded, inside the frame', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-frames-'));
  const files = await frames(dir, 6);
  assert.deepEqual(await contentBox(files, { pad: 4 }), { left: 16, top: 46, width: 128, height: 28 });
  assert.deepEqual(await contentBox(files, { pad: 100 }), { left: 0, top: 0, width: 200, height: 150 });
  const blank = path.join(dir, 'blank.png');
  await sharp({ create: { width: 50, height: 50, channels: 3, background: PAPER } }).png().toFile(blank);
  await assert.rejects(contentBox([blank]), /every frame is background/);
});

test('encodeAnimation keeps every frame and its delay when the file fits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-frames-'));
  const files = await frames(dir, 6), out = path.join(dir, 'a.webp');
  const r = await encodeAnimation(files, out, { width: 100, crop: { left: 0, top: 25, width: 200, height: 100 }, delays: [100, 100, 100, 100, 100, 900] });
  const meta = await sharp(out, { animated: true }).metadata();
  assert.equal(r.frames, 6); assert.equal(meta.pages, 6); assert.equal(meta.width, 100); assert.equal(meta.pageHeight, 50);
  assert.deepEqual(meta.delay, [100, 100, 100, 100, 100, 900]); assert.equal(meta.loop, 0);
  assert.equal(fs.statSync(out).size, r.bytes);
});

test('encodeAnimation drops frames, not time, to get under the byte cap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-frames-'));
  const files = await frames(dir, 8, { noise: true }), out = path.join(dir, 'b.webp');
  const full = await encodeAnimation(files, path.join(dir, 'full.webp'), { width: 200, delays: 50, maxBytes: 10_000_000, quality: 90 });
  const r = await encodeAnimation(files, out, { width: 200, delays: 50, maxBytes: Math.round(full.bytes * 0.45), quality: 90, minQuality: 82 });
  const meta = await sharp(out, { animated: true }).metadata();
  assert.ok(r.frames < 8 && r.bytes <= Math.round(full.bytes * 0.45));
  assert.equal(meta.delay.reduce((a, b) => a + b, 0), 8 * 50, 'the loop lasts as long');
  await assert.rejects(encodeAnimation(files.slice(0, 2), path.join(dir, 'c.webp'), { width: 200, maxBytes: 100 }), /stays over/);
});
