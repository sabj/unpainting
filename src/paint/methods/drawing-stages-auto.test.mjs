import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chooseDrawingStages, drawingStageIntent } from './drawing-stages-auto.mjs';

async function fixture(t, raw = [], expanded = raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-stages-auto-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'target.png');
  await sharp(Buffer.alloc(8 * 8 * 3, 240), { raw: { width: 8, height: 8, channels: 3 } }).png().toFile(image);
  const invocation = [...expanded], intent = drawingStageIntent({ argv0: raw, expandedArgv: expanded });
  const opt = (name, fallback) => {
    const at = invocation.lastIndexOf(`--${name}`);
    return at < 0 ? fallback : invocation[at + 1] ?? fallback;
  };
  const fetcher = async () => { throw new Error('unexpected model call'); };
  const choose = () => chooseDrawingStages({ opt, argv: invocation, image, root: dir, out: dir,
    rgb: Buffer.alloc(8 * 8 * 3, 240), w: 8, h: 8, penLine: 0, fetcher, intent });
  return { dir, image, invocation, intent, opt, choose };
}

async function withoutModelKey(fn) {
  const oldKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try { return await fn(); }
  finally {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
}

test('default auto respects caller-supplied opening or closing files and leaves references untouched', async t => {
  for (const raw of [
    ['--drawingfile', 'opening'],
    ['--drawinglast', 'closing'],
    ['--drawingfile', 'opening', '--drawinglast', 'closing'],
  ]) {
    const f = await fixture(t, raw);
    const before = [...f.invocation];
    assert.equal(await f.choose(), null);
    assert.deepEqual(f.invocation, before);
    if (raw.includes('--drawingfile')) assert.equal(f.opt('drawingfile'), raw[raw.indexOf('--drawingfile') + 1]);
    if (raw.includes('--drawinglast')) assert.equal(f.opt('drawinglast'), raw[raw.indexOf('--drawinglast') + 1]);
  }
});

test('registration replacement of a caller drawing remains authored', async t => {
  const raw = ['--drawingfile', 'original-opening'];
  const expanded = ['--drawingfile', 'registered-opening'];
  const f = await fixture(t, raw, expanded);
  assert.equal(f.intent.authoredOpening, true);
  const before = [...f.invocation];
  assert.equal(await f.choose(), null);
  assert.deepEqual(f.invocation, before);
  assert.equal(f.opt('drawingfile'), 'registered-opening');
});

test('explicit CLI auto opts back into planning while recipe or plan auto does not', async t => {
  await withoutModelKey(async () => {
    const explicit = await fixture(t, ['--drawingstages', 'auto', '--drawingfile', 'opening']);
    assert.equal(explicit.intent.explicitAuto, true);
    assert(await explicit.choose());

    const expandedByRecipeOrPlan = await fixture(t, ['--drawingfile', 'opening'], ['--drawingstages', 'auto', '--drawingfile', 'opening']);
    assert.equal(expandedByRecipeOrPlan.intent.explicitAuto, false);
    assert.equal(await expandedByRecipeOrPlan.choose(), null);
  });
});

test('linework auto replaces the opening source and generated files are not caller-authored', async t => {
  await withoutModelKey(async () => {
    const f = await fixture(t, ['--linework', 'auto'], ['--linework', 'auto', '--drawingfile', 'generated-lines']);
    assert.equal(f.intent.authoredOpening, false);
    assert(await f.choose());

    const suppliedThenSuperseded = await fixture(t, ['--linework', 'auto', '--drawingfile', 'old-opening'], ['--linework', 'auto', '--drawingfile', 'old-opening']);
    assert.equal(suppliedThenSuperseded.intent.authoredOpening, false);
    assert(await suppliedThenSuperseded.choose());
  });
});

test('equals-form options are not recognized as provenance inputs by the split-only CLI parser', async t => {
  const lineworkEquals = await fixture(t, ['--linework=auto', '--drawingfile', 'opening']);
  assert.equal(lineworkEquals.intent.authoredOpening, true);
  assert.equal(await lineworkEquals.choose(), null);

  const autoEquals = await fixture(t, ['--drawingstages=auto', '--drawingfile', 'opening']);
  assert.equal(autoEquals.intent.explicitAuto, false);
  assert.equal(await autoEquals.choose(), null);

  await withoutModelKey(async () => {
    const stagesEquals = await fixture(t, ['--stages=none']);
    assert.equal(stagesEquals.intent.explicitStages, false);
    assert(await stagesEquals.choose());
  });
});

test('explicit stages none, drawing none and drawingstages off remain authoritative', async t => {
  const authored = ['--drawingfile', 'opening', '--drawinglast', 'closing'];
  for (const flags of [
    [...authored, '--stages', 'none'],
    [...authored, '--drawing', 'none'],
    [...authored, '--drawingstages', 'off'],
  ]) {
    const f = await fixture(t, flags);
    const before = [...f.invocation];
    assert.equal(await f.choose(), null);
    assert.deepEqual(f.invocation, before);
    assert.equal(f.opt('drawingfile'), 'opening');
    assert.equal(f.opt('drawinglast'), 'closing');
  }
});

test('normal resume replays saved flags without a model call; a missing record is a quiet no-op', async t => {
  const f = await fixture(t, ['--resumestate', 'saved']);
  const record = { flags: ['--stages', 'prep'] };
  fs.writeFileSync(path.join(f.dir, 'drawing-choice.json'), JSON.stringify(record));
  assert.deepEqual(await f.choose(), record);
  assert.deepEqual(f.invocation.slice(-2), record.flags);

  const missing = await fixture(t, ['--resumestate', 'saved']);
  assert.equal(await missing.choose(), null);
});

test('resume does not override explicit off, none or stage choices', async t => {
  for (const extra of [['--drawingstages', 'off'], ['--drawing', 'none'], ['--stages', 'finishink']]) {
    const f = await fixture(t, ['--resumestate', 'saved', ...extra]);
    fs.writeFileSync(path.join(f.dir, 'drawing-choice.json'), JSON.stringify({ flags: ['--stages', 'prep'] }));
    const before = [...f.invocation];
    assert.equal(await f.choose(), null);
    assert.deepEqual(f.invocation, before);
  }
});
