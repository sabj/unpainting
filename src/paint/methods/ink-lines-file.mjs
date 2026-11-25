// Pipeline: inking, stage 2 (measure the lines).
// The opening (--drawingfile) and closing (--drawinglast) line files are drawn as they are: a drawing file is the
// selection, so nothing here cuts, smooths, decides or re-measures its lines. Only the target's own line darkness and
// pixel size are read, for --inkdarkmatch, --inkdarkcap and --inkwidthfloor, and written to <out>/ink-lines.json.
// (Holding a plan's own line file to the subject, with the region-label ink decision, was removed in 0.4; it last
// exists at commit 8ce5518a.)
// Planning only: it reads the target once, before the target guard seals it.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { linePaths, hasLineFile, readLineText } from '../../crop/lines.mjs';
import { labPlanes } from './line-evidence.mjs';
import { holdLinesToTarget } from './ink-lines.mjs';
import { strokesPeakAbsorbance, INK_STRENGTH_QUANTILE } from './ink-match.mjs';

/** The ink-line flags: { darkCap, widthFloor, darkMatch, measure } where measure is whether anything reads the target. */
export function inkLineFlags(num) {
  const f = { darkCap: num('inkdarkcap', 0), widthFloor: num('inkwidthfloor', 0), darkMatch: num('inkdarkmatch', 0) };
  for (const [k, v] of Object.entries(f)) if (!Number.isFinite(v) || v < 0) throw new Error(`ink lines: ${k} must be a number of 0 or more, not ${v}`);
  return { ...f, measure: f.darkCap > 0 || f.widthFloor > 0 || f.darkMatch > 0 };
}

const quantileOf = (P, q) => { const s = Float32Array.from(P).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const lPlaneCache = new Map();
async function lPlane(image, w, h) {
  const key = `${image}|${digest(image)}|${w}|${h}`;
  if (!lPlaneCache.has(key)) {
    const { data, info } = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
    lPlaneCache.set(key, labPlanes(data, info.width, info.height).L.map(v => 100 * v));
  }
  return lPlaneCache.get(key);
}

/** Measure one line file against the target. Returns the stage record { file, out: null, stats, pixelMm }, or null for a file with no lines. */
async function holdLineFileImpl({ stage, base, image, root = '.', sheetMm, flags, targetW, log = () => {} }) {
  const file = path.resolve(root, linePaths(base).lines);
  if (!hasLineFile(file)) return null;
  const doc = JSON.parse(readLineText(file));
  if (!Array.isArray(doc.lines) || !doc.lines.length) return null;
  if (!(doc.image?.w && doc.image?.h)) throw new Error(`ink lines: ${path.basename(file)} has no image box, so its lines cannot be read against the target`);
  const im = doc.image, L = await lPlane(image, im.w, im.h), pxMm = sheetMm / im.w;
  const r = holdLinesToTarget(doc.lines, L, im.w, im.h, { sigma: 0, cornerDeg: 50, threshold: 0, measure: false });
  // the target's line cores, as --inkdarkmatch reads the pen's strokes on its scrap
  const gestures = r.lines.map(g => ({ points: g.points.map(([x, y]) => ({ x, y })) }));
  // peakAbsorbance: the lines' median step against their sides (a record). inkAbsorbance: the ink's own strength, read on
  // the firm lines against bare paper; this is what the pen's load is matched to.
  const stats = flags.darkMatch > 0 ? { ...r.stats, peakAbsorbance: strokesPeakAbsorbance(L, im.w, im.h, gestures), inkAbsorbance: strokesPeakAbsorbance(L, im.w, im.h, gestures, { quantile: INK_STRENGTH_QUANTILE, paperL: quantileOf(L, 0.9) }) } : r.stats;
  const s = r.stats;
  log(`ink lines, ${stage}: ${path.basename(file)}, ${doc.lines.length} lines drawn as they are; target line L* ${s.lineL?.toFixed(1) ?? '-'} against ${s.sideL?.toFixed(1) ?? '-'} beside it`);
  return { file, out: null, stats, pixelMm: sheetMm / targetW, filePixelMm: pxMm };
}

const heldStages = new Map();
const digest = file => createHash('sha256').update(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from(readLineText(file))).digest('hex');
async function holdLineFile(args) {
  const file = path.resolve(args.root, linePaths(args.base).lines);
  if (!hasLineFile(file)) return null;
  const key = JSON.stringify([args.stage, file, digest(file), path.resolve(args.image), digest(args.image), args.sheetMm, args.targetW, args.flags]);
  if (heldStages.has(key)) { args.log(`ink lines, ${args.stage}: unchanged input, reused measurements`); return heldStages.get(key); }
  const record = await holdLineFileImpl(args);
  heldStages.set(key, record);
  return record;
}

/**
 * Measure the opening and closing files named by --drawingfile and --drawinglast.
 * @returns { opening, closing } stage records (or null), also written to <out>/ink-lines.json
 */
export async function holdInkLines({ opt, num, image, root = '.', out, sheetMm, log = () => {} }) {
  const flags = inkLineFlags(num);
  if (!flags.measure) return null;
  const targetW = (await sharp(image).metadata()).width, res = { flags };
  for (const [stage, key] of [['opening', 'drawingfile'], ['closing', 'drawinglast']]) {
    const base = opt(key, '');
    res[stage] = base ? await holdLineFile({ stage, base, image, root, sheetMm, flags, targetW, log }) : null;
  }
  res.pixelMm = sheetMm / targetW;
  fs.writeFileSync(path.join(out, 'ink-lines.json'), JSON.stringify(res, null, 1) + '\n');
  return res;
}
