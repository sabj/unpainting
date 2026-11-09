#!/usr/bin/env node
// Static scan for code that could tell one benchmark subject from another: a subject name, a target hash, or a
// branch on an image or sheet size. Comments are ignored. Hits must be listed in tools/guard/subject-scan-allow.json
// with a reason; a new hit or a stale entry fails src/paint/overfit-scan.test.mjs.
//
//   node tools/guard/subject-scan.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Names that only mean a benchmark subject.
const DISTINCT = 'trumbull|mittens|h3[46]-?a|overlook|flatiron';
// Names that are also plain words or short ids: matched only as a quoted whole string, or with a subject-x prefix.
const QUOTED = 'hills|south-france|sargent|Yale|SF|Cape|Jones|[YG][1-4]|subject-[a-e]';
const SIZE_VAR = '(?:w|h|W|H|width|height|sheetmm|sheetWidthMm|sheetw)';
export const RULES = [
  { id: 'name', re: [new RegExp(`\\b(?:${DISTINCT})\\b`, 'i'), new RegExp(`(['"\`])(?:${QUOTED})\\1|['"\`]subject-[a-e][.\\-_/]`)],
    why: 'names a benchmark subject' },
  { id: 'hash', re: [/['"`][0-9a-f]{16,64}['"`]/i], why: 'holds a hash that can identify a target or fixture' },
  { id: 'size', re: [new RegExp(`\\b${SIZE_VAR}\\s*[=!]==?\\s*\\d{3,4}\\b|\\b\\d{3,4}\\s*[=!]==?\\s*${SIZE_VAR}\\b`)],
    why: 'branches on an image or sheet size' },
];

// Source with comments blanked out, line breaks kept. Quotes and template literals are tracked so '//' inside a string
// survives. A regex literal holding a quote can confuse it; a flagged line is reviewed by hand.
export function stripComments(text) {
  let out = '', i = 0, quote = null;
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      i++;
    } else if (c === '/' && d === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') out += '\n'; i++; }
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** Hits in one source text: [{line, rule, snippet}]. One hit per rule per line. */
export function scanSource(text) {
  const hits = [];
  stripComments(text).split('\n').forEach((line, k) => {
    for (const r of RULES) if (r.re.some(re => re.test(line))) hits.push({ line: k + 1, rule: r.id, snippet: line.trim().slice(0, 160) });
  });
  return hits;
}

const SKIP_DIR = /(^|\/)(node_modules|fixtures|\.git)(\/|$)/;
const ROOTS = ['src', 'tools/paint-plate.mjs', 'tools/speed', 'tools/painter', 'tools/guard', 'bench/scripts', 'bench/v4v5'];
// The scan itself and tests name subjects on purpose.
const SKIP_FILE = f => /\.test\.mjs$/.test(f) || f === 'tools/guard/subject-scan.mjs';

function files(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full) || SKIP_DIR.test(rel)) return [];
  if (fs.statSync(full).isFile()) return /\.mjs$/.test(rel) && !SKIP_FILE(rel) ? [rel] : [];
  return fs.readdirSync(full).sort().flatMap(n => files(root, path.join(rel, n)));
}

/** Every hit in the painting and harness code: [{file, line, rule, snippet}]. */
export function scanRepo(root) {
  return ROOTS.flatMap(r => files(root, r)).flatMap(file =>
    scanSource(fs.readFileSync(path.join(root, file), 'utf8')).map(h => ({ file, ...h })));
}

export function loadAllow(root) {
  const p = path.join(root, 'tools/guard/subject-scan-allow.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).allow : [];
}

/** Hits beyond each entry's count are unlisted; entries with no matching hit are stale. */
export function compareToAllow(hits, allow) {
  const seen = new Map();
  for (const h of hits) { const k = `${h.file}\0${h.rule}`; seen.set(k, [...(seen.get(k) ?? []), h]); }
  const unlisted = [], used = new Set();
  for (const [k, list] of seen) {
    const [file, rule] = k.split('\0');
    const entry = allow.find(e => e.file === file && e.rule === rule);
    if (entry) used.add(entry);
    unlisted.push(...list.slice(entry?.count ?? 0));
  }
  const stale = allow.filter(e => !used.has(e) || (seen.get(`${e.file}\0${e.rule}`)?.length ?? 0) < e.count);
  return { unlisted, stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const hits = scanRepo(root);
  const { unlisted, stale } = compareToAllow(hits, loadAllow(root));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ hits, unlisted, stale }, null, 1));
  else {
    for (const h of hits) console.log(`${h.file}:${h.line}  [${h.rule}] ${h.snippet}`);
    console.log(`${hits.length} hits, ${unlisted.length} unlisted, ${stale.length} stale allow entries`);
  }
  process.exit(unlisted.length || stale.length ? 1 : 0);
}
