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
//   - every B plate passes the copy checks (copy-limits.mjs): absolute ceilings on the plate itself.
// Strokes and render seconds are reported as B's cost against A. A cost never accepts or refuses a change.
// Anything else is "not accepted", with the reasons. The look test alone never accepts a change: a copied target
// looks hand-painted. Nothing here reads a target image.
//
// --sheet also writes a blind contact sheet per pair (DIR/sheet-<name>/) for a person to answer.
// --no-vision makes no judge call: it runs the copy checks and writes the sheets.
//
// Scoring a painting against Auto (the benchmark's look score, not a decision about a painter change):
//
//   node bench/scripts/pair-judge.mjs versus-auto --manifest versus.json --out DIR [--python PY] [--repeats 2]
//                                                 [--seed 1] [--no-progression] [--no-tiles]
//
// versus.json: [{ "name": "mittens / opus", "auto": "/run/dir/auto-plate", "painting": "/run/dir/plate",
//                 "style": "watercolour over pencil" }]
// Each painting gets its win rate against the Auto painting of the same subject with a 95% interval
// (bench/scorer/versus.py), and beside it, never folded in: the progression check on the plate's own stage strip
// (bench/scorer/progression.py on stages/strip.jpg) and the plate's cheat-risk record. The judge route is
// JUDGE_ROUTE; JUDGE_ROUTE=local (judge J3) needs no key.
// An entry with "target": "/path/target.png" is also scored against the target picture itself, and so is its Auto:
// the ceiling, measured. Two questions are asked apart, subject and craft; 50% would be "cannot be told from the
// target". A model painting is then read as the share of Auto's gap to the target it closed.
// An entry with "source": "/path/source.png" is also compared with Auto as a whole sheet with the source shown
// (bench/scorer/whole.py, local route only): which is the more faithful painting of the source, and which looks
// more like a skilled hand-painted watercolour, two separate answers. Tiles cannot see a whole-picture fault such
// as a painting that is far too pale; this can. --no-tiles leaves the tile comparison out.
// An entry with "failed": true and no "painting" is a try that produced no painting: it is a loss on every tile,
// 0%, and is listed, not dropped.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scorePython } from './preflight.mjs';
import { copyLimits, copyLimitsLine, costChange } from './copy-limits.mjs';

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
    dir, painting, sheetMm, width, height, commit: card.codeSHA ?? null, subject: card.subject ?? null, strokes: risk.strokes, smallShare: risk.smallShare ?? null, seconds: card.seconds ?? null,
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

const strokeCell = c => `${c.cost.strokes} (${Math.round(100 * c.cost.sheetCover)}% of ${c.checks.strokes.limit})`;

