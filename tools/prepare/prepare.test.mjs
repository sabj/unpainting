import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { standardSheet, SHEET_RULE } from '../paint/sheet-rule.mjs';
import { resolveSubject } from '../paint/subjects.mjs';
import { picturesAt } from '../paint/run-sets.mjs';
import { buildManifest, verifyManifest, filesOf } from './manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-prepare-'));
const py = (code, env = {}) => spawnSync('python3', ['-B', '-c', code], { cwd: HERE, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...env } });

test('the registry writer sizes a sheet under the rule exactly as the painter checks it', () => {
  const dir = tmp();
  try {
    const sizes = [[2100, 1767], [1600, 2035], [3000, 2089], [2902, 4036], [1600, 2394], [1664, 2104], [3451, 2363], [3332, 2230], [3437, 2512], [1488, 1057], [3193, 2943], [3859, 2984], [1086, 1448], [896, 1200], [1536, 1024], [768, 548], [1000, 1000], [3, 2]];
    const r = py(`import json; from subjects_lib import standard_sheet, RULE_NAME, RULE_SUFFIX; print(json.dumps([RULE_NAME, RULE_SUFFIX] + [standard_sheet(*s) for s in ${JSON.stringify(sizes)}]))`, { UNPAINT_PREP: dir });
    assert.equal(r.status, 0, r.stderr);
    const [rule, suffix, ...got] = JSON.parse(r.stdout);
    assert.equal(rule, SHEET_RULE); assert.equal(suffix, '-qs');
    sizes.forEach((px, i) => {
      const js = standardSheet(px), [wmm, hmm, cells] = got[i];
      assert.deepEqual([wmm, hmm, cells.full, cells.half, cells.line], [js.widthMm, js.heightMm, js.cells, Math.round(js.cells / 2), js.cells * 2], px.join(' x '));
      // and the record it would write passes the painter's own check of a record under the rule
      const rec = { id: 'x-qs', source: { path: 's.png', px }, sheet: { widthMm: wmm, cellsAcross: cells, rule }, inputs: { drawingVectors: { stem: 'v', files: [] }, studies: [{ path: 'a.png' }] } };
      assert.equal(resolveSubject({ file: 'R', base: dir, subjects: [rec] }, 'x-qs').sheet.rule, SHEET_RULE);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the registry writer registers each of the benchmark\'s fifteen a second time under the rule, as the run sets name them', () => {
  const src = fs.readFileSync(path.join(HERE, 'register.py'), 'utf8'), ids = /RULE_IDS = \(([^)]*)\)/s.exec(src)[1].match(/"[^"]+"/g).map(s => s.slice(1, -1));
  assert.deepEqual(ids.map(i => `${i}-qs`).sort(), picturesAt('extended').map(p => p.id).sort());
});

test('nothing here guesses where the preparation folder is, and no script carries a home path', () => {
  const no = py('import prep_root; prep_root.prep_root()', { UNPAINT_PREP: '' });
  assert.notEqual(no.status, 0); assert.match(no.stderr, /UNPAINT_PREP is not set to the preparation folder/);
  for (const sh of ['finish.sh', 'rule.sh', 'studies.sh', 'vectors.sh']) {
    const r = spawnSync('zsh', [path.join(HERE, sh), 'some-id'], { encoding: 'utf8', env: { ...process.env, UNPAINT_PREP: '' } });
    assert.equal(r.status, 2, sh); assert.match(r.stderr, /UNPAINT_PREP is not set/, sh);
  }
  const dir = tmp();
  try {
    const lora = spawnSync('zsh', [path.join(HERE, 'studies.sh'), 'x'], { encoding: 'utf8', env: { ...process.env, UNPAINT_PREP: dir, UNPAINT_PREP_PYTHON: '/bin/sh', UNPAINT_STUDY_PYTHON: '/bin/sh', UNPAINT_STUDY_LORA: '' } });
    assert.equal(lora.status, 2); assert.match(lora.stderr, /UNPAINT_STUDY_LORA is not set/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  for (const f of fs.readdirSync(HERE, { recursive: true })) {
    const p = path.join(HERE, f); if (!fs.statSync(p).isFile() || f === 'prepare.test.mjs') continue;
    assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /\/Users\/|~\/Scratch|expanduser\(|\/home\/[a-z]/, `${f} names a home folder`);
  }
});

test('the five prompts the studies, lay-in and ink line were made with are in the repository', () => {
  for (const p of ['s1', 's3', 's4', 'l1', 'e6']) assert.ok(fs.readFileSync(path.join(HERE, 'prompts', `${p}.txt`), 'utf8').trim().length > 200, p);
  const r = py('import study_model as m; print(m.size_for(3451, 2363, 1), m.size_for(896, 1200, 1), len(m.prompt_of("s3")))');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^\(1568, 1072, 3451, 2363\) \(896, 1200, 896, 1200\) \d+/);
  const bad = spawnSync('python3', ['-B', path.join(HERE, 'study_model.py'), 'a|b|nope|1|42'], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /prompt 'nope' is none of s1, s3, s4, l1, e6/);
});

test('the inputs manifest lists every file with its checksum and its seed; a changed, missing or unprepared input is a fault', () => {
  const dir = tmp();
  try {
    const put = (f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };
    const files = { 'src.png': 'S', 'guides/l.png': 'L', 'v-lines.json': '1', 'v-vectors.json': '2', 'studies/s3.png': 'A', 'labels/a.json': '{}', 'named-forms/a-qs/receipt.json': 'r', 'named-forms/a-qs/named-sam.png': 'm', 'named-forms/a-qs/labels.json': 'l' };
    for (const [f, t] of Object.entries(files)) put(f, t);
    const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    const rec = { id: 'a-qs', inputId: 'a', source: { path: 'src.png', px: [1000, 1000], sha256: sha('src.png') }, sheet: { rule: SHEET_RULE, widthMm: 326.04, heightMm: 326.04, cellsAcross: { full: 1254 } },
      studySeed: { chosen: 7, final: true, why: 'lowest penalty', seedsOnDisk: [7, 11, 42] },
      inputs: { drawing: { path: 'guides/l.png', sha256: sha('guides/l.png'), made: { prompt: 'l1', seed: '7', steps: '8', host: 'here' } }, drawingVectors: { stem: 'v', files: [{ path: 'v-lines.json', sha256: sha('v-lines.json') }, { path: 'v-vectors.json', sha256: sha('v-vectors.json') }] },
        studies: [{ path: 'studies/s3.png', sha256: sha('studies/s3.png'), made: { prompt: 's3', seed: '7', steps: '8', host: 'here' } }] }, labels: { path: 'labels/a.json', sha256: sha('labels/a.json') } };
    const pictures = [{ id: 'a-qs', title: 'A' }, { id: 'b-qs', title: 'B' }, { id: 'c-qs', title: 'C' }];
    const earlier = { ...structuredClone(rec), id: 'b', sheet: { rule: 'long side 1462', widthMm: 380.12, cellsAcross: { full: 1462 } }, studySeed: { chosen: null, final: false, status: 'pending' } };
    const doc = buildManifest(pictures, [rec, earlier], dir, { now: '2026-11-23' });
    const [a, b, c] = doc.pictures;
    assert.equal(a.prepared, true); assert.deepEqual(a.absent, []); assert.equal(a.files.length, filesOf(rec).length); assert.equal(a.studySeed.chosen, 7);
    assert.deepEqual(a.files.find(f => f.role === 'study 1'), { role: 'study 1', path: 'studies/s3.png', sha256: sha('studies/s3.png'), made: { prompt: 's3', seed: '7', steps: '8', host: 'here' }, bytes: 1 });
    assert.equal(b.prepared, false); assert.equal(b.listedFrom, 'b'); assert.match(b.absent.join('; '), /study seed is not final \(pending\).*not registered under the sheet rule: listed from the earlier registration b/); assert.match(b.absent.join('; '), /named-forms\/b\/receipt\.json is not on disk/);
    assert.deepEqual(c.absent, ['the picture is not in the subject list']);
    assert.equal(doc.prepared, 1); assert.equal(doc.of, 3);
    const only = { ...doc, pictures: [a] };
    assert.deepEqual(verifyManifest(only, dir), []);
    put('studies/s3.png', 'changed'); fs.rmSync(path.join(dir, 'labels/a.json'));
    assert.deepEqual(verifyManifest(only, dir), ['a-qs: study 1 studies/s3.png differs from the manifest', 'a-qs: missing labels labels/a.json']);
    assert.match(verifyManifest(doc, dir).join('\n'), /b-qs: the manifest itself lists it as not prepared/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the committed manifest names all fifteen, prepared or not', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'inputs-manifest.json'), 'utf8'));
  assert.deepEqual(doc.pictures.map(p => p.id), picturesAt('extended').map(p => p.id));
  for (const p of doc.pictures) { assert.equal(typeof p.prepared, 'boolean', p.id); assert.equal(p.prepared, p.absent.length === 0, p.id); for (const f of p.files) assert.ok(f.absent || /^[0-9a-f]{64}$/.test(f.sha256), `${p.id} ${f.path}`); }
});
