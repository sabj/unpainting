import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { priceTable, priceOf, modelCost } from './prices.mjs';

const roster = JSON.parse(fs.readFileSync(new URL('../../bench/run-sets.json', import.meta.url), 'utf8')).roster.models;
const authors = JSON.parse(fs.readFileSync(new URL('./authors.json', import.meta.url), 'utf8')).authors;

test('every model of the roster has a list price with its source, and the table its date', () => {
  assert.match(priceTable().retrieved, /^\d{4}-\d{2}-\d{2}$/);
  for (const key of roster) {
    const a = authors.find(x => x.key === key), p = priceOf(a.id, '2026-11-24');
    assert.ok(p, `${key} (${a.id}) has a price`);
    assert.ok(p.input > 0 && p.cached > 0 && p.output > 0 && p.cached <= p.input, key);
    assert.ok(p.source, `${key} names its source`);
  }
});

test('the Gemini prices as given: Neon $3/$15; Carbon and Argon $2/$10 to 30 Nov, then $4/$20; cached a tenth of input', () => {
  assert.deepEqual(['input', 'cached', 'output'].map(k => priceOf('gemini-4-neon-medium', '2026-11-24')[k]), [3, 0.3, 15]);
  for (const id of ['gemini-4-carbon-medium', 'gemini-4-argon-high']) {
    assert.deepEqual(['input', 'cached', 'output'].map(k => priceOf(id, '2026-11-30')[k]), [2, 0.2, 10]);
    assert.deepEqual(['input', 'cached', 'output'].map(k => priceOf(id, '2026-12-01')[k]), [4, 0.4, 20]);
  }
  assert.equal(priceOf('no-such-model', '2026-11-24'), null);
});

test('a reported cost stands; else it is estimated from the split, the totals or the total, and says which', () => {
  assert.deepEqual(modelCost({ id: 'gpt-6.1-sol', costUSD: 1.5, tokens: 9 }, '2026-11-24'), { costUSD: 1.5, costFrom: 'reported by the command', estimate: null });
  // Terra: 1 M fresh at $1, 2 M cached at $0.05, 0.1 M out at $5
  const terra = modelCost({ id: 'gpt-6.1-terra', tokenSplit: { reported: true, freshIn: 1e6, cachedIn: 2e6, out: 1e5 } }, '2026-11-24');
  assert.equal(terra.costUSD, 1.6); assert.equal(terra.costFrom, 'estimated from list prices'); assert.match(terra.estimate.source, /openai/);
  // Gemini bills thinking, which agy reports apart from output, as output
  const neon = modelCost({ id: 'gemini-4-neon-medium', tokenSplit: { reported: true, freshIn: 0, cachedIn: 0, out: 1e5, thinking: 1e5 } }, '2026-11-24');
  assert.equal(neon.costUSD, 3); assert.match(neon.estimate.from, /thinking billed as output/);
  // Wonder Full with no split: from its total tokens, priced as fresh input, said so
  const wonder = modelCost({ id: 'muse-wonder-full-1.0', tokens: 500_000 }, '2026-11-24');
  assert.equal(wonder.costUSD, 2); assert.match(wonder.estimate.from, /total tokens alone/); assert.match(wonder.estimate.note, /no API price for Wonder Full/);
  assert.equal(modelCost({ id: 'gpt-6.1-sol', tokensIn: 1e6, tokensOut: 1e5 }, '2026-11-24').costUSD, 3);
  assert.equal(modelCost({ id: 'gpt-6.1-sol' }, '2026-11-24').costUSD, null);
});
