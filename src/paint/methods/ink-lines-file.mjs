// Pipeline: inking, stage 2 (hold and measure the lines).
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
import { strokesPeakAbsorbance } from './ink-match.mjs';
import { separate } from '../../crop/inkwash.mjs';
import { decideFile } from './ink-decide-file.mjs';
import { DECIDE_DEFAULTS } from './ink-decide.mjs';
import { prepareSegments } from '../../crop/segment-prep.mjs';

/** The ink-line flags: { support (L*), smoothMm, cornerDeg, measure } where measure is whether anything reads the target. */
export function inkLineFlags(num) {
  const f = { support: num('linesupport', 0), smoothMm: num('linesmooth', 0), cornerDeg: num('linesmoothcorner', 50),
    darkCap: num('inkdarkcap', 0), widthFloor: num('inkwidthfloor', 0), lineMeasure: num('linemeasure', 0), darkMatch: num('inkdarkmatch', 0),
    gapMm: num('linegapmm', 0), minMm: num('lineminmm', 0), inkOnly: num('lineinkonly', 0),
    decide: num('inkdecide', 0), inkDarkRule: num('inkdarkrule', 0), joinMm: num('inkjoin', 0), shadowMask: num('inkshadowmask', 1), dropFaint: num('inkdropfaint', 1), geom: num('inkgeom', 0), foliage: num('inkfoliage', 0), salience: num('inksalience', 0), hatch: num('inkhatch', 0), hatchAngle: num('hatchangle', 45), hatchForm: num('hatchform', 0), widthMinMm: num('linewidthmin', 0.05), widthMaxMm: num('linewidthmax', 0.28), detailRatio: num('linedetailratio', 0.75), strokeMaxMm: num('linestrokemax', 0.5), probeMm: num('lineprobemm', 0.2) };
  for (const [k, v] of Object.entries(f)) if (!Number.isFinite(v) || v < 0) throw new Error(`ink lines: ${k} must be a number of 0 or more, not ${v}`);
  if (f.cornerDeg > 180) throw new Error('--linesmoothcorner: degrees from 0 to 180');
  return { ...f, measure: f.decide > 0 || f.support > 0 || f.smoothMm > 0 || f.darkCap > 0 || f.widthFloor > 0 || f.lineMeasure > 0 || f.darkMatch > 0 };
}

// a contour piece shorter than this, or turning faster than this, is detail (an eye, a pupil, a nostril)
const SHORT_MM = 6, CURVED_DEG_PER_MM = 25;
// the line files the models made: the lineart map's contours, and the source's own pen strokes gated by the map
const MODEL_KINDS = ['line-map', 'stroke'];

const quantileOf = (P, q) => { const s = Float32Array.from(P).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

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
 * --lineinkonly 1: the cells the ink separator (crop/inkwash.mjs) reads as pen line on the file's grid: narrow, darker
 * than both sides and in the picture's own ink colour. With --linesupport, a line is kept only along them.
 */
async function inkCells(image, w, h) {
  const { data } = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
  // paper: the mean of the lightest tenth, as the separator's callers take it
  const n = w * h, lum = i => 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2];
  const light = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum(b) - lum(a)).slice(0, Math.max(1, (n / 10) | 0));
  return separate(data, w, h, [0, 1, 2].map(c => light.reduce((t, i) => t + data[3 * i + c], 0) / light.length)).ink;
}

/** A line file's lines and widths scaled to a grid `gridW` pixels wide. */
function onGrid(doc, gridW) {
  const f = gridW / doc.image.w, image = { ...doc.image, w: gridW, h: Math.round(doc.image.h * f) };
  return { ...doc, image, lines: doc.lines.map(g => ({ ...g, points: g.points.map(([x, y]) => [x * f, y * f]), ...(Array.isArray(g.widths) ? { widths: g.widths.map(v => v * f) } : {}) })) };
}

/**
 * Hold one line file to the target. Returns the stage record { file, out, stats, pixelMm } (out null when the file
 * is passed through unchanged), or null for a file with no lines.
 */
