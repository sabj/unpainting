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

test('v096 keeps the old tuned flags on every subject and applies no preset by subject id', () => {
  const v096 = expandRecipe({ argv: ['--recipe', 'v096'] }).argv;
  for (const flag of ['--darkgain', '--stoneblocks', '--skylanes', '--shadowraw']) assert.ok(v096.includes(flag), flag);
  const y1 = expandRecipe({ argv: ['--recipe', 'v096', '--valueplan', 'examples/plans/trumbull-values.json'] });
  assert.match(y1.note, /recipe v096, presets architecture, glaze-gains,/);
  assert.ok(!y1.argv.includes('--trumbullrules'));
});

test("a plan's washes.paints sets the box unless --paints is given", () => {
  const plan = ['--valueplan', 'examples/plans/trumbull-values.json'];
  const box = expandRecipe({ argv: plan }).argv;
  assert.equal(box[box.lastIndexOf('--paints') + 1], 'ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen');
  const own = expandRecipe({ argv: [...plan, '--paints', 'ochre'] }).argv;
  assert.equal(own[own.lastIndexOf('--paints') + 1], 'ochre');
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

test('a plan sheet section sets --sheetmm, --seed and --targetguard defaults and checks --sheetmm', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-recipe-'));
  try {
    const file = path.join(dir, 'plan.json');
    fs.writeFileSync(file, JSON.stringify({ subject: 'mittens', sheet: { widthMm: 152.4, seed: 0, targetGuard: 'strict' } }));
    const { argv } = expandRecipe({ argv: ['--valueplan', file] });
    const value = name => argv[argv.lastIndexOf(name) + 1];
    assert.equal(value('--sheetmm'), '152.4');
    assert.equal(value('--seed'), '0');
    assert.equal(value('--targetguard'), 'strict');
    const override = expandRecipe({ argv: ['--valueplan', file, '--sheetmm', '152.4', '--seed', '3', '--targetguard', 'gentle'] }).argv;
    const overVal = name => override[override.lastIndexOf(name) + 1];
    assert.equal(overVal('--sheetmm'), '152.4');
    assert.equal(overVal('--seed'), '3');
    assert.equal(overVal('--targetguard'), 'gentle');
    assert.throws(() => expandRecipe({ argv: ['--valueplan', file, '--sheetmm', '200'] }), /sheet\.widthMm 152\.4 does not match --sheetmm 200/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the default recipe carries the technique rules: seams on colour edges, small marks, joined washes, no blot charge', () => {
  const { argv } = expandRecipe({ argv: [] });
  const value = name => argv[argv.lastIndexOf(name) + 1];
  assert.equal(value('--subjectseam'), '0.5');
  assert.equal(value('--smallmarks'), '1');
  assert.equal(value('--smallmarklights'), '0', 'no small reserved lights: they read as speckle in dark coats');
  assert.equal(value('--washjoin'), '1');
  assert.equal(value('--undercover'), '0');
});
