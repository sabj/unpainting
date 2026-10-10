#!/usr/bin/env node
// Static check for hill-climb patterns: the painter may plan from the reference, but may not fit strokes to it.
//
//   node tools/guard/lint-target-use.mjs [--json] [--allow tools/guard/target-use-allow.json] [paths...]
//
// Categories:
//   b  per-stroke or per-cell colour fitted to target pixels
//   c  residual or error driven: lay more where the sheet lacks the target's per-cell plan, keep-if-closer loops
//   review  a lowest-error fit: allowed for palette or mix choice from box pigments, never for marks
//   d  target pixels read during the paint step (tools/paint-plate.mjs, from the line that calls TARGET_GUARD.beginPaint()
//      to phaseMark('painting'), the same span the runtime guard closes)
// Findings without an allow entry fail the check. Each entry requires a reason and reviewer.
// It reads source text, so it also flags code that the runtime guard already refuses or that no default run reaches.
// Use it as a review aid next to the runtime guard, not in place of it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RULES = [
  { id: 'plan-minus-sheet', cat: 'c', re: /\b(AL|AA|PL|A|plan)\s*\[[^\]]+\]\s*-\s*(LEDGER|ONSHEET|led|sheet\w*|onsheet)\s*\[/,
    why: 'per-cell target plan minus what the sheet holds: lays paint where the painting is still short of the target' },
  { id: 'owed-residual', cat: 'c', re: /\b(owedAlong|owedFn)\s*\(|\.owed\s*\(|\bowed\s*\(\s*(AA|AL|A)\b/,
    why: 'residual helper: what the sheet still owes the target plan, per cell' },
  { id: 'feedback-charge', cat: 'c', re: /\black\s*\/\s*planned\b/,
    why: 'passage charge scaled by how far the sheet is from the target plan inside it' },
  { id: 'residual-field', cat: 'c', re: /\bfield\s*:\s*WANT\b|\bwantHere\b|detailMarks\(\s*WANT\b/,
    why: 'stroke paths or pressure steered by the per-cell residual against the target plan' },
  { id: 'render-correct-loop', cat: 'c', re: /\b(D0|target\w*|src\w*)\s*\[\s*i\s*\]\s*-\s*(DR|render\w*|R)\s*\[\s*i\s*\]/,
    why: 'render, compare with the target, correct: an optimisation loop against target pixels' },
  { id: 'keep-if-closer', cat: 'c', re: /\b(gain|improve\w*)\s*[<>]=?\s*(minGain|\w*min\w*)\b.*\b(err|dE|delta|loss)\w*|\b(err|dE|loss)\w*\s*<\s*best\w*.*\b(render|sheet|paint)/i,
    why: 'candidate kept only when its error against the target drops' },
  { id: 'keep-if-closer-de', cat: 'c', re: /\bafter\.(de|err)\b.*\bbefore\.(de|err)\b/,
    why: 'a touch kept only when it brings the sheet closer to the target colour' },
  { id: 'hill-climb-nudge', cat: 'c', re: /\b(s|score|next\w*)\.value\s*>\s*best\w*\.value\b/,
    why: 'random nudges kept when they score better against the target' },
  { id: 'fit-score-loop', cat: 'review', re: /\b(score|err)\s*<\s*best\.(score|err)\b/,
    why: 'a fit that keeps the lowest error: allowed for palette and mix choice from box pigments, not for marks' },
  { id: 'cell-colour-fit', cat: 'b', re: /\btarget\s*=\s*\[\s*r\s*,\s*g\s*,\s*b\s*\]|\berr\s*=\s*target\.reduce\(/,
    why: 'pigment shares grid-searched per cell against that cell\'s target RGB' },
];
// target reads inside the paint step of paint-plate.mjs
const PAINT_FILE = /tools[\\/]paint-plate\.mjs$/;
const PX_READ = /\bpx\s*\[|\brgb\s*:\s*px\b|[,{(]\s*px\s*[,})]/;

export function lintSource(file, text) {
  const out = [], lines = text.split('\n');
  let inPaint = false;
  const paintFile = PAINT_FILE.test(file);
  lines.forEach((line, k) => {
    if (paintFile && /^TARGET_GUARD\.beginPaint\(\)/.test(line)) inPaint = true;
    if (paintFile && /^phaseMark\('painting'\)/.test(line)) inPaint = false;
    const code = line.replace(/^\s*\/\/.*$/, '');
    if (!code.trim()) return;
    for (const r of RULES) if (r.re.test(code)) out.push(finding(file, k + 1, r.id, r.cat, r.why, code));
    if (inPaint && PX_READ.test(code) && !/TARGET_GUARD/.test(code)) out.push(finding(file, k + 1, 'target-at-paint', 'd', 'target pixels (px) read or handed on during the paint step', code));
  });
  return out;
}

function finding(file, line, rule, cat, why, code) {
  const snippet = code.trim().slice(0, 160);
  // the key survives line moves: file, rule and the normalised text of the line
  const key = crypto.createHash('sha1').update(`${file}|${rule}|${code.replace(/\s+/g, '')}`).digest('hex').slice(0, 12);
  return { file, line, rule, cat, why, snippet, key };
}

export function listSources(roots) {
  const files = [];
  const walk = p => {
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) {
      const base = path.basename(p);
      if (['node_modules', 'vendor', 'work', '.git', 'guard'].includes(base)) return;
      for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f));
    } else if (/\.(mjs|js)$/.test(p) && !/\.test\.mjs$/.test(p)) files.push(p);
  };
  roots.forEach(walk);
  return files;
}

export function lint({ roots, allow = [] }) {
  const allowed = new Set(allow.map(a => a.key));
  const all = listSources(roots).flatMap(f => lintSource(path.relative(process.cwd(), f), fs.readFileSync(f, 'utf8')));
  return { findings: all.filter(f => !allowed.has(f.key)), allowed: all.filter(f => allowed.has(f.key)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), json = a.includes('--json');
  const ai = a.indexOf('--allow'), allowFile = ai >= 0 ? a[ai + 1] : 'tools/guard/target-use-allow.json';
  const roots = a.filter((v, i) => !v.startsWith('--') && a[i - 1] !== '--allow');
  let allow = [];
  if (fs.existsSync(allowFile)) {
    allow = JSON.parse(fs.readFileSync(allowFile, 'utf8')).allow ?? [];
    const bad = allow.filter(e => !e.key || !e.reason || !e.approvedBy);
    if (bad.length) { console.error(`allow file: ${bad.length} entries lack key, reason or approvedBy`); process.exit(2); }
  }
  const { findings, allowed } = lint({ roots: roots.length ? roots : ['tools', 'src'], allow });
  if (json) console.log(JSON.stringify({ findings, allowed: allowed.length }, null, 1));
  else {
    for (const f of findings) console.log(`${f.file}:${f.line}  [${f.cat}] ${f.rule}  ${f.snippet}`);
    const by = findings.reduce((m, f) => ({ ...m, [f.cat]: (m[f.cat] || 0) + 1 }), {});
    console.log(`\n${findings.length} findings (${Object.entries(by).map(([c, k]) => `${c} ${k}`).join(', ')}), ${allowed.length} allowed`);
  }
  process.exit(findings.length ? 1 : 0);
}