export function table(pairs, pooled, decision) {
  const head = ['pair', 'held out', 'tiles for B', 'tiles for A', 'ties', 'p', 'look', 'copy A', 'copy B', 'strokes A', 'strokes B', 'render time B'];
  const rows = pairs.map(p => [p.name, p.heldOut ? 'yes' : 'no', p.look?.tilesB ?? '-', p.look?.tilesA ?? '-', p.look?.ties ?? '-', p.look?.p ?? '-',
    !p.look?.complete ? 'not judged' : p.look.winner ? `decided for ${p.look.winner.toUpperCase()}` : 'not decided', copyLimitsLine(p.copyA), copyLimitsLine(p.copyB), strokeCell(p.copyA), `${strokeCell(p.copyB)}, ${p.cost.strokes ?? '-'}x A`, p.cost.seconds == null ? '-' : `${p.cost.seconds}x A`]);
  if (pooled?.complete) rows.push(['all', '', pooled.tilesB, pooled.tilesA, pooled.ties, pooled.p, pooled.winner ? `decided for ${pooled.winner.toUpperCase()}` : 'not decided', '', '', '', '', '']);
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
    const copyA = copyLimits(a), copyB = copyLimits(b);
    pairs.push({ name: e.name, heldOut: e.heldOut === true, a, b, copyA, copyB, cost: costChange(copyA, copyB), look: python(py, args, run) });
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

export function parseVersusArgs(argv) {
  const o = { manifest: null, out: null, python: null, repeats: 2, seed: 1, progression: true, tiles: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--manifest') o.manifest = v(); else if (a === '--out') o.out = v(); else if (a === '--python') o.python = v();
    else if (a === '--repeats') o.repeats = Number(v()); else if (a === '--seed') o.seed = Number(v());
    else if (a === '--no-progression') o.progression = false; else if (a === '--no-tiles') o.tiles = false;
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.manifest || !o.out) throw new Error('usage: pair-judge.mjs versus-auto --manifest versus.json --out DIR [--python PY] [--repeats 2] [--seed 1] [--no-progression] [--no-tiles]');
  if (!Number.isInteger(o.repeats) || o.repeats < 1) throw new Error('--repeats must be a whole number, 1 or more');
  if (!Number.isInteger(o.seed)) throw new Error('--seed must be a whole number');
  return o;
}

/** The side indexes of one plate, as they are on disk: the cheat-risk record's own numbers. */
export function riskOf(dir, { readFile = f => fs.readFileSync(f, 'utf8') } = {}) {
  const r = JSON.parse(readFile(path.join(dir, 'cheat-risk.json')));
  if (typeof r.risk !== 'number') throw new Error(`${dir}: cheat-risk.json has no risk score`);
  return { risk: r.risk, level: r.level ?? null, review: r.review ?? null, parts: r.parts ?? null, flags: r.flags ?? [], hfCorr: r.hfCorr ?? null, strokes: r.strokes ?? null, smallShare: r.smallShare ?? null };
}

const pct = x => x == null ? '-' : `${Math.round(100 * x)}%`;
const FAILED = { complete: true, failed: true, winRate: 0, softWinRate: 0, interval: null, tiles: null, reading: 'failed: counted as a loss' };

/** Share of Auto's gap to the target that a painting closed (versus.py gap_closed): 0 no better than Auto, 1 level with the target. */
export const gapClosed = (painting, auto) => painting == null || auto == null || auto >= 0.5 ? null : Math.round(1000 * (painting - auto) / (0.5 - auto)) / 1000;

/** Against the target, per question: the win rate with ties, the graded rate, and the gap closed on each. */
export function targetTable(rows) {
  const qs = ['subject', 'craft'];
  const head = ['painting', ...qs.flatMap(q => [`${q}: tiles won / lost / tied`, `${q}: win rate (95% interval)`, `${q}: graded rate`, `${q}: gap to target closed`])];
  const cell = (r, q) => {
    const x = r.target?.[q];
    if (!x) return ['-', '-', '-', '-'];
    const rep = x.repeats?.[0];
    return [rep ? `${rep.wins} / ${rep.losses} / ${rep.ties}` : x.failed ? 'failed' : '-', x.complete ? `${pct(x.winRate)}${x.interval ? ` (${pct(x.interval[0])} to ${pct(x.interval[1])})` : ''}` : 'not judged',
      pct(x.softWinRate), r.auto ? 'Auto' : r.gap?.[q] == null ? '-' : pct(r.gap[q])];
  };
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.filter(r => r.target).map(r => '| ' + [r.name, ...qs.flatMap(q => cell(r, q))].join(' | ') + ' |')].join('\n');
}

/** Whole sheet with the source shown, per question: judges for Auto, for the painting, tied, and the painting's graded rate. */
export function wholeTable(rows) {
  const qs = ['faithful', 'skill'];
  const head = ['painting', ...qs.flatMap(q => [`${q}: judges for Auto / painting / tied`, `${q}: painting's rate (50% is level with Auto)`])];
  const cell = x => !x ? ['-', '-'] : x.failed ? ['failed', '0%'] : [`${x.forAuto} / ${x.forPainting} / ${x.ties}`, x.complete ? pct(x.painting) : 'not judged'];
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.filter(r => r.whole).map(r => '| ' + [r.name, ...qs.flatMap(q => cell(r.whole[q]))].join(' | ') + ' |')].join('\n');
}

