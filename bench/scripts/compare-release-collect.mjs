// Reads the evidence for a release comparison: published run records (prior paintings) and plate folders
// (0.3.0 repaints, 0.3.1 plates). Every provenance field comes from a record on disk, never from the caller.
import fs from 'node:fs';
import path from 'node:path';

export const MIN_SOURCE_WIDTH = 600;
export const MIN_RENDER_WIDTH = 540;
const SUBJECT_ALIASES = { france: 'south-france', sf: 'south-france' };

const readJsonIf = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Width and height from a PNG, JPEG or WebP header, or null. */
export function readImageSize(b) {
  if (!Buffer.isBuffer(b) || b.length < 24) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
const sizeOfFile = f => { try { return readImageSize(fs.readFileSync(f)); } catch { return null; } };

export const indexedOf = (composite, selfScore) =>
  (composite == null || !Number.isFinite(composite) || !selfScore ? null : 100 * composite / selfScore);

/** Self-scores per subject from the results file beside the runs folder. */
export function loadSelfScores(runsDir) {
  const doc = readJsonIf(path.join(runsDir, '..', 'results', 'results.json'));
  return Object.fromEntries((doc?.crops ?? []).filter(c => c.selfScore != null).map(c => [c.key, c.selfScore]));
}

// ---------------------------------------------------------------- plates

function identify(dir) {
  const parts = path.resolve(dir).split(path.sep);
  const base = parts.at(-1);
  const raw = /^(.+)-raw$/.exec(base);
  if (raw && /^\d+$/.test(parts.at(-2) ?? '')) {
    return { subject: raw[1], model: parts.at(-3), try: Number(parts.at(-2)), round: parts.at(-4) };
  }
  const m = /^([a-z]+)(\d+)-(.+)$/.exec(base);
  if (!m) return null;
  return { model: m[1], try: Number(m[2]), subject: SUBJECT_ALIASES[m[3]] ?? m[3], round: null };
}

const gpuName = (card, backendDoc) => {
  const info = card.provenance?.backend?.adapterEvidence?.adapterInfo ?? backendDoc?.adapterEvidence?.adapterInfo;
  const vendor = info?.vendor, device = info?.device;
  if (device) return (device.startsWith(vendor ?? '\0') ? device : `${vendor ?? ''} ${device}`).trim();
  return card.gpuBackend?.adapter ?? backendDoc?.adapter ?? 'not recorded';
};
const samName = seg => {
  if (!seg?.backend) return 'not recorded';
  if (seg.backend !== 'sam') return `segments ${seg.backend}`;
  return `sam ${seg.model?.model ?? ''}${seg.model?.device ? ` (${seg.model.device})` : ''}`.replace(/\s+/g, ' ').trim();
};
const argAfter = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

/** One plate folder (needs run-card.json) as a flat record, or null. */
export function parsePlateDir(dir) {
  const card = readJsonIf(path.join(dir, 'run-card.json'));
  const id = identify(dir);
  if (!card || !id) return null;
  const backendDoc = readJsonIf(path.join(dir, 'backend.json')) ?? {};
  const framesDoc = readJsonIf(path.join(dir, 'frames.json')) ?? {};
  const state = readJsonIf(path.join(dir, 'code-state.json')) ?? {};
  const args = Array.isArray(card.args) ? card.args.map(String) : [];
  const gpuArg = argAfter(args, '--gpu');
  const imageArg = argAfter(args, '--image');
  const dims = card.dimensions ?? null;
  const frames = (framesDoc.frames ?? []).map(f => ({ ...f, file: path.join(dir, f.src) }));
  const painting = ['painting.jpg', 'painting.png'].map(n => path.join(dir, n)).find(f => fs.existsSync(f)) ?? null;
  return {
    ...id,
    dir,
    release: backendDoc.release ?? framesDoc.release ?? null,
    commit: card.codeSHA || state.commit || backendDoc.commit || framesDoc.commit || null,
    painterVersion: backendDoc.painterVersion ?? framesDoc.painterVersion ?? null,
    simVersion: backendDoc.simVersion ?? framesDoc.simVersion ?? null,
    backend: card.gpuBackend?.backend ?? backendDoc.backend ?? null,
    fallback: Boolean(backendDoc.fallback ?? card.gpuBackend?.fallback ?? false),
    argsGpuOff: gpuArg != null && ['off', '0', 'cpu', 'false'].includes(String(gpuArg).toLowerCase()),
    gpu: gpuName(card, backendDoc),
    sam: samName(card.segments),
    paintWidth: dims?.paintWidth ?? framesDoc.width ?? null,
    sourceWidth: dims?.sourceWidth ?? (imageArg ? sizeOfFile(imageArg)?.w ?? null : null),
    seconds: card.seconds ?? null,
    exit: card.exit ?? null,
    cleanTree: card.cleanTree ?? null,
    targetSHA256: card.targetSHA256 ?? null,
    framesListed: frames.length,
    framesFound: frames.filter(f => fs.existsSync(f.file)).length,
    frames,
    painting,
    score: readJsonIf(path.join(dir, 'score.json')) ?? card.score ?? null,
  };
}

const commitMatches = (got, want) => Boolean(got && want && want.length >= 7 && got.length >= 7 && (got.startsWith(want) || want.startsWith(got)));

/**
 * Refusals stop a plate being compared at all. Marks stay visible on a plate that is shown.
 * strict turns a low-resolution source into a refusal.
 */
export function gatePlate(p, { expectedCommit = null, minSourceWidth = MIN_SOURCE_WIDTH, minRenderWidth = MIN_RENDER_WIDTH, strict = false, targetSha256 = null } = {}) {
  const refused = [], marks = [];
  const R = (code, text) => refused.push({ code, text });
  const M = (code, text) => marks.push({ code, text });
  if (!expectedCommit) R('commit-unlabelled', `no commit is labelled for release ${p.release ?? 'unknown'}, so this plate cannot be checked`);
  else if (!p.commit) R('commit-missing', `run card records no commit; ${p.release} is labelled ${expectedCommit}`);
  else if (!commitMatches(p.commit, expectedCommit)) R('commit-mismatch', `run card commit ${p.commit.slice(0, 7)} differs from the labelled ${p.release} commit ${expectedCommit.slice(0, 7)}`);
  if (p.backend !== 'gpu' || p.fallback || p.argsGpuOff) R('cpu', `CPU or fallback run (backend ${p.backend ?? 'unknown'}, fallback ${p.fallback}, --gpu off ${p.argsGpuOff})`);
  if (!(p.paintWidth >= minRenderWidth)) R('low-res-render', `rendered ${p.paintWidth ?? 'unknown'} px wide, under the ${minRenderWidth} px minimum`);
  if (targetSha256 && p.targetSHA256 && targetSha256 !== p.targetSHA256) R('target-mismatch', 'painted from a different target file than the comparison target');
  if (p.sourceWidth == null) M('source-unknown', 'source target width is not recorded');
  else if (p.sourceWidth < minSourceWidth) {
    const text = `low-resolution source: ${p.sourceWidth} px target enlarged to ${p.paintWidth ?? '?'} px`;
    if (strict) R('low-res-source', text); else M('low-res-source', text);
  }
  if (p.cleanTree === false) M('dirty-tree', 'the code tree was dirty when this plate was painted');
  if (p.framesListed > 0 && p.framesFound < p.framesListed) M('frames-missing', `playback incomplete: ${p.framesFound} of ${p.framesListed} frame files exist`);
  if (p.framesListed === 0) M('frames-missing', 'no playback frames recorded');
  return { admitted: refused.length === 0, refused, marks };
}

function* walk(dir, depth = 0) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (entries.some(e => e.isFile() && e.name === 'run-card.json')) { yield dir; return; }
  if (depth >= 6) return;
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory() && e.name !== 'node_modules' && !e.name.endsWith('.logs')) yield* walk(path.join(dir, e.name), depth + 1);
  }
}

