// Pipeline: inking, stage 2 (hold and measure the lines): what is ink-worthy and what is wash.
// The source's SAM regions are labelled (architecture, figure, face, hands, drapery, tree trunk, foliage, sky, water,
// ground, shadow mass) by a vision model reading an overlay, cached by source/map/model provenance, or by an explicit
// simple classifier of each region's own colour and size. Requested vision fails closed. A tone-mass pass adds shadow
// masses that no region isolates. Each label carries an ink rule. A candidate line is drawn only where the label of
// the ground under it says ink (a contour counts when either side is ink-worthy) and it also passes the line-or-mass test
// (line-class.mjs). Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

export const LABELS = Object.freeze(['architecture', 'figure', 'face', 'hands', 'drapery', 'tree_trunk', 'foliage', 'sky', 'water', 'ground', 'shadow_mass']);

/**
 * What each label allows. `ink`: 'none' (wash only), 'structure' (edges and openings, not shading), 'outline' (outline
 * and key folds), 'features' (every pen line, small ones too), 'elongated' (trunks and branches: long, connected strokes).
 * `minMm`: a piece of line shorter than this is not drawn there, unless it is a feature. `penContrast`: only a point
 * whose own contrast (L*) is at least this is drawn there.
 */
export const INK_RULES = Object.freeze({
  architecture: { ink: 'structure', minMm: 2 },
  figure: { ink: 'outline', minMm: 1.5 },
  face: { ink: 'features', minMm: 0 },
  hands: { ink: 'features', minMm: 0 },
  drapery: { ink: 'outline', minMm: 3 },
  tree_trunk: { ink: 'elongated', minMm: 6 },
  foliage: { ink: 'elongated', minMm: 8 }, // leaves are wash; a long, smooth, connected stroke through them is a branch
  sky: { ink: 'none' },
  water: { ink: 'none' },
  ground: { ink: 'structure', minMm: 6 },
  // a shadow is wash: its shape and its edges are never drawn. A pen line of its own, strong against both sides, stays.
  shadow_mass: { ink: 'structure', minMm: 3, penContrast: 10 },
});

const sha = b => createHash('sha256').update(b).digest('hex');

/** Centroid of each label's largest blob, cheaply: the mean of its cells nearest the label's median row. */
function regionCentroids(labels, w, h, ids) {
  const sx = new Map(), sy = new Map(), n = new Map();
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const id = labels[y * w + x]; sx.set(id, (sx.get(id) ?? 0) + x); sy.set(id, (sy.get(id) ?? 0) + y); n.set(id, (n.get(id) ?? 0) + 1); }
  return ids.map(id => ({ id, x: (sx.get(id) ?? 0) / (n.get(id) || 1), y: (sy.get(id) ?? 0) / (n.get(id) || 1), n: n.get(id) ?? 0 }));
}

