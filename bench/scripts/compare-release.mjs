#!/usr/bin/env node
// Generates one self-contained HTML page comparing releases: target, best prior painting, 0.1.1 repaint, 0.3.2 plate,
// full playback, scores, provenance from run records, and a browser-stored human vote per pair.
// Usage: node bench/scripts/compare-release.mjs --plates <dir>[,<dir>] --out comparison.html
//   [--runs bench/runs] [--expect 0.3.2=<sha|tag>] [--expect 0.1.1=<sha|tag>] [--releases 0.1.1,0.2.1,0.1.1] [--rounds V4,V5]
//   [--strict] [--improved file.mjs|file.json] [--scores file.json] [--targets dir] [--frame-width <preview px>] [--final-width <preview px>]
// Finals and every recorded frame retain their original bytes by default; widths opt into JPEG92 previews.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { scanPlates, loadPriors, loadSelfScores, buildRows, indexedOf, readImageSize } from './compare-release-collect.mjs';
import { renderPage } from './compare-release-page.mjs';
import { IMPROVED, validateImproved } from './compare-release-improved.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const list = v => v.split(',').map(s => s.trim()).filter(Boolean);

export function parseArgs(argv = process.argv.slice(2)) {
  const o = { runs: path.join(REPO, 'bench', 'runs'), plateRoots: [], out: path.resolve('comparison.html'), expected: {}, releases: null, rounds: null, strict: false, relabel: {}, improved: null, scores: null, targetsDir: null, frameWidth: null, finalWidth: null, title: 'Release comparison' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--runs') o.runs = path.resolve(next());
    else if (a === '--plates') o.plateRoots.push(...list(next()).map(p => path.resolve(p)));
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--expect') { const [k, v] = next().split('='); if (!k || !v) throw new Error('--expect needs release=sha'); o.expected[k] = v; }
    else if (a === '--releases') o.releases = list(next());
    else if (a === '--rounds') o.rounds = list(next());
    else if (a === '--relabel') { const [k, v] = next().split('='); if (!k || !v) throw new Error('--relabel needs from=to'); o.relabel[k] = v; }
    else if (a === '--strict') o.strict = true;
    else if (a === '--improved') o.improved = path.resolve(next());
    else if (a === '--scores') o.scores = path.resolve(next());
    else if (a === '--targets') o.targetsDir = path.resolve(next());
    else if (a === '--frame-width') o.frameWidth = Number(next());
    else if (a === '--final-width') o.finalWidth = Number(next());
    else if (a === '--title') o.title = next();
    else throw new Error(`unknown option: ${a}`);
  }
  validateWidths(o);
  return o;
}

function validateWidths(o) {
  for (const [name, value] of [['frame-width', o.frameWidth], ['final-width', o.finalWidth]]) {
    if (value != null && (!Number.isSafeInteger(value) || value <= 0)) throw new Error(`--${name} requires a positive integer`);
  }
}

