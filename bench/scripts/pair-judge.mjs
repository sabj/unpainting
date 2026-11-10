#!/usr/bin/env node
// Decide a painting change: blind full-size pairs for the look, plus the copy checks. Plate A is the painter as it
// is, plate B the same subject and plan painted by the change.
//
//   node bench/scripts/pair-judge.mjs --manifest pairs.json --out DIR [--python PY] [--calls 2] [--seed 1]
//                                     [--sheet] [--no-vision]
//
// pairs.json: [{ "name": "dog-paint", "a": "/run/dir/before", "b": "/run/dir/after",
//                "style": "pure watercolor, no ink", "heldOut": true }]
// A run dir is a paint-plate output: painting.png, run-card.json, cheat-risk.json, target-guard.json.
//
// The change is accepted on its look only when all of these hold:
//   - every pair was judged completely, and at least one pair is a held-out subject;
//   - over all tiles of all pairs the judges prefer B (exact sign test, bench/scorer/pairs.py);
//   - no single plate is decided for A;
//   - every B plate passes the copy checks (copy-limits.mjs).
// Anything else is "not accepted", with the reasons. The look test alone never accepts a change: a copied target
// looks hand-painted. Nothing here reads a target image.
//
// --sheet also writes a blind contact sheet per pair (DIR/sheet-<name>/) for a person to answer.
// --no-vision makes no judge call: it runs the copy checks and writes the sheets.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scorePython } from './preflight.mjs';
import { copyLimits, copyLimitsLine } from './copy-limits.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAIRS_PY = path.join(HERE, '..', 'scorer', 'pairs.py');

export function parseArgs(argv) {
  const o = { manifest: null, out: null, python: null, calls: 2, seed: 1, sheet: false, vision: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--manifest') o.manifest = v(); else if (a === '--out') o.out = v(); else if (a === '--python') o.python = v();
    else if (a === '--calls') o.calls = Number(v()); else if (a === '--seed') o.seed = Number(v());
    else if (a === '--sheet') o.sheet = true; else if (a === '--no-vision') o.vision = false;
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.manifest || !o.out) throw new Error('usage: pair-judge.mjs --manifest pairs.json --out DIR [--python PY] [--calls 2] [--seed 1] [--sheet] [--no-vision]');
  if (!Number.isInteger(o.calls) || o.calls < 2 || o.calls % 2) throw new Error('--calls must be an even number, 2 or more');
  if (!Number.isInteger(o.seed)) throw new Error('--seed must be a whole number');
  return o;
}

/** What the pair test needs from one run directory. Every missing record is an error. */
export function readRun(dir, { exists = fs.existsSync, readFile = f => fs.readFileSync(f, 'utf8') } = {}) {
  const json = name => {
    const f = path.join(dir, name);
    if (!exists(f)) throw new Error(`${dir}: no ${name}`);
    return JSON.parse(readFile(f));
  };
  const painting = path.join(dir, 'painting.png');
  if (!exists(painting)) throw new Error(`${dir}: no painting.png`);
  const card = json('run-card.json'), risk = json('cheat-risk.json'), guard = json('target-guard.json');
  const sheetMm = card.provenance?.geometry?.sheetMm, width = card.dimensions?.paintWidth, height = card.dimensions?.paintHeight;
  if (!(sheetMm > 0) || !(width > 0) || !(height > 0)) throw new Error(`${dir}: run-card.json has no sheet width or painting size`);
  return {
    dir, painting, sheetMm, width, height, commit: card.codeSHA ?? null, subject: card.subject ?? null, strokes: risk.strokes ?? null,
    hfCorr: risk.hfCorr, hfCeiling: risk.hfCeiling, guard: { guarded: guard.mode !== 'off', violations: guard.violations }, looks: guard.looks?.count,
  };
}

/** Both plates must show the same sheet at the same size, or the tiles do not line up. */
export function checkPair(entry, a, b) {
  for (const k of ['name', 'a', 'b', 'style']) if (!entry[k] || typeof entry[k] !== 'string') throw new Error(`pair ${entry.name ?? '?'}: "${k}" is missing`);
  if (a.width !== b.width || a.height !== b.height) throw new Error(`pair ${entry.name}: paintings differ in size (${a.width}x${a.height} and ${b.width}x${b.height})`);
  if (a.sheetMm !== b.sheetMm) throw new Error(`pair ${entry.name}: sheets differ in width (${a.sheetMm} mm and ${b.sheetMm} mm)`);
}

