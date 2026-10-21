// Segmentation runs before every painting, loudly: the right python and checkpoint are found, a map is made once
// per target hash and then read from the cache, a missing SAM fails the run, and the readers find the map by the
// target's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describeSegments, prepareSegments, resolveSamCheckpoint, resolveSegPython, segmentKey } from './segment-prep.mjs';
import { hasSegments, loadSegments, segmentPaths } from './segments.mjs';

const temp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'segprep-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const touch = (file, text = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
const options = flags => (k, d) => (k in flags ? flags[k] : d);

// A repo root with the two scripts the cache key reads, and a target image.
async function repo(t) {
  const root = temp(t);
  touch(path.join(root, 'tools/seg/segments.py'), '# segments');
  touch(path.join(root, 'tools/seg/sam_regions.py'), '# regions');
  const image = path.join(root, 'in', 'target.png');
  fs.mkdirSync(path.dirname(image));
  await sharp(Buffer.alloc(4 * 3 * 3, 200), { raw: { width: 4, height: 3, channels: 3 } }).png().toFile(image);
  return { root, image };
}

// A stand-in for the seg python: writes a two-region map made by `backend` and counts its runs in <root>/runs.
async function fakePython(root, { backend = 'sam', fail = false } = {}) {
  const fixture = path.join(root, 'fixture');
  await sharp(Buffer.from([1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2]), { raw: { width: 4, height: 3, channels: 1 } }).png().toFile(`${fixture}.png`);
  const made = backend === 'sam' ? { backend: 'sam', model: 'vit_b', device: 'mps', masks: 9, laid: 2 } : { backend: 'kmeans', k: 8 };
  fs.writeFileSync(`${fixture}.json`, JSON.stringify({ mode: 'regions', backend: made, image: { w: 4, h: 3 }, legend: { 1: 'r1', 2: 'r2' },
    regions: [{ id: 1, name: 'r1', foreground: false, area: 0.5 }, { id: 2, name: 'r2', foreground: true, area: 0.5 }] }));
  const script = `#!/bin/sh
echo run >> "${root}/runs"
${fail ? 'echo "segments: SAM required and it did not run: no torch" >&2; exit 2' : ''}
img="$2"; out=""; prev=""
for a in "$@"; do if [ "$prev" = "--out" ]; then out="$a"; fi; prev="$a"; done
base=$(basename "$img"); base="\${base%.*}"
cp "${fixture}.png" "$out/$base.png"; cp "${fixture}.json" "$out/$base.json"; echo '{}' > "$out/$base-contours.json"
`;
  const file = touch(path.join(root, 'bin', 'python'), script);
  fs.chmodSync(file, 0o755);
  return file;
}
const runs = root => (fs.existsSync(path.join(root, 'runs')) ? fs.readFileSync(path.join(root, 'runs'), 'utf8').split('\n').filter(Boolean).length : 0);

test('the seg python: --segpython, then PAINTER_SEG_PYTHON, then the repo venvs; a named path must exist', t => {
  const root = temp(t);
  assert.equal(resolveSegPython({ root, env: {} }), null);
  const plain = touch(path.join(root, '.venv/bin/python'));
  assert.equal(resolveSegPython({ root, env: {} }), plain);
  const repoVenv = touch(path.join(root, '.venv-seg/bin/python'));
  assert.equal(resolveSegPython({ root, env: {} }), repoVenv, 'a seg venv beats a plain .venv');
  assert.equal(resolveSegPython({ root, env: { PAINTER_SEG_PYTHON: plain } }), plain);
  assert.equal(resolveSegPython({ given: repoVenv, root, env: { PAINTER_SEG_PYTHON: plain } }), repoVenv);
  assert.throws(() => resolveSegPython({ given: '/no/such/python', root, env: {} }), /does not exist/);
  assert.throws(() => resolveSegPython({ root, env: { PAINTER_SEG_PYTHON: '/no/such/python' } }), /PAINTER_SEG_PYTHON/);
});

test('the SAM checkpoint: --samcheckpoint, then PAINTER_SAM_CHECKPOINT, then work/models', t => {
  const root = temp(t), elsewhere = temp(t);
  assert.equal(resolveSamCheckpoint({ root, env: {} }), null);
  const work = touch(path.join(root, 'work/models/sam_vit_b_01ec64.pth'));
  assert.equal(resolveSamCheckpoint({ root, env: {} }), work);
  const models = touch(path.join(elsewhere, 'sam_vit_b_01ec64.pth'));
  assert.equal(resolveSamCheckpoint({ root, env: { PAINTER_SAM_CHECKPOINT: models } }), models);
  assert.equal(resolveSamCheckpoint({ given: work, root, env: { PAINTER_SAM_CHECKPOINT: models } }), work);
  assert.throws(() => resolveSamCheckpoint({ given: '/no/sam.pth', root, env: {} }), /does not exist/);
  assert.throws(() => resolveSamCheckpoint({ root, env: { PAINTER_SAM_CHECKPOINT: '/no/sam.pth' } }), /PAINTER_SAM_CHECKPOINT/);
});

