import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './sync-site-media.mjs';

const MEDIA = path.resolve(import.meta.dirname, '..', '..', 'demos', 'lab', 'media');

test("Paint Lab's paper, sheet, brush, pen, pencil and optics are the painter's own (run tools/lab/sync-site-media.mjs)", () => {
  const files = generate();
  for (const name of ['paper', 'sheet', 'brush', 'pen', 'pencil', 'km']) assert.ok(files.has(`${name}.js`), `${name}.js is generated`);
  for (const [rel, code] of files) assert.ok(fs.existsSync(path.join(MEDIA, rel)) && fs.readFileSync(path.join(MEDIA, rel), 'utf8') === code, `demos/lab/media/${rel} differs from src/media`);
});

test('the generated media import nothing the browser cannot load', () => {
  for (const [rel, code] of generate()) {
    // a dynamic import (sheet.js's thread pool, never started in the browser) is left as it is
    assert.ok(!/from\s+'(?!\.{1,2}\/)[^']+'/.test(code), `${rel} imports a bare module`);
    assert.ok(!/from\s+'[^']+\.mjs'/.test(code), `${rel} still imports a .mjs file`);
  }
});
