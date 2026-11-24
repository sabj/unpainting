import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRunSets, picturesAt, expandRunSets, isRunSet, levelOneTargets } from './run-sets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ids = list => list.map(p => p.id);

test('the core is five pictures, one of each group, on the whole ladder', () => {
  const core = picturesAt('core');
  assert.deepEqual(ids(core), ['manet-morisot-fan-crop', 'prout-laundresses', 'turner-esseillon', 'white-ships-1488', 'mittens-closeup']);
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
  assert.match(l3.said[0], /^run set extended at L3: 5 of its 15 pictures \(manet-morisot-fan-crop, .*\); the other 10 are not run at L3$/);
  assert.equal(at(['extended'], 'Auto').subjects.length, 15); assert.equal(at(['extended'], null).subjects.length, 15);
  assert.deepEqual(ids(at(['mittens-closeup', 'core'], 'L2').subjects), ['mittens-closeup', 'manet-morisot-fan-crop', 'prout-laundresses', 'turner-esseillon', 'white-ships-1488'], 'a picture named twice is painted once');
  assert.deepEqual(at(['beach', 'h36'], 'L2'), { subjects: [{ id: 'beach', variant: null }, { id: 'h36', variant: null }], said: [] });
  assert.throws(() => expandRunSets([{ id: 'core', variant: 'approved' }], 'L2'), /without a variant/);
});

test('level 1 of a set is never run on part of it in silence', () => {
  assert.throws(() => levelOneTargets('core'), /no level 1 target is prepared for manet-morisot-fan-crop, prout-laundresses, turner-esseillon, white-ships-1488/);
  const doc = { depths: { full: { levels: ['Auto', 'L1'] } }, sets: { s: { pictures: 'all', depth: 'full' } }, pictures: [{ id: 'a', title: 'A', group: 'g', core: true, levelOne: 'a-full' }, { id: 'b', title: 'B', group: 'g', core: false, levelOne: 'b-full' }] };
  assert.deepEqual(levelOneTargets('s', loadRunSets(doc)), ['a-full', 'b-full']);
  const r = spawnSync(process.execPath, ['bench/scripts/run.mjs', '--round', 'V3', '--dry-run', '--crops', 'core'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2); assert.match(r.stderr, /run set core, level 1: no level 1 target is prepared for/);
});

test('a fault in the file stops whatever reads it', () => {
  const ok = () => ({ depths: { d: { levels: ['Auto'] } }, sets: { s: { pictures: 'all', depth: 'd' } }, pictures: [{ id: 'a', title: 'A', group: 'g', core: true }] });
  assert.equal(picturesAt('s', 'Auto', loadRunSets(ok())).length, 1);
  assert.throws(() => loadRunSets({ ...ok(), pictures: [...ok().pictures, ...ok().pictures] }), /listed twice/);
  assert.throws(() => loadRunSets({ ...ok(), sets: { s: { pictures: 'all', depth: 'deep' } } }), /no depth "deep"/);
  assert.throws(() => loadRunSets({ ...ok(), depths: { d: { levels: ['L9'] } } }), /depth d: levels from/);
  assert.throws(() => loadRunSets({ ...ok(), pictures: [{ id: 'a' }] }), /needs id, title, group and core/);
});