/** The decision, from per-pair results [{ name, heldOut, look, copyA, copyB }] and the pooled look verdict. */
export function decide(pairs, pooled) {
  const reasons = [];
  if (!pairs.length) reasons.push('no pairs');
  if (!pairs.some(p => p.heldOut)) reasons.push('no held-out subject in the set');
  for (const p of pairs) if (!p.copyB.pass) reasons.push(`${p.name}: B fails the copy checks (${copyLimitsLine(p.copyB)})`);
  const incomplete = pairs.filter(p => !p.look?.complete).map(p => p.name);
  if (incomplete.length || !pooled?.complete) reasons.push(`look not judged completely${incomplete.length ? ': ' + incomplete.join(', ') : ''}`);
  else {
    if (pooled.winner !== 'b') reasons.push(pooled.winner === 'a' ? `judges prefer A (${pooled.tilesA} tiles to ${pooled.tilesB}, p ${pooled.p})` : `no decided preference (${pooled.tilesB} tiles for B, ${pooled.tilesA} for A, p ${pooled.p})`);
    for (const p of pairs) if (p.look.winner === 'a') reasons.push(`${p.name}: decided for A (${p.look.tilesA} tiles to ${p.look.tilesB})`);
  }
  return { accept: reasons.length === 0, reasons };
}

function python(py, args, run) {
  const r = run(py, [PAIRS_PY, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3600000 });
  if (r.error) throw new Error(`pairs.py could not start (${py}): ${r.error.message}`);
  // exit 3 is an incomplete judgement: the result is still printed, and decide() reports it
  if (r.status !== 0 && r.status !== 3) throw new Error(`pairs.py failed (exit ${r.status}): ${(r.stderr || '').trim().slice(-600)}`);
  return JSON.parse(r.stdout);
}

export function table(pairs, pooled, decision) {
  const head = ['pair', 'held out', 'tiles for B', 'tiles for A', 'ties', 'p', 'look', 'copy A', 'copy B', 'strokes A', 'strokes B'];
  const rows = pairs.map(p => [p.name, p.heldOut ? 'yes' : 'no', p.look?.tilesB ?? '-', p.look?.tilesA ?? '-', p.look?.ties ?? '-', p.look?.p ?? '-',
    !p.look?.complete ? 'not judged' : p.look.winner ? `decided for ${p.look.winner.toUpperCase()}` : 'not decided', copyLimitsLine(p.copyA), copyLimitsLine(p.copyB), p.a.strokes ?? '-', p.b.strokes ?? '-']);
  if (pooled?.complete) rows.push(['all', '', pooled.tilesB, pooled.tilesA, pooled.ties, pooled.p, pooled.winner ? `decided for ${pooled.winner.toUpperCase()}` : 'not decided', '', '', '', '']);
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |'), '',
    decision.accept ? 'ACCEPTED on look and copy checks.' : `NOT ACCEPTED: ${decision.reasons.join('; ')}.`].join('\n');
}

export function runPairJudge(argv, { run = spawnSync, read = readRun, env = process.env } = {}) {
  const o = parseArgs(argv);
  const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));
  if (!Array.isArray(manifest)) throw new Error('the manifest must be a list of pairs');
  fs.mkdirSync(o.out, { recursive: true });
  const py = scorePython(o.python, env), pairs = [];
  for (const e of manifest) {
    const a = read(e.a), b = read(e.b);
    checkPair(e, a, b);
    const slug = e.name.replace(/[^\w.-]+/g, '-');
    const args = ['--a', a.painting, '--b', b.painting, '--style', e.style, '--plate-mm', String(a.sheetMm), '--calls', String(o.calls), '--seed', String(o.seed), '--out', path.join(o.out, `${slug}.json`)];
    if (!o.vision) args.push('--no-vision');
    if (o.sheet) args.push('--sheet', path.join(o.out, `sheet-${slug}`));
    pairs.push({ name: e.name, heldOut: e.heldOut === true, a, b, copyA: copyLimits(a), copyB: copyLimits(b), look: python(py, args, run) });
  }
  const files = pairs.map(p => path.join(o.out, `${p.name.replace(/[^\w.-]+/g, '-')}.json`));
  const pooled = o.vision && pairs.length ? python(py, ['--pool', ...files], run) : null;
  const decision = decide(pairs, pooled);
  const brief = pairs.map(({ look, ...p }) => ({ ...p, look: look && { complete: look.complete, tilesA: look.tilesA, tilesB: look.tilesB, ties: look.ties, p: look.p, decided: look.decided, winner: look.winner, errors: look.errors } }));
  fs.writeFileSync(path.join(o.out, 'verdict.json'), JSON.stringify({ version: 'pair-judge-v1', calls: o.calls, seed: o.seed, pairs: brief, pooled, decision }, null, 1));
  const md = table(pairs, pooled, decision);
  fs.writeFileSync(path.join(o.out, 'verdict.md'), `# Pair verdict\n\n${md}\n`);
  return { pairs, pooled, decision, md };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = runPairJudge(process.argv.slice(2));
    console.log(r.md);
    process.exit(r.decision.accept ? 0 : 1);
  } catch (e) { console.error(e.message); process.exit(2); }
}
