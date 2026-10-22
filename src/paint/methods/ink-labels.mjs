// Pipeline: inking, stage 2 (hold and measure the lines): what is ink-worthy and what is wash.
// The source's SAM regions are labelled (architecture, figure, face, hands, drapery, tree trunk, foliage, sky, water,
// ground, shadow mass) by a vision model reading an overlay of the regions, cached by the target's SHA-256, or by a simple
// classifier of each region's own colour and size when no model can run (logged loudly). A tone-mass pass adds shadow
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
  foliage: { ink: 'none' },
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
 * smooth pale region touching the top is sky, a blue-grey smooth one is water, a small dark one is a shadow mass, the
 * rest is architecture. `r` is a segments.json region { area, lab, labSpread, bbox }.
 */
export function simpleLabel(r, { w, h }) {
  const [L, A, B] = r.lab, [sL] = r.labSpread ?? [0], top = r.bbox[1] / h < 0.05;
  if (A < -6 && B > 4) return 'foliage';
  if (top && r.area > 0.08 && sL < 12 && L > 55) return 'sky';
  if (B < -4 && sL < 12) return 'water';
  if (L < 38 && r.area < 0.1) return 'shadow_mass';
  return 'architecture';
}

const PROMPT = ids => `This image is a drawing with its regions outlined in magenta and numbered. For each region number, say what the region is, choosing one label from: ${LABELS.join(', ')}. (tree_trunk is trunks and branches; foliage is leaf masses; shadow_mass is a broad cast or form shadow; drapery is clothing or cloth; architecture is buildings, walls, columns, arches, steps.) Regions: ${ids.join(', ')}. Reply with JSON only, like {"1": "sky", "2": "architecture"}, with every region number as a key.`;

function askJudge(judge, png, ids, { run = spawnSync, env = process.env } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-labels-')), file = path.join(dir, 'regions.png');
  fs.writeFileSync(file, png);
  try {
    const prompt = PROMPT(ids);
    const r = judge === 'codex'
      ? run(env.CODEX_BIN || 'codex', ['exec', '-i', file, '--sandbox', 'read-only', '--skip-git-repo-check', prompt], { cwd: dir, encoding: 'utf8', timeout: 600000 })
      : run(env.AGY_BIN || 'agy', ['-p', `Open the image file ${file} with your file-viewing tool (do not run shell commands). ${prompt}`, '--model', env.INK_LABEL_MODEL || 'gemini-3.8-flash-high', '--mode', 'plan', '--add-dir', dir], { encoding: 'utf8', timeout: 600000 });
    if (r.error || r.status !== 0) throw new Error(r.error?.message ?? (String(r.stderr ?? '').trim().split('\n').at(-1) || `exit ${r.status}`));
    const labels = parseLabelReply(r.stdout, ids);
    if (!labels) throw new Error(`no labels in the reply: ${String(r.stdout).slice(0, 200)}`);
    return labels;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/**
 * Labels for the regions of the target's SAM map. From the cache when this target, region map and judge were labelled
 * before; else by the vision model `judge` ('codex' or 'agy'); a region it leaves out, or all of them when it cannot run,
 * take the simple classifier, and the record says so.
 * @returns { labels: { [id]: label }, source: { [id]: 'vision'|'simple' }, judge, cached, note? }
 */
export async function labelRegions({ image, regions, labelMap, w, h, judge = 'codex', cacheDir, segKey = '', log = () => {}, run = spawnSync, env = process.env }) {
  const ids = regions.map(r => r.id);
  const key = `${sha(fs.readFileSync(image))}-${segKey}-${judge}`, file = path.join(cacheDir, `${key}.json`);
  if (judge !== 'simple' && fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), cached: true };
  let vision = null, note = null;
  if (judge !== 'simple') {
    try { vision = askJudge(judge, await overlayPng({ image, labels: labelMap, w, h, ids }), ids, { run, env }); } catch (e) {
      note = `${judge} could not label the regions: ${e.message}`;
      log(`!!! ink labels: ${note}; every region takes the simple classifier of its colour and size`);
    }
  }
  const labels = {}, source = {};
  for (const r of regions) { if (vision?.[r.id]) { labels[r.id] = vision[r.id]; source[r.id] = 'vision'; } else { labels[r.id] = simpleLabel(r, { w, h }); source[r.id] = 'simple'; } }
  const out = { labels, source, judge: vision ? judge : 'simple', ...(note ? { note } : {}), cached: false };
  if (vision) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out) + '\n'); }
  return out;
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
    const label = cellLabel(Math.round(x + dx), Math.round(y + dy));
    const rule = INK_RULES[label];
    if (rule && RANK[rule.ink] > RANK[best.ink]) best = { ...rule, label };
  }
  return best;
}
