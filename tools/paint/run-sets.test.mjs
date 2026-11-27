import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRunSets, picturesAt, expandRunSets, isRunSet, levelOneTargets, standardSheetOnly, isBenchmarkPicture, readiness, rosterEntries } from './run-sets.mjs';
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

// a registry record as the preparation writes it, before the rule: 1536 x 1024 px at 1462 cells (the rule gives it 1536)
const earlier = () => ({ id: 'mittens-closeup', name: 'mittens-closeup', inputId: 'mittens-closeup-v2', source: { path: 'src.png', px: [1536, 1024], sha256: 'a'.repeat(64) },
  sheet: { widthMm: 380.12, cellsAcross: { full: 1462 }, rule: '0.26 mm a cell at full; long-side cells = min(source long side px, 1462)' }, studySeed: { chosen: 11, final: true },
  inputs: { drawingVectors: { stem: 'replay/vectors/mittens-closeup-v2-std-layin', sheetMm: 380.12, fittedSheetMm: 380.12, how: 'replay/vectors/make.sh mittens-closeup-v2-std-layin guides/l.png src.png 380.12 pencil', files: [{ path: 'replay/vectors/mittens-closeup-v2-std-layin-lines.json', sha256: 'b'.repeat(64) }, { path: 'replay/vectors/mittens-closeup-v2-std-layin-vectors.json', sha256: 'c'.repeat(64) }] },
    studies: [{ path: 'studies/s3.png', sha256: 'd'.repeat(64), minArea: 6 }] }, options: { common: [] } });

test('every picture the file names is a registration under the sheet rule, by its id', () => {
  for (const p of picturesAt('extended')) assert.match(p.id, /-qs$/, p.id);
  assert.ok(isBenchmarkPicture('mittens-closeup-qs') && !isBenchmarkPicture('mittens-closeup') && !isBenchmarkPicture('white-ships'));
});

