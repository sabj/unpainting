// The tools a choice may use beside its kind (choice.mjs): its own choice of the drawing's lines, lines of its own and
// the drawing's medium (lines-edit.mjs), its
// own named forms (forms-edit.mjs), and planner settings inside single named forms. This module reads what they work
// on once (toolsBase), checks a choice's tools against it without writing anything (resolveTools: what the session's
// broker calls for every plan), and writes them out as the files and run settings the painter takes (writeTools).
// Nothing here calls the painter, and none of it needs a painter option of its own.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { linesListing, applyLinesEdit, writeLinesEdit, linesLine } from './lines-edit.mjs';
import { applyFormsEdit, writeFormsEdit, formsLine } from './forms-edit.mjs';
import { strokesToLay } from '../../src/paint/methods/drawing-default.mjs';

/**
 * What a run's tools work on, read once: the record's drawing (its strokes and lines), the reviewed forms (id map,
 * label list) when the subject has them, the sheet and the number of studies. `spec` is a checked subject.
 */
export async function toolsBase(spec) {
  const stem = spec.drawing.abs, vectorsFile = `${stem}-vectors.json`;
  const vectors = fs.existsSync(vectorsFile) ? JSON.parse(fs.readFileSync(vectorsFile, 'utf8')) : null;
  const linesFile = `${stem}-lines.json`, lines = vectors && fs.existsSync(linesFile) ? JSON.parse(fs.readFileSync(linesFile, 'utf8')) : null;
  let mask = null, things = null;
  if (spec.masks?.receipt) {
    const r = JSON.parse(fs.readFileSync(spec.masks.receipt, 'utf8')), at = path.dirname(spec.masks.receipt);
    const { data, info } = await sharp(path.resolve(at, r.mask.path)).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    mask = { ids: new Uint8Array(data.buffer, data.byteOffset, info.width * info.height), width: info.width, height: info.height };
    things = JSON.parse(fs.readFileSync(path.resolve(at, r.labels.path), 'utf8')).things;
  }
  const forms = (things ?? []).map((t, i) => ({ id: i + 1, name: t?.name || t?.thing, kind: t?.kind ?? 'other' }));
  return { stem, vectors, lines, mask, things, forms, receipt: spec.masks?.receipt ?? null, sheet: { widthMm: spec.sheet.widthMm, heightMm: spec.sheet.heightMm }, studies: spec.studies.length, source: { abs: spec.source.abs, sha256: spec.source.sha256 },
    listing: vectors ? linesListing(vectors, { mask, forms }) : null };
}

/**
 * A choice's tools checked against the base, nothing written. `tools`: {linesEdit, formsEdit (the parsed files, or
 * null), perForm ([[form name, [[study, key, value]]]] or null)}. Returns {forms (the edited forms, or null), listing
 * (the drawing's lines with the forms as the choice has them), lines (the edit applied, or null), sets (the run
 * settings of the per-form values), record: {lines, forms, perForm} (what was chosen, counted), said (one line)}.
 * Throws with the reason, said for the author.
 */
