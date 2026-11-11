import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { writePenLines } from './pen-trace-file.mjs';

test('the painter\'s line stage traces a wide pen drawing whole, in its own pixels, one width and one weight per line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pen-file-'));
  try {
    // 1200 px wide: a long pale curve 6 px wide (a reed line) and a dark corner patch for the value scale
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f2ebe0"/><rect width="20" height="20" fill="#2a1a10"/><path d="M 100 600 C 400 200 800 200 1100 500" stroke="#a08060" stroke-width="6" fill="none"/></svg>';
    const img = path.join(dir, 't.png'); await sharp(Buffer.from(svg)).png().toFile(img);
    const r = await writePenLines(img, path.join(dir, 'lines'), { sheetMm: 280, pen: true });
    const doc = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    assert.deepEqual(doc.image, { w: 1200, h: 800 });
    const longest = doc.lines.reduce((a, l) => (l.length > a.length ? l : a));
    assert.ok(longest.length > 800, `longest ${longest.length} px of a ~1150 px curve`);
    for (const l of doc.lines) { assert.equal(l.widths, undefined); assert.equal(l.weights, undefined); }
    assert.ok(Math.abs(longest.width - 6) < 2.5, `width ${longest.width} for a 6 px line`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a subject that does not read as pen keeps only lines in the darker half of its scale', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pen-file-'));
  try {
    // a dark patch large enough to be the scale's ink end, so the pale curve lies in the lighter half
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f2ebe0"/><rect width="80" height="80" fill="#2a1a10"/><path d="M 100 600 C 400 200 800 200 1100 500" stroke="#b8a48c" stroke-width="6" fill="none"/></svg>';
    const img = path.join(dir, 't.png'); await sharp(Buffer.from(svg)).png().toFile(img);
    const r = await writePenLines(img, path.join(dir, 'lines'), { sheetMm: 280, pen: false });
    assert.equal(r.lines.length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