/** The source with each region's outline and its number, for the vision model. */
async function overlayPng({ image, labels, w, h, ids }) {
  const long = 1100, f = Math.min(1, long / Math.max(w, h)), ow = Math.round(w * f), oh = Math.round(h * f);
  const base = await sharp(image).flatten({ background: '#fff' }).removeAlpha().resize(ow, oh, { fit: 'fill' }).raw().toBuffer();
  const edge = Buffer.from(base);
  for (let y = 0; y < oh - 1; y++) for (let x = 0; x < ow - 1; x++) {
    const a = labels[Math.min(h - 1, Math.round(y / f)) * w + Math.min(w - 1, Math.round(x / f))];
    const b = labels[Math.min(h - 1, Math.round(y / f)) * w + Math.min(w - 1, Math.round((x + 1) / f))], c = labels[Math.min(h - 1, Math.round((y + 1) / f)) * w + Math.min(w - 1, Math.round(x / f))];
    if (a !== b || a !== c) { const i = 3 * (y * ow + x); edge[i] = 255; edge[i + 1] = 0; edge[i + 2] = 255; }
  }
  const text = regionCentroids(labels, w, h, ids).filter(c => c.n > 0).map(c => `<g><rect x="${(c.x * f - 14).toFixed(0)}" y="${(c.y * f - 12).toFixed(0)}" width="${String(c.id).length * 11 + 8}" height="20" fill="#000" opacity="0.75"/><text x="${(c.x * f - 10).toFixed(0)}" y="${(c.y * f + 4).toFixed(0)}" font-family="Helvetica" font-size="15" font-weight="bold" fill="#fff">${c.id}</text></g>`).join('');
  return sharp(edge, { raw: { width: ow, height: oh, channels: 3 } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}">${text}</svg>`) }]).png().toBuffer();
}

/** The model's { "<id>": "<label>" } reply, checked: only known ids and labels count. */
export function parseLabelReply(text, ids) {
  const s = String(text ?? '');
  for (let b = s.lastIndexOf('}'), a = s.indexOf('{'); a >= 0 && b > a; b = s.lastIndexOf('}', b - 1)) {
    try {
      const j = JSON.parse(s.slice(a, b + 1)), out = {};
      for (const id of ids) { const v = String(j[id] ?? j[`r${id}`] ?? '').toLowerCase().replace(/[^a-z_]/g, '_').replace(/^tree$|^trunk$|^branches$|^tree_trunk_and_branches$/, 'tree_trunk').replace(/^shadow$|^shadow_mass_?$/, 'shadow_mass'); if (LABELS.includes(v)) out[id] = v; }
      if (Object.keys(out).length) return out;
    } catch { /* try a shorter span */ }
  }
  return null;
}

/**
 * A label for a region from its own numbers, for when no vision model can run: green and textured is foliage, a large
 * smooth pale region touching the top is sky, a blue-grey smooth one is water, the rest is architecture. Dark is not
 * shadow: a dark region may be an iron gate or a figure, so the classifier never calls one a shadow mass (the line-or-mass
 * test still leaves shadow edges to the wash). `r` is a segments.json region { area, lab, labSpread, bbox }.
 */
export function simpleLabel(r, { w, h }) {
  const [L, A, B] = r.lab, [sL] = r.labSpread ?? [0], top = r.bbox[1] / h < 0.05;
  if (A < -6 && B > 4) return 'foliage';
  if (top && r.area > 0.08 && sL < 12 && L > 55) return 'sky';
  if (B < -4 && sL < 12) return 'water';
  return 'architecture';
}

const PROMPT = ids => `This image is a drawing with its regions outlined in magenta and numbered. For each region number, identify the visible physical material or form, choosing one label from: ${LABELS.join(', ')}. Architecture includes manufactured solid structures and objects and built surfaces. Ground means unbuilt natural terrain. Water means an exposed liquid surface, not its solid enclosure or a dark reflection or shadow on a solid. Tree_trunk means trunks and branches; foliage means leaf masses; drapery means clothing or cloth. Use figure, face and hands for the corresponding visible human forms. Shadow_mass means a broad cast or form shadow, not a solid structure merely seen in shadow. Use these specific human, natural and material categories where they fit; solidity or darkness alone does not make a region architecture. If a region mixes a visible solid built form with liquid, sky or shadow, preserve the visible solid structural meaning rather than labelling the entire region as a wash-only surface. Judge what is visibly present, not just its colour or what surrounds it. Regions: ${ids.join(', ')}. Reply with JSON only: a complete mapping from every listed region number to one allowed label, with no omitted or additional region keys.`;

const DEFAULT_AGY_MODEL = 'claude-sonnet-4-6';
const canonical = value => JSON.stringify(value, function (_key, v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
});

function executableIdentity(command, env) {
  const candidates = command.includes(path.sep) ? [path.resolve(command)]
    : String(env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, command));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const resolved = fs.realpathSync(candidate);
      if (fs.statSync(resolved).isFile()) return { path: resolved, sha256: sha(fs.readFileSync(resolved)) };
    } catch { /* try the next PATH entry */ }
  }
  throw new Error(`executable not found or unreadable: ${command}`);
}

