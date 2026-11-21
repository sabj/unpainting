// A subject by name: its record in SUBJECTS.json becomes everything one painting needs (source, sheet, opening
// drawing, the registered studies with their roles and floors, labels, named SAM forms, the record's painter
// options), with this run's --set values laid over it. Every value that differs from the record is listed in
// `deviations`, and every pinned input is checked against its sha256 before anything runs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Roles of the studies of a wash plan, coarse to fine, in plain words. */
const ROLES = ['block-in (the broad shapes)', 'middle study (later washes)', 'fine study (details and accents)'];
/** --set keys this module reads; every other key is a paint-plate option (command.mjs). */
const SUBJECT_KEYS = new Set(['drawing', 'width', 'sheetmm', 'masks', 'floors']);
const STUDY_KEY = /^study([1-9])\.([a-z]+)$/;
const isSubjectKey = k => SUBJECT_KEYS.has(k) || STUDY_KEY.test(k);

/** Where SUBJECTS.json is: $UNPAINT_SUBJECTS, else Scratch/unpainting-033 in the home folder, found when the run starts. */
export function registryPath(env = process.env) {
  return path.resolve(env.UNPAINT_SUBJECTS || path.join(os.homedir(), 'Scratch', 'unpainting-033', 'SUBJECTS.json'));
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
export function resolveSubject(registry, id, { sets = [], variant = null, variantName = null } = {}) {
  const rec = registry.subjects.find(s => s.id === id || s.name === id);
  if (!rec) throw new Error(`no subject "${id}" in ${registry.file}. Subjects: ${registry.subjects.map(s => s.id).join(', ')}`);
  const abs = p => path.resolve(registry.base, p);
  const all = new Map([...Object.entries(variant?.set ?? {}), ...sets]);
  const deviations = [], say = (what, now, record) => deviations.push({ what, now: String(now), record: String(record) });
  const cells = rec.sheet?.cellsAcross?.full, mm = rec.sheet?.widthMm, vec = rec.inputs?.drawingVectors;
  if (!(cells > 0) || !(mm > 0) || !rec.source?.path || !vec?.stem || !rec.inputs?.studies?.length) throw new Error(`subject ${rec.id}: the record lacks a source, sheet, drawing vectors or studies`);

  const sheet = { widthMm: mm, cells };
  if (all.has('width')) { const v = Number(all.get('width')); if (!Number.isInteger(v) || v < 16) throw new Error('--set width: whole cells across'); if (v !== cells) say('cells across', v, cells); sheet.cells = v; }
  if (all.has('sheetmm')) { const v = Number(all.get('sheetmm')); if (!(v > 0)) throw new Error('--set sheetmm: millimetres across'); if (v !== mm) say('sheet width (mm)', v, mm); sheet.widthMm = v; }
  const [pw, ph] = rec.source.px ?? [];
  sheet.rows = pw > 0 && ph > 0 ? Math.round(sheet.cells * ph / pw) : null;
  sheet.heightMm = sheet.rows ? +(sheet.widthMm * ph / pw).toFixed(2) : null;
  sheet.cellMm = +(sheet.widthMm / sheet.cells).toFixed(4);

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

  const labels = rec.labels?.path ? { path: rec.labels.path, abs: abs(rec.labels.path), sha256: rec.labels.sha256, count: rec.labels.count ?? null } : null;
  // named SAM forms: this run's --set masks, else the record's receipt when it has one (sam.receipt)
  const recordReceipt = rec.sam?.receipt ?? rec.inputs?.namedForms?.receipt ?? null;
  const receipt = all.get('masks') ?? recordReceipt;
  if (all.has('masks') && all.get('masks') !== recordReceipt) say('named forms (SAM receipt)', all.get('masks'), recordReceipt ?? 'none');
  // with neither, the painter's own rule: a receipt beside the source, SOURCE.named-sam.json, when there is one
  const masks = receipt ? { receipt: path.resolve(all.has('masks') ? process.cwd() : registry.base, receipt), beside: false }
    : { receipt: abs(rec.source.path) + '.named-sam.json', beside: true };

  return {
    id: rec.id, name: rec.name ?? rec.id, variant: variantName, variantWhy: variant?.why ?? null, registry: registry.file, use: rec.use ?? null,
    source: { path: rec.source.path, abs: abs(rec.source.path), sha256: rec.source.sha256, px: rec.source.px ?? null },
    sheet, drawing, studies, labels, masks, deviations,
    options: optionPairs([...(rec.options?.common ?? []), ...(rec.options?.line ?? []), ...(rec.options?.paper ?? [])]),
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
  if (spec.masks?.beside && !exists(spec.masks.receipt)) spec.masks = null;
  const m = spec.masks;
  if (m) {
    if (!exists(m.receipt)) faults.push(`missing named-forms receipt: ${m.receipt}`);
    else {
      const r = readJson(m.receipt);
      m.mask = path.resolve(path.dirname(m.receipt), r.mask?.path ?? '');
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