export function versusTable(rows) {
  const head = ['painting', 'win rate against Auto', '95% interval', 'reading', 'tiles won / lost / tied', 'repeat gap', 'same tile verdict on repeat', 'judges agree', 'progression early / mean', 'cheat risk', 'detail match', 'strokes'];
  const prog = p => p == null ? 'not run' : p.earlyMean == null ? 'not judged' : `${p.earlyMean} / ${p.mean}`;
  const side = r => r.risk ? [prog(r.progression), `${r.risk.risk} (${r.risk.level ?? '-'})`, r.risk.hfCorr ?? '-', r.risk.strokes ?? '-'] : ['-', '-', '-', '-'];
  const tally = l => l.repeats?.[0] ? `${l.repeats[0].wins} / ${l.repeats[0].losses} / ${l.repeats[0].ties}` : l.tiles ?? '-';
  const out = rows.map(r => r.auto
    ? [r.name, 'Auto', '', '', '', '', '', '', ...side(r)]
    : !r.look ? [r.name, 'not run', '', '', '', '', '', '', ...side(r)]
    : [r.name, pct(r.look.winRate), r.look.interval ? `${pct(r.look.interval[0])} to ${pct(r.look.interval[1])}` : '-', r.look.complete ? r.look.reading : 'not judged', tally(r.look),
      r.look.repeatability?.measured ? `${Math.round(100 * r.look.repeatability.winRateRange)} points` : 'not measured', pct(r.look.repeatability?.tileAgreement),
      pct(r.look.judgeAgreement?.length ? r.look.judgeAgreement.reduce((s, a) => s + (a.mean ?? 0), 0) / r.look.judgeAgreement.length : null), ...side(r)]);
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...out.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
}

