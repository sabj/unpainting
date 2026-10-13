import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { markTapeJSON } from './mark-tape-json.mjs';
import { readMarkTape } from './mark-tape-read.mjs';
import { loadStats } from '../../tools/stroke-stats.mjs';

const tape = () => ({ w: 100, h: 50, scale: 10, sheetWidthMm: 200, base: [250, 248, 240], note: 'a "quoted" ] { brace', brushes: [0], brushOpts: [{ radius: 10 }],
  marks: Array.from({ length: 6000 }, (_, i) => i % 3 ? { k: 's', b: 0, d: [[i, 100, -1], [i + 900, 100, -1]] } : { k: 'g', options: { label: `x]"{${i}` }, points: [[1, [2, 3]]] }) });

test('a saved mark tape reads back as a stream, whole or gzipped', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-tape-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const doc = tape(), text = [...markTapeJSON(doc)].join('');
  fs.writeFileSync(path.join(dir, 'marks.json'), text);
  fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ ...doc, after: [1, { k: 2 }] }, null, 1));
  fs.writeFileSync(path.join(dir, 'marks.json.gz'), zlib.gzipSync(text));
  assert.deepEqual(await readMarkTape(path.join(dir, 'marks.json')), JSON.parse(text));
  assert.deepEqual(await readMarkTape(path.join(dir, 'marks.json.gz')), JSON.parse(text));
  assert.deepEqual(await readMarkTape(path.join(dir, 'old.json')), { ...doc, after: [1, { k: 2 }] });
  fs.writeFileSync(path.join(dir, 'cut.json'), text.slice(0, -40));
  await assert.rejects(readMarkTape(path.join(dir, 'cut.json')), /truncated/);
});

test('the stroke-stats loader never reads a mark tape into one string', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-tape-stats-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'marks.json');
  fs.writeFileSync(file, [...markTapeJSON(tape())].join(''));
  // stands in for a native tape longer than V8's longest string
  const read = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (path.resolve(String(f)) === file) throw new RangeError('Invalid string length'); return read.call(this, f, ...a); };
  t.after(() => { fs.readFileSync = read; });
  const s = await loadStats(file);
  assert.equal(s.counts.paint, 4000);
});
