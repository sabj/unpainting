// A subject by name: its record in SUBJECTS.json becomes everything one painting needs (source, sheet, opening
// drawing, the registered studies with their roles and floors, labels, named SAM forms, the record's painter
// options), with this run's --set values laid over it. Every value that differs from the record is listed in
// `deviations`, and every pinned input is checked against its sha256 before anything runs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHEET_RULE, standardSheet } from './sheet-rule.mjs';
import { realSizeOf } from './real-size.mjs';

/** Roles of the studies of a wash plan, coarse to fine, in plain words. */
const ROLES = ['block-in (the broad shapes)', 'middle study (later washes)', 'fine study (details and accents)'];
/** --set keys this module reads; every other key is a paint-plate option (command.mjs). */
const SUBJECT_KEYS = new Set(['drawing', 'drawingorder', 'width', 'sheetmm', 'masks', 'floors']);
const STUDY_KEY = /^study([1-9])\.([a-z]+)$/;
/** A study setting for one named form, by the form's number in its receipt: form3.study1.clusters. */
const FORM_KEY = /^form([1-9][0-9]{0,2})\.study([1-9])\.([a-z]+)$/;
/** When the drawing is laid (the painter's --drawing): before the washes, before and after, after, or not at all. */
const DRAWING_ORDERS = ['first', 'both', 'last', 'none'];
const isSubjectKey = k => SUBJECT_KEYS.has(k) || STUDY_KEY.test(k) || FORM_KEY.test(k);

/** Where SUBJECTS.json is: $UNPAINT_SUBJECTS, else Scratch/unpainting-033 in the home folder, found when the run starts. */
export function registryPath(env = process.env) {
  return path.resolve(env.UNPAINT_SUBJECTS || path.join(os.homedir(), 'Scratch', 'unpainting-033', 'SUBJECTS.json'));
}

/** Where the reviewed named-form receipts are: $UNPAINT_FORMS, else the folder named-forms beside SUBJECTS.json. */
export function formsPath(registry, env = process.env) {
  return path.resolve(env.UNPAINT_FORMS || path.join(registry.base, 'named-forms'));
}

export function loadRegistry(file = registryPath()) {
  if (!fs.existsSync(file)) throw new Error(`no subject list at ${file} (set UNPAINT_SUBJECTS to its SUBJECTS.json)`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(doc.subjects)) throw new Error(`${file}: no "subjects" list`);
  return { file, base: path.dirname(file), subjects: doc.subjects };
}

/** A record's options ("--name", "value", ...) as ordered [name, value] pairs. */
export function optionPairs(flat) {
  const pairs = [];
  for (let i = 0; i < flat.length; i += 2) {
    if (!String(flat[i]).startsWith('--') || flat[i + 1] === undefined) throw new Error(`record options: expected --name value pairs, got ${flat.slice(i, i + 2).join(' ')}`);
    pairs.push([flat[i].slice(2), String(flat[i + 1])]);
  }
  return pairs;
}

/**
 * The run's inputs for one subject. `sets` are [key, value] pairs; `variant` is an entry of variants.json
 * ({why, set}) or null. Reads no file but the registry already loaded: checkInputs does the reading.
 */