export function resolveTools(tools, base) {
  const record = {}, said = [], sets = [], warnings = [...(tools.warnings ?? [])];
  let forms = null, formsNow = base.forms, listing = base.listing, lines = null;
  if (tools.formsEdit) {
    if (!base.mask) throw new Error('forms edit: this subject has no named forms to edit');
    forms = applyFormsEdit(base.mask, base.things, tools.formsEdit, base.sheet);
    formsNow = forms.forms; record.forms = { file: tools.forms ?? null, ...forms.record, now: forms.forms.map(f => ({ id: f.id, name: f.name, kind: f.kind })) }; said.push(`Your forms: ${formsLine(forms.record)}.`);
    if (base.vectors) listing = linesListing(base.vectors, { mask: { ids: forms.ids, width: base.mask.width, height: base.mask.height }, forms: formsNow });
  }
  if (tools.linesEdit || tools.medium) {
    if (!base.vectors) throw new Error('lines edit: this subject\'s drawing has no vector strokes to choose from');
    // (the line file is not needed to check an edit: only the strokes are chosen)
    lines = applyLinesEdit(base.vectors, base.lines ?? { lines: [] }, tools.linesEdit ?? null, listing, { medium: tools.medium ?? null, forms: base.mask ? { ...base.mask, list: base.forms } : null });
    record.lines = { file: tools.lines ?? null, ...lines.record }; said.push(`Your drawing: ${linesLine(lines.record)}.`); warnings.push(...lines.warnings);
  }
  // the pen's ink (choice.mjs "ink"): laid over the run's settings as `ink` (command.mjs: inkfast 1 or 0)
  if (tools.ink) { record.ink = tools.ink; said.push(`The pen's ink: ${tools.ink}.`); }
  if (tools.perForm) {
    if (!formsNow.length) throw new Error('"perForm": this subject has no named forms');
    const list = [];
    for (const [name, values] of tools.perForm) {
      const f = formsNow.find(x => x.name === name);
      if (!f) throw new Error(`"perForm": there is no form "${name}" (the forms${forms ? ' as you edited them' : ''}: ${formsNow.map(x => x.name).join(', ')})`);
      for (const [study, key, value] of values) {
        if (study > base.studies) throw new Error(`"perForm", ${name}: the subject has ${base.studies} studies`);
        sets.push([`form${f.id}.study${study}.${key}`, String(value)]); list.push({ form: name, id: f.id, study, setting: key, value });
      }
    }
    record.perForm = list; said.push(`Per form: ${list.length} settings in ${tools.perForm.length} forms (${tools.perForm.map(([n]) => n).join(', ')}).`);
  }
  return { forms, formsNow, listing, lines, sets, record, warnings, said: said.join(' ') };
}

/**
 * A choice's tools written into `dir` as what the painter takes: the edited forms as a receipt of their own
 * (forms/), the chosen lines as drawing stems (lines/). Returns {sets: [[key, value]] to lay over the run's settings,
 * record, said, receipt, mask, forms, opening, closing, order}.
 */
export async function writeTools(dir, tools, base) {
  const got = resolveTools(tools, base), sets = [...got.sets], out = { record: got.record, said: got.said, warnings: got.warnings, formsNow: got.formsNow };
  if (tools.formsEdit) {
    const f = await writeFormsEdit({ dir: path.join(dir, 'forms'), receipt: base.receipt, edit: tools.formsEdit, sheet: base.sheet, source: base.source });
    sets.push(['masks', f.receipt]); Object.assign(out, { receipt: f.receipt, mask: f.mask });
  }
  if (tools.linesEdit || tools.medium) {
    const l = writeLinesEdit({ dir: path.join(dir, 'lines'), stem: base.stem, edit: tools.linesEdit ?? null, listing: got.listing, medium: tools.medium ?? null, forms: base.mask ? { ...base.mask, list: base.forms } : null });
    sets.push(...l.sets); Object.assign(out, { opening: l.opening, closing: l.closing, order: l.order, laidAs: l.laidAs });
  }
  return { ...out, sets };
}

/** The chosen lines as one drawing document for a picture: lines before the washes as pencil, lines after them as ink, dropped ones left out. */
export function linesPictureDoc(vectors, before = [], after = []) {
  return { ...vectors, medium: 'pencil', strokes: [...before.map(s => ({ ...s, drop: false, medium: 'graphite' })), ...after.map(s => ({ ...s, drop: false, medium: 'ink', dark: 1 }))] };
}

/** The drawing with every stroke the painter lays on its own (drawing-default.mjs; on a pencil lay-in not the strokes tagged drop): the picture of the lines as Auto lays them. */
export function allLinesDoc(vectors, lines = null, forms = null) {
  return { ...vectors, strokes: strokesToLay(vectors, lines, forms).strokes.map(s => ({ ...s, drop: false })) };
}
