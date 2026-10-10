import assert from 'node:assert/strict';
import {semanticFilmRemovalReady} from './semantic-areas.mjs';
const film=deps=>({lights:{mode:'film',actions:{afterPasses:deps}}});
const plan={doc:{areas:[{passes:[film(['surround/base']),film(['surround/base','surround/dark'])]}]}};
assert.equal(semanticFilmRemovalReady(plan,new Set()),false);
assert.equal(semanticFilmRemovalReady(plan,new Set(['surround/base'])),false);
assert.equal(semanticFilmRemovalReady(plan,new Set(['surround/base','surround/dark'])),true);
assert.equal(semanticFilmRemovalReady({doc:{areas:[{passes:[{lights:{mode:'paint-owned'}}]}]}},new Set()),false);
console.log('PASS 4 semantic physical-film prerequisite checks; native dry gate remains executor admission');