async function holdLineFile({ stage, base, image, root = '.', out, sheetMm, flags, targetW, gridW = 0, log = () => {}, decide = null }) {
  const file = path.resolve(root, linePaths(base).lines);
  if (!fs.existsSync(file)) return null;
  const doc0 = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(doc0.lines) || !doc0.lines.length) return null;
  if (!(doc0.image?.w && doc0.image?.h)) throw new Error(`ink lines: ${path.basename(file)} has no image box, so its lines cannot be read against the target`);
  // with --linemeasure, a file drawn on a finer grid than the pen's is read on the pen's grid (the painting's, or with
  // --inkres N, N times as fine), so the support test's one to two pixels beside a line are as wide as the pen line it will draw
  let doc = flags.lineMeasure > 0 && gridW > 0 && doc0.image.w > 1.25 * gridW ? onGrid(doc0, gridW) : doc0;
  const im = doc.image, L = await lPlane(image, im.w, im.h), pxMm = sheetMm / im.w;
  // --inkdecide 1: a lineart map's candidate lines are drawn only where the ink rule of the ground under them allows it and
  // the source shows a pen line, not a mass edge (ink-decide-file.mjs). Once: a stage file made from decided lines is not decided again.
  let decided = doc.inkDecided === true;
  if (decide && MODEL_KINDS.includes(doc0.inputKind) && !decided) {
    const r = await decideFile({ doc, L, image, out, stage, pxMm, ...decide, geom: flags.geom > 0, shadowMask: flags.shadowMask > 0, o: { ...DECIDE_DEFAULTS, dropFaint: flags.dropFaint > 0 }, foliage: flags.foliage > 0, inkDarkRule: flags.inkDarkRule > 0, joinMm: flags.joinMm, salient: flags.salience > 0, hatch: flags.hatch > 0 ? { angle: flags.hatchAngle, form: flags.hatchForm > 0 } : null, log });
    doc = { ...doc, lines: r.lines, inkDecided: true }; decided = true;
  }
  // --linegapmm and --lineminmm: the support filter joins gaps up to this long and drops pieces shorter than this
  // (defaults 2 and 3 of the file's pixels)
  // A lineart map's contours (copy-lines --kind line-map) are measured, never cut: the map says where the line is, and the
  // target's pixels only set its width and darkness. Their pieces are never drawn on damp paper (--inkbleed).
  const model = MODEL_KINDS.includes(doc0.inputKind), support = model ? 0 : flags.support;
  const opts = { sigma: flags.smoothMm / pxMm, cornerDeg: flags.cornerDeg, threshold: support,
    ...(flags.gapMm > 0 ? { gapPx: flags.gapMm / pxMm } : {}), ...(flags.minMm > 0 ? { minRunPx: flags.minMm / pxMm } : {}) };
  const inkMask = flags.inkOnly > 0 && support > 0 ? await inkCells(image, im.w, im.h) : null;
  // a map's contours: widths held to the pen's range (--linewidthmin, --linewidthmax, --linedetailmm for short or curved
  // pieces), read with a probe of --lineprobemm either way so a wash beside the line is not taken for the line
  // a traced pen stroke carries its own width: up to --linestrokemax mm, no detail ratio, no darkness shrink
  const stroke = doc0.inputKind === 'stroke';
  const contour = model ? { reach: Math.max(1.5, flags.probeMm / pxMm), widthPx: { min: flags.widthMinMm / pxMm, max: (stroke ? flags.strokeMaxMm : flags.widthMaxMm) / pxMm, detail: stroke ? 1 : flags.detailRatio, darkWidth: !stroke, paperWeight: stroke, paperL: stroke ? quantileOf(L, 0.9) : null, shortPx: SHORT_MM / pxMm, curvedDegPerPx: CURVED_DEG_PER_MM * pxMm } } : {};
  const r = holdLinesToTarget(doc.lines, L, im.w, im.h, { ...opts, measure: flags.lineMeasure > 0, inkMask, contour: model, ...contour });
  // the target's line cores, as --inkdarkmatch reads the pen's strokes on its scrap
  const gestures = r.lines.map(g => ({ points: g.points.map(([x, y]) => ({ x, y })) }));
  const stats = flags.darkMatch > 0 ? { ...r.stats, peakAbsorbance: strokesPeakAbsorbance(L, im.w, im.h, gestures) } : r.stats;
  const record = { file, out: null, stats, pixelMm: sheetMm / targetW, filePixelMm: pxMm, ...(model ? { model: true } : {}) };
  const changed = support > 0 || flags.smoothMm > 0 || flags.lineMeasure > 0 || decided;
  if (changed) {
    const stem = path.join(out, `ink-${stage}`), next = { ...doc, lines: r.lines, ...(decided ? { inkDecided: true } : {}), inkLines: { source: file, support, smoothMm: flags.smoothMm, cornerDeg: flags.cornerDeg, measured: flags.lineMeasure > 0 } };
    if (!r.lines.length) next.empty = `no line of ${path.basename(file)} follows a line in the target (--linesupport ${support})`;
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(next) + '\n');
    record.out = stem;
  }
  const s = r.stats, pct = v => `${(100 * v).toFixed(0)}%`;
  log(`ink lines, ${stage}: ${path.basename(file)}${flags.smoothMm > 0 ? `, smoothed at ${flags.smoothMm} mm (turning ${(s.turnBefore / pxMm).toFixed(1)} to ${(s.turnAfter / pxMm).toFixed(1)} degrees per mm)` : ''}`
    + `${support > 0 ? `, ${s.pieces} pieces of ${s.kept} of ${s.lines} lines kept where the target shows a line of ${support} L* or more (${pct(s.keptPx / Math.max(1e-9, s.lengthPx))} of the length)` : `, ${model ? 'lineart map lines, measured and not cut, ' : ''}${pct(s.supportedShare)} of the length on a target line`}`
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
  // the regions the ink decision reads: SAM's, cached by the target's hash (the painter asks for them again later)
  const decide = flags.decide > 0 ? { segments: prepareSegments({ image, root, out, opt, log }), judge: opt('inklabeljudge', 'codex'), cacheDir: path.resolve(root, opt('inklabelcache', 'work/line-labels')) } : null;
  const targetW = (await sharp(image).metadata()).width, res = { flags };
  for (const [stage, key] of [['opening', 'drawingfile'], ['closing', 'drawinglast']]) {
    const base = opt(key, '');
    res[stage] = base ? await holdLineFile({ stage, base, image, root, out, sheetMm, flags, targetW, gridW: num('width', 0) * Math.max(1, Math.round(num('inkres', 1))), log, decide }) : null;
    if (res[stage]?.out) argv.push('--' + key, res[stage].out);
  }
  res.pixelMm = sheetMm / targetW;
  fs.writeFileSync(path.join(out, 'ink-lines.json'), JSON.stringify(res, null, 1) + '\n');
  return res;
}
