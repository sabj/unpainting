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

test('v096 keeps the old default: the tuned flags on every subject, and the subject presets for Y1', () => {
  const v096 = expandRecipe({ argv: ['--recipe', 'v096'] }).argv;
  for (const flag of ['--darkgain', '--stoneblocks', '--skylanes', '--shadowraw']) assert.ok(v096.includes(flag), flag);
  const y1 = expandRecipe({ argv: ['--recipe', 'v096', '--valueplan', 'examples/plans/trumbull-values.json'] });
  assert.match(y1.note, /recipe v096, presets architecture, trumbull/);
  for (const flag of ['--trumbullrules', '--recesses', '--paints']) assert.ok(y1.argv.includes(flag), flag);
});

test('the historical recipe adds the Trumbull paint box unless --paints is given', () => {
  const plan = ['--recipe', 'v096', '--valueplan', 'examples/plans/trumbull-values.json'];
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

test('an unseen ink-and-wash plan uses source paper and a lean palette, with explicit overrides last', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-recipe-'));
  try {
    const file = path.join(dir, 'plan.json');
    fs.writeFileSync(file, JSON.stringify({ subject:'unseen-ink-study', styleSelection:{style:'ink-and-wash',reason:'Visible brown ink and pale washes'} }));
    const read = args => {const {argv}=expandRecipe({argv:['--recipe','general','--valueplan',file,...args]});const get=name=>argv[argv.lastIndexOf('--'+name)+1];get.has=name=>argv.includes('--'+name);return get;};
    const base=read([]);
    assert.equal(base('paperrgb'),'source');assert.equal(base('palettewide'),'0');assert.equal(base('boxpick'),'0');assert.ok(!base.has('stoneblocks'));
    const own=read(['--palettewide','1','--paperrgb','250,250,250']);
    assert.equal(own('palettewide'),'1');assert.equal(own('paperrgb'),'250,250,250');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('source extraction stays opt-in when no line file is given', () => {
  const { argv } = expandRecipe({ argv: [] });
  assert.equal(argv[argv.lastIndexOf('--sourcelines') + 1], '0');
  assert.equal(argv[argv.lastIndexOf('--linesource') + 1], 'none');
  const explicit = expandRecipe({ argv: ['--linesource', 'source-ink'] }).argv;
  assert.equal(explicit[explicit.lastIndexOf('--linesource') + 1], 'source-ink');
});

// The full held-out Guardi run exposed heavy isolated accents with automatic final darks.
test('final darks require an explicit choice and command-line choices win', () => {
  const value = args => {const {argv} = expandRecipe({argv: args}); return argv[argv.lastIndexOf('--finaldarks') + 1];};
  assert.equal(value([]), '0');
  assert.equal(value(['--finaldarks', '1']), '1');
});

// The general recipe lost connected dark masses on Hills in the release comparison.
test('combined defaults use general washes and v096 retains fitted settings', () => {
  const flags = args => expandRecipe({argv: args}).argv;
  const base = flags(['--recipe','v096']), general = flags([]);
  for (const flag of ['--darkgain','--coolgain','--skylanes','--shadowraw']) assert.ok(base.includes(flag), flag);
  for (const flag of ['--huechroma','--passcap','--maskmm','--lightfamilies','--palelights']) {
    assert.ok(!base.includes(flag), flag); assert.ok(general.includes(flag), flag);
  }
});

test('the default recipe carries the technique rules: seams on colour edges, small marks, joined washes, no blot charge', () => {
  const { argv } = expandRecipe({ argv: [] });
  const value = name => argv[argv.lastIndexOf(name) + 1];
  assert.equal(value('--subjectseam'), '0.5');
  assert.equal(value('--smallmarks'), '1');
  assert.equal(value('--washjoin'), '1');
  assert.equal(value('--undercover'), '0');
});
