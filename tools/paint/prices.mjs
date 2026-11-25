// What a model's tokens cost at list prices, when its command reports tokens but no money (codex, agy, muse). The
// prices are bench/api-prices.json: USD per million tokens of fresh input, cached input and output, each with its
// source and date. A cost from here is always marked as estimated; a cost the command reports is never replaced.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../bench/api-prices.json', import.meta.url));
let table = null;
/** The price table, read once. */
export const priceTable = () => (table ??= JSON.parse(fs.readFileSync(FILE, 'utf8')));

/** The prices of a model id on a day ('YYYY-MM-DD'): {key, input, cached, output, thinkingAsOutput, source, note} or null. The id matches a key exactly, or less its effort. */
export function priceOf(id, day, prices = priceTable()) {
  if (!id) return null;
  const key = [id, String(id).replace(/-(low|medium|high|xhigh|max)$/, '')].find(k => prices.models[k]);
  if (!key) return null;
  const e = prices.models[key], now = e.after && day >= e.after.date ? { ...e, ...e.after } : e;
  return { key, input: now.input, cached: now.cachedInput ?? now.cacheRead ?? now.input / 10, output: now.output, thinkingAsOutput: Boolean(e.thinkingAsOutput), source: e.source, note: e.note ?? null, retrieved: prices.retrieved };
}

const usd = v => +v.toFixed(4);
/**
 * The model's cost for usage.json: {costUSD, costFrom, estimate}. What the command reported stands; else an estimate
 * from list prices: from the token split (fresh, cached, output, and thinking reported apart where the provider bills
 * it as output), else from input and output totals (all input priced fresh), else from the total alone (all priced as
 * fresh input), each said; null when the model has no price or no tokens.
 */
export function modelCost(author, day, prices = priceTable()) {
  if (author.costUSD != null) return { costUSD: author.costUSD, costFrom: 'reported by the command', estimate: null };
  const p = priceOf(author.id, day, prices), s = author.tokenSplit?.reported ? author.tokenSplit : null;
  const none = why => ({ costUSD: null, costFrom: `not reported by this command, and ${why}`, estimate: null });
  if (!p) return none(`no list price for ${author.id ?? 'this model'} in bench/api-prices.json`);
  const at = { model: p.key, perMillion: { input: p.input, cachedInput: p.cached, output: p.output }, source: p.source, retrieved: p.retrieved, day, ...(p.note ? { note: p.note } : {}) };
  let cost, from;
  if (s) {
    const out = (s.out ?? 0) + (p.thinkingAsOutput ? s.thinking ?? 0 : 0);
    cost = ((s.freshIn ?? 0) * p.input + (s.cachedIn ?? 0) * p.cached + out * p.output) / 1e6;
    from = `the token split (fresh input, cached input, output${p.thinkingAsOutput && s.thinking ? ', thinking billed as output' : ''})`;
  } else if (author.tokensIn != null || author.tokensOut != null) {
    cost = ((author.tokensIn ?? 0) * p.input + (author.tokensOut ?? 0) * p.output) / 1e6;
    from = 'input and output totals, no split reported: all input priced as fresh input';
  } else if (author.tokens) {
    cost = author.tokens * p.input / 1e6;
    from = 'the total tokens alone, no split reported: all priced as fresh input (a working session\'s tokens are mostly input; cached input would cost less, output more)';
  } else return none('it reported no tokens');
  return { costUSD: usd(cost), costFrom: 'estimated from list prices', estimate: { ...at, from } };
}
