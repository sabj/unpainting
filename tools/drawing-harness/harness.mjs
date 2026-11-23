// The drawing harness (0.4 rc3): pencil and ink rigorously harnessed. A matrix of small whole painter runs on the CPU,
// each cell checked from the painter's own records (drawing-laid*.json, ink-held.json, frames.json, the log) and the
// rendered sheet (drawing-opening.png, painting.png):
//
//   medium   pencil | waterproof ink | soluble ink | none
//   when     before the washes | after them, over the dry paint
//   who      Auto's default | a model's lines file | a model's own drawn lines
//   size     a look (half the cells across, finalwidth the full) | the full painting
//
// `node tools/drawing-harness/harness.mjs --out DIR [--md FILE]` runs every cell and writes results.json (and the
// markdown table); harness.test.mjs runs it inside `npm test`; acceptance.mjs is the GPU check on a real subject.
// A cell that cannot exist says why (Auto has no choice of when or of lines); a cell that fails says what failed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { writeLinesEdit, linesListing, LINES_EDIT_FORMAT } from '../paint/lines-edit.mjs';
import { strokesToLay } from '../../src/paint/methods/drawing-default.mjs';
import { paintedShare, filmShrinks } from '../../src/paint/film-painted.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MEDIA = ['pencil', 'waterproof', 'soluble', 'none'], WHENS = ['before', 'after'], WHO = ['auto', 'lines', 'own'], SIZES = ['look', 'full'];
/** The stated limits: a pencil line under the washes moves at most this share out of its cells; waterproof ink none
 *  beyond float rounding (0.01%); soluble ink the painter's own limit (ink-held.json `most`). */
export const LIMITS = Object.freeze({ pencilMoved: 0.001, waterproofMoved: 1e-4, lookFinalDrawing: 0.85, continuityBreaks: 0.05, weightDarker: 1.15, eraseShare: 0.5 });
const W = 48, H = 36, MM = 48, LOOK = 24;

// the subject: a pale paper with one blue block (the washes) over the middle of the drawing
const SVG = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#faf7ef"/><rect x="4" y="11" width="40" height="15" fill="#8fa6bd"/></svg>`;
// the drawing: five horizontal strokes, 0.3 mm wide (finer than a 1 mm cell), the third and fourth hatching tagged drop
const Y = { 1: 6, 2: 14, 3: 19, 4: 23, 5: 31 }, PART = { 1: 'outline', 2: 'outline', 3: 'hatch', 4: 'hatch', 5: 'outline' };
// (the contours run the sheet's width, the hatching a third of it: the film lays the big forms first)
const X = seq => (PART[seq] === 'hatch' ? [16, 32] : [6, 42]);
const strokeAt = (seq, medium) => { const [a, b] = X(seq); return { seq, line: seq, part: PART[seq], phase: PART[seq] === 'hatch' ? 'texture' : 'growth', object: 0, unit: 0, dark: 0.6, medium,
  path: [[a, Y[seq]], [(a + b) / 2, Y[seq]], [b, Y[seq]]], widths: [0.3, 0.3, 0.3], drawn: 'path', outline: [[[a, Y[seq] - 0.15], [b, Y[seq] - 0.15], [b, Y[seq] + 0.15], [a, Y[seq] + 0.15]]],
  ...(PART[seq] === 'hatch' ? { drop: true } : {}) }; };
export const drawingDoc = medium => ({ source: 'drawing harness', medium, sheetMm: MM, heightMm: H, fills: 'marked',
  strokes: [1, 2, 3, 4, 5].map(seq => strokeAt(seq, medium === 'ink' ? 'ink' : 'graphite')) });

/** Writes the subject and both drawings (pencil and ink) into `dir`. */
export async function writeSubject(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'target.png');
  await sharp(Buffer.from(SVG)).png().toFile(target);
  const stems = {};
  for (const m of ['pencil', 'ink']) {
    const stem = path.join(dir, `drawing-${m}`), doc = drawingDoc(m);
    fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify(doc));
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify({ image: { w: W, h: H }, inputKind: 'drawing', medium: m === 'ink' ? 'ink' : 'pencil', lines: doc.strokes.map(s => ({ seq: s.seq, points: s.path.map(([x, y]) => [x, y]), width: 0.3, weight: 1, role: m === 'ink' ? 'pen stroke' : 'pencil stroke', length: 36 })) }));
    stems[m] = stem;
  }
  return { target, stems };
}

/** Every cell of the matrix, with why it does not exist when it does not. */
export function cells() {
  const out = [];
  for (const medium of MEDIA) for (const when of WHENS) for (const who of WHO) for (const size of SIZES) {
    const na = who === 'auto' && when === 'after' ? 'Auto lays its drawing before the washes; drawing after them is a model\'s choice'
      : medium === 'none' && when === 'after' && who !== 'own' ? 'with no drawing nothing is laid before or after' : null;
    out.push({ id: `${medium}/${when}/${who}/${size}`, medium, when, who, size, na });
  }
  return out;
}

