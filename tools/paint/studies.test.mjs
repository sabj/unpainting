import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { qwenRoute, studyRequestPrompt, parseStudyRequests, writeStudyRequest, makeStudies, withAuthorStudies } from './studies.mjs';

const BRIEF = 'Make a painter\'s block-in study of this watercolour on its existing sheet, keeping the framing and proportions, the face as three planes, lights as bare paper, with no outlines or text.';

test('the local study route is found piece by piece, and each missing piece is named', () => {
  const home = '/h', base = '/reg', hub = '/h/.cache/huggingface/hub', lora = `${hub}/models--lightx2v--Qwen-Image-Edit-2511-Lightning/snapshots`;
  const files = { '/reg/guides/tools/qwen_onboard_local.py': 'lora rev abc123', '/reg/bin/one-model': 'x', '/h/.local/share/uv/tools/mflux/bin/python': 'x',
    [`${hub}/models--mlx-community--qwen-image-edit-2511-8bit/refs/main`]: 'rev51\n', [lora]: 'dir', [`${lora}/abc123/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors`]: 'x' };
  const look = f => ({ env: {}, home, exists: p => p in f, read: p => f[p], list: () => ['abc123'] });
  const ok = qwenRoute(base, look(files));
  assert.equal(ok.ready, true); assert.equal(ok.modelRevision, 'rev51'); assert.equal(ok.loraRevision, 'abc123');
  const none = qwenRoute(base, look({}));
  assert.equal(none.ready, false); assert.equal(none.missing.length, 5);
  assert.match(none.missing.join('\n'), /local Qwen driver[\s\S]*one-model launcher[\s\S]*mflux python[\s\S]*qwen-image-edit-2511-8bit[\s\S]*Lightning LoRA/);
  const stale = qwenRoute(base, look({ ...files, '/reg/guides/tools/qwen_onboard_local.py': 'another revision' }));
  assert.deepEqual(stale.missing, ['a driver written for the installed LoRA revision abc123']);
  assert.equal(qwenRoute(base, { ...look(files), env: { UNPAINT_QWEN_DRIVER: '/else/d.py' } }).missing.length, 1);
});

test('the author is asked for briefs, and its answer is checked', () => {
  const p = studyRequestPrompt('THE BRIEF', ['inputs/source.png', 'inputs/study-1.png']);
  assert.match(p, /^THE BRIEF/); assert.match(p, /Do not write the script yet/); assert.match(p, /`inputs\/study-1.png`/);
  const got = parseStudyRequests({ seen: 's', studies: [{ role: 'fine', brief: BRIEF + '\n  more', why: 'eyes' }, { role: 'block-in', brief: BRIEF }] });
  assert.deepEqual(got.map(g => [g.role, g.index]), [['fine', 2], ['block-in', 0]]); assert.ok(!got[0].brief.includes('\n'));
  assert.deepEqual(parseStudyRequests({ studies: [] }), []);
  assert.throws(() => parseStudyRequests({}), /needs a "studies" list/);
  assert.throws(() => parseStudyRequests({ studies: [{ role: 'sky', brief: BRIEF }] }), /role "sky"/);
  assert.throws(() => parseStudyRequests({ studies: [{ role: 'fine', brief: BRIEF }, { role: 'fine', brief: BRIEF }] }), /two briefs/);
  assert.throws(() => parseStudyRequests({ studies: [{ role: 'fine', brief: 'too short' }] }), /one paragraph/);
  assert.throws(() => parseStudyRequests({ studies: [{ role: 'fine', brief: BRIEF + ' | rm' }] }), /without \| or #/);
});

test('a request pins every input; made studies replace the registered ones of their roles only', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-studies-'));
  try {
    const driver = path.join(d, 'driver.py'), source = path.join(d, 'src.png'); fs.writeFileSync(driver, 'd'); fs.writeFileSync(source, 's');
    const route = { driver, launcher: '/l', python: '/py', modelRevision: 'rev51', loraRevision: 'abc123' }, requests = parseStudyRequests({ studies: [{ role: 'middle', brief: BRIEF }] });
    const request = writeStudyRequest({ dir: path.join(d, 'studies'), authorKey: 'opus', source: { abs: source, sha256: 'aa' }, route, seed: 11, requests });
    const doc = JSON.parse(fs.readFileSync(request.file, 'utf8'));
    assert.equal(doc.mode, 'tool-assisted'); assert.equal(doc.round, 'A'); assert.equal(doc.modelRevision, 'rev51'); assert.deepEqual([doc.steps, doc.guidance], [8, 1]);
    assert.equal(doc.jobs[0].seed, 11); assert.equal(fs.readFileSync(doc.jobs[0].prompt, 'utf8').trim(), BRIEF); assert.match(doc.toolSHA256, /^[a-f0-9]{64}$/);
    let seen = null;
    const made = await makeStudies({ root: '/repo', request, requests, route, run: async (cmd, args) => { seen = [cmd, ...args]; fs.writeFileSync(request.jobs[0].output, 'png'); return 0; } });
    assert.deepEqual(seen.slice(0, 3), ['python3', '/repo/tools/paint/assisted-studies.py', request.file]); assert.deepEqual(seen.slice(3), ['--python', '/py', '--launcher', '/l']);
    assert.equal(made[0].index, 1);
    const studies = withAuthorStudies([{ path: 'a.png', abs: '/a.png', role: 'block-in' }, { path: 'b.png', abs: '/b.png', role: 'middle study' }], made);
    assert.equal(studies[0].abs, '/a.png'); assert.equal(studies[1].abs, request.jobs[0].output); assert.equal(studies[1].byAuthor, true); assert.match(studies[1].role, /author's own brief/);
    fs.rmSync(request.jobs[0].output);
    await assert.rejects(makeStudies({ root: '/repo', request, requests, route, run: async () => 0 }), /returned no middle study/);
    await assert.rejects(makeStudies({ root: '/repo', request, requests, route, run: async () => 1 }), /ended with exit 1/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
