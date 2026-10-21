// The ink line files held to the target before painting (ink-lines.mjs): the opening (--drawingfile) and closing
// (--drawinglast) files are smoothed (--linesmooth mm) and cut to where the target shows a line (--linesupport L*),
// written to <out>/ink-opening-lines.json and <out>/ink-closing-lines.json, and the pens pointed at them. The target's
// own line darkness and pixel size are measured on the way, for --inkdarkcap and --inkwidthfloor, and written to
// <out>/ink-lines.json.
// Planning only: it reads the target once, before the target guard seals it.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { linePaths } from '../../crop/lines.mjs';
import { labPlanes } from './line-evidence.mjs';
import { holdLinesToTarget } from './ink-lines.mjs';

/** The ink-line flags: { support (L*), smoothMm, cornerDeg, measure } where measure is whether anything reads the target. */
export function inkLineFlags(num) {
  const f = { support: num('linesupport', 0), smoothMm: num('linesmooth', 0), cornerDeg: num('linesmoothcorner', 50),
    darkCap: num('inkdarkcap', 0), widthFloor: num('inkwidthfloor', 0) };
  for (const [k, v] of Object.entries(f)) if (!Number.isFinite(v) || v < 0) throw new Error(`ink lines: ${k} must be a number of 0 or more, not ${v}`);
  if (f.cornerDeg > 180) throw new Error('--linesmoothcorner: degrees from 0 to 180');
  return { ...f, measure: f.support > 0 || f.smoothMm > 0 || f.darkCap > 0 || f.widthFloor > 0 };
}

const lPlaneCache = new Map();
async function lPlane(image, w, h) {
  const key = `${image}|${w}|${h}`;
  if (!lPlaneCache.has(key)) {
    const { data, info } = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
    lPlaneCache.set(key, labPlanes(data, info.width, info.height).L.map(v => 100 * v));
  }
  return lPlaneCache.get(key);
}

/**
 * Hold one line file to the target. Returns the stage record { file, out, stats, pixelMm } (out null when the file
 * is passed through unchanged), or null for a file with no lines.
 */
async function holdLineFile({ stage, base, image, root = '.', out, sheetMm, flags, targetW, log = () => {} }) {
  const file = path.resolve(root, linePaths(base).lines);
  if (!fs.existsSync(file)) return null;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(doc.lines) || !doc.lines.length) return null;
  const im = doc.image?.w && doc.image?.h ? doc.image : null;
  if (!im) throw new Error(`ink lines: ${path.basename(file)} has no image box, so its lines cannot be read against the target`);
  const L = await lPlane(image, im.w, im.h), pxMm = sheetMm / im.w;
  const r = holdLinesToTarget(doc.lines, L, im.w, im.h, { sigma: flags.smoothMm / pxMm, cornerDeg: flags.cornerDeg, threshold: flags.support });
  const record = { file, out: null, stats: r.stats, pixelMm: sheetMm / targetW, filePixelMm: pxMm };
  const changed = flags.support > 0 || flags.smoothMm > 0;
  if (changed) {
    const stem = path.join(out, `ink-${stage}`), next = { ...doc, lines: r.lines, inkLines: { source: file, support: flags.support, smoothMm: flags.smoothMm, cornerDeg: flags.cornerDeg } };
    if (!r.lines.length) next.empty = `no line of ${path.basename(file)} follows a line in the target (--linesupport ${flags.support})`;
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(next) + '\n');
    record.out = stem;
  }
  const s = r.stats, pct = v => `${(100 * v).toFixed(0)}%`;
  log(`ink lines, ${stage}: ${path.basename(file)}${flags.smoothMm > 0 ? `, smoothed at ${flags.smoothMm} mm (turning ${(s.turnBefore / pxMm).toFixed(1)} to ${(s.turnAfter / pxMm).toFixed(1)} degrees per mm)` : ''}`
    + `${flags.support > 0 ? `, ${s.pieces} pieces of ${s.kept} of ${s.lines} lines kept where the target shows a line of ${flags.support} L* or more (${pct(s.keptPx / Math.max(1e-9, s.lengthPx))} of the length)` : `, ${pct(s.supportedShare)} of the length on a target line`}`
    + `; target line L* ${s.lineL?.toFixed(1) ?? '-'} against ${s.sideL?.toFixed(1) ?? '-'} beside it`);
  return record;
}

/**
 * Hold the opening and closing files named by --drawingfile and --drawinglast. Pushes the new file names onto argv.
 * @returns { opening, closing } stage records (or null), also written to <out>/ink-lines.json
 */
export async function holdInkLines({ opt, num, argv, image, root = '.', out, sheetMm, log = () => {} }) {
  const flags = inkLineFlags(num);
  if (!flags.measure) return null;
  const targetW = (await sharp(image).metadata()).width, res = { flags };
  for (const [stage, key] of [['opening', 'drawingfile'], ['closing', 'drawinglast']]) {
    const base = opt(key, '');
    res[stage] = base ? await holdLineFile({ stage, base, image, root, out, sheetMm, flags, targetW, log }) : null;
    if (res[stage]?.out) argv.push('--' + key, res[stage].out);
  }
  res.pixelMm = sheetMm / targetW;
  fs.writeFileSync(path.join(out, 'ink-lines.json'), JSON.stringify(res, null, 1) + '\n');
  return res;
}