const INKFAST = { waterproof: '1', soluble: '0' };
/** The painter's arguments for a cell, and what it must lay: {args, expect: {opening, closing (ids or null), medium, edit}}. */
export function cellPlan(cell, { target, stems, dir }) {
  const { medium, when, who, size } = cell, args = ['--image', target, '--washplan', target];
  const pen = medium === 'waterproof' || medium === 'soluble';
  let expect;
  if (who === 'auto') {
    if (medium === 'none') { args.push('--drawing', 'none'); expect = { opening: null, closing: null, medium: null }; }
    else {
      const doc = drawingDoc(pen ? 'ink' : 'pencil');
      args.push('--drawingfile', pen ? stems.ink : stems.pencil, '--drawing', 'first', '--stages', 'none');
      if (pen) args.push('--inkrecipe', 'wash', '--inkfast', INKFAST[medium]); else args.push('--outlinemedium', 'graphite');
      expect = { opening: strokesToLay(doc, JSON.parse(fs.readFileSync(`${pen ? stems.ink : stems.pencil}-lines.json`, 'utf8'))).strokes.map(s => s.seq), closing: null, medium: pen ? 'ink' : 'pencil' };
    }
  } else {
    // a model's choice on the pencil drawing (so a pen choice crosses the drawing's own medium): the session's own writer
    const vectors = drawingDoc('pencil'), listing = linesListing(vectors);
    const rules = who === 'lines' ? (when === 'before' ? [{ where: { ids: [3] }, do: 'before' }, { where: { ids: [5] }, weight: 2 }] : [{ where: { ids: [1, 2] }, do: 'after' }]) : [];
    const own = who === 'own' ? [{ points: [[8, 34], [40, 34]], medium: pen ? 'pen' : 'pencil', widthMm: 0.3, dark: 0.6, when }] : undefined;
    const edit = { format: LINES_EDIT_FORMAT, rules, ...(own ? { own } : {}) };
    const got = writeLinesEdit({ dir: path.join(dir, 'choice'), stem: stems.pencil, edit, listing, medium: pen ? 'pen' : medium });
    const ids = stem => stem ? JSON.parse(fs.readFileSync(`${stem}-vectors.json`, 'utf8')).strokes.map(s => s.seq) : null;
    for (const [k, v] of got.sets) {
      if (k === 'drawing') args.push('--drawingfile', v);
      else if (k === 'drawingorder') args.push('--drawing', v);
      else if (k === 'inkfast' && pen) continue; // the cell's ink is named below
      else args.push(`--${k}`, v);
    }
    if (got.order === 'none') args.push('--drawing', 'none');
    else if (!got.sets.some(([k]) => k === 'drawingorder')) args.push('--drawing', 'first');
    if (pen) args.push('--inkfast', INKFAST[medium]);
    args.push('--stages', 'none');
    expect = { opening: got.order === 'last' ? null : ids(got.opening), closing: ids(got.closing), medium: got.laidAs, edit: got.record };
  }
  if (size === 'look') args.push('--width', String(LOOK), '--finalwidth', String(W)); else args.push('--width', String(W));
  return { args, expect };
}

const BASE = ['--allowdirty', '1', '--scale', '1', '--sheetmm', String(MM), '--mode', 'fast', '--threads', '1', '--feedback', '0', '--notargetlooks', '1', '--targetguard', 'strict', '--video', '1', '--frames', '12', '--segments', 'off'];
/** Runs the painter for one cell into `out`; resolves {code, log}. */
export function runPainter(args, out, { timeout = 280000, gpu = false } = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, ['tools/paint-plate.mjs', ...BASE, '--gpu', gpu ? 'on' : 'off', ...args, '--out', out], { cwd: ROOT, timeout, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      const log = `${stdout ?? ''}${stderr ?? ''}`; fs.writeFileSync(`${out}.log`, log);
      resolve({ code: err ? (err.code ?? 1) : 0, log });
    });
  });
}

