// A compiled wash plan as a working author reads it (session.mjs): one row a wash with its brush, strokes, area,
// colour, move, box on the sheet and the named forms it covers, and no outline or stroke geometry (the plan's picture
// is a look, counted; the data is not). Also the pictures and numbers of a look: the dried sheet of the small real
// painting beside the source and the middle study, the stages of that painting, and each named form measured in the
// study, in the plan and on the dried sheet, marked both ways.
import { handTravel } from './hand-travel.mjs';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { gridImage } from './author.mjs';
import { passageNumbers, formsCovered, formValues, formsTable, formsTableDried, numbersTable, onGrid } from './step-back.mjs';

/** Kinds of named form that take rounds only, and the widest round inside them (mm), as the step back marks them. */
const LIVING = new Set(['face', 'eye', 'animal', 'fur', 'figure', 'hair', 'clothing']), MOST_ROUND_MM = 17, IN_FORM_SHARE = 0.1;

function boxOf(q) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  for (const l of q.outline ?? []) for (const p of l.points ?? l) take(p);
  if (x0 === Infinity) for (const s of q.strokes ?? []) for (const p of s.points ?? []) take(p);
  return x0 === Infinity ? null : [x0, y0, x1, y1].map(v => Math.round(v));
}

/**
 * The plan's washes in painting order: [{n, id, stage, kind, what, rgb, areaMm2, brushMm, strokes, move, boxMm, forms}].
 * Works for the code planner's plan and for a compiled script (whose passes name their passage).
 */
export function planRows(valuePlan) {
  return (valuePlan.passes ?? []).map((q, i) => ({
    n: i + 1, id: q.script?.passage ?? q.id ?? null, stage: q.stage ?? null, kind: q.kind ?? null, what: String(q.thing ?? q.what ?? '').slice(0, 90),
    rgb: q.script?.plannedRGB ?? q.colour ?? null, areaMm2: Math.round(Number(q.areaMm2) || 0), brushMm: Number(q.widestBrushMm) || null, strokes: q.strokes?.length ?? 0,
    move: q.move ?? null, boxMm: boxOf(q), forms: (q.forms ?? []).filter(f => f.share >= 0.05).map(f => ({ name: f.name, kind: f.kind, share: +Number(f.share).toFixed(2) })),
  }));
}

/** The plan in a few numbers: {shapes, washes, strokes, stages, widestBrushMm, washesByStage, studies, handTravel}. */
export function planSummary(valuePlan) {
  const s = valuePlan.summary ?? {}, passes = valuePlan.passes ?? [];
  return { shapes: s.shapes ?? null, passages: s.passages ?? null, washes: s.washes ?? passes.length, strokes: s.plannedStrokes ?? null, stages: s.stages ?? null, washesByStage: s.washesByStage ?? null,
    widestBrushMm: passes.reduce((m, p) => Math.max(m, Number(p.widestBrushMm) || 0), 0) || null, paintedShare: s.paintedShare != null ? +Number(s.paintedShare).toFixed(2) : null,
    studies: (s.layersOfStudy ?? []).map(l => ({ leastMm2: l.minMm2, shapes: l.shapes, washes: l.washes, strokes: l.strokes })),
    // strokes the plan found too small for a wet bed (src/paint/methods/tiny-touch.mjs), when it found any
    ...(s.tinyTouches?.length ? { tinyTouches: s.tinyTouches } : {}),
    // how often the sheet is left to dry: the wet sittings of the plan (consecutive washes of one layer are one sitting)
    dryings: passes.reduce((n, p, i) => n + (i === 0 || p.layer !== passes[i - 1].layer ? 1 : 0), 0),
    // how far the hand jumps between consecutive strokes of a passage (hand-travel.mjs): told to a working author
    handTravel: handTravel(passes) };
}

/** The warning a plan check gives an author about its tiny touches (strokes so short the brush only lands on its tip), or ''. */
export function tinyTouchWarning(summary) {
  const t = summary?.tinyTouches ?? [];
  if (!t.length) return '';
  const by = new Map(); for (const x of t) by.set(x.passage, [...(by.get(x.passage) ?? []), x]);
  const list = [...by].map(([id, xs]) => `${id} (${xs.map(x => `${x.lengthMm} mm with the ${x.brushMm} mm brush, about ${x.mm2} mm2`).join('; ')})`).join(', ');
  return ` WARNING, ${t.length} tiny touch${t.length > 1 ? 'es' : ''}: a stroke much shorter than its brush is wide only lands on the brush's tip (under ${t[0].leastMm2} mm2 of paper), so it is laid as a plain touch with no wet bed and will hardly show. In passage ${list}. Lengthen it, give it a smaller brush, or drop it.`;
}

