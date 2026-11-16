// Pipeline: inking, stage 1 (the drawing plan, files). --drawplan <file>: the plan is validated against the target and
// the sheet, it selects from the candidate line files the model-line source wrote (draw-plan-place.mjs), and the
// selection is written as the opening and closing line files the pens draw (drawing-file.mjs), in the target's own
// pixels. Planning only. Also writes <out>/drawplan-placed.json (each planned line: found share, drawn or not, strokes)
// and <out>/drawplan.jpg (the target, the candidate pool in grey, planned paths in blue, the selected lines in red,
// planned lines not found in orange).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { linePaths, readLineText } from '../../crop/lines.mjs';
import { validateDrawPlan } from './draw-plan.mjs';
import { selectPlanned, WEIGHT_SHARE } from './draw-plan-place.mjs';
import { proposeContours, drawContours, sourcePenLines } from './draw-plan-contours.mjs';
import { luminance } from '../../crop/pen-trace.mjs';

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The ids of the proposed contours that are the source's own pen lines (sourcePenLines), the target read at the pool's
 *  own width. Planning only: it reads the target before painting. */
async function penLineIds(image, contours, stems, sheetMm) {
  const poolW = JSON.parse(readLineText(linePaths(stems[0]).lines)).image.w;
  const { data, info } = await sharp(image).flatten({ background: '#ffffff' }).resize({ width: poolW }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return sourcePenLines(contours, luminance(data, info.width, info.height), info.width, info.height, sheetMm / info.width);
}

/** The lines of candidate line files (stems, as --drawingfile takes them) in sheet millimetres. */
function candidateLines(stems, sheetMm) {
  return stems.flatMap(stem => {
    const doc = JSON.parse(readLineText(linePaths(stem).lines));
    if (!doc.image?.w) throw new Error(`--drawplan: ${linePaths(stem).lines} has no image box`);
    const f = sheetMm / doc.image.w;
    return (doc.lines ?? []).filter(l => l.points?.length >= 2).map(l => ({ ...l, points: l.points.map(([x, y]) => [x * f, y * f]),
      ...(Array.isArray(l.widths) ? { widths: l.widths.map(v => v * f) } : {}), ...(l.width != null ? { width: l.width * f } : {}) }));
  });
}

/** A drawing plan read and validated against the target `image` and the sheet. */
export async function readDrawPlan({ file, image, sheetMm }) {
  if (!fs.existsSync(file)) throw new Error(`--drawplan: no file ${file}`);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`--drawplan: ${file} is not JSON (${e.message})`); }
  const meta = await sharp(image).metadata();
  return validateDrawPlan(doc, { sheetMm, targetW: meta.width, targetH: meta.height, targetSHA256: sha256(image) });
}

/**
 * Select a drawing plan's lines from the candidate line files `candidates` (stems) and write the pens' files under
 * `out`. Returns { opening, closing, record }: the line file stems (null for a stage with no line drawn) and the record.
 */