test('the cache key changes with the target bytes, the backend and the segmentation code', async t => {
  const { root, image } = await repo(t);
  const a = segmentKey({ image, backend: 'sam', root });
  assert.match(a, /^[0-9a-f]{16}-sam-[0-9a-f]{8}$/);
  assert.notEqual(segmentKey({ image, backend: 'kmeans', root }), a);
  fs.appendFileSync(path.join(root, 'tools/seg/sam_regions.py'), '\n# changed');
  assert.notEqual(segmentKey({ image, backend: 'sam', root }), a);
});

test('a map is made once per target, registered under the target name, logged with its backend, then cached', async t => {
  const { root, image } = await repo(t);
  const python = await fakePython(root);
  const checkpoint = touch(path.join(root, 'sam.pth'));
  const out = temp(t), logs = [];
  const opt = options({ segpython: python, samcheckpoint: checkpoint });
  const first = prepareSegments({ image, root, out, opt, log: l => logs.push(l), env: {} });
  assert.equal(first.backend, 'sam');
  assert.equal(first.regions, 2);
  assert.equal(first.cached, false);
  assert.equal(runs(root), 1);
  assert.match(logs[0], /^segments: SAM vit_b on mps \(9 masks, 2 laid\), 2 regions, 1 inside the frame; made in/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'segments.json'), 'utf8')).backend, 'sam');
  // two targets are both called target.png; the readers find this one's map by name
  assert.equal(segmentPaths('target').labels, `${first.stem}.png`);
  assert.ok(hasSegments('target'));
  const seg = await loadSegments('target', 8, 6);
  assert.deepEqual(seg.regions.map(r => r.name), ['r1', 'r2']);
  const again = prepareSegments({ image, root, opt, log: l => logs.push(l), env: {} });
  assert.equal(again.cached, true);
  assert.equal(runs(root), 1, 'the cached map is not made again');
  assert.match(logs[1], /2 regions, 1 inside the frame; from the cache$/);
});

test('SAM is required by default: no checkpoint, a failing script or a k-means map all stop the run', async t => {
  const { root, image } = await repo(t);
  const python = await fakePython(root, { backend: 'kmeans' });
  const log = () => {};
  assert.throws(() => prepareSegments({ image, root, opt: options({ segpython: python }), log, env: {} }), /SAM is required and no sam_vit_b_01ec64.pth was found/);
  const checkpoint = touch(path.join(root, 'sam.pth'));
  assert.throws(() => prepareSegments({ image, root, opt: options({ segpython: python, samcheckpoint: checkpoint }), log, env: {} }), /asked for sam, the map .* was made by kmeans/);
  const failing = await fakePython(temp(t), { fail: true });
  assert.throws(() => prepareSegments({ image, root, opt: options({ segpython: failing, samcheckpoint: checkpoint, segcache: temp(t) }), log, env: {} }), /SAM required and it did not run: no torch/);
});

test('--segments kmeans asks for no checkpoint, and --segments off says so and makes nothing', async t => {
  const { root, image } = await repo(t);
  const python = await fakePython(root, { backend: 'kmeans' }), logs = [];
  const r = prepareSegments({ image, root, opt: options({ segments: 'kmeans', segpython: python }), log: l => logs.push(l), env: {} });
  assert.equal(r.backend, 'kmeans');
  assert.match(logs[0], /^segments: k-means in Lab \(k 8\), 2 regions/);
  assert.equal(prepareSegments({ image, root, opt: options({ segments: 'off' }), log: l => logs.push(l), env: {} }), null);
  assert.match(logs[1], /^segments: off/);
  assert.throws(() => prepareSegments({ image, root, opt: options({ segments: 'auto' }), log: () => {}, env: {} }), /--segments: one of sam, kmeans, off/);
});

test('the log line names the backend, the region count and where the map came from', () => {
  const doc = { backend: { backend: 'sam', model: 'vit_b', device: 'cpu', masks: 40, laid: 12 }, regions: [{ foreground: true }, { foreground: false }, {}] };
  assert.equal(describeSegments(doc, { cached: false, seconds: 21.04 }), 'segments: SAM vit_b on cpu (40 masks, 12 laid), 3 regions, 1 inside the frame; made in 21.0 s');
});
