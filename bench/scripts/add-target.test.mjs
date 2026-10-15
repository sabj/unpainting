// node --test bench/scripts/add-target.test.mjs   (npm run bench:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { BENCH, V2, readJson } from './lib.mjs';
import { addTarget, coarseMap } from './add-target.mjs';
import { brief } from './runners.mjs';

test('coarseMap reproduces the shape and values of a published coarse map', async () => {
  const { data, info } = await sharp(path.join(V2, 'targets', 'hills.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ours = coarseMap('hills', data, info.width, info.height), theirs = readJson(path.join(V2, 'targets', 'hills-coarse.json'));
  for (const k of ['w', 'h', 'cols', 'rows']) assert.equal(ours[k], theirs[k], k);
  assert.equal(ours.palette.length, 8);
  assert.equal(ours.cells.length, theirs.cells.length);
  const err = ours.value.reduce((s, v, i) => s + Math.abs(v - theirs.value[i]), 0) / ours.value.length;
  assert.ok(err < 0.03, `mean value error ${err}`);
  assert.ok(ours.cells.every(c => c >= 0 && c < 8));
});

test('addTarget writes the target, its coarse map, its crops.json entry and its V4/V5 subject', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'add-target-'));
  try {
    fs.mkdirSync(path.join(root, 'v2'), { recursive: true }); fs.mkdirSync(path.join(root, 'v4v5'));
    fs.copyFileSync(path.join(V2, 'crops.json'), path.join(root, 'v2', 'crops.json'));
    fs.copyFileSync(path.join(BENCH, 'v4v5', 'subjects.json'), path.join(root, 'v4v5', 'subjects.json'));
    const { entry } = await addTarget({ image: path.join(V2, 'targets', 'sargent.png'), task: 'harbour', name: 'Harbour',
      style: 'loose watercolor: boats at a harbour wall', source: 'test image', licence: 'public domain', crop: [0, 0, 200, 150], width: 160, root });
    assert.deepEqual([entry.width, entry.height], [160, 120]);
    assert.ok(fs.existsSync(path.join(root, 'v2', 'targets', 'harbour.png')));
    const map = readJson(path.join(root, 'v2', 'targets', 'harbour-coarse.json'));
    assert.equal(map.cols * map.rows, map.cells.length);
    assert.equal(readJson(path.join(root, 'v2', 'crops.json')).crops.at(-1).task, 'harbour');
    assert.equal(readJson(path.join(root, 'v4v5', 'subjects.json')).subjects.harbour.taskStyle, 'loose watercolor');
    await assert.rejects(addTarget({ image: path.join(V2, 'targets', 'sargent.png'), task: 'harbour', name: 'H', style: 's', source: 's', licence: 'l', root }), /already exists/);
    await assert.rejects(addTarget({ image: path.join(V2, 'targets', 'sargent.png'), task: 'Bad Name', name: 'H', style: 's', source: 's', licence: 'l', root }), /lower-case/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the V1/V2 brief is the frozen brief for the five targets and cuts targets outside the run', () => {
  const five = brief('naive', ['hills', 'south-france', 'sargent', 'mittens', 'trumbull'], '/view');
  assert.equal(five, fs.readFileSync(path.join(V2, 'naive', 'BRIEF.md'), 'utf8').replaceAll('TARGET_DIR', '/view'));
  const two = brief('naive', ['hills', 'sargent'], '/view');
  assert.ok(!two.includes('| `south-france` |'), 'a target outside the run is cut');
  assert.ok(two.includes('The two targets'));
});