export function runVersusAuto(argv, { run = spawnSync, read = readRun, risk = riskOf, exists = fs.existsSync } = {}) {
  const o = parseVersusArgs(argv);
  const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('the manifest must be a list of paintings');
  fs.mkdirSync(o.out, { recursive: true });
  const py = scorePython(o.python, process.env);
  const script = (name, args, okExit = [0]) => {
    const r = run(py, [path.join(HERE, '..', 'scorer', name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3600000 });
    if (r.error) throw new Error(`${name} could not start (${py}): ${r.error.message}`);
    if (!okExit.includes(r.status)) throw new Error(`${name} failed (exit ${r.status}): ${(r.stderr || '').trim().slice(-600)}`);
    return JSON.parse(r.stdout);
  };
  const progression = (dir, style) => {
    if (!o.progression) return null;
    const strip = path.join(dir, 'stages', 'strip.jpg');
    if (!exists(strip)) throw new Error(`${dir}: no stages/strip.jpg for the progression check (pass --no-progression to leave it out)`);
    return script('progression.py', ['--sheet', strip, '--style', style]);
  };
  const rows = [], autos = new Map();
  const againstTarget = (target, run_, style, file) => {
    const t = script('versus.py', ['--target', target, '--image', run_.painting, '--style', style, '--plate-mm', String(run_.sheetMm), '--seed', String(o.seed), '--out', path.join(o.out, file)], [0, 3]);
    return t.questions;
  };
  for (const e of manifest) {
    const failed = e.failed === true;
    for (const k of ['name', 'auto', ...(failed ? [] : ['painting']), 'style']) if (!e[k] || typeof e[k] !== 'string') throw new Error(`painting ${e.name ?? '?'}: "${k}" is missing`);
    if (failed && e.painting) throw new Error(`painting ${e.name}: a failed try has no "painting"`);
    if (e.target != null && (typeof e.target !== 'string' || !exists(e.target))) throw new Error(`painting ${e.name}: no target at ${e.target}`);
    const a = read(e.auto), slug = e.name.replace(/[^\w.-]+/g, '-');
    if (!autos.has(e.auto)) {
      const row = { name: `${a.subject ?? path.basename(e.auto)} (Auto)`, auto: true, dir: e.auto, risk: risk(e.auto), progression: progression(e.auto, e.style) };
      autos.set(e.auto, row);
      rows.push(row);
    }
    const autoRow = autos.get(e.auto);
    if (e.target && !autoRow.target) autoRow.target = againstTarget(e.target, a, e.style, `${slug}--auto-target.json`);
    const gap = t => e.target ? Object.fromEntries(Object.keys(autoRow.target).map(q => [q, gapClosed(t[q].softWinRate ?? t[q].winRate, autoRow.target[q].softWinRate ?? autoRow.target[q].winRate)])) : undefined;
    if (e.source != null && (typeof e.source !== 'string' || !exists(e.source))) throw new Error(`painting ${e.name}: no source at ${e.source}`);
    if (failed) {
      const target = e.target ? Object.fromEntries(Object.keys(autoRow.target).map(q => [q, FAILED])) : undefined;
      const lost = { complete: true, failed: true, painting: 0 };
      rows.push({ name: e.name, auto: false, dir: null, autoDir: e.auto, look: FAILED, risk: null, progression: null, ...(target ? { target, gap: gap(target) } : {}), ...(e.source ? { whole: { faithful: lost, skill: lost } } : {}) });
      continue;
    }
    const b = read(e.painting);
    checkPair({ name: e.name, a: e.auto, b: e.painting, style: e.style }, a, b);
    const full = !o.tiles ? null : script('versus.py', ['--auto', a.painting, '--image', b.painting, '--style', e.style, '--plate-mm', String(a.sheetMm), '--repeats', String(o.repeats), '--seed', String(o.seed), '--out', path.join(o.out, `${slug}.json`)], [0, 3]);
    const target = e.target ? againstTarget(e.target, b, e.style, `${slug}--target.json`) : undefined;
    const whole = e.source ? script('whole.py', ['--source', e.source, '--auto', a.painting, '--image', b.painting, '--style', e.style, '--out', path.join(o.out, `${slug}--whole.json`)], [0, 3]).questions : undefined;
    rows.push({ name: e.name, auto: false, dir: e.painting, autoDir: e.auto, look: full, risk: risk(e.painting), progression: progression(e.painting, e.style), ...(target ? { target, gap: gap(target) } : {}), ...(whole ? { whole } : {}) });
  }
  const withTarget = rows.some(r => r.target);
  const withWhole = rows.some(r => r.whole);
  const md = versusTable(rows) + (withWhole ? `\n\n## Whole sheet against Auto, with the source shown\n\n${wholeTable(rows)}` : '') + (withTarget ? `\n\n## Against the target\n\n50% would be a painting that cannot be told from its target. The graded rate keeps moving when every tile is lost. Gap closed is from the graded rate.\n\n${targetTable(rows)}` : '');
  fs.writeFileSync(path.join(o.out, 'versus.json'), JSON.stringify({ version: 'versus-auto-v1', repeats: o.repeats, seed: o.seed, rows }, null, 1));
  fs.writeFileSync(path.join(o.out, 'versus.md'), `# Win rate against Auto\n\n${md}\n`);
  return { rows, md, complete: rows.every(r => (r.auto || !r.look || r.look.complete) && (!r.whole || Object.values(r.whole).every(q => q.complete)) && (!r.target || Object.values(r.target).every(q => q.complete))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'versus-auto') {
      const v = runVersusAuto(process.argv.slice(3));
      console.log(v.md);
      process.exit(v.complete ? 0 : 3);
    }
    const r = runPairJudge(process.argv.slice(2));
    console.log(r.md);
    process.exit(r.decision.accept ? 0 : 1);
  } catch (e) { console.error(e.message); process.exit(2); }
}