export async function writeDrawPlanLines({ file, image, sheetMm, candidates, out, preview = true, log = () => {} }) {
  if (!fs.existsSync(file)) throw new Error(`--drawplan: no file ${file}`);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`--drawplan: ${file} is not JSON (${e.message})`); }
  const meta = await sharp(image).metadata();
  const plan = validateDrawPlan(doc, { sheetMm, targetW: meta.width, targetH: meta.height, targetSHA256: sha256(image) });
  if (!candidates?.length) throw new Error('--drawplan selects from the model-line source\'s lines, and no line source wrote any (docs/ink.md: --linesource source-ink --linemodel 1)');
  const pool = candidateLines(candidates, sheetMm), k = meta.width / sheetMm;
  // the proposed contours, numbered (draw-plan-contours.mjs); a line naming contours is drawn from exactly those, a line
  // given only a path selects the pool's pieces along it (draw-plan-place.mjs)
  const prop = proposeContours(pool, { W: plan.sheet.widthMm, H: plan.sheet.heightMm });
  const named = plan.lines.filter(g => Array.isArray(g.contours));
  if (named.length && plan.contourSet !== prop.sha256) throw new Error(`--drawplan: the plan names contours of set ${plan.contourSet.slice(0, 12)}, and this target's line source proposes set ${prop.sha256.slice(0, 12)}: the plan was made from other contours (re-check it with drawplan-check.mjs)`);
  // every pen line of the source's own drawing is accounted for: drawn by a line, or left to the wash by name
  const pens = await penLineIds(image, prop.contours, candidates, sheetMm);
  if (named.length) {
    const used = new Set([...named.flatMap(g => g.contours), ...plan.leftToWash.flatMap(w => w.contours ?? [])]);
    const missed = pens.filter(id => !used.has(id));
    if (missed.length) throw new Error(`--drawplan: ${missed.length} of the source's ${pens.length} own pen lines are neither drawn nor left to the wash by name: ${missed.join(' ')}; name each in a line's contours or in a leftToWash entry's contours, with why`);
  }
  const dc = drawContours(named, prop.contours);
  if (dc.missing.length) throw new Error(`--drawplan: contours not in the proposed set: ${dc.missing.map(m => `${m.line}: ${m.id}`).join(', ')}`);
  const sel = mergeSelections(plan, selectPlanned({ ...plan, lines: plan.lines.filter(g => !Array.isArray(g.contours)) }, pool), dc.strokes);
  writeContours(prop, { out, k, image: { w: meta.width, h: meta.height }, sheetMm, pens });
  // the pool's kind (a lineart map's lines): the pens hold and measure the selected lines as model lines (ink-lines-file.mjs)
  const inputKind = JSON.parse(readLineText(linePaths(candidates[0]).lines)).inputKind;
  fs.mkdirSync(out, { recursive: true });
  const stems = {};
  for (const stage of ['opening', 'closing']) {
    const lines = sel.lines[stage].map(l => ({ points: l.points.map(([x, y]) => [+(x * k).toFixed(1), +(y * k).toFixed(1)]), length: +(l.length * k).toFixed(1),
      weight: l.weight, ...(l.widths ? { widths: l.widths.map(v => +(v * k).toFixed(2)) } : l.width != null ? { width: +(l.width * k).toFixed(2) } : {}),
      ...(l.planWeight === 'heavy' ? { heavy: true } : {}), role: 'subject', kind: 'line', object: l.object, planId: l.planId, drawRole: l.drawRole, planWeight: l.planWeight }));
    if (!lines.length) { stems[stage] = null; continue; }
    const stem = path.join(out, `drawplan-${stage}`);
    // the plan decided these lines: the region and mass-edge decision (--inkdecide) does not cut them again (inkDecided),
    // and the drawing roles of value plan families do not thin them (drawPlan; drawing-file.mjs)
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify({ source: `drawing plan ${path.basename(file)} selecting from ${candidates.map(c => path.basename(c)).join(', ')} (draw-plan-place.mjs)`, image: { w: meta.width, h: meta.height }, targetSHA256: plan.target.sha256, sheetMm,
      ...(inputKind ? { inputKind } : {}), inkDecided: true, drawPlan: { file: path.resolve(file), stage }, lines }) + '\n');
    stems[stage] = stem;
  }
  const notFound = sel.record.filter(r => !r.drawn);
  // a landmark places the subject: one the model's lines do not hold stops the run, never drawn without (Fable 00:10)
  const lostLandmarks = notFound.filter(r => r.role === 'landmark');
  if (lostLandmarks.length) throw new Error(`--drawplan: landmarks not found among the model lines: ${lostLandmarks.map(r => `${r.id} (${Math.round(100 * r.found)}% of its path)`).join(', ')}; name the contours they are drawn from, or correct the path (drawplan-check.mjs)`);
  const record = { plan: path.resolve(file), candidates: candidates.map(c => linePaths(c).lines), targetSHA256: plan.target.sha256, sheetMm, reachMm: plan.reachMm ?? null,
    contours: { set: prop.sha256, proposed: prop.contours.length, pieces: prop.pieces, joined: prop.joined, leftOut: prop.leftOut, named: named.length },
    pool: sel.pool, selectedMm: sel.claimedMm, sheetEdgeMm: sel.edgeMm, leftOutMm: +(sel.pool.mm - sel.claimedMm).toFixed(0), planned: plan.lines.length, drawn: plan.lines.length - notFound.length,
    notFound: notFound.map(r => r.id), leftToWash: plan.leftToWash, lines: sel.record, strokes: { opening: sel.lines.opening.length, closing: sel.lines.closing.length } };
  fs.writeFileSync(path.join(out, 'drawplan-placed.json'), JSON.stringify(record, null, 1) + '\n');
  if (preview) await writePreview({ image, meta, plan, pool, sel, file: path.join(out, 'drawplan.jpg') });
  log(`drawing plan: ${record.drawn} of ${record.planned} planned lines drawn from the model lines (${named.length} named by ${prop.contours.length} proposed contours, set ${prop.sha256.slice(0, 12)}; ${plan.lines.length - named.length} by path${plan.reachMm ? ` within ${plan.reachMm} mm` : ''}; ${record.strokes.opening} opening, ${record.strokes.closing} closing strokes; ${record.selectedMm} of ${sel.pool.mm} mm of candidate line kept, the rest left out)${notFound.length ? `; not found, so not drawn: ${notFound.map(r => `${r.id} (${Math.round(100 * r.found)}%)`).join(', ')}` : ''}`);
  return { opening: stems.opening, closing: stems.closing, record };
}

