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

test('a study setting may be given for one named form, by its number: @name#FORM=value', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'study-load-form-')); t.after(() => rm(dir, { recursive: true, force: true }));
  {
    const f = path.join(dir, 's.png'); await sharp({ create: { width: 8, height: 6, channels: 3, background: '#ccbbaa' } }).png().toFile(f);
    const { studies } = await loadStudies(`${f}:6@clusters=20@clusters#2=32@floor#2=3@formbase#11=0,${f}:2@lay=0@lay#3=1@lightest#3=70`, dir, 8, 6);
    assert.deepEqual(studies[0].read, { clusters: 20 }); assert.deepEqual(studies[0].forms, { 2: { clusters: 32, floor: 3 }, 11: { formbase: 0 } });
    assert.deepEqual(studies[1].read, { lay: 0 }); assert.deepEqual(studies[1].forms, { 3: { lay: 1, lightest: 70 } });
    assert.equal((await loadStudies(`${f}:6`, dir, 8, 6)).studies[0].forms, undefined, 'none: the study is as it was');
    await assert.rejects(() => loadStudies(`${f}@clusters#0=4`, dir, 8, 6), /unknown study setting for a form/); await assert.rejects(() => loadStudies(`${f}@round#2=4`, dir, 8, 6), /unknown study setting for a form/);
    await assert.rejects(() => loadStudies(`${f}@floor=4`, dir, 8, 6), /unknown study setting @floor=4/);
  }
});
