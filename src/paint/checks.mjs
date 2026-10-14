// Mid-painting checks: continue or stop.
//
// A painting is never thrown away because one stroke or pass fails a physical or plan check. check() records the
// failure, logs one line and lets the caller carry on (with its own fallback in onFail). Under --strict 1 the same call
// throws, which restores the old stops for development. Bug guards (non-finite numbers, GPU limits, bad plans) do not
// go through here; they stay hard errors.
//
// Every continued check is counted. writeContinuedChecks(dir) writes continued-checks.json next to the painting and
// logs one closing line, so a painting that only finished thanks to these fallbacks stays visible.
import fs from 'node:fs';
import path from 'node:path';

export const CONTINUED_FILE = 'continued-checks.json';
const EXAMPLES = 5;
let strict = false;
let checks = new Map();

/** Turn the old stops back on (--strict 1, or its older alias --wetgate 1). */
export function setStrict(on) { strict = !!on; }
export function strictChecks() { return strict; }

/** Forget every recorded check and leave strict mode (tests). */
export function resetChecks() { strict = false; checks = new Map(); }

/**
 * `ok` true: nothing happens, returns true. `ok` false: under strict throws Error(`${name} ${details}`); otherwise counts
 * the event under `name`, logs `continued past <name> <details>`, calls onFail(details) and returns false.
 */
export function check(name, ok, details = {}, { onFail = null } = {}) {
  if (ok) return true;
  if (typeof name !== 'string' || !name) throw new TypeError('check needs a name');
  const text = describe(details);
  if (strict) throw new Error(text ? `${name} ${text}` : name);
  const prior = checks.get(name) ?? { count: 0, examples: [] };
  checks = new Map(checks).set(name, { count: prior.count + 1, examples: prior.examples.length < EXAMPLES ? [...prior.examples, details] : prior.examples });
  console.log(`continued past ${name}${text ? ' ' + text : ''}`);
  if (onFail) onFail(details);
  return false;
}

function describe(details) {
  if (details === undefined || details === null) return '';
  if (typeof details === 'string') return details;
  try { return JSON.stringify(details); } catch { return String(details); }
}

/** { strict, total, checks: { name: { count, examples } } }, names in first-seen order. */
export function continuedSummary() {
  const out = {};
  let total = 0;
  for (const [name, v] of checks) { out[name] = { count: v.count, examples: v.examples }; total += v.count; }
  return { strict, total, checks: out };
}

/** The closing log line: `continued past N checks: name xC, ...`. */
export function continuedLine(summary = continuedSummary()) {
  const parts = Object.entries(summary.checks).map(([name, v]) => `${name} x${v.count}`);
  return `continued past ${summary.total} checks${parts.length ? ': ' + parts.join(', ') : ''}`;
}

/** Write continued-checks.json into `dir`, log the closing line, and return the summary. */
export function writeContinuedChecks(dir) {
  const summary = continuedSummary();
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, CONTINUED_FILE), JSON.stringify(summary, null, 1) + '\n'); }
  catch (e) { console.error(`continued checks not written to ${dir}: ${e.message}`); }
  console.log(continuedLine(summary));
  return summary;
}
