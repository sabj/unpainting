import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { writeInkLines } from './ink-lines-file.mjs';

test('a pen line on paper comes back as a line file in source pixels', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-lines-'));
  try {
    const W = 200, H = 120, px = Buffer.alloc(W * H * 3, 245);
    for (let x = 30; x < 170; x++) for (let y = 59; y < 61; y++) { const i = (y * W + x) * 3; px[i] = 60; px[i + 1] = 45; px[i + 2] = 35; }
    const image = path.join(dir, 't.png');
    await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
    const r = await writeInkLines(image, path.join(dir, 'out'), { width: 200 });
    assert.ok(r.lines.length >= 1);
    const doc = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    assert.deepEqual(doc.image, { w: W, h: H });
    const xs = doc.lines.flatMap(g => g.points.map(p => p[0]));
    assert.ok(Math.min(...xs) < 60 && Math.max(...xs) > 140);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