/** Plates of every labelled release under the roots, gated, with duplicates folded (an admitted copy wins). */
export function scanPlates(roots, { expected = {}, strict = false, minSourceWidth = MIN_SOURCE_WIDTH, targetOf = () => null } = {}) {
  const byKey = new Map();
  for (const root of roots) {
    for (const dir of walk(root)) {
      const p = parsePlateDir(dir);
      if (!p || !p.release || !(p.release in expected)) continue;
      const target = targetOf(p.subject);
      // The card's own width wins. Without one, the comparison target's width counts only when the card's target hash matches it.
      if (p.sourceWidth == null && target?.width && p.targetSHA256 && p.targetSHA256 === target.sha) { p.sourceWidth = target.width; }
      p.gate = gatePlate(p, { expectedCommit: expected[p.release], strict, minSourceWidth, targetSha256: target?.sha ?? null });
      const key = [p.release, p.subject, p.model, p.try].join('|');
      const prev = byKey.get(key);
      if (!prev) { p.alsoAt = []; byKey.set(key, p); continue; }
      const [keep, drop] = !prev.gate.admitted && p.gate.admitted ? [p, prev] : [prev, p];
      keep.alsoAt = [...(prev.alsoAt ?? []), ...(p.alsoAt ?? []), drop.dir].filter((d, i, a) => d !== keep.dir && a.indexOf(d) === i);
      byKey.set(key, keep);
    }
  }
  return [...byKey.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.model.localeCompare(b.model) || a.try - b.try);
}

