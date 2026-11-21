import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadStudies, STUDY_SETTINGS } from './study-load.mjs';

test('a wash plan names each study\'s least size and its settings: FILE:MIN@name=value', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'study-load-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await sharp(Buffer.alloc(8 * 6 * 3, 200), { raw: { width: 8, height: 6, channels: 3 } }).png().toFile(path.join(dir, 'a.png'));
  const { studies, flat } = await loadStudies('a.png:6@shapes=120@clusters=24@join=8,a.png:4', dir, 8, 6);
  assert.equal(flat, false);
  assert.deepEqual(studies.map(s => [s.minMm2, s.read]), [[6, { shapes: 120, clusters: 24, join: 8 }], [4, {}]]);
  assert.ok(['shapes', 'clusters', 'join'].every(k => STUDY_SETTINGS.includes(k)));
  await assert.rejects(loadStudies('a.png:6@sliver=3', dir, 8, 6), /unknown study setting @sliver=3/);
  await assert.rejects(loadStudies('a.png:6@shapes=many', dir, 8, 6), /unknown study setting/);
});