test('a benchmark picture not registered under the sheet rule is refused in plain words; an earlier registration by its own id still runs', () => {
  const doc = { depths: { d: { levels: ['Auto'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [{ id: 'mittens-closeup', title: 'M', group: 'g', core: true }] }, sets = loadRunSets(doc);
  const old = resolveSubject({ file: 'R', base: '/r', subjects: [earlier()] }, 'mittens-closeup');
  assert.throws(() => standardSheetOnly(old, sets), /mittens-closeup is a benchmark picture, and its registration is not under the one-area sheet rule.*27\.9 x 38\.1 cm.*1462 cells.*It is not run/s);
  assert.equal(standardSheetOnly(old), old, 'not one of the benchmark\'s pictures: it runs on the sheet it was registered with');
  const { record } = reRegistered(earlier()), now = resolveSubject({ file: 'R', base: '/r', subjects: [earlier(), record] }, 'mittens-closeup-qs');
  assert.equal(standardSheetOnly(now), now); assert.equal(now.sheet.rule, SHEET_RULE);
});

test('registering again under the rule: a new record with a new id, the earlier one untouched, and what must be made again', () => {
  const was = earlier(), { record, redo } = reRegistered(was), std = standardSheet([1536, 1024]);
  assert.deepEqual(was, earlier(), 'the earlier record is not changed');
  assert.equal(record.id, 'mittens-closeup-qs'); assert.equal(record.inputId, 'mittens-closeup-v2', 'the inputs made from the source keep their name'); assert.equal(record.registeredFrom, 'mittens-closeup'); assert.equal(ruleIdOf('h36-qs'), 'h36-qs');
  assert.equal(record.sheet.rule, SHEET_RULE); assert.equal(record.sheet.cellsAcross.full, std.cells); assert.equal(record.sheet.widthMm, std.widthMm);
  assert.deepEqual(record.source, was.source, 'the same source, by its checksum'); assert.deepEqual(record.inputs.studies, was.inputs.studies, 'the studies carry over');
  const v = record.inputs.drawingVectors;
  assert.equal(v.stem, 'replay/vectors/mittens-closeup-qs-std-layin'); assert.equal(v.sheetMm, std.widthMm); assert.ok(v.files.every(f => f.sha256 === null && f.path.startsWith(v.stem)), 'the drawing is fitted again: nothing of the old fit is pinned');
  assert.equal(v.how, `replay/vectors/make.sh mittens-closeup-qs-std-layin guides/l.png src.png ${std.widthMm} pencil`);
  assert.deepEqual(record.realSize, { heightCm: 30.5, widthCm: 23, nominal: true }, 'the real size goes with the record');
  assert.match(redo.join('\n'), /drawingVectors: fit again at .* mm across \(it was fitted at 380\.12 mm\)/); assert.match(redo.join('\n'), /named-forms\/mittens-closeup\/ to named-forms\/mittens-closeup-qs\//);
  assert.throws(() => reRegistered(record), /already registered under the one-area rule/);
  // the rule gives Mittens close-up (1086 x 1448 px, 1086 cells) the sheet it had: its fit stands, pins and all
  const mittens = { ...earlier(), source: { path: 's', px: [1086, 1448], sha256: 'a' }, sheet: { widthMm: 282.36, cellsAcross: { full: 1086 } } }, same = reRegistered(mittens);
  assert.deepEqual(same.record.inputs.drawingVectors, mittens.inputs.drawingVectors); assert.equal(same.record.sheet.rule, SHEET_RULE); assert.doesNotMatch(same.redo.join('\n'), /fit again/);
  const small = reRegistered({ ...earlier(), id: 'kasha-portrait', source: { path: 's', px: [896, 1200], sha256: 'a' } });
  assert.match(small.redo.join('\n'), /painted enlarged 1\.21 times/);
});

test('the check says, picture by picture, what is not under the rule or not prepared', () => {
  const doc = { depths: { d: { levels: ['Auto', 'L1'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [
    { id: 'mittens-closeup-qs', title: 'M', group: 'g', core: true, levelOne: 'm-full' }, { id: 'mittens-closeup', title: 'old', group: 'g', core: true, levelOne: null }, { id: 'nowhere-qs', title: 'N', group: 'g', core: true, levelOne: 'n' }] };
  const before = readiness('s', { record: id => (id === 'mittens-closeup' ? earlier() : null), resolve: () => { throw new Error('unused'); }, check: x => x }, loadRunSets(doc))[0];
  assert.match(before.faults[0], /^not registered under the sheet rule yet: make it from mittens-closeup \(node tools\/paint\/reregister\.mjs mittens-closeup --registry .*1462 cells, its study seed final \(11\)$/);
  const { record } = reRegistered(earlier()), reg = { file: 'R', base: '/r', subjects: [earlier(), record] };
  const on = new Map(), pin = () => { for (const f of record.inputs.drawingVectors.files) f.sha256 = 'e'.repeat(64); };
  const io = { exists: f => on.has(f) || f.endsWith('receipt.json') || f.endsWith('named-sam.png'), hash: f => on.get(f) ?? 'm', readJson: () => ({ schema: 'named-sam-v1', mask: { path: 'named-sam.png', sha256: 'm' }, forms: [] }) };
  const run = () => readiness('s', { record: id => reg.subjects.find(x => x.id === id) ?? null, resolve: id => resolveSubject(reg, id, { formsDir: '/r/named-forms' }), check: spec => checkInputs(spec, io) }, loadRunSets(doc));
  let [m, old, none] = run();
  assert.equal(m.ok, false); assert.match(m.faults.join('; '), /not pinned by a checksum: drawing file replay\/vectors\/mittens-closeup-qs-std-layin-lines\.json/); assert.match(m.faults.join('; '), /missing source: \/r\/src\.png/);
  assert.match(old.faults.join('; '), /not under the one-area sheet rule \(registered at 1462 cells/); assert.match(old.faults.join('; '), /no level 1 target/);
  assert.deepEqual(none.faults, ['not registered: no such subject in the subject list']);
  pin(); for (const f of [['/r/src.png', 'a'], ['/r/studies/s3.png', 'd'], ...record.inputs.drawingVectors.files.map(f => [`/r/${f.path}`, 'e'])]) on.set(f[0], f[1].repeat(64));
  [m] = run(); assert.deepEqual(m.faults, []); assert.equal(m.ok, true);
  record.studySeed.final = false; record.studySeed.status = 'pending'; [m] = run(); assert.match(m.faults.join(), /study seed is not final \(pending\)/);
});

test('the check as a command stops plainly when there is no subject list', () => {
  const r = spawnSync(process.execPath, ['tools/paint/run-sets.mjs', 'check', 'core'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, UNPAINT_SUBJECTS: path.join(ROOT, 'tools', 'paint', 'no-such-SUBJECTS.json') } });
  assert.equal(r.status, 2); assert.match(r.stderr, /run-sets check: no subject list at/);
});

test('the ten 0.5 painters have matching registry entries at medium effort', () => {
  const sets = loadRunSets(), rows = rosterEntries(sets);
  assert.deepEqual(sets.roster, ['wonderfull-m', 'neon-m', 'carbon-m', 'argon-m', 'astra-m', 'sol-m', 'terra-m', 'fable-m', 'opus-m', 'sonnet-m']);
  assert.deepEqual(rows.filter(r => !r.ok), []);
  assert.deepEqual(rows.map(r => [r.cli, r.id, r.effort]), [['muse', 'muse-wonder-full-1.0', 'medium'], ['agy', 'gemini-4-neon-medium', 'medium'], ['agy', 'gemini-4-carbon-medium', 'medium'], ['agy', 'gemini-4-argon-medium', 'medium'],
    ['codex', 'gpt-6.2-astra', 'medium'], ['codex', 'gpt-6.1-sol', 'medium'], ['codex', 'gpt-6.1-terra', 'medium'], ['claude', 'claude-fable-5-2', 'medium'], ['claude', 'claude-opus-5-5', 'medium'], ['claude', 'claude-sonnet-5-5', 'medium']]);
  assert.ok(!sets.roster.some(k => /hydrogen|luna|haiku/.test(k)), 'Hydrogen, Luna and Haiku are not in the roster');
});

test('a roster model without both entries, with entries that differ, or called by a command the gate does not know is named', () => {
  const doc = { roster: { models: ['a', 'b', 'c', 'd'] }, depths: { d: { levels: ['Auto'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [{ id: 'p', title: 'P', group: 'g', core: true }] };
  const authors = [{ key: 'a', name: 'A', id: 'a-1', effort: 'medium', cli: 'codex' }, { key: 'b', name: 'B', id: 'b-1', effort: 'medium', cli: 'claude' }, { key: 'd', name: 'D', id: 'd-1', effort: 'medium', cli: 'ollama' }];
  const models = [{ key: 'a', name: 'A', id: 'a-1', effort: 'medium', runner: 'codex' }, { key: 'b', name: 'B', id: 'b-2', effort: 'high', runner: 'claude' }, { key: 'c', name: 'C', id: 'c-1', effort: 'n/a', runner: 'together' }, { key: 'd', name: 'D', id: 'd-1', effort: 'medium', runner: 'ollama' }];
  const rows = rosterEntries(loadRunSets(doc), authors, models);
  assert.deepEqual(rows.map(r => r.ok), [true, false, false, false]);
  assert.deepEqual(rows[1].faults, ['its id differs: b-1 in tools/paint/authors.json, b-2 in bench/models.json', 'its effort differs: medium in tools/paint/authors.json, high in bench/models.json']);
  assert.deepEqual(rows[2].faults, ['no entry in tools/paint/authors.json (levels 2 to 4)', 'its command together has no gate (tools/paint/session-net.mjs PROVIDER_HOSTS)', 'its entry in bench/models.json names no id or no effort']);
  assert.deepEqual(rows[3].faults, ['its command ollama has no gate (tools/paint/session-net.mjs PROVIDER_HOSTS)']);
  assert.throws(() => loadRunSets({ ...doc, roster: { models: ['a', 'a'] } }), /in the roster twice/); assert.throws(() => loadRunSets({ ...doc, roster: {} }), /"roster" needs "models"/);
  assert.throws(() => rosterEntries(loadRunSets({ ...doc, roster: undefined }), authors, models), /no "roster"/);
});

test('the check as a command names every roster model before the pictures, with no subject list too', () => {
  const r = spawnSync(process.execPath, ['tools/paint/run-sets.mjs', 'check', 'core'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, UNPAINT_SUBJECTS: path.join(ROOT, 'tools', 'paint', 'no-such-SUBJECTS.json') } });
  assert.match(r.stdout, /^ready {5}model wonderfull-m \(Muse Wonder Full \(medium\); muse, muse-wonder-full-1\.0, effort medium\)$/m);
  assert.match(r.stdout, /Roster: 10 of 10 models have their entry for level 1 and for levels 2 to 4\./);
});
