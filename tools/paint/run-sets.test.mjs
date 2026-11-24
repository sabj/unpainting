import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRunSets, picturesAt, expandRunSets, isRunSet, levelOneTargets, standardSheetOnly, isBenchmarkPicture, readiness } from './run-sets.mjs';
import { SHEET_RULE, standardSheet } from './sheet-rule.mjs';
import { reRegistered, ruleIdOf } from './reregister.mjs';
import { resolveSubject, checkInputs } from './subjects.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ids = list => list.map(p => p.id);

test('the core is five pictures, one of each group, on the whole ladder', () => {
  const core = picturesAt('core');
  assert.deepEqual(ids(core), ['manet-morisot-fan-crop-qs', 'prout-laundresses-qs', 'turner-esseillon-qs', 'white-ships-1488-qs', 'mittens-closeup-qs']);
  assert.deepEqual(core.map(p => p.group), ['figural', 'architectural', 'landscape', 'loose', 'bonus (generated)']);
  for (const p of core) assert.deepEqual(p.levels, ['Auto', 'L1', 'L2', 'L3', 'L4'], p.id);
});

test('the extended set is all fifteen, three of each group: the core on the whole ladder, the other ten at Auto and level 2', () => {
  const all = picturesAt('extended');
  assert.equal(all.length, 15); assert.equal(new Set(ids(all)).size, 15);
  const groups = Object.groupBy(all, p => p.group);
  assert.deepEqual(Object.entries(groups).map(([g, ps]) => [g, ps.length, ps.filter(p => p.core).length]), [['figural', 3, 1], ['architectural', 3, 1], ['landscape', 3, 1], ['loose', 3, 1], ['bonus (generated)', 3, 1]]);
  for (const p of all) assert.deepEqual(p.levels, p.core ? ['Auto', 'L1', 'L2', 'L3', 'L4'] : ['Auto', 'L2'], p.id);
  assert.equal(picturesAt('extended', 'Auto').length, 15); assert.equal(picturesAt('extended', 'L2').length, 15);
  for (const l of ['L1', 'L3', 'L4']) assert.deepEqual(ids(picturesAt('extended', l)), ids(picturesAt('core')), `${l}: the core five only`);
  assert.throws(() => picturesAt('everything'), /no run set "everything".*core, extended/); assert.throws(() => picturesAt('core', 'L5'), /level L5/);
});

test('a set\'s name stands for its pictures at the level asked for, where it was written', () => {
  const at = (words, level) => expandRunSets(words.map(id => ({ id, variant: null })), level);
  assert.ok(isRunSet('core') && isRunSet('extended') && !isRunSet('mittens-closeup') && !isRunSet('all'));
  const l3 = at(['beach', 'extended'], 'L3');
  assert.deepEqual(ids(l3.subjects), ['beach', ...ids(picturesAt('core'))]);
  assert.match(l3.said[0], /^run set extended at L3: 5 of its 15 pictures \(manet-morisot-fan-crop-qs, .*\); the other 10 are not run at L3$/);
  assert.equal(at(['extended'], 'Auto').subjects.length, 15); assert.equal(at(['extended'], null).subjects.length, 15);
  assert.deepEqual(ids(at(['mittens-closeup-qs', 'core'], 'L2').subjects), ['mittens-closeup-qs', 'manet-morisot-fan-crop-qs', 'prout-laundresses-qs', 'turner-esseillon-qs', 'white-ships-1488-qs'], 'a picture named twice is painted once');
  assert.deepEqual(at(['beach', 'h36'], 'L2'), { subjects: [{ id: 'beach', variant: null }, { id: 'h36', variant: null }], said: [] });
  assert.throws(() => expandRunSets([{ id: 'core', variant: 'approved' }], 'L2'), /without a variant/);
});