/** Cache provenance contains input hashes and public configuration, never credentials. */
export function labelIdentity({ image, regions, labelMap, w, h, judge, model, executable, prompt }) {
  if (!Number.isInteger(w) || w < 1 || !Number.isInteger(h) || h < 1 ||
      !ArrayBuffer.isView(labelMap) || labelMap instanceof DataView || labelMap.length !== w * h)
    throw new Error('label map must be a typed array with exactly w * h cells');
  const bytes = Buffer.from(labelMap.buffer, labelMap.byteOffset, labelMap.byteLength);
  return { version: 1, imageSHA256: sha(fs.readFileSync(image)),
    map: { w, h, type: labelMap.constructor.name, sha256: sha(bytes) },
    regionsSHA256: sha(canonical(regions)), promptSHA256: sha(prompt), judge, model, executable };
}

function validateVision(record, ids, identity, context) {
  const fail = reason => { throw new Error(`${context}: ${reason}`); };
  if (!record || record.judge !== identity.judge || canonical(record.identity) !== canonical(identity))
    fail('cache identity or judge mismatch');
  if (record.note) fail('vision record contains a fallback/error note');
  for (const key of ['labels', 'source']) {
    if (!record[key] || typeof record[key] !== 'object' || Array.isArray(record[key]) ||
        Object.keys(record[key]).length !== ids.length ||
        Object.keys(record[key]).some(id => !ids.some(wanted => String(wanted) === id)))
      fail(`${key} must cover exactly every requested region`);
  }
  for (const id of ids) {
    if (!LABELS.includes(record.labels[id])) fail(`region ${id} has a missing or unknown label`);
    if (record.source[id] !== 'vision') fail(`region ${id} is not vision-labelled`);
  }
  return record;
}

function askJudge(judge, png, ids, { run = spawnSync, command, model, prompt, env } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-labels-')), file = path.join(dir, 'regions.png');
  try {
    fs.writeFileSync(file, png);
    const args = judge === 'codex'
      ? ['exec', '-i', file, '--model', model, '--sandbox', 'read-only', '--skip-git-repo-check', prompt]
      : ['-p', `Open the image file ${file} with your file-viewing tool (do not run shell commands). ${prompt}`, '--model', model, '--mode', 'plan', '--add-dir', dir];
    const r = run(command, args, { cwd: dir, env, encoding: 'utf8', timeout: 600000 });
    if (r.error || r.status !== 0) throw new Error(`label process failed (${r.error?.code ?? r.signal ?? r.status ?? 'unknown status'})`);
    const labels = parseLabelReply(r.stdout, ids);
    if (!labels) throw new Error('label reply contained no valid region labels');
    return labels;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Explicit simple classification stays local. Requested vision is complete or fails closed. */
export async function labelRegions({ image, regions, labelMap, w, h, judge = 'codex', cacheDir, run = spawnSync, env = process.env }) {
  if (!['simple', 'codex', 'agy'].includes(judge)) throw new Error(`ink labels: unknown judge ${JSON.stringify(judge)}; use simple, codex or agy`);
  const ids = regions.map(r => r.id);
  if (judge === 'simple') return {
    labels: Object.fromEntries(regions.map(r => [r.id, simpleLabel(r, { w, h })])),
    source: Object.fromEntries(ids.map(id => [id, 'simple'])), judge, cached: false,
  };
  if (ids.some(id => !Number.isInteger(id) || id < 0) || new Set(ids).size !== ids.length)
    throw new Error('ink labels: region IDs must be distinct nonnegative integers');
  const context = `ink labels (${judge})`;
  try {
    const model = String(env.INK_LABEL_MODEL ?? (judge === 'agy' ? DEFAULT_AGY_MODEL : '')).trim();
    if (!model) throw new Error('set INK_LABEL_MODEL explicitly for the requested vision judge; an unresolved model cannot identify a cache');
    const command = env[judge === 'codex' ? 'CODEX_BIN' : 'AGY_BIN'] || judge;
    const prompt = PROMPT(ids), executable = executableIdentity(command, env);
    const identity = labelIdentity({ image, regions, labelMap, w, h, judge, model, executable, prompt });
    const file = path.join(cacheDir, `${identity.imageSHA256}-${sha(canonical(identity))}.json`);
    if (fs.existsSync(file)) {
      const record = validateVision(JSON.parse(fs.readFileSync(file, 'utf8')), ids, identity, 'cached vision labels');
      return { ...record, cached: true };
    }
    const labels = askJudge(judge, await overlayPng({ image, labels: labelMap, w, h, ids }), ids, { run, command: executable.path, model, prompt, env });
    const missing = ids.filter(id => !Object.hasOwn(labels, id));
    if (missing.length) throw new Error(`label reply has missing or unknown labels for regions ${missing.join(', ')}`);
    const out = validateVision({ labels, source: Object.fromEntries(ids.map(id => [id, 'vision'])), judge, identity, cached: false }, ids, identity, 'vision labels');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out) + '\n');
    return out;
  } catch (e) {
    throw new Error(`${context}: ${e.message}`, { cause: e });
  }
}

