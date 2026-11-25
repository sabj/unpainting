import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { FRAME_FILE, frameFormat, frameName, encodeFrame } from './frame-file.mjs';

test('a film is lossless, checkpoint frames stay JPEG', () => {
  assert.equal(frameFormat(false), 'jpg');
  assert.equal(frameFormat(true), 'webp');
  assert.equal(frameFormat(true, false), 'png');
  assert.equal(frameName(7), 'f0007.jpg');
  assert.equal(frameName(240, 'webp'), 'f0240.webp');
  for (const f of ['f0000.jpg', 'f0240.webp', 'f12345.png']) assert.ok(FRAME_FILE.test(f), f);
  for (const f of ['painting.png', 'f0000.gif', 'xf0000.jpg']) assert.ok(!FRAME_FILE.test(f), f);
});

test('a film frame comes back from its file exactly; a JPEG frame does not have to', async () => {
  const w = 64, h = 48, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37 + (i >> 5) * 11) & 255; // not a flat field: every byte matters
  const raw = { raw: { width: w, height: h, channels: 3 } };
  for (const format of ['webp', 'png']) {
    const file = await encodeFrame(sharp(rgb, raw), frameName(0, format)).toBuffer();
    assert.equal((await sharp(file).metadata()).format, format);
    assert.ok((await sharp(file).removeAlpha().raw().toBuffer()).equals(rgb), `${format} changed the frame`);
  }
  const jpg = await encodeFrame(sharp(rgb, raw), frameName(0)).toBuffer();
  assert.equal((await sharp(jpg).metadata()).format, 'jpeg');
});