const readJson = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const hashIds = ids => crypto.createHash('sha256').update(ids.join(',')).digest('hex');
async function grey(file) { const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
/** Mean darkness (0..1, against the picture's paper) along a stroke's row in mm, at the picture's own scale. */
function darknessAlong(img, yMm, { x0 = 10, x1 = 38 } = {}) {
  const s = img.w / MM, paper = img.data[Math.round(2 * s) * img.w + Math.round(2 * s)], v = [];
  for (let x = Math.round(x0 * s); x <= Math.round(x1 * s); x++) {
    let d = 0; for (let dy = -Math.ceil(s); dy <= Math.ceil(s); dy++) { const y = Math.round(yMm * s) + dy; if (y >= 0 && y < img.h) d = Math.max(d, (paper - img.data[y * img.w + x]) / Math.max(1, paper)); }
    v.push(Math.max(0, d));
  }
  const sorted = [...v].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  return { mean: v.reduce((a, b) => a + b, 0) / v.length, median, breaks: median > 0 ? v.filter(d => d < 0.5 * median).length / v.length : 1 };
}

/** A line's contrast (0..1) against the picture just above and below it (2 mm off), along its middle: the line over paint. */
function contrastAlong(img, yMm, { x0 = 10, x1 = 38 } = {}) {
  const s = img.w / MM, v = [], at = (x, y) => img.data[Math.max(0, Math.min(img.h - 1, y)) * img.w + x];
  for (let x = Math.round(x0 * s); x <= Math.round(x1 * s); x++) {
    const ref = (at(x, Math.round((yMm - 2) * s)) + at(x, Math.round((yMm + 2) * s))) / 2;
    let lo = 255; for (let dy = -Math.ceil(s); dy <= Math.ceil(s); dy++) lo = Math.min(lo, at(x, Math.round(yMm * s) + dy));
    v.push(Math.max(0, (ref - lo) / Math.max(1, ref)));
  }
  const sorted = [...v].sort((a, b) => a - b); return sorted[sorted.length >> 1];
}

/** A run's film checked for paint that is shown and then lost (film-painted.mjs): the drops, or null with no film. */
export async function filmLosses(out) {
  const fr = readJson(path.join(out, 'frames.json'))?.frames;
  if (!fr?.length) return null;
  const read = f => sharp(path.join(out, f.src)).resize(96, 96, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const paper = await read(fr[0]), shares = [];
  for (const f of fr) shares.push(paintedShare(await read(f), paper));
  return filmShrinks(shares, fr);
}

/** Checks one finished cell: [{check, ok, detail}]. */
export async function checkCell(cell, expect, out, { code, log }) {
  const R = [], put = (check, ok, detail = '') => R.push({ check, ok: Boolean(ok), detail });
  if (code !== 0) {
    // the only stop a drawing may cause is soluble ink moving more than its limit, said plainly
    const loud = /moved [\d.]+% of the pen's ink|INK MOVED|first wash moved/i.test(log);
    put('the painting finished', cell.medium === 'soluble' && loud, cell.medium === 'soluble' && loud ? 'stopped loudly: soluble ink moved past its limit' : `exit ${code}: ${log.split('\n').filter(Boolean).slice(-3).join(' | ')}`);
    return R;
  }
  const opening = readJson(path.join(out, 'drawing-laid.json')), closing = readJson(path.join(out, 'drawing-laid-closing.json'));
  // the lines drawn are exactly the lines chosen, by ids and their hash; nothing when there is no drawing
  const same = (rec, ids) => ids == null ? rec == null || rec.laid === 0 : rec != null && rec.laidSha256 === hashIds(ids) && rec.laidIds.join() === ids.join();
  put('lines laid before the washes are the lines chosen', same(opening, expect.opening), `laid ${opening?.laidIds?.join(',') ?? 'none'}, chosen ${expect.opening?.join(',') ?? 'none'}`);
  put('lines laid after the washes are the lines chosen', same(closing, expect.closing), `laid ${closing?.laidIds?.join(',') ?? 'none'}, chosen ${expect.closing?.join(',') ?? 'none'}`);
  // before or after as asked: the record's own time, and the log's order (a closing drawing is laid after a wash)
  if (closing) { const at = log.indexOf('drawing after the washes'), wash = log.search(/^pass \d|^value pass|^stage 1|^wash /m); put('the closing lines are laid after the washes', closing.when === 'after' && at > 0 && (wash < 0 || at > wash), `when ${closing.when}`); }
  // the medium on the sheet is the one chosen
  const laidMedium = rec => rec == null ? null : /ink/.test(String(rec.medium)) ? 'ink' : 'pencil';
  if (expect.medium) put('the medium on the sheet is the one chosen', [opening, closing].filter(Boolean).every(r => laidMedium(r) === (expect.medium === 'ink' ? 'ink' : 'pencil')) && (expect.medium !== 'ink' || /\(ink\) on a/.test(log)), `chosen ${expect.medium}, laid ${[opening, closing].filter(Boolean).map(laidMedium).join(', ')}`);
  else put('no drawing on the sheet', !/ink vectors: \d+ strokes/.test(log) || /ink vectors: 0 strokes/.test(log) || cell.who === 'own', '');
  // ink and pencil under the washes: waterproof moves none, soluble within the painter's limit, pencil within the stated amount
  const held = readJson(path.join(out, 'ink-held.json'));
  if (cell.when === 'before' && expect.opening?.length) {
    if (cell.medium === 'waterproof') put('waterproof ink moves none under the washes', held && held.moved <= LIMITS.waterproofMoved, held ? `moved ${(100 * held.moved).toFixed(3)}%` : 'no ink-held record');
    if (cell.medium === 'soluble') put('soluble ink moves within its limit', held && held.moved <= held.most, held ? `moved ${(100 * held.moved).toFixed(2)}% (limit ${(100 * held.most).toFixed(1)}%)` : 'no ink-held record');
    const gheld = readJson(path.join(out, 'graphite-held.json'));
    if (cell.medium === 'pencil') put(`pencil is not smeared (at most ${100 * LIMITS.pencilMoved}% moved)`, gheld && gheld.moved <= LIMITS.pencilMoved, gheld ? `moved ${(100 * gheld.moved).toFixed(3)}%` : 'no graphite-held record');
  }
  // the rendered sheet: the drawing shows where it was laid, continuous, weights honoured
  const pic = fs.existsSync(path.join(out, 'drawing-opening.png')) ? await grey(path.join(out, 'drawing-opening.png')) : null;
  // the opening drawing holds the lines laid before the first washes; those laid with a later stage (drawing-phases.mjs)
  // are on the sheet from their phase on, and must show on the finished painting
  const before = opening?.opening ?? expect.opening, phased = (expect.opening ?? []).filter(id => !(before ?? []).includes(id));
  if (pic && before?.length) {
    const shown = before.filter(id => Y[id]).map(id => [id, darknessAlong(pic, Y[id], { x0: X(id)[0] + 2, x1: X(id)[1] - 2 })]);
    put('every chosen line shows on the opening drawing, unbroken', shown.every(([, d]) => d.median > 0.03 && d.breaks <= LIMITS.continuityBreaks), shown.map(([id, d]) => `${id}: dark ${d.median.toFixed(2)}, breaks ${(100 * d.breaks).toFixed(0)}%`).join('; '));
    const left = [1, 2, 3, 4, 5].filter(id => !expect.opening.includes(id) && !(expect.closing ?? []).includes(id));
    if (left.length) put('lines not chosen do not show', left.every(id => darknessAlong(pic, Y[id]).median < 0.02), left.map(id => `${id}: ${darknessAlong(pic, Y[id]).median.toFixed(3)}`).join('; '));
    if (cell.who === 'lines' && cell.when === 'before' && before.includes(5) && before.includes(1)) { const a = darknessAlong(pic, Y[5]).median, b = darknessAlong(pic, Y[1]).median; put('a weight of 2 lays its line darker', a >= LIMITS.weightDarker * b, `weighted ${a.toFixed(2)} against ${b.toFixed(2)}`); }
  }
  // lines drawn after the washes show on the finished painting, over the paint
  const fin = fs.existsSync(path.join(out, 'painting.png')) ? await grey(path.join(out, 'painting.png')) : null;
  if (fin && phased.length) {
    const shown = phased.filter(id => Y[id]).map(id => [id, contrastAlong(fin, Y[id], { x0: X(id)[0] + 2, x1: X(id)[1] - 2 })]);
    put('the lines drawn with a later stage show on the finished painting', shown.every(([, c]) => c > 0.03), shown.map(([id, c]) => `${id}: contrast ${c.toFixed(2)}`).join('; '));
  }
  R.push(...phaseChecks(out, opening));
  if (fin && expect.closing?.length) {
    const shown = expect.closing.filter(id => Y[id]).map(id => [id, contrastAlong(fin, Y[id], { x0: X(id)[0] + 2, x1: X(id)[1] - 2 })]);
    put('the lines drawn after the washes show on the finished painting', shown.every(([, c]) => c > 0.03), shown.map(([id, c]) => `${id}: contrast ${c.toFixed(2)}`).join('; '));
  }
  // the film shows the drawing being drawn over several frames, big forms first
  const frames = readJson(path.join(out, 'frames.json'));
  if (expect.opening?.length > 1 && frames) {
    // (the opening drawing's frames, before the first paint: a later phase is drawn big forms first within itself)
    const all = frames.frames ?? [], paintAt = all.findIndex(f => f.stage === 'paint');
    const drawing = (paintAt < 0 ? all : all.slice(0, paintAt)).filter(f => f.stage === 'drawing' && Array.isArray(f.ids));
    const len = ids => ids.reduce((a, id) => a + (Y[id] ? X(id)[1] - X(id)[0] : 0), 0) / Math.max(1, ids.filter(id => Y[id]).length);
    const every = all.filter(f => f.stage === 'drawing' && Array.isArray(f.ids));
    put('the film shows the drawing drawn over several frames', every.length >= 2, `${every.length} drawing frames`);
    if (drawing.length >= 2) put('the film lays the big forms first', len(drawing[0].ids) >= len(drawing.at(-1).ids), `first frame lines ${len(drawing[0].ids).toFixed(0)} mm long on average, last ${len(drawing.at(-1).ids).toFixed(0)} mm`);
  }
  const lost = await filmLosses(out);
  if (lost) put('the film never loses paint it has shown (but at an erase)', !lost.length, lost.length ? lost.map(d => `frame ${d.at}: ${d.from} to ${d.to}`).join('; ') : 'no drop');
  return R;
}

/** Look against final for the same choice: the same lines laid and the same drawing on the sheet. */
export async function checkLookFinal(lookOut, fullOut) {
  const a = readJson(path.join(lookOut, 'drawing-laid.json')), b = readJson(path.join(fullOut, 'drawing-laid.json'));
  if (!a && !b) return [{ check: 'look and final lay the same lines', ok: true, detail: 'neither lays a drawing' }];
  const R = [{ check: 'look and final lay the same lines', ok: Boolean(a && b && a.laidSha256 === b.laidSha256), detail: `${a?.laid ?? 0} and ${b?.laid ?? 0} lines` }];
  const fa = path.join(lookOut, 'drawing-opening.png'), fb = path.join(fullOut, 'drawing-opening.png');
  // the lines go down with the washes that need them (drawing-phases.mjs): a look whose plan has other washes than the
  // final's times them otherwise, and its opening drawing is not the final's; with the same plan it must be
  const open = r => (r?.opening ?? r?.laidIds ?? []).join(), washes = d => readJson(path.join(d, 'drawing-phases.json'))?.washes ?? readJson(path.join(d, 'value-plan.json'))?.summary?.washes ?? null;
  if (open(a) !== open(b)) {
    const wa = washes(lookOut), wb = washes(fullOut);
    R.push({ check: 'look and final open with the same lines, or their plans differ', ok: wa !== wb, detail: `look opens with ${a?.opening?.length ?? a?.laid} lines over ${wa} washes, final with ${b?.opening?.length ?? b?.laid} over ${wb}` });
  } else if (fs.existsSync(fa) && fs.existsSync(fb)) {
    const A = await grey(fa), B = await sharp(fb).greyscale().resize(A.w, A.h, { kernel: 'cubic' }).raw().toBuffer();
    let ma = 0, mb = 0; for (let i = 0; i < A.data.length; i++) { ma += A.data[i]; mb += B[i]; } ma /= A.data.length; mb /= A.data.length;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < A.data.length; i++) { const x = A.data[i] - ma, y = B[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    const r = sab / Math.sqrt(saa * sbb || 1);
    R.push({ check: 'look and final show the same drawing', ok: r >= LIMITS.lookFinalDrawing, detail: `correlation ${r.toFixed(3)}` });
  }
  return R;
}

/**
 * The eraser cell: Auto's pencil lay-in under a painting script that washes the lower half and rubs out the left half of
 * the top contour (stroke 1) on bare paper. The plan's answer says what the eraser takes there (eraserTakes); the
 * painter's own record of each rub (value-commands.jsonl) and the finished painting must show that much gone, and the
 * pencil on the fine sheet lifted with it (fine-erase.mjs).
 */
export async function eraseCell(dir, { gpu = false } = {}) {
  const subject = await writeSubject(dir), script = path.join(dir, 'erase-script.json');
  fs.writeFileSync(script, JSON.stringify({ format: 'painting-script 2', author: 'drawing harness', sheet: { widthMm: MM, heightMm: H }, palette: ['ochre', 'ultramarine'],
    brushes: { mop: { shape: 'round', widthMm: 8 } }, passages: [
      { id: 'ground', what: 'the lower half', stage: 1, kind: 'wash', region: [[4, 20], [44, 20], [44, 34], [4, 34]], paint: { pigments: { ultramarine: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } },
      { id: 'rub', what: 'the left half of the top contour', stage: 2, kind: 'erase', widthMm: 3, region: [[4, 4], [22, 4], [22, 8], [4, 8]], handling: { pressure: 1 }, wait: 'dry' }] }));
  const out = path.join(dir, 'plate'), done = await runPainter(['--image', subject.target, '--washplan', `script:${script}`, '--drawingfile', subject.stems.pencil, '--drawing', 'first', '--stages', 'none', '--outlinemedium', 'graphite', '--paints', 'ochre,ultramarine', '--paintsextend', '0', '--width', String(W)], out, { gpu });
  const R = [], put = (check, ok, detail) => R.push({ check, ok: Boolean(ok), detail });
  if (done.code !== 0) { put('the painting finished', false, done.log.split('\n').filter(Boolean).slice(-3).join(' | ')); return R; }
  const plan = readJson(path.join(out, 'value-plan.json')), said = (plan?.passes ?? []).find(q => q.kind === 'erase')?.erase;
  const rubs = fs.readFileSync(path.join(out, 'value-commands.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(q => q.kind === 'erase');
  const share = rubs.reduce((a, q) => a + (q.graphiteShare ?? 0), 0) / Math.max(1, rubs.length);
  put('the eraser is in the plan with what it takes', said?.takes?.bare > 0, said ? `the answer: ${Math.round(100 * said.takes.bare)}% off bare paper` : 'no erase instruction');
  put('each rub takes what the plan answer says', said && rubs.length && Math.abs(share - said.takes.bare) <= 0.1, `${rubs.length} rubs took ${(100 * share).toFixed(0)}% of the pencil under them on average`);
  const fin = await grey(path.join(out, 'painting.png')), left = darknessAlong(fin, Y[1], { x0: 8, x1: 20 }).median, right = darknessAlong(fin, Y[1], { x0: 26, x1: 40 }).median;
  put('the rubbed half of the line is gone from the finished painting', left <= LIMITS.eraseShare * right, `rubbed ${left.toFixed(3)}, kept ${right.toFixed(3)}`);
  return R;
}

/** What a run's drawing phases record says: every phase on dry paper, and what the washes over it moved within limits. */
function phaseChecks(out, laid) {
  const rec = readJson(path.join(out, 'drawing-phases.json')), R = [];
  if (!laid?.phases?.length) return R;
  const put = (check, ok, detail) => R.push({ check, ok: Boolean(ok), detail });
  put('every phase of the drawing is laid, on dry paper', rec && rec.phases.length === laid.phases.length && rec.phases.every(p => p.paperWasDry || p.extraDryMs >= 0), rec ? `${rec.phases.length} of ${laid.phases.length} phases laid, ${rec.extraDries} needed the paper dried first` : 'no drawing-phases.json');
  const held = fs.existsSync(path.join(out, 'drawing-phases-held.jsonl')) ? fs.readFileSync(path.join(out, 'drawing-phases-held.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  for (const h of held) put(`a phase's ${h.medium} moves within its limit under the next wash`, h.moved <= (h.medium === 'graphite' ? LIMITS.pencilMoved : LIMITS.waterproofMoved), `moved ${(100 * h.moved).toFixed(3)}%`);
  return R;
}

/**
 * The drawing laid in phases with a two-stage painting (drawing-phases.mjs): a script washes the lower part in stage 1
 * and the band round line 2 in stage 2. Auto's pencil lays line 2 with stage 2, the rest first; a pen drawing is inked
 * whole first; a model's "stage 2" lays its line with stage 2 in pencil or in waterproof ink. Each phase on dry paper,
 * filmed after paint, and the washes over it move it no more than the stated limits.
 */
export async function phasesCells(dir, { gpu = false } = {}) {
  const subject = await writeSubject(dir), script = path.join(dir, 'two-stages.json');
  fs.writeFileSync(script, JSON.stringify({ format: 'painting-script 2', author: 'drawing harness', sheet: { widthMm: MM, heightMm: H }, palette: ['ochre', 'ultramarine'],
    brushes: { mop: { shape: 'round', widthMm: 8 } }, passages: [
      { id: 'ground', what: 'the lower part', stage: 1, kind: 'wash', region: [[4, 21], [44, 21], [44, 34], [4, 34]], paint: { pigments: { ochre: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } },
      { id: 'band', what: 'the band round line 2', stage: 2, kind: 'wash', region: [[4, 9], [44, 9], [44, 18], [4, 18]], paint: { pigments: { ultramarine: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } }] }));
  const base = ['--image', subject.target, '--washplan', `script:${script}`, '--drawing', 'first', '--stages', 'none', '--paints', 'ochre,ultramarine', '--paintsextend', '0', '--width', String(W)];
  const choose = (name, rules, medium, own) => {
    const got = writeLinesEdit({ dir: path.join(dir, name, 'choice'), stem: subject.stems.pencil, edit: { format: LINES_EDIT_FORMAT, rules, ...(own ? { own } : {}) }, listing: linesListing(drawingDoc('pencil')), medium });
    const args = []; for (const [k, v] of got.sets) args.push(k === 'drawing' ? '--drawingfile' : `--${k}`, v); return args;
  };
  const cases = [
    { id: 'pencil-auto', args: ['--drawingfile', subject.stems.pencil, '--outlinemedium', 'graphite'], opening: [1, 5], phases: [[2]] },
    { id: 'pen-auto', args: ['--drawingfile', subject.stems.ink, '--inkrecipe', 'wash', '--inkfast', '1'], opening: [1, 2, 3, 4, 5], phases: [] },
    { id: 'pencil-model', args: [...choose('pencil-model', [{ where: { ids: [1] }, do: 'stage 2' }, { where: { ids: [2] }, do: 'before' }], null), '--outlinemedium', 'graphite'], opening: [2, 5], phases: [[1]] },
    // a phase of one stroke finer than the sheet samples (0.01 mm long and wide): told and counted, never a stop (the
    // rc7 white-ships fault: a phase of one 0.03 mm stroke stopped the painting with "inked no cell")
    { id: 'subcell-phase', args: [...choose('subcell-phase', [{ where: { ids: [2] }, do: 'before' }], null, [{ points: [[20, 14], [20.01, 14]], widthMm: 0.01, dark: 0.5, when: 'stage 2' }]), '--outlinemedium', 'graphite'], opening: [1, 2, 5], phases: [[6]], addedNoCell: 1 },
    { id: 'pen-model', args: [...choose('pen-model', [{ where: { ids: [2] }, do: 'stage 2' }], 'pen'), '--inkrecipe', 'wash', '--inkfast', '1'], opening: [1, 5], phases: [[2]] },
  ];
  const R = [];
  for (const c of cases) {
    const out = path.join(dir, c.id, 'plate'); fs.mkdirSync(path.dirname(out), { recursive: true });
    const done = await runPainter([...base, ...c.args], out, { gpu }), put = (check, ok, detail) => R.push({ check: `${c.id}: ${check}`, ok: Boolean(ok), detail });
    if (done.code !== 0) { put('the painting finished', false, done.log.split('\n').filter(Boolean).slice(-3).join(' | ')); continue; }
    const laid = readJson(path.join(out, 'drawing-laid.json')), ph = (laid?.phases ?? []).map(p => p.ids);
    put('the lines before the first washes are the ones due then', (laid?.opening ?? laid?.laidIds)?.join() === c.opening.join(), `opening ${(laid?.opening ?? laid?.laidIds)?.join(',')}, due ${c.opening.join(',')}`);
    put('the later lines go down with stage 2', JSON.stringify(ph) === JSON.stringify(c.phases) && (laid?.phases ?? []).every(p => p.stage === 2), `phases ${JSON.stringify(laid?.phases ?? [])}`);
    if (c.phases.length) {
      const fr = readJson(path.join(out, 'frames.json'))?.frames ?? [], firstPaint = fr.findIndex(f => f.stage === 'paint');
      put('the film shows the later lines drawn after paint', firstPaint >= 0 && fr.slice(firstPaint).some(f => f.stage === 'drawing' && f.ids?.some(id => c.phases.flat().includes(id))), `first paint frame ${firstPaint}`);
      for (const k of phaseChecks(out, laid)) put(k.check, k.ok, k.detail);
      if (c.addedNoCell == null) put('the washes over a phase are measured', fs.existsSync(path.join(out, 'drawing-phases-held.jsonl')), 'drawing-phases-held.jsonl');
      else { const rec = readJson(path.join(out, 'drawing-phases.json')); put('a phase finer than the sheet is told and counted, not a stop', rec?.addedNoCell === c.addedNoCell && /added no cell/.test(done.log), `added no cell: ${rec?.addedNoCell}`); }
    }
  }
  return R;
}

/** Pencil against ink at the same weight, Auto, before the washes: the pencil line as continuous as the ink line. */
export async function continuityCheck(results) {
  const at = id => results.find(r => r.cell.id === id)?.out, p = at('pencil/before/auto/full'), k = at('waterproof/before/auto/full');
  if (!p || !k) return [{ check: 'pencil as continuous as ink', ok: false, detail: 'the two cells did not paint' }];
  const a = darknessAlong(await grey(path.join(p, 'drawing-opening.png')), Y[1]), b = darknessAlong(await grey(path.join(k, 'drawing-opening.png')), Y[1]);
  return [{ check: 'a pencil line is as continuous as an ink line of the same weight', ok: a.breaks <= Math.max(LIMITS.continuityBreaks, b.breaks), detail: `pencil breaks ${(100 * a.breaks).toFixed(0)}%, ink ${(100 * b.breaks).toFixed(0)}%` }];
}

/** Runs the whole matrix in `dir` (jobs at once); returns [{cell, plan, checks, status}]. */
export async function runMatrix(dir, { jobs = Math.max(2, Math.min(8, os.availableParallelism() - 1)), only = null, gpu = false } = {}) {
  const subject = await writeSubject(dir), list = cells().filter(c => !only || only(c)), results = [];
  let next = 0;
  const work = async () => {
    while (next < list.length) {
      const cell = list[next++];
      if (cell.na) { results.push({ cell, status: 'n/a', checks: [], why: cell.na }); continue; }
      const cdir = path.join(dir, cell.id.replace(/\//g, '-')); fs.mkdirSync(cdir, { recursive: true });
      let plan;
      try { plan = cellPlan(cell, { ...subject, dir: cdir }); } catch (e) { results.push({ cell, status: 'fail', checks: [{ check: 'the choice is accepted', ok: false, detail: e.message }] }); continue; }
      const out = path.join(cdir, 'plate'), done = await runPainter(plan.args, out, { gpu });
      const checks = await checkCell(cell, plan.expect, out, done);
      results.push({ cell, out, args: plan.args, expect: plan.expect, status: checks.every(c => c.ok) ? 'pass' : 'fail', checks });
    }
  };
  await Promise.all(Array.from({ length: jobs }, work));
  // look against final, cell by cell
  for (const r of results.filter(r => r.cell.size === 'look' && r.out)) {
    const full = results.find(q => q.cell.id === r.cell.id.replace(/look$/, 'full'));
    if (!full?.out) continue;
    const lf = await checkLookFinal(r.out, full.out); r.checks.push(...lf); if (lf.some(c => !c.ok)) r.status = 'fail';
  }
  return results.sort((a, b) => cells().findIndex(c => c.id === a.cell.id) - cells().findIndex(c => c.id === b.cell.id));
}

/** A model choosing pencil for a drawing prepared in ink, before the washes: laid in pencil, whatever the drawing or the source. */
export async function crossCell(dir, { gpu = false } = {}) {
  const subject = await writeSubject(dir), vectors = drawingDoc('ink');
  const got = writeLinesEdit({ dir: path.join(dir, 'choice'), stem: subject.stems.ink, edit: null, listing: linesListing(vectors), medium: 'pencil' });
  const args = ['--image', subject.target, '--washplan', subject.target, '--stages', 'none', '--drawing', 'first', '--width', String(W)];
  for (const [k, v] of got.sets) args.push(k === 'drawing' ? '--drawingfile' : `--${k}`, v);
  const out = path.join(dir, 'plate'), done = await runPainter(args, out, { gpu }), rec = readJson(path.join(out, 'drawing-laid.json'));
  return [{ check: 'a model\'s pencil on an ink drawing is laid in pencil', ok: done.code === 0 && rec?.medium === 'pencil' && /\(graphite\) on a/.test(done.log), detail: `laid ${rec?.medium ?? 'nothing'}${done.code ? `, exit ${done.code}` : ''}` }];
}

/** The whole harness: the matrix, then the eraser, pencil against ink, and a model's medium against the drawing's. */
export async function runHarness(dir, opts = {}) {
  const results = await runMatrix(path.join(dir, 'matrix'), opts);
  const extra = [
    { id: 'erase', what: 'erasing removes what the plan answer says (Auto pencil, a script\'s erase passage)', checks: await eraseCell(path.join(dir, 'erase'), opts) },
    { id: 'continuity', what: 'pencil line continuity against ink at equal weight', checks: await continuityCheck(results) },
    { id: 'medium-cross', what: 'a model\'s medium against the drawing\'s own', checks: await crossCell(path.join(dir, 'cross'), opts) },
    { id: 'phases', what: 'the drawing laid in phases with a two-stage painting (Auto pencil and pen, a model\'s stage 2 in pencil and in ink)', checks: await phasesCells(path.join(dir, 'phases'), opts) },
  ].map(e => ({ ...e, status: e.checks.every(c => c.ok) ? 'pass' : 'fail' }));
  return { results, extra };
}

/** The results as a markdown table, cell by cell, failures said plainly. */
export function resultsMarkdown(results, { extra = [], title = 'Drawing harness', when = new Date().toISOString().slice(0, 16), commit = '' } = {}) {
  const L = [`# ${title}`, '', `Run ${when}${commit ? ` at ${commit}` : ''}: ${results.filter(r => r.status === 'pass').length} cells pass, ${results.filter(r => r.status === 'fail').length} fail, ${results.filter(r => r.status === 'n/a').length} do not exist; ${extra.filter(e => e.status === 'pass').length} of ${extra.length} further checks pass.`, '',
    '| medium | when | who chose | size | result | what was checked (failures first) |', '|---|---|---|---|---|---|'];
  for (const r of results) {
    const c = r.cell, said = r.status === 'n/a' ? r.why : [...r.checks.filter(k => !k.ok).map(k => `FAILS: ${k.check} (${k.detail})`), ...r.checks.filter(k => k.ok).map(k => k.check)].join('; ');
    L.push(`| ${c.medium} | ${c.when} | ${c.who} | ${c.size} | ${r.status.toUpperCase()} | ${said.replace(/\|/g, '/')} |`);
  }
  if (extra.length) {
    L.push('', '| check | result | what was checked (failures first) |', '|---|---|---|');
    for (const e of extra) L.push(`| ${e.what} | ${e.status.toUpperCase()} | ${[...e.checks.filter(k => !k.ok).map(k => `FAILS: ${k.check} (${k.detail})`), ...e.checks.filter(k => k.ok).map(k => `${k.check} (${k.detail})`)].join('; ').replace(/\|/g, '/')} |`);
  }
  return L.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const at = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const dir = path.resolve(at('--out') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-harness-')));
  const { results, extra } = await runHarness(dir);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ cells: results.map(({ cell, status, checks, why }) => ({ cell: cell.id, status, why, checks })), extra }, null, 1));
  const md = resultsMarkdown(results, { extra });
  if (at('--md')) fs.writeFileSync(at('--md'), md);
  process.stdout.write(md);
  process.exitCode = results.some(r => r.status === 'fail') || extra.some(e => e.status === 'fail') ? 1 : 0;
}
