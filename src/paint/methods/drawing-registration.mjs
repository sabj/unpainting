// A prepared drawing put on the target it is painted on (--drawingfile, before every other line route). The painter maps
// a line file's image box onto the target's (src/crop/lines.mjs scaleLines, each axis on its own), so a file traced
// from another image, such as an image model's sketch drawn at another aspect, lands stretched and shifted. When the
// file's aspect and the target's differ by more than ASPECT_LIMIT, or the file names another image as its target
// (targetSHA256), the lines are registered to the target's own edges
// (src/crop/register-lines.mjs: scale, aspect and shift by a two-sided chamfer fit), written to
// <out>/lines-registered-lines.json with the transform and its scores, and the pens draw that file instead. Rounding
// between grids (a 540 x 442 file for a 304 x 249 target) stays well inside the limit and is left alone.
// The registered file names the painted target, so the line loader's check (src/crop/lines.mjs) passes it.
// Planning only: it reads the target once, before the target guard seals it. Reads --drawingfile, --image, --width.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { linePaths } from '../../crop/lines.mjs';
import { registerLines, applyRegistration } from '../../crop/register-lines.mjs';
import { edgeEvidence } from './line-evidence.mjs';

const ASPECT_LIMIT = 0.02;

/** How far a file's image aspect is from a target's, as a share (0 when they agree). */
export function aspectGap(image, tw, th) {
  const a = (image.w / image.h) / (tw / th);
  return Math.max(a, 1 / a) - 1;
}

/** The painted target as the line loader checks it: { sha256, w, h }. */
export async function lineTargetOf(image) {
  const meta = await sharp(image).metadata();
  return { sha256: crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex'), w: meta.width, h: meta.height };
}

/**
 * Register `base`'s line file to the target when their aspects differ (or always, with `force`), write it to
 * `stem`-lines.json (default <out>/lines-registered) and push --drawingfile onto argv.
 * @returns the registration record (also written into the new file), or null when the file needs none
 */
export async function registerDrawingFile({ base, image, root = '.', out, stem = path.join(out, 'lines-registered'), width, argv = [], force = false, log = () => {} }) {
  const file = path.resolve(root, linePaths(base).lines);
  if (!fs.existsSync(file)) return null;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!doc.image?.w || !doc.image?.h || (!force && doc.registration?.targetGrid)) return null;
  const t = await lineTargetOf(image), gap = aspectGap(doc.image, t.w, t.h);
  const otherImage = !!doc.targetSHA256 && doc.targetSHA256 !== t.sha256;
  if (!force && !(gap > ASPECT_LIMIT) && !otherImage) return null;
  const { data, info } = await sharp(image).removeAlpha().resize({ width }).raw().toBuffer({ resolveWithObject: true });
  const r = registerLines(doc.lines, doc.image, edgeEvidence(data, info.width, info.height));
  const grid = { w: info.width, h: info.height };
  const record = { file, aspectGap: +gap.toFixed(4), sourceSHA256: doc.targetSHA256 ?? null, targetSHA256: t.sha256, targetGrid: grid,
    scoreCells: Object.fromEntries(['naive', 'uniform', 'best'].map(k => [k === 'best' ? 'registered' : k, { both: r[k].score, linesToEdges: r[k].toEdges, edgesToLines: r[k].toLines, near: r[k].near }])), capCells: r.cap };
  const reg = { ...applyRegistration(doc, r.best, grid, record), targetSHA256: t.sha256 };
  fs.mkdirSync(path.dirname(path.resolve(stem)), { recursive: true });
  fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(reg) + '\n');
  argv.push('--drawingfile', stem);
  log(`drawing registration: ${path.basename(file)} is ${doc.image.w} x ${doc.image.h}, ${(100 * gap).toFixed(0)}% off the target's aspect${otherImage ? `, made for image ${doc.targetSHA256.slice(0, 8)} (the target is ${t.sha256.slice(0, 8)})` : ''}; registered to the target's edges (sx ${r.best.sx.toFixed(4)}, sy ${r.best.sy.toFixed(4)}, shift ${r.best.tx.toFixed(1)}, ${r.best.ty.toFixed(1)} cells): line to edge ${r.naive.score} to ${r.best.score} cells, ${(100 * r.naive.near).toFixed(1)}% to ${(100 * r.best.near).toFixed(1)}% of line on an edge; ${reg.lines.length} of ${doc.lines.length} lines on the sheet`);
  return reg.registration;
}