const git = (args, cwd = REPO) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
/** Labelled commits when none are given: the v0.1.1 tag and this checkout's HEAD for 0.3.2. */
export function defaultExpected(given = {}) {
  return { '0.1.1': git(['rev-parse', 'bf6d5c4^{commit}']), '0.3.2': git(['rev-parse', 'HEAD']), ...given };
}
const resolveRef = (v, cwd) => (/^[0-9a-f]{7,40}$/i.test(v) ? v : git(['rev-parse', `${v}^{commit}`], cwd) ?? v);

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const rawUri = f => dataUri(fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream');
async function imageUri(f, width) {
  if (width == null) return rawUri(f);
  const buf = await sharp(f).resize({ width, withoutEnlargement: true }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return dataUri(buf, 'image/jpeg');
}

function normaliseScore(raw, selfScore) {
  if (!raw) return null;
  const composite = raw.j1?.composite ?? raw.composite ?? null;
  const progression = typeof raw.progression === 'number' ? raw.progression : raw.progression?.mean ?? null;
  if (composite == null && progression == null) return null;
  return { composite, indexed: indexedOf(composite, selfScore), progression };
}

async function plateRecord(p, { expected, selfScores, frameWidth, finalWidth, externalScores }) {
  const score = normaliseScore(externalScores[[p.release, p.subject, p.model, p.try].join('|')] ?? p.score, selfScores[p.subject]);
  const rec = {
    release: p.release, model: p.model, try: p.try, commit: p.commit, labelledCommit: expected[p.release] ?? null,
    gpu: p.gpu, sam: p.sam, paintWidth: p.paintWidth, sourceWidth: p.sourceWidth, seconds: p.seconds, dir: p.dir,
    score, marks: [...p.gate.marks], refused: p.gate.refused, alsoAt: p.alsoAt ?? [],
  };
  if (!p.gate.admitted) return rec;
  rec.delivery = { final: finalWidth == null ? 'original bytes' : `JPEG92 preview, maximum width ${finalWidth}px`, frames: frameWidth == null ? 'original bytes' : `JPEG92 previews, maximum width ${frameWidth}px` };
  if (finalWidth != null || frameWidth != null) rec.marks.push({ code: 'preview-delivery', text: `Explicit preview delivery: final ${rec.delivery.final}; frames ${rec.delivery.frames}. Source render widths above describe the original files.` });
  rec.final = p.painting ? await imageUri(p.painting, finalWidth) : null;
  const frames = [], missingFrames = [], nonNativeFrames = [];
  for (const f of p.frames) {
    if (!fs.existsSync(f.file)) { missingFrames.push(f.src); continue; }
    const sourceDimensions = readImageSize(fs.readFileSync(f.file));
    if (!sourceDimensions || sourceDimensions.w !== p.imageWidth || sourceDimensions.h !== p.imageHeight) nonNativeFrames.push(f.src);
    const { file, ...metadata } = f;
    frames.push({ ...metadata, sourceFile: f.src, sourceDimensions, src: await imageUri(file, frameWidth), stage: [f.stage, f.step].filter(Boolean).join(' '), position: f.position ?? null });
  }
  rec.frames = frames;
  rec.playback = { kind: 'recorded frames', listed: p.frames.length, delivered: frames.length, missingFrames, nonNativeFrames, nativeFramesComplete: p.frames.length > 0 && !missingFrames.length && !nonNativeFrames.length && frameWidth == null };
  rec.checkpoints = await retainedCheckpoints(p, frameWidth);
  if ((!p.frames.length || missingFrames.length) && rec.checkpoints.images.length) {
    rec.playback.kind = 'grouped retained checkpoint evidence, not chronological playback';
    rec.recordedFrames = frames;
    rec.frames = [...rec.checkpoints.images, { src: rec.final, stage: 'actual final painting endpoint (not a recorded frame)', position: null }];
    rec.marks.push({ code: 'checkpoint-evidence', text: 'Scrubber shows grouped retained checkpoint evidence: percentage checkpoints, then dried bands, then the actual final painting. This is not chronological playback and does not replace missing recorded frames.' });
  }
  if (rec.checkpoints.images.length && (rec.checkpoints.missing.length || rec.checkpoints.nonNative.length || !rec.checkpoints.expectedBands.length)) rec.marks.push({ code: 'checkpoint-incomplete', text: `Retained checkpoint proof incomplete: ${rec.checkpoints.missing.length} missing files, ${rec.checkpoints.nonNative.length} dimension mismatches; completed-band ledger ${rec.checkpoints.expectedBands.length ? 'present' : 'unavailable'}.` });
  if (nonNativeFrames.length) rec.marks.push({ code: 'frame-resolution', text: `${nonNativeFrames.length} recorded frames are unreadable or differ from the native painting dimensions; playback is not complete native proof.` });
  return rec;
}

// Retained files are separate evidence, never replacements claiming to be missing recorded frames.
async function retainedCheckpoints(p, width) {
  const specs = [];
  const progress = [10, 25, 50, 75, 100];
  const missing = [];
  for (const percent of progress) {
    const stem = `stages/stage-${String(percent).padStart(3, '0')}`;
    const file = ['.png', '.jpg'].map(ext => stem + ext).find(name => fs.existsSync(path.join(p.dir, name)));
    if (file) specs.push({ file, kind: 'progress-checkpoint', percent, stage: `retained ${percent}% checkpoint — ${file}` });
    else missing.push(stem);
  }
  const bands = fs.readdirSync(p.dir).map(file => ({ file, match: /^value-band-(\d+)-dried\.png$/.exec(file) })).filter(x => x.match).map(x => ({ file: x.file, band: Number(x.match[1]) })).sort((a,b) => a.band - b.band);
  const countsFile = path.join(p.dir, 'value-executed-counts.json');
  const counted = fs.existsSync(countsFile) ? JSON.parse(fs.readFileSync(countsFile, 'utf8')).bands : [];
  if (!Array.isArray(counted) || counted.some(b => !b || !Number.isSafeInteger(b.band) || b.band <= 0 || !Number.isSafeInteger(b.strokes) || b.strokes < 0)) throw new Error(`Invalid completed-band counts: ${countsFile}`);
  const boundaryBands = p.frames.filter(f => f.boundary === 'value').map(f => f.value);
  if (boundaryBands.some(b => !Number.isSafeInteger(b) || b <= 0)) throw new Error(`Invalid completed-band boundary: ${p.dir}/frames.json`);
  const expectedBands = [...new Set([...counted.filter(b => b.strokes > 0).map(b => b.band), ...boundaryBands])].sort((a,b) => a-b);
  for (const band of expectedBands) if (!bands.some(b => b.band === band)) missing.push(`value-band-${band}-dried.png`);
  specs.push(...bands.map(b => ({...b,kind:'dried-band-checkpoint',stage:`retained dried band ${b.band} — ${b.file}`})));
  const images = [], nonNative = [];
  for (const spec of specs) {
    const file = path.join(p.dir, spec.file), sourceDimensions = readImageSize(fs.readFileSync(file));
    if (!sourceDimensions || sourceDimensions.w !== p.imageWidth || sourceDimensions.h !== p.imageHeight) nonNative.push(spec.file);
    images.push({...spec,sourceDimensions,src:await imageUri(file,width),position:null});
  }
  return { images, missing, nonNative, expectedBands, nativeComplete: !missing.length && !nonNative.length && expectedBands.length > 0 && width == null };
}

async function priorRecord(p) {
  return {
    round: p.round, try: p.try, release: p.release, painterVersion: p.painterVersion, simVersion: p.simVersion, commit: p.commit,
    machine: p.machine, paintWidth: p.paintWidth, minutes: p.minutes, strokes: p.strokes, composite: p.composite, indexed: p.indexed,
    progression: p.progression, imageWidth: p.imageWidth, final: rawUri(p.imagePath), stages: p.stagesPath ? rawUri(p.stagesPath) : null,
  };
}

async function loadImproved(file) {
  if (!file) return IMPROVED;
  const data = file.endsWith('.json') ? JSON.parse(fs.readFileSync(file, 'utf8')) : (await import(pathToFileURL(file).href)).IMPROVED;
  const errors = validateImproved(data);
  if (errors.length) throw new Error(`improved data ${file}: ${errors.join('; ')}`);
  return data;
}

export async function generate(opts) {
  const o = { ...parseArgs([]), ...opts };
  validateWidths(o);
  const expected = Object.fromEntries(Object.entries(o.expected).map(([k, v]) => [k, resolveRef(v, REPO)]));
  const selfScores = loadSelfScores(o.runs);
  const targetsDir = o.targetsDir ?? path.join(o.runs, '..', 'v2', 'targets');
  const targetFile = s => ['.png', '.jpg', '.webp'].map(e => path.join(targetsDir, s + e)).find(f => fs.existsSync(f)) ?? null;
  const targetOf = s => { const f = targetFile(s); if (!f) return null; const b = fs.readFileSync(f); return { sha: sha256(b), width: readImageSize(b)?.w ?? null }; };
  const plates = scanPlates(o.plateRoots, { relabel: o.relabel, expected, strict: o.strict, targetOf });
  const { priors, scanned } = loadPriors(o.runs, { releases: o.releases, rounds: o.rounds, selfScores });
  const results = readJson(path.join(o.runs, '..', 'results', 'results.json'));
  const models = readJson(path.join(o.runs, '..', 'models.json'));
  const subjectOrder = (results?.crops ?? []).map(c => c.key);
  const subjectName = Object.fromEntries((results?.crops ?? []).map(c => [c.key, c.name]));
  const modelName = Object.fromEntries((models?.models ?? []).map(m => [m.key, m.name]));
  const seen = new Set([...priors.values()].map(p => p.subject).concat(plates.map(p => p.subject)));
  const subjects = [...seen].sort((a, b) => (subjectOrder.indexOf(a) + 1 || 99) - (subjectOrder.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const modelKeys = [...new Set(plates.map(p => p.model))].sort();
  const externalScores = o.scores ? JSON.parse(fs.readFileSync(o.scores, 'utf8')) : {};
  const ctx = { expected, selfScores, frameWidth: o.frameWidth, finalWidth: o.finalWidth, externalScores };

  const rows = [];
  for (const r of buildRows({ plates, priors, subjects, models: modelKeys.length ? modelKeys : [...new Set([...priors.values()].map(p => p.model))].sort() })) {
    const tf = targetFile(r.subject);
    rows.push({
      id: r.id, subject: r.subject, subjectName: subjectName[r.subject] ?? r.subject, model: r.model,
      modelName: r.prior?.modelName ?? modelName[r.model] ?? r.model, try: r.try,
      target: tf ? { src: rawUri(tf), w: readImageSize(fs.readFileSync(tf))?.w ?? null } : null,
      prior: r.prior ? await priorRecord(r.prior) : null,
      repaint: r.repaint ? await plateRecord(r.repaint, ctx) : null,
      plate: r.plate ? await plateRecord(r.plate, ctx) : null,
    });
  }

  const improved = await loadImproved(o.improved);
  const admitted = plates.filter(p => p.gate.admitted);
  const wanted = ["0.1.1"];
  const missing = wanted.filter(r => !scanned.releases.includes(r));
  const meta = {
    title: o.title, generatedAt: new Date().toISOString(), labelledCommits: expected, priorReleases: scanned.releases,
    priorNote: missing.length ? `No published run records exist for ${missing.join(' or ')}.` : '',
    counts: { rows: rows.length, admitted: admitted.length, refused: plates.length - admitted.length, marked: admitted.filter(p => p.gate.marks.length).length },
    plateTable: plates.map(p => ({ subject: p.subject, model: p.model, try: p.try, release: p.release, commit: p.commit, gpu: p.gpu, paintWidth: p.paintWidth, sourceWidth: p.sourceWidth, seconds: p.seconds, admitted: p.gate.admitted, reasons: p.gate.refused.map(r => r.code) })),
  };
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  fs.writeFileSync(o.out, renderPage({ rows, improved, meta }));
  return { out: o.out, bytes: fs.statSync(o.out).size, rows: rows.length, ...meta.counts };
}

import crypto from 'node:crypto';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs();
    o.expected = defaultExpected(o.expected);
    const r = await generate(o);
    console.log(`wrote ${r.out} (${(r.bytes / 1048576).toFixed(1)} MiB): ${r.rows} rows, ${r.admitted} plates admitted, ${r.refused} refused, ${r.marked} admitted with marks`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