// ---------------------------------------------------------------- priors

/** The best published, scored, non-disqualified painting per subject and model, by J1 composite. */
export function loadPriors(runsDir, { releases = null, rounds = null, selfScores = {} } = {}) {
  const priors = new Map();
  const scanned = { runs: 0, crops: 0, releases: new Set() };
  const dirs = f => { try { return fs.readdirSync(f, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { return []; } };
  for (const round of dirs(runsDir)) for (const model of dirs(path.join(runsDir, round))) for (const tryDir of dirs(path.join(runsDir, round, model))) {
    const folder = path.join(runsDir, round, model, tryDir);
    const run = readJsonIf(path.join(folder, 'run.json'));
    if (!run) continue;
    scanned.runs++;
    scanned.releases.add(run.release);
    if (releases && !releases.includes(run.release)) continue;
    if (rounds && !rounds.includes(run.round)) continue;
    if (run.cheat?.disqualified) continue;
    for (const [subject, crop] of Object.entries(run.crops ?? {})) {
      scanned.crops++;
      const composite = crop.score?.composite;
      const imagePath = crop.images?.final ? path.join(folder, crop.images.final) : null;
      if (composite == null || !imagePath || !fs.existsSync(imagePath)) continue;
      const key = `${subject}|${run.painter?.key ?? model}`;
      if (priors.get(key) && priors.get(key).composite >= composite) continue;
      const stagesPath = crop.images?.stages ? path.join(folder, crop.images.stages) : null;
      priors.set(key, {
        subject, model: run.painter?.key ?? model, modelName: run.painter?.name ?? model,
        composite, indexed: indexedOf(composite, selfScores[subject]), progression: crop.progression?.mean ?? null,
        round: run.round, try: run.try, release: run.release, painterVersion: run.painterVersion ?? null, simVersion: run.simVersion ?? null,
        commit: run.commit ?? null, machine: run.settings?.machine ?? null,
        paintWidth: run.settings?.paintWidth?.[subject] ?? crop.sheet?.W ?? null,
        minutes: crop.minutes ?? null, strokes: crop.strokes ?? null,
        imagePath, stagesPath: stagesPath && fs.existsSync(stagesPath) ? stagesPath : null,
        imageWidth: sizeOfFile(imagePath)?.w ?? null, runFile: path.join(folder, 'run.json'),
      });
    }
  }
  return { priors, scanned: { ...scanned, releases: [...scanned.releases].sort() } };
}

// ---------------------------------------------------------------- rows

/** One row per subject and model, and one per try where a 0.3.1 plate exists. Gaps stay as gaps. */
export function buildRows({ plates, priors, subjects, models }) {
  const rows = [];
  for (const subject of subjects) for (const model of models) {
    const mine = plates.filter(p => p.subject === subject && p.model === model);
    const plates31 = mine.filter(p => p.release === '0.3.1').sort((a, b) => a.try - b.try);
    const repaints = mine.filter(p => p.release === '0.3.0').sort((a, b) => a.try - b.try);
    const prior = priors.get(`${subject}|${model}`) ?? null;
    if (!plates31.length) { rows.push({ id: `${subject}|${model}`, subject, model, try: null, prior, repaint: repaints[0] ?? null, plate: null }); continue; }
    for (const plate of plates31) {
      rows.push({ id: `${subject}|${model}|${plate.try}`, subject, model, try: plate.try, prior, repaint: repaints.find(r => r.try === plate.try) ?? repaints[0] ?? null, plate });
    }
  }
  return rows;
}
