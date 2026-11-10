// No new default-off flags (CONTRIBUTING.md): a change is proven and becomes the behaviour, or it stays on a branch.
//
// The painter reads its options where it uses them: num('name', default) and opt('name', default) in
// tools/paint-plate.mjs, tools/plate and the src/paint and src/crop modules they call. This file finds those reads.
// option-ledger.json lists the option names that existed when the rule was made. option-ledger.test.mjs fails when a
// name outside that list is off unless typed, and when the list names an option nothing reads any more.
import fs from 'node:fs';
import path from 'node:path';

/** Where painter options are read, relative to the repository root. */
export const OPTION_ROOTS = Object.freeze(['tools/paint-plate.mjs', 'tools/plate', 'src/paint', 'src/crop']);

const READ = /\b(?:num|opt)\(\s*'([a-z][a-z0-9]*)'\s*(,\s*)?/g;
const LITERAL = /^(?:(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)|'([^'\\]*)'|"([^"\\]*)"|(true|false|null|undefined))\s*\)/;
// What a setting that is off unless typed looks like: no default at all, zero, an empty or negative word.
const OFF_WORDS = new Set(['', '0', 'off', 'none', 'no', 'false', 'null', 'undefined']);

/** Every option read in one source text: [{ name, default }] where default is { kind: 'none' | 'literal' | 'computed', value? }. */
export function optionReads(source) {
  const out = [];
  for (const m of source.matchAll(READ)) {
    const rest = source.slice(m.index + m[0].length, m.index + m[0].length + 200);
    if (!m[2]) { if (/^\)/.test(rest)) out.push({ name: m[1], default: { kind: 'none' } }); continue; }
    const lit = LITERAL.exec(rest);
    out.push({ name: m[1], default: lit ? { kind: 'literal', value: lit[1] ?? lit[2] ?? lit[3] ?? lit[4] } : { kind: 'computed' } });
  }
  return out;
}

/** True when a read leaves the option off unless it is typed. A computed default cannot be judged and counts as off. */
export function isOffByDefault(read) {
  if (read.default.kind !== 'literal') return true;
  const v = String(read.default.value).trim().toLowerCase();
  return OFF_WORDS.has(v) || Number(v) === 0;
}

function sourceFiles(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [rel];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(e => {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) return sourceFiles(root, child);
    return /\.mjs$/.test(e.name) && !/\.test\.mjs$/.test(e.name) ? [child] : [];
  });
}

/** Every painter option in the repository: Map(name -> [{ file, default }]). */
export function scanOptions(root, roots = OPTION_ROOTS) {
  const found = new Map();
  for (const file of roots.flatMap(r => sourceFiles(root, r)).sort()) {
    for (const read of optionReads(fs.readFileSync(path.join(root, file), 'utf8'))) {
      if (!found.has(read.name)) found.set(read.name, []);
      found.get(read.name).push({ file: file.split(path.sep).join('/'), default: read.default });
    }
  }
  return found;
}

/**
 * Check the options found against the ledger of names that existed when the rule was made.
 * Returns { added: [{ name, file, why }], stale: [name] }; both empty when the rule holds.
 */
export function checkLedger(found, ledger) {
  const known = new Set(ledger), added = [], stale = ledger.filter(name => !found.has(name));
  for (const [name, reads] of found) {
    if (known.has(name)) continue;
    for (const read of reads) {
      if (!isOffByDefault(read)) continue;
      const why = read.default.kind === 'none' ? 'it has no default' : read.default.kind === 'computed' ? 'its default is computed, so the check cannot see that it is on' : `its default is ${JSON.stringify(read.default.value)}`;
      added.push({ name, file: read.file, why });
    }
  }
  return { added, stale };
}