export function resolveSubject(registry, id, { sets = [], variant = null, variantName = null, formsDir = null } = {}) {
  const rec = registry.subjects.find(s => s.id === id || s.name === id);
  if (!rec) throw new Error(`no subject "${id}" in ${registry.file}. Subjects: ${registry.subjects.map(s => s.id).join(', ')}`);
  const abs = p => path.resolve(registry.base, p);
  const all = new Map([...Object.entries(variant?.set ?? {}), ...sets]);
  const deviations = [], say = (what, now, record) => deviations.push({ what, now: String(now), record: String(record) });
  const cells = rec.sheet?.cellsAcross?.full, mm = rec.sheet?.widthMm, vec = rec.inputs?.drawingVectors;
  if (!(cells > 0) || !(mm > 0) || !rec.source?.path || !vec?.stem || !rec.inputs?.studies?.length) throw new Error(`subject ${rec.id}: the record lacks a source, sheet, drawing vectors or studies`);

  // the sheet: a record registered under the one-area rule (sheet-rule.mjs) must carry that rule's numbers for its
  // picture; a record registered before it keeps the sheet it was registered with, and the run's block says so
  const underRule = rec.sheet.rule === SHEET_RULE;
  if (underRule) {
    const std = standardSheet(rec.source.px ?? []);
    if (std.cells !== cells || Math.abs(std.widthMm - mm) > 0.005) throw new Error(`subject ${rec.id}: the record says its sheet follows the one-area rule (${SHEET_RULE}) but holds ${cells} cells, ${mm} mm across; the rule gives ${std.cells} cells, ${std.widthMm} mm for a ${rec.source.px.join(' x ')} px picture. Register it again`);
  }
  const sheet = { widthMm: mm, cells };
  if (all.has('width')) { const v = Number(all.get('width')); if (!Number.isInteger(v) || v < 16) throw new Error('--set width: whole cells across'); if (v !== cells) say('cells across', v, cells); sheet.cells = v; }
  if (all.has('sheetmm')) { const v = Number(all.get('sheetmm')); if (!(v > 0)) throw new Error('--set sheetmm: millimetres across'); if (v !== mm) say('sheet width (mm)', v, mm); sheet.widthMm = v; }
  const [pw, ph] = rec.source.px ?? [];
  sheet.rows = pw > 0 && ph > 0 ? Math.round(sheet.cells * ph / pw) : null;
  sheet.heightMm = sheet.rows ? +(sheet.widthMm * ph / pw).toFixed(2) : null;
  sheet.cellMm = +(sheet.widthMm / sheet.cells).toFixed(4);
  sheet.rule = underRule ? SHEET_RULE : 'as registered, before the one-area rule';

  const stem = all.get('drawing') ?? vec.stem, own = stem === vec.stem;
  if (!own) say('opening drawing', stem, vec.stem);
  const drawing = {
    stem, abs: abs(stem), fittedSheetMm: own ? vec.fittedSheetMm ?? vec.sheetMm ?? null : null,
    files: own ? vec.files.map(f => ({ path: f.path, abs: abs(f.path), sha256: f.sha256 }))
      : ['lines', 'vectors'].map(k => ({ path: `${stem}-${k}.json`, abs: abs(`${stem}-${k}.json`), sha256: null })),
  };

  const floors = all.has('floors') ? all.get('floors').split(',').map(Number) : null;
  if (floors && (floors.length !== rec.inputs.studies.length || floors.some(v => !(v >= 0)))) throw new Error(`--set floors: ${rec.inputs.studies.length} numbers (mm2), one for each study`);
  const studies = rec.inputs.studies.map((s, i) => {
    const floorMm2 = floors ? floors[i] : s.minArea ?? null;
    if (floors && floors[i] !== s.minArea) say(`study ${i + 1} floor (mm2)`, floors[i], s.minArea);
    return { path: s.path, abs: abs(s.path), sha256: s.sha256, kind: s.kind ?? null, role: ROLES[i] ?? `study ${i + 1}`, floorMm2, read: {} };
  });
  for (const [k, v] of all) {
    const m = STUDY_KEY.exec(k); if (!m) continue;
    const st = studies[Number(m[1]) - 1];
    if (!st) throw new Error(`--set ${k}: the subject has ${studies.length} studies`);
    if (!(Number(v) >= 0)) throw new Error(`--set ${k}: a number`);
    st.read[m[2]] = Number(v); say(`study ${m[1]} ${m[2]}`, v, 'the planner default');
  }
  // a study setting for one named form (the form's number in the receipt the run reads): its own value inside that form
  for (const [k, v] of all) {
    const m = FORM_KEY.exec(k); if (!m) continue;
    const st = studies[Number(m[2]) - 1];
    if (!st) throw new Error(`--set ${k}: the subject has ${studies.length} studies`);
    if (!(Number(v) >= 0)) throw new Error(`--set ${k}: a number`);
    st.forms ??= {}; (st.forms[m[1]] ??= {})[m[3]] = Number(v); say(`study ${m[2]} ${m[3]} in named form ${m[1]}`, v, 'the study\'s own setting');
  }

  const labels = rec.labels?.path ? { path: rec.labels.path, abs: abs(rec.labels.path), sha256: rec.labels.sha256, count: rec.labels.count ?? null } : null;
  // named SAM forms, in this order: --set masks=<receipt.json> (none: no forms), then <forms folder>/<id>/receipt.json
  // when it is there (checkInputs looks), then none
  const asked = all.get('masks') ?? null;
  const masks = asked === 'none' ? { receipt: null, from: 'off' }
    : asked ? { receipt: path.resolve(asked), from: 'set' }
      : { receipt: path.join(formsDir ?? formsPath(registry), rec.id, 'receipt.json'), from: 'folder' };
  if (asked) say('named forms', asked === 'none' ? 'none (turned off)' : asked, 'the reviewed receipt in the named-forms folder');

  const options = optionPairs([...(rec.options?.common ?? []), ...(rec.options?.line ?? []), ...(rec.options?.paper ?? [])]);
  if (all.has('drawingorder')) {
    const v = all.get('drawingorder'), at = options.findIndex(([k]) => k === 'drawing'), was = at >= 0 ? options[at][1] : 'first';
    if (!DRAWING_ORDERS.includes(v)) throw new Error(`--set drawingorder: one of ${DRAWING_ORDERS.join(', ')}`);
    if (v !== was) say('when the drawing is laid', v, was);
    if (at >= 0) options[at] = ['drawing', v]; else options.push(['drawing', v]);
  }
  return {
    id: rec.id, name: rec.name ?? rec.id, variant: variantName, variantWhy: variant?.why ?? null, registry: registry.file, use: rec.use ?? null,
    source: { path: rec.source.path, abs: abs(rec.source.path), sha256: rec.source.sha256, px: rec.source.px ?? null },
    sheet, realSize: realSizeOf(rec), drawing, studies, labels, masks, deviations, studySeed: rec.studySeed?.chosen ?? null,
    options,
    otherSets: [...all].filter(([k]) => !isSubjectKey(k)),
  };
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * Read every input of the spec and check it against its pinned sha256. Throws one error naming every missing file and
 * every mismatch. Fills in the hash of each unpinned file (a drawing that is not the record's) and the named forms.
 */
export function checkInputs(spec, { hash = sha256, exists = fs.existsSync, readJson = f => JSON.parse(fs.readFileSync(f, 'utf8')) } = {}) {
  const faults = [];
  const check = (what, f) => {
    if (!exists(f.abs)) { faults.push(`missing ${what}: ${f.abs}`); return; }
    const got = hash(f.abs);
    if (f.sha256 && got !== f.sha256) faults.push(`${what} changed: ${f.abs} is sha256 ${got.slice(0, 12)}, the record pins ${f.sha256.slice(0, 12)}`);
    if (!f.sha256) f.unpinnedSha256 = got;
  };
  check('source', spec.source);
  spec.drawing.files.forEach(f => check('drawing file', f));
  spec.studies.forEach((s, i) => check(`study ${i + 1}`, s));
  if (spec.labels) check('labels', spec.labels);
  // no receipt in the folder: no named forms, said in the run's block; a receipt that was asked for must exist
  if (spec.masks && (spec.masks.from === 'off' || (spec.masks.from === 'folder' && !exists(spec.masks.receipt)))) spec.masks = { ...spec.masks, none: spec.masks.from === 'off' ? 'turned off by --set masks=none' : `no receipt at ${spec.masks.receipt}`, receipt: null };
  const m = spec.masks?.receipt ? spec.masks : null;
  if (m) {
    if (!exists(m.receipt)) faults.push(`missing named-forms receipt: ${m.receipt}`);
    else {
      const r = readJson(m.receipt);
      m.mask = path.resolve(path.dirname(m.receipt), r.mask?.path ?? '');
      m.review = path.join(path.dirname(m.receipt), 'review.jpg'); if (!exists(m.review)) m.review = null;
      m.labels = r.labels?.path ? path.resolve(path.dirname(m.receipt), r.labels.path) : null;
      m.forms = (r.forms ?? []).map(f => ({ id: f.id, name: f.name, kind: f.kind }));
      if (r.schema !== 'named-sam-v1') faults.push(`named forms: ${m.receipt} is not a named-sam-v1 receipt`);
      else if (!exists(m.mask)) faults.push(`missing named-forms mask: ${m.mask}`);
      else if (hash(m.mask) !== r.mask.sha256) faults.push(`named-forms mask changed: ${m.mask} does not match its receipt`);
      if (r.source?.sha256 && r.source.sha256 !== spec.source.sha256) faults.push(`named forms: ${m.receipt} was made from another source (sha256 ${r.source.sha256.slice(0, 12)})`);
      m.labelsMatch = !spec.labels || !r.labels?.sha256 ? null : r.labels.sha256 === spec.labels.sha256;
    }
  }
  if (faults.length) throw new Error(`subject ${spec.id}: inputs do not match the record\n  ${faults.join('\n  ')}`);
  return spec;
}
