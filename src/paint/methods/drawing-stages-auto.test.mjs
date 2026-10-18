import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chooseDrawingStages } from './drawing-stages-auto.mjs';

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-stages-auto-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'target.png');
  await sharp(Buffer.alloc(8 * 8 * 3, 240), { raw: { width: 8, height: 8, channels: 3 } }).png().toFile(image);
  const values = { drawingstages: 'auto', drawing: 'first', resumestate: '', penwash: 0, sketchpython: '', drawingplanner: 'test-model' };
  const opt = (name, fallback) => values[name] ?? fallback;
  const argv = [];
  const choose = (intent = {}, options = {}) => chooseDrawingStages({ opt, argv, image, root: dir, out: dir,
    rgb: Buffer.alloc(8 * 8 * 3, 240), w: 8, h: 8, penLine: 0, fetcher: async () => { throw new Error('unexpected model call'); }, intent, ...options });
  return { dir, image, values, argv, choose };
}

test('default auto respects caller supplied opening and closing files', async t => {
  const f = await fixture(t);
  assert.equal(await f.choose({ authoredOpening: true }), null);
  assert.equal(await f.choose({ authoredClosing: true }), null);
});

test('explicit auto opts back into planning with caller supplied files', async t => {
  const f = await fixture(t);
  const oldKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const record = await f.choose({ authoredOpening: true, authoredClosing: true, explicitAuto: true });
    assert(record);
    assert.equal(record.model.unavailable, 'no OPENROUTER_API_KEY and no cached answer');
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('generated line source files do not look authored to the chooser', async t => {
  const f = await fixture(t);
  const oldKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert(await f.choose({ authoredOpening: false, authoredClosing: false }));
  } finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});

test('explicit stages and drawing none or off continue to bypass auto planning', async t => {
  const f = await fixture(t);
  f.argv.push('--stages', 'prepink');
  assert.equal(await f.choose(), null);
  f.argv.length = 0;
  f.values.drawing = 'none';
  assert.equal(await f.choose(), null);
  f.values.drawing = 'first';
  f.values.drawingstages = 'off';
  assert.equal(await f.choose(), null);
});

test('resume reapplies its saved flags without a model call even when auto would otherwise be bypassed', async t => {
  const f = await fixture(t);
  const record = { final: { graphitePrep: 'light', inkPrep: 'none', inkFinish: 'none' }, flags: ['--stages', 'prep'] };
  fs.writeFileSync(path.join(f.dir, 'drawing-choice.json'), JSON.stringify(record));
  f.values.resumestate = 'saved';
  f.values.drawingstages = 'off';
  f.values.drawing = 'none';
  f.argv.push('--stages', 'finishink');
  assert.deepEqual(await f.choose({ authoredOpening: true }), record);
  assert.deepEqual(f.argv.slice(-2), record.flags);
});