/** One line a wash of the code planner's plan, a wide brush inside a living form marked. */
export function rowsTable(rows) {
  return rows.map(r => {
    const living = r.forms.filter(f => LIVING.has(f.kind) && f.share >= IN_FORM_SHARE), flags = [];
    if (r.brushMm > MOST_ROUND_MM + 0.01 && living.length) flags.push(`BRUSH OVER ${MOST_ROUND_MM} mm IN ${living.map(f => f.name).join(', ')}`);
    if (!r.strokes) flags.push('NOTHING LAID');
    return `${r.n} | stage ${r.stage ?? '?'} | ${r.kind ?? '?'} | brush ${r.brushMm ?? '?'} mm | ${r.strokes} strokes | ${r.areaMm2} mm2 | ${r.move ?? '?'} | rgb ${r.rgb?.join('/') ?? '?'} | box ${r.boxMm ? `x ${r.boxMm[0]}-${r.boxMm[2]}, y ${r.boxMm[1]}-${r.boxMm[3]} mm` : '?'} | covers ${r.forms.slice(0, 4).map(f => `${f.name} ${Math.round(100 * f.share)}%`).join(', ') || 'no named form'} | ${r.what}${flags.length ? ` | !! ${flags.join('; ')}` : ''}`;
  });
}

/** Pictures of the same height set side by side with a gap. A PNG buffer. */
export async function beside(images, { height = 900, gap = 16 } = {}) {
  const parts = [];
  for (const img of images) { const m = await sharp(img).metadata(), w = Math.round(m.width * height / m.height); parts.push({ w, buf: await sharp(img).resize(w, height, { fit: 'fill' }).png().toBuffer() }); }
  const width = parts.reduce((a, p) => a + p.w, 0) + gap * (parts.length - 1); let x = 0;
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(parts.map(p => { const at = { input: p.buf, left: x, top: 0 }; x += p.w + gap; return at; })).png().toBuffer();
}

/**
 * What a compiled plan tells its author. `plate` is the folder the plan compiled into; `run` the record's sheet,
 * subject, studies and masks; `script` the author's script when the plan is one. Returns {summary, rows, table (the
 * washes, one line each), formTable (each named form in the middle study and in the plan, marked both ways), marked}.
 * Reads the plan preview only for the form table. With `painting` (the dried sheet of a look's painting) the form
 * table sets the DRIED sheet against the study and the plan (formsTableDried) and `dried` is true.
 */
export async function planNumbers({ plate, planPreview, run, script = null, painting = null }) {
  const plan = JSON.parse(fs.readFileSync(path.join(plate, 'value-plan.json'), 'utf8')), rows = planRows(plan), W = run.sheet.widthMm;
  const study = run.studies[Math.min(1, run.studies.length - 1)];
  let formTable = [], covered = {};
  if (run.masks?.mask && planPreview) {
    const { data, info } = await sharp(run.masks.mask).greyscale().raw().toBuffer({ resolveWithObject: true }), mask = { data, width: info.width, height: info.height };
    const inStudy = formValues(await onGrid(study.abs, mask), mask, run.masks.forms), inPlan = formValues(await onGrid(planPreview, mask), mask, run.masks.forms);
    formTable = painting ? formsTableDried(inStudy, inPlan, formValues(await onGrid(painting, mask), mask, run.masks.forms)) : formsTable(inStudy, inPlan);
    if (script) covered = formsCovered(plan, mask, run.masks.forms, W);
  }
  const table = script ? numbersTable(passageNumbers(plan, script), covered) : rowsTable(rows);
  return { summary: planSummary(plan), rows, table, formTable, dried: Boolean(painting), marked: { washes: table.filter(l => l.includes('!!')).length, forms: formTable.filter(l => l.includes('!!')).length } };
}