test('level 1 of a set is never run on part of it in silence', () => {
  const none = { depths: { full: { levels: ['Auto', 'L1'] } }, sets: { s: { pictures: 'all', depth: 'full' } }, pictures: [{ id: 'a', title: 'A', group: 'g', core: true, levelOne: 'a-full' }, { id: 'b', title: 'B', group: 'g', core: true, levelOne: null }, { id: 'c', title: 'C', group: 'g', core: true }] };
  assert.throws(() => levelOneTargets('s', loadRunSets(none)), /run set s, level 1: no level 1 target is prepared for b, c/);
  // the core five each have one (made by bench/scripts/add-level-one-target.mjs; the runner then refuses a target without its rendering unit)
  assert.deepEqual(levelOneTargets('core'), ['manet-morisot-fan-crop-full', 'prout-laundresses-full', 'turner-esseillon-full', 'white-ships-1488-full', 'mittens-closeup-full']);
  const doc = { depths: { full: { levels: ['Auto', 'L1'] } }, sets: { s: { pictures: 'all', depth: 'full' } }, pictures: [{ id: 'a', title: 'A', group: 'g', core: true, levelOne: 'a-full' }, { id: 'b', title: 'B', group: 'g', core: false, levelOne: 'b-full' }] };
  assert.deepEqual(levelOneTargets('s', loadRunSets(doc)), ['a-full', 'b-full']);
  // a run set at a round that is not level 1 is refused before anything starts
  const r = spawnSync(process.execPath, ['bench/scripts/run.mjs', '--round', 'V4', '--dry-run', '--crops', 'core'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('a fault in the file stops whatever reads it', () => {
  const ok = () => ({ depths: { d: { levels: ['Auto'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [{ id: 'a', title: 'A', group: 'g', core: true }] });
  assert.equal(picturesAt('s', 'Auto', loadRunSets(ok())).length, 1);
  assert.throws(() => loadRunSets({ ...ok(), pictures: [...ok().pictures, ...ok().pictures] }), /listed twice/);
  assert.throws(() => loadRunSets({ ...ok(), sets: { s: { pictures: 'all', depth: 'deep' } } }), /no depth "deep"/);
  assert.throws(() => loadRunSets({ ...ok(), depths: { d: { levels: ['L9'] } } }), /depth d: levels from/);
  assert.throws(() => loadRunSets({ ...ok(), pictures: [{ id: 'a' }] }), /needs id, title, group and core/);
});

// a registry record as the preparation writes it, before the rule: 1086 x 1448 px at 1086 cells
const earlier = () => ({ id: 'mittens-closeup', name: 'mittens-closeup', inputId: 'mittens-closeup-v2', source: { path: 'src.png', px: [1086, 1448], sha256: 'a'.repeat(64) },
  sheet: { widthMm: 282.36, cellsAcross: { full: 1086 }, rule: '0.26 mm a cell at full; long-side cells = min(source long side px, 1462)' }, studySeed: { chosen: 11, final: true },
  inputs: { drawingVectors: { stem: 'replay/vectors/mittens-closeup-v2-std-layin', sheetMm: 282.36, fittedSheetMm: 282.36, how: 'replay/vectors/make.sh mittens-closeup-v2-std-layin guides/l.png src.png 282.36 pencil', files: [{ path: 'replay/vectors/mittens-closeup-v2-std-layin-lines.json', sha256: 'b'.repeat(64) }, { path: 'replay/vectors/mittens-closeup-v2-std-layin-vectors.json', sha256: 'c'.repeat(64) }] },
    studies: [{ path: 'studies/s3.png', sha256: 'd'.repeat(64), minArea: 6 }] }, options: { common: [] } });

test('every picture the file names is a registration under the sheet rule, by its id', () => {
  for (const p of picturesAt('extended')) assert.match(p.id, /-qs$/, p.id);
  assert.ok(isBenchmarkPicture('mittens-closeup-qs') && !isBenchmarkPicture('mittens-closeup') && !isBenchmarkPicture('white-ships'));
});

test('a benchmark picture not registered under the sheet rule is refused in plain words; an earlier registration by its own id still runs', () => {
  const doc = { depths: { d: { levels: ['Auto'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [{ id: 'mittens-closeup', title: 'M', group: 'g', core: true }] }, sets = loadRunSets(doc);
  const old = resolveSubject({ file: 'R', base: '/r', subjects: [earlier()] }, 'mittens-closeup');
  assert.throws(() => standardSheetOnly(old, sets), /mittens-closeup is a benchmark picture, and its registration is not under the one-area sheet rule.*27\.9 x 38\.1 cm.*1086 cells.*It is not run/s);
  assert.equal(standardSheetOnly(old), old, 'not one of the benchmark\'s pictures: it runs on the sheet it was registered with');
  const { record } = reRegistered(earlier()), now = resolveSubject({ file: 'R', base: '/r', subjects: [earlier(), record] }, 'mittens-closeup-qs');
  assert.equal(standardSheetOnly(now), now); assert.equal(now.sheet.rule, SHEET_RULE);
});

test('registering again under the rule: a new record with a new id, the earlier one untouched, and what must be made again', () => {
  const was = earlier(), { record, redo } = reRegistered(was), std = standardSheet([1086, 1448]);
  assert.deepEqual(was, earlier(), 'the earlier record is not changed');
  assert.equal(record.id, 'mittens-closeup-qs'); assert.equal(record.inputId, 'mittens-closeup-qs'); assert.equal(record.registeredFrom, 'mittens-closeup'); assert.equal(ruleIdOf('h36-qs'), 'h36-qs');
  assert.equal(record.sheet.rule, SHEET_RULE); assert.equal(record.sheet.cellsAcross.full, std.cells); assert.equal(record.sheet.widthMm, std.widthMm);
  assert.deepEqual(record.source, was.source, 'the same source, by its checksum'); assert.deepEqual(record.inputs.studies, was.inputs.studies, 'the studies carry over');
  const v = record.inputs.drawingVectors;
  assert.equal(v.stem, 'replay/vectors/mittens-closeup-qs-std-layin'); assert.equal(v.sheetMm, std.widthMm); assert.ok(v.files.every(f => f.sha256 === null && f.path.startsWith(v.stem)), 'the drawing is fitted again: nothing of the old fit is pinned');
  assert.equal(v.how, `replay/vectors/make.sh mittens-closeup-qs-std-layin guides/l.png src.png ${std.widthMm} pencil`);
  assert.deepEqual(record.realSize, { heightCm: 30.5, widthCm: 23, nominal: true }, 'the real size goes with the record');
  assert.match(redo.join('\n'), /drawingVectors: fit again at .* mm across \(it was fitted at 282\.36 mm\)/); assert.match(redo.join('\n'), /named-forms\/mittens-closeup\/ to named-forms\/mittens-closeup-qs\//);
  assert.throws(() => reRegistered(record), /already registered under the one-area rule/);
  const small = reRegistered({ ...earlier(), id: 'kasha-portrait', source: { path: 's', px: [896, 1200], sha256: 'a' } });
  assert.match(small.redo.join('\n'), /painted enlarged 1\.21 times/);
});

test('the check says, picture by picture, what is not under the rule or not prepared', () => {
  const doc = { depths: { d: { levels: ['Auto', 'L1'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [
    { id: 'mittens-closeup-qs', title: 'M', group: 'g', core: true, levelOne: 'm-full' }, { id: 'mittens-closeup', title: 'old', group: 'g', core: true, levelOne: null }, { id: 'nowhere-qs', title: 'N', group: 'g', core: true, levelOne: 'n' }] };
  const before = readiness('s', { record: id => (id === 'mittens-closeup' ? earlier() : null), resolve: () => { throw new Error('unused'); }, check: x => x }, loadRunSets(doc))[0];
  assert.match(before.faults[0], /^not registered under the sheet rule yet: make it from mittens-closeup \(node tools\/paint\/reregister\.mjs mittens-closeup --registry .*1086 cells, its study seed final \(11\)$/);
  const { record } = reRegistered(earlier()), reg = { file: 'R', base: '/r', subjects: [earlier(), record] };
  const on = new Map(), pin = () => { for (const f of record.inputs.drawingVectors.files) f.sha256 = 'e'.repeat(64); };
  const io = { exists: f => on.has(f) || f.endsWith('receipt.json') || f.endsWith('named-sam.png'), hash: f => on.get(f) ?? 'm', readJson: () => ({ schema: 'named-sam-v1', mask: { path: 'named-sam.png', sha256: 'm' }, forms: [] }) };
  const run = () => readiness('s', { record: id => reg.subjects.find(x => x.id === id) ?? null, resolve: id => resolveSubject(reg, id, { formsDir: '/r/named-forms' }), check: spec => checkInputs(spec, io) }, loadRunSets(doc));
  let [m, old, none] = run();
  assert.equal(m.ok, false); assert.match(m.faults.join('; '), /not pinned by a checksum: drawing file replay\/vectors\/mittens-closeup-qs-std-layin-lines\.json/); assert.match(m.faults.join('; '), /missing source: \/r\/src\.png/);
  assert.match(old.faults.join('; '), /not under the one-area sheet rule \(registered at 1086 cells/); assert.match(old.faults.join('; '), /no level 1 target/);
  assert.deepEqual(none.faults, ['not registered: no such subject in the subject list']);
  pin(); for (const f of [['/r/src.png', 'a'], ['/r/studies/s3.png', 'd'], ...record.inputs.drawingVectors.files.map(f => [`/r/${f.path}`, 'e'])]) on.set(f[0], f[1].repeat(64));
  [m] = run(); assert.deepEqual(m.faults, []); assert.equal(m.ok, true);
  record.studySeed.final = false; record.studySeed.status = 'pending'; [m] = run(); assert.match(m.faults.join(), /study seed is not final \(pending\)/);
});

test('the check as a command stops plainly when there is no subject list', () => {
  const r = spawnSync(process.execPath, ['tools/paint/run-sets.mjs', 'check', 'core'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, UNPAINT_SUBJECTS: path.join(ROOT, 'tools', 'paint', 'no-such-SUBJECTS.json') } });
  assert.equal(r.status, 2); assert.match(r.stderr, /run-sets check: no subject list at/);
});
