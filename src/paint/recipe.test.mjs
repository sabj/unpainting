import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecipe } from './recipe.mjs';

const flagNames = argv => argv.filter((_, i) => i % 2 === 0);

test('the default recipe names each flag once, as flag and value pairs', () => {
  const { argv, note } = expandRecipe({ argv: [] });
  assert.equal(note, 'recipe default');
  assert.equal(argv.length % 2, 0);
  const names = flagNames(argv);
  assert.ok(names.every(n => n.startsWith('--')));
  assert.equal(new Set(names).size, names.length);
});

test('v096 is an alias of the default recipe', () => {
  const plain = expandRecipe({ argv: ['--recipe', 'default'] }).argv;
  const alias = expandRecipe({ argv: ['--recipe', 'v096'] }).argv;
  assert.deepEqual(alias.slice(0, -2), plain.slice(0, -2));
});

test('a Trumbull value plan adds its paint box unless --paints is given', () => {
  const plan = ['--valueplan', 'examples/plans/trumbull-values.json'];
  assert.ok(expandRecipe({ argv: plan }).argv.includes('--paints'));
  const own = expandRecipe({ argv: [...plan, '--paints', 'ochre'] }).argv;
  assert.equal(own.filter(a => a === '--paints').length, 1);
});

test('none and areaplan runs add no flags', () => {
  assert.deepEqual(expandRecipe({ argv: ['--recipe', 'none'] }).argv, ['--recipe', 'none']);
  assert.deepEqual(expandRecipe({ argv: ['--areaplan', 'x.json'] }).argv, ['--areaplan', 'x.json']);
});

test('a plan drawing section comes after the recipe and before the command line, so typed flags win', () => {
  const plan = ['--valueplan', 'examples/plans/trumbull-values.json'];
  const { argv, note } = expandRecipe({ argv: [...plan, '--inkkscale', '2'] });
  assert.match(note, /drawing from the plan/);
  const value = name => argv[argv.lastIndexOf(name) + 1];
  assert.equal(value('--inkkscale'), '2');
  assert.equal(value('--outlinemedium'), 'ink');
  assert.ok(argv.indexOf('--outlinemedium') > argv.indexOf('--skylanes'));
});

test('the default recipe forces no drawing medium or ink weight', () => {
  const { argv } = expandRecipe({ argv: [] });
  for (const flag of ['--outlinemedium', '--inkkscale', '--inkk', '--openinglines', '--closinglines', '--closingedgemin', '--drawwidthgain']) assert.ok(!argv.includes(flag), flag);
});
