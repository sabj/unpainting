// Surface labels: a coat or dressed stone asks for marks, everything else and every doubt asks for none, and a judge that
// cannot run is said so and replaced by nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { labelSurfaces, SURFACE_KIND, SURFACE_LABELS } from './surface-labels.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-labels-'));
const w = 8, h = 4, image = path.join(dir, 'x.png');
await sharp(Buffer.alloc(w * h * 3, 200), { raw: { width: w, height: h, channels: 3 } }).png().toFile(image);
const regions = [{ id: 1, area: 0.5 }, { id: 2, area: 0.5 }];
const labelMap = Uint8Array.from({ length: w * h }, (_, i) => (i % w < 4 ? 1 : 2));
const stub = reply => (cmd, args) => ({ status: 0, stdout: JSON.stringify(reply), stderr: '', error: undefined, args });
// an executable the identity can hash
const bin = path.join(dir, 'fake-codex'); fs.writeFileSync(bin, '#!/bin/sh\n'); fs.chmodSync(bin, 0o755);
const env = { PATH: process.env.PATH, CODEX_BIN: bin, INK_LABEL_MODEL: 'test-model' };

test('a coat and dressed stone ask for their kinds; other and unsure ask for none', async () => {
  const r = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir: path.join(dir, 'c1'), env, run: stub({ 1: 'fur_curly', 2: 'dressed_stone' }) });
  assert.equal(r.status, 'ok'); assert.deepEqual(r.kinds, { 1: 'curly-coat', 2: 'masonry' });
  const s = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir: path.join(dir, 'c2'), env, run: stub({ 1: 'other', 2: 'unsure' }) });
  assert.equal(s.status, 'ok'); assert.deepEqual(s.kinds, {}, 'doubt and cloth and skin take nothing');
  assert.deepEqual(Object.keys(SURFACE_KIND).sort(), ['dressed_stone', 'fur_curly', 'fur_short', 'hair_long']);
  assert.ok(SURFACE_LABELS.includes('unsure'));
});

test('an answer is cached, and read again without asking the judge', async () => {
  const cacheDir = path.join(dir, 'c3'); let calls = 0;
  const run = (...a) => { calls++; return stub({ 1: 'fur_short', 2: 'other' })(...a); };
  await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir, env, run });
  const again = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir, env, run });
  assert.equal(calls, 1); assert.equal(again.cached, true); assert.deepEqual(again.kinds, { 1: 'short-coat' });
});

test('a judge that cannot run is reported with its reason and gives no labels, never another judge', async () => {
  const noModel = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir: path.join(dir, 'c4'), env: { PATH: process.env.PATH, CODEX_BIN: bin } });
  assert.equal(noModel.status, 'unavailable'); assert.match(noModel.reason, /INK_LABEL_MODEL/); assert.deepEqual(noModel.kinds, {});
  const fails = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir: path.join(dir, 'c5'), env, run: () => ({ status: 1, stdout: '', stderr: 'quota', error: undefined }) });
  assert.equal(fails.status, 'unavailable'); assert.match(fails.reason, /label process failed/);
  const simple = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'simple', cacheDir: path.join(dir, 'c6'), env });
  assert.equal(simple.status, 'unavailable', 'the local classifier does not know coats');
});

test('a reply with an unknown label is refused whole', async () => {
  const bad = await labelSurfaces({ image, regions, labelMap, w, h, judge: 'codex', cacheDir: path.join(dir, 'c7'), env, run: stub({ 1: 'fur_curly', 2: 'tree_trunk' }) });
  assert.equal(bad.status, 'unavailable'); assert.deepEqual(bad.kinds, {});
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
