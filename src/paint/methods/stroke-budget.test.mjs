import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFocus } from './stroke-budget.mjs';

const load = async (doc, w = 4, h = 4) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-'));
  const file = path.join(dir, 'focus.json');
  fs.writeFileSync(file, JSON.stringify(doc));
  try { return await loadFocus({ opt: () => file, w, h, sharp: null, path, root: '/' }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('a focus array of the wrong size is refused', async () => {
  await assert.rejects(load(new Array(10).fill(1)), /focusmap.*10.*16/);
});

test('a focus file with no usable values or regions is refused', async () => {
  await assert.rejects(load({ regions: [{ note: 'no bounds' }] }), /focusmap/);
  await assert.rejects(load({ nothing: true }), /focusmap/);
});

test('a focus array of the right size and focus regions load', async () => {
  assert.equal((await load(new Array(16).fill(255)))[0], 1);
  const f = await load({ regions: [{ bounds: [0, 0, .5, .5], weight: .5 }] });
  assert.equal(f[0], .5);
  assert.equal(f[15], 0);
});
