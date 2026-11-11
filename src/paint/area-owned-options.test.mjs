// Move 12: with an area plan, the order of work and the wet sessions come from the plan alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_OWNED_OPTIONS, refuseAreaOwned } from './area-owned-options.mjs';
import { painterSource } from '../../tools/plate/source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('an order or session option beside an area plan stops the run, naming the plan field', () => {
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--darkfirst', '1']), /--darkfirst: .*pass\.order/);
  assert.throws(() => refuseAreaOwned(['--washsession', '2', '--areaplan', 'p.json']), /--washsession: .*pass\.session/);
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--order', 'legacy-painter']), /--order legacy-painter/);
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--subjectorder', '.5', '--charge', '1']), /--subjectorder.*--charge/s);
});

test('the same options stay for value plans and runs with no plan; --order painter is the default and allowed', () => {
  assert.doesNotThrow(() => refuseAreaOwned(['--valueplan', 'c.json', '--darkfirst', '1', '--washsession', '2', '--order', 'painter']));
  assert.doesNotThrow(() => refuseAreaOwned(['--order', 'legacy-painter', '--subjectorder', '1']));
  assert.doesNotThrow(() => refuseAreaOwned(['--areaplan', 'p.json', '--order', 'painter', '--width', '480']));
  assert.doesNotThrow(() => refuseAreaOwned(['--areaplan', '', '--darkfirst', '1']));
});

test('no recipe sets an option an area plan owns', () => {
  const recipes = fs.readFileSync(path.join(ROOT, 'src/paint/recipe.mjs'), 'utf8');
  for (const k of Object.keys(AREA_OWNED_OPTIONS)) assert.doesNotMatch(recipes, new RegExp(`--${k}\\b`), `a recipe sets --${k}`);
});

test('the automatic painter order never reorders or cuts the ladder under an area plan', () => {
  const SRC = painterSource();
  assert.match(SRC, /refuseAreaOwned\(argv\);/);
  assert.match(SRC, /if \(!VALUE_ENABLED && !ctx\.AREA_PLAN && \['painter','legacy-painter'\]\.includes\(ORDER\)\) \{/);
});

test('move 11: an automatic light rule beside an area plan stops the run, naming pass.lights', () => {
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--whitefloor', '.5']), /--whitefloor: .*pass\.lights/);
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--smalllights', 'frisket']), /--smalllights frisket: .*pass\.lights/);
  assert.throws(() => refuseAreaOwned(['--areaplan', 'p.json', '--white', 'gouache']), /--white gouache/);
  assert.doesNotThrow(() => refuseAreaOwned(['--areaplan', 'p.json', '--smalllights', '0', '--white', 'none']));
  assert.doesNotThrow(() => refuseAreaOwned(['--valueplan', 'c.json', '--whitefloor', '.5', '--smalllights', '1']));
});

test('move 11: no automatic hold of target-light cells under an area plan; the plan\'s reserves are the lights', () => {
  assert.match(painterSource(), /const WHITE_HOLD = \(\(\) => \{\n  if \(opt\('areaplan', ''\)\) return null;/);
});