/** The target, the candidate pool (grey), the planned paths (blue; orange when not found) and the selected lines (red). */
async function writePreview({ image, meta, plan, pool, sel, file }) {
  const s = 1200 / Math.max(meta.width, meta.height), w = Math.round(meta.width * s), h = Math.round(meta.height * s), f = v => v / plan.sheet.widthMm * meta.width * s;
  const poly = P => P.map(p => `${f(p[0]).toFixed(1)},${f(p[1]).toFixed(1)}`).join(' ');
  const drawn = new Set(sel.record.filter(r => r.drawn).map(r => r.id));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${pool.map(l => `<polyline points="${poly(l.points)}" fill="none" stroke="#60a0a0" stroke-width="1" opacity="0.6"/>`).join('')}${
    plan.lines.filter(g => Array.isArray(g.path)).map(g => `<polyline points="${poly(g.closed ? [...g.path, g.path[0]] : g.path)}" fill="none" stroke="${drawn.has(g.id) ? '#2060ff' : '#ff9000'}" stroke-width="${drawn.has(g.id) ? 1.5 : 3}" stroke-dasharray="${drawn.has(g.id) ? '4 3' : ''}" opacity="0.8"/>`).join('')}${
    [...sel.lines.opening, ...sel.lines.closing].map(l => `<polyline points="${poly(l.points)}" fill="none" stroke="#e00000" stroke-width="${l.weight > 0.7 ? 3 : l.weight > 0.5 ? 2 : 1.2}"/>`).join('')}</svg>`;
  await sharp(image).flatten({ background: '#ffffff' }).resize(w, h).modulate({ brightness: 1.15, saturation: 0.3 }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toFile(file);
}

/** The path selection and the named contours' strokes as one selection in the plan's order: { lines: { opening, closing },
 *  record, pool, claimedMm, edgeMm }. */
function mergeSelections(plan, sel, strokes) {
  const out = { opening: [], closing: [] }, record = [], byLine = new Map(sel.record.map(r => [r.id, r]));
  let claimedMm = 0;
  for (const g of plan.lines) {
    if (!Array.isArray(g.contours)) {
      out[g.stage].push(...sel.lines[g.stage].filter(l => l.planId === g.id)); record.push(byLine.get(g.id));
      claimedMm += byLine.get(g.id).drawnMm; continue;
    }
    const ss = (strokes.get(g.id) ?? []).map(x => ({ ...x, weight: WEIGHT_SHARE[g.weight], planId: g.id, object: g.what, drawRole: g.role, planWeight: g.weight }));
    out[g.stage].push(...ss);
    const mm = ss.reduce((a, x) => a + x.length, 0); claimedMm += mm;
    record.push({ id: g.id, what: g.what, role: g.role, stage: g.stage, weight: g.weight, contours: g.contours, found: 1, drawn: ss.length > 0, strokes: ss.length, drawnMm: +mm.toFixed(1) });
  }
  return { lines: out, record, pool: sel.pool, claimedMm: +claimedMm.toFixed(0), edgeMm: sel.edgeMm };
}

/** <out>/drawplan-contours.json: the numbered contours in the target's pixels, as the planner reads them. */
function writeContours(prop, { out, k, image, sheetMm, pens = [] }) {
  const pen = new Set(pens);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'drawplan-contours.json'), JSON.stringify({ set: prop.sha256, image, sheetMm, note: 'contours proposed from the line model\'s pool (draw-plan-contours.mjs), longest first; points in target pixels, length in sheet mm',
    sourcePenLines: pens, contours: prop.contours.map(c => ({ id: c.id, lengthMm: c.length, ...(pen.has(c.id) ? { sourcePen: true } : {}), points: c.points.map(([x, y]) => [+(x * k).toFixed(1), +(y * k).toFixed(1)]) })) }) + '\n');
}

/**
 * The planner's view of the numbered contours: the target in `cols` x `rows` tiles, each `tileW` pixels wide, with every
 * proposed contour drawn in a colour and its id written at its middle; `<out>/contours-<r><c>.jpg`. Returns the files.
 */
async function writeContourTiles({ image, contoursFile, out, cols = 3, rows = 2, tileW = 1400 }) {
  const doc = JSON.parse(fs.readFileSync(contoursFile, 'utf8')), meta = await sharp(image).metadata(), W = meta.width, H = meta.height;
  const files = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(c * W / cols), x1 = Math.floor((c + 1) * W / cols), y0 = Math.floor(r * H / rows), y1 = Math.floor((r + 1) * H / rows);
    const s = tileW / (x1 - x0), tw = tileW, th = Math.round((y1 - y0) * s), f = ([x, y]) => `${((x - x0) * s).toFixed(1)},${((y - y0) * s).toFixed(1)}`;
    const inTile = ([x, y]) => x >= x0 && x < x1 && y >= y0 && y < y1;
    const hue = id => (Number(id.slice(1)) * 137.508) % 360;
    const lines = doc.contours.filter(cn => cn.points.some(inTile));
    const labels = lines.filter(cn => inTile(cn.points[cn.points.length >> 1]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}">${lines.map(cn => `<polyline points="${cn.points.map(f).join(' ')}" fill="none" stroke="hsl(${hue(cn.id)},90%,40%)" stroke-width="${cn.sourcePen ? 4.5 : 2}" opacity="0.9"/>`).join('')}${
      labels.map(cn => { const [x, y] = f(cn.points[cn.points.length >> 1]).split(',').map(Number); return `<text x="${x + 3}" y="${y - 3}" font-family="Helvetica" font-size="15" font-weight="bold" fill="hsl(${hue(cn.id)},90%,30%)" stroke="white" stroke-width="3" paint-order="stroke">${cn.id}${cn.sourcePen ? '*' : ''}</text>`; }).join('')}</svg>`;
    const file = path.join(out, `contours-${r}${c}.jpg`);
    await sharp(image).flatten({ background: '#ffffff' }).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize(tw, th).modulate({ brightness: 1.2, saturation: 0.35 })
      .composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88 }).toFile(file);
    files.push(file);
  }
  return files;
}

/**
 * Propose the numbered contours for a target before any plan exists: writes <out>/drawplan-contours.json and the
 * planner's tiles (writeContourTiles). Returns { set, proposed, files }.
 */
export async function writeProposal({ image, sheetMm, candidates, out }) {
  const meta = await sharp(image).metadata(), k = meta.width / sheetMm, H = sheetMm * meta.height / meta.width;
  const prop = proposeContours(candidateLines(candidates, sheetMm), { W: sheetMm, H });
  writeContours(prop, { out, k, image: { w: meta.width, h: meta.height }, sheetMm, pens: await penLineIds(image, prop.contours, candidates, sheetMm) });
  const files = await writeContourTiles({ image, contoursFile: path.join(out, 'drawplan-contours.json'), out });
  return { set: prop.sha256, proposed: prop.contours.length, pieces: prop.pieces, leftOut: prop.leftOut, pens: JSON.parse(fs.readFileSync(path.join(out, 'drawplan-contours.json'), 'utf8')).sourcePenLines, files };
}
