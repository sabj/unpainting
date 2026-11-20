import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecipe } from './recipe.mjs';

const flagNames = argv => argv.filter((_, i) => i % 2 === 0);
// the bundled Trumbull plan's drawing and paints, without its styleSelection (removed in 0.4)
const PLAN_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'recipe-plan-'));
const TRUMBULL = (await import('node:path')).join(PLAN_DIR, 'trumbull.json');
(await import('node:fs')).writeFileSync(TRUMBULL, JSON.stringify({ subject: 'trumbull', drawing: { medium: 'ink', inkColor: 'sepia', amount: 1, lines: 'all', weight: 1, closingLines: 1 }, washes: { paints: ['ochre', 'rawsienna', 'hansa', 'ultramarine', 'cerulean', 'sepia', 'sapgreen'] } }));

test('the default recipe names each flag once, as flag and value pairs', () => {
  const { argv, note } = expandRecipe({ argv: [] });
  assert.equal(note, 'recipe default');
  assert.equal(argv.length % 2, 0);
  const names = flagNames(argv);
  assert.ok(names.every(n => n.startsWith('--')));
  assert.equal(new Set(names).size, names.length);
});

test('v096 and presets are gone: naming either fails the run', () => {
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'v096'] }), /v096/);
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'default+architecture'] }), /presets were removed/);
  const y1 = expandRecipe({ argv: ['--valueplan', TRUMBULL] });
  assert.ok(!y1.argv.includes('--stoneblocks') && !y1.argv.includes('--recesses'));
});

test('a stored plan that selects a style (the light-to-dark plan) fails loudly and says how to replay it', () => {
  assert.throws(() => expandRecipe({ argv: ['--valueplan', 'examples/plans/trumbull-values.json'] }), /styleSelection was removed in 0.4.*tag v0.3.2/);
});

test("a plan's washes.paints sets the box unless --paints is given", () => {
  const plan = ['--valueplan', TRUMBULL];
  const box = expandRecipe({ argv: plan }).argv;
  assert.equal(box[box.lastIndexOf('--paints') + 1], 'ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen');
  const own = expandRecipe({ argv: [...plan, '--paints', 'ochre'] }).argv;
  assert.equal(own[own.lastIndexOf('--paints') + 1], 'ochre');
});

test('a none recipe adds no flags', () => {
  assert.deepEqual(expandRecipe({ argv: ['--recipe', 'none'] }).argv, ['--recipe', 'none']);
});

test('a plan drawing section comes after the recipe and before the command line, so typed flags win', () => {
  const plan = ['--valueplan', TRUMBULL];
  const { argv, note } = expandRecipe({ argv: [...plan, '--inkkscale', '2'] });
  assert.match(note, /drawing from the plan/);
  const value = name => argv[argv.lastIndexOf(name) + 1];
  assert.equal(value('--inkkscale'), '2');
  assert.equal(value('--outlinemedium'), 'ink');
  assert.ok(argv.indexOf('--outlinemedium') > argv.indexOf('--palettewide'));
});

test('the default recipe forces no drawing medium or ink weight', () => {
  const { argv } = expandRecipe({ argv: [] });
  for (const flag of ['--outlinemedium', '--inkkscale', '--inkk', '--openinglines', '--closinglines', '--closingedgemin', '--drawwidthgain']) assert.ok(!argv.includes(flag), flag);
});

test('no recipe names a line extraction option; one typed fails loudly as removed', async () => {
  const { refuseRemoved } = await import('./removed-options.mjs');
  for (const name of ['default', 'general', 'combined']) {
    const { argv } = expandRecipe({ argv: ['--recipe', name] });
    assert.ok(!argv.some(a => ['--linesource', '--sourcelines', '--copylines', '--linemodel', '--linework'].includes(a)), name);
  }
  assert.throws(() => refuseRemoved(['--linesource', 'source-ink']), /--linesource was removed in 0.4.*49447027/);
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'penwash'] }), /penwash recipe .* was removed in 0.4/);
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

test('the default recipe carries the technique rules: seams on colour edges, no blot charge', () => {
  const { argv } = expandRecipe({ argv: [] });
  const value = name => argv[argv.lastIndexOf(name) + 1];
  assert.equal(value('--subjectseam'), '0.5');
  assert.equal(value('--undercover'), '0');
});


test('experimental pigment properties and sheet-tone stages require an explicit request',()=>{
 const {argv}=expandRecipe({argv:[]});
 for(const key of ['pigphys','gran','flocblue','flocearth','flocyellow','tonestage','crosshatch']) assert.ok(!argv.includes('--'+key),key);
 const explicit=expandRecipe({argv:['--flocearth','.2','--crosshatch','1']}).argv;
 assert.equal(explicit[explicit.lastIndexOf('--flocearth')+1],'.2');
});

test('recipe none gives plan drawing precedence over template defaults', () => {
  const { argv } = expandRecipe({ argv: ['--recipe', 'none', '--valueplan', TRUMBULL, '--outlinemedium', 'graphite'] });
  assert.equal(argv[argv.lastIndexOf('--outlinemedium') + 1], 'ink');
});

test('recipe none: a plan naming a removed wash field fails loudly', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.join(PLAN_DIR, 'wash.json');
  fs.writeFileSync(file, JSON.stringify({ subject: 'test', washes: { colour: 'layered' } }));
  assert.throws(() => expandRecipe({ argv: ['--recipe', 'none', '--valueplan', file] }), /washes.colour was removed in 0.4/);
});
test('standalone flags do not shift scalar collapse, including negative values', () => {
  const { argv } = expandRecipe({ argv: ['--verbose', '--frames', '2', '--probe', '--offset', '-2', '--frames', '3', '--end'] });
  assert.equal(argv[argv.indexOf('--frames') + 1], '3');
  assert.equal(argv.filter(v => v === '--frames').length, 1);
  assert.deepEqual(argv.slice(-5), ['--verbose', '--probe', '--offset', '-2', '--end'].slice(-6));
});
test('unknown recipe names throw, including inherited object names', () => {
  for (const name of ['typo', 'toString']) assert.throws(() => expandRecipe({argv: ['--recipe', name]}), /unknown recipe/);
});