/** Cells under a broad, dark tone mass (a shadow or dark wash), as a 0/1 plane: blurred L* well under the paper's. */
export function shadowMassMask(L, w, h, pxMm, { sigmaMm = 0.8, drop = 20, minAreaMm2 = 8 } = {}) {
  const r = Math.max(1, Math.round(sigmaMm / pxMm)), blur = boxBlur(boxBlur(L, w, h, r), w, h, r);
  const sorted = Float32Array.from(blur).sort(), paper = sorted[Math.floor(0.9 * sorted.length)];
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = blur[i] < paper - drop ? 1 : 0;
  // keep blobs of at least the area
  const seen = new Uint8Array(w * h), min = minAreaMm2 / (pxMm * pxMm), out = new Uint8Array(w * h), stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const blob = []; stack.push(s); seen[s] = 1;
    while (stack.length) { const i = stack.pop(); blob.push(i); const x = i % w, y = (i - x) / w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
    if (blob.length >= min) for (const i of blob) out[i] = 1;
  }
  return out;
}

export function boxBlur(P, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let x = -r; x < w; x++) { const a = x + r, b = x - r - 1; if (a < w) { s += P[y * w + a]; c++; } if (b >= 0) { s -= P[y * w + b]; c--; } if (x >= 0) tmp[y * w + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h; y++) { const a = y + r, b = y - r - 1; if (a < h) { s += tmp[a * w + x]; c++; } if (b >= 0) { s -= tmp[b * w + x]; c--; } if (y >= 0) out[y * w + x] = s / c; } }
  return out;
}

/**
 * The ink rule that applies at a point: the most permissive rule among the labels within `reachPx` of it (a contour is
 * drawn when either side is ink-worthy). `cellLabel(x, y)` is the label at a cell. Order of permissiveness follows
 * RANK; a shadow mass takes a cell only where no region label says ink within reach and the tone-mass mask says shadow.
 */
const RANK = { none: 0, elongated: 1, structure: 2, outline: 3, features: 4 };
export function ruleAt(cellLabel, x, y, reachPx) {
  let best = { ink: 'none', minMm: Infinity, label: null };
  for (const [dx, dy] of [[0, 0], [reachPx, 0], [-reachPx, 0], [0, reachPx], [0, -reachPx]]) {
    const label = cellLabel(Math.floor(x + dx), Math.floor(y + dy));
    const rule = INK_RULES[label];
    if (rule && RANK[rule.ink] > RANK[best.ink]) best = { ...rule, label };
  }
  return best;
}