/** The text of a look's numbers: the form table, then the washes. */
export function numbersText({ summary, table, formTable, dried = false }, { script = false, painted = null } = {}) {
  const forms = dried ? `EACH NAMED FORM, MEASURED ON THE DRIED SHEET: the middle study's mean lightness (L*, 0 black to 100 white) and its
darks (the L* its darkest twentieth lies under), the same for your plan with every layer down, and the same for the
sheet as it DRIED in this look's painting${painted ? ` (${painted})` : ''}. The dried sheet is what counts and it should MATCH the study, both
ways: a form paler than the study is as wrong as one darker. A fault is marked !! (TOO PALE or TOO DARK). The paper
is a little off white and the pencil drawing lies on the sheet, so a form left as bare paper reads about L* 95.` : `EACH NAMED FORM, MEASURED: the middle study's mean lightness (L*, 0 black to 100 white) and its darks (the L* its darkest
twentieth lies under), then the same for this plan with every layer down. The finished form should MATCH the study,
both ways: a form paler than the study is as wrong as one darker. A fault is marked !!.`;
  return `THE PLAN IN NUMBERS
${summary.passages != null ? `${summary.passages} passages, ` : summary.shapes != null ? `${summary.shapes} shapes, ` : ''}${summary.washes} washes, ${summary.strokes ?? '?'} strokes, widest wash brush ${summary.widestBrushMm ?? '?'} mm${summary.washesByStage ? `, washes by stage ${summary.washesByStage.join('/')}` : ''}${summary.paintedShare != null ? `, ${Math.round(100 * summary.paintedShare)}% of the sheet painted` : ''}

${forms}

${formTable.length ? formTable.join('\n') : '(no named forms for this subject)'}

EACH WASH, IN PAINTING ORDER (${script ? 'id | stage | widest brush | strokes | area | how it is laid | the sheet there after it | the named forms its strokes cover | what' : 'number | stage | kind | widest brush | strokes | area | how it is laid | its colour | its box on the sheet | the named forms it covers | what'}):

${table.join('\n')}
`;
}

/** The code planner's washes as a table, with no measure against the subject or a study: the session's starting point. */
export function washesText({ summary, table }) {
  return `THE CODE PLANNER'S PLAN IN NUMBERS
${summary.shapes != null ? `${summary.shapes} shapes, ` : ''}${summary.washes} washes, ${summary.strokes ?? '?'} strokes, widest wash brush ${summary.widestBrushMm ?? '?'} mm${summary.washesByStage ? `, washes by stage ${summary.washesByStage.join('/')}` : ''}${summary.paintedShare != null ? `, ${Math.round(100 * summary.paintedShare)}% of the sheet painted` : ''}

EACH WASH, IN PAINTING ORDER (number | stage | kind | widest brush | strokes | area | how it is laid | its colour | its box on the sheet | the named forms it covers | what; a fault a number shows is marked !!):

${table.join('\n')}
`;
}

/** A plan's picture alone on the millimetre grid (no subject beside it). A PNG buffer. */
export async function planPicture({ planPreview, run }) {
  return gridImage(await sheetOf(planPreview, run), run.sheet.widthMm, { width: 1000 });
}
/** The plan preview without the caption it may carry under the sheet. */
async function sheetOf(planPreview, run) {
  const m = await sharp(planPreview).metadata(), rows = run.sheet.rows ? Math.min(m.height, Math.round(m.width * run.sheet.rows / run.sheet.cells)) : m.height;
  return sharp(planPreview).extract({ left: 0, top: 0, width: m.width, height: rows }).png().toBuffer();
}

/**
 * The picture of a look: the sheet (the dried painting of the look; a plan preview is cut to the sheet), the source
 * and the middle study side by side on the millimetre grid. A PNG buffer.
 */
export async function lookPicture({ planPreview, run }) {
  const W = run.sheet.widthMm, study = run.studies[Math.min(1, run.studies.length - 1)];
  return beside([await gridImage(await sheetOf(planPreview, run), W, { width: 1000 }), await gridImage(run.subject.sourceAbs, W, { width: 1000 }), await gridImage(study.abs, W, { width: 1000 })]);
}

/** The stage strip of a painting (the source, then the sheet at 10, 25, 50, 75 and 100% of the strokes) as a PNG no wider than `most` px. */
export async function stagesPicture(strip, { most = 3000 } = {}) {
  return sharp(strip).resize({ width: most, withoutEnlargement: true }).png().toBuffer();
}
