// A subject registered again under the one-area sheet rule (sheet-rule.mjs), as a NEW record with a new id: the record
// registered before the rule stays as it is, under its own id, so results painted from it keep their inputs.
// The convention: the new record's id (the name its refitted drawing carries) is the old id + "-qs"
// (quarter sheet). bench/run-sets.json names only such records. What carries over unchanged, with its checksum: the
// source, the studies and the lay-in picture (all made from the source at its own pixel size), the labels. (The
// registry of record is written by tools/prepare/register.py, which makes the same -qs records from its table; this
// command is for a subject list that is not written from that table, and to see what a record under the rule holds.) What must
// be made again at the new sheet width: the drawing's vectors (fitted in millimetres of the sheet) and their tags;
// the named forms are copied to the new id's folder (they are in the source's pixels). Pure but for the command.
//   node tools/paint/reregister.mjs ID [--as NEWID] [--from SUBJECTS.json] --registry FILE
//     FILE: a subject list to add the new record to (written; made when absent). It is always named: this command
//     never writes a registry it was not pointed at. --print in its place prints the record alone.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHEET_RULE, CELL_MM, standardSheet } from './sheet-rule.mjs';
import { realSizeOf } from './real-size.mjs';

/** The suffix of a record registered under the rule from an earlier one. */
export const RULE_SUFFIX = '-qs';
export const ruleIdOf = id => (id.endsWith(RULE_SUFFIX) ? id : `${id}${RULE_SUFFIX}`);

const r3 = v => +v.toFixed(3);

/**
 * {record, redo: [plain lines: what must be made again, with the command where there is one]} for `rec` under the
 * rule as `newId`. Throws on a record already under the rule, or without a source size.
 */
export function reRegistered(rec, { newId = ruleIdOf(rec.id), realSize = realSizeOf(rec) } = {}) {
  if (rec.sheet?.rule === SHEET_RULE) throw new Error(`subject ${rec.id} is already registered under the one-area rule`);
  if (newId === rec.id) throw new Error(`subject ${rec.id}: the record under the rule takes a new id (the earlier one stays as it is)`);
  const [pw, ph] = rec.source?.px ?? [];
  const s = standardSheet([pw, ph]), oldInput = rec.inputId ?? rec.id, redo = [];
  const out = structuredClone(rec);
  // the inputs made from the source keep their name (the earlier input id); only a refitted drawing carries the new id
  out.id = newId; out.name = `${rec.name ?? rec.id}${RULE_SUFFIX}`; out.inputId = oldInput; out.registeredFrom = rec.id;
  out.sheet = {
    widthMm: s.widthMm, heightMm: s.heightMm,
    cellsAcross: { full: s.cells, half: Math.round(s.cells / 2), line: s.cells * 2 },
    cellMm: { full: CELL_MM, half: CELL_MM * 2, line: CELL_MM / 2 },
    sourcePxPerCell: { full: r3(pw / s.cells), half: r3(pw / Math.round(s.cells / 2)), line: r3(pw / (s.cells * 2)) },
    rule: SHEET_RULE,
  };
  if (realSize && !out.realSize) out.realSize = { heightCm: realSize.heightCm, widthCm: realSize.widthCm, ...(realSize.nominal ? { nominal: true } : {}), ...(realSize.part ? { part: true } : {}), ...(realSize.sheet ? { sheet: true } : {}) };
  // the rule may give a picture the very sheet it had (Mittens close-up): its fit stands, pins and all
  const sameSheet = Math.abs(s.widthMm - rec.sheet.widthMm) <= 0.005;
  for (const [key, v] of Object.entries(out.inputs ?? {})) {
    if (!v || Array.isArray(v) || !v.stem || sameSheet) continue;
    const base = path.basename(v.stem), rest = base.startsWith(oldInput) ? base.slice(oldInput.length) : base.startsWith(rec.id) ? base.slice(rec.id.length) : `-${base}`;
    const stem = path.posix.join(path.posix.dirname(v.stem), `${newId}${rest}`), wasMm = v.sheetMm ?? v.fittedSheetMm ?? rec.sheet.widthMm;
    const how = typeof v.how === 'string' && v.how.includes(base) ? v.how.replace(base, path.basename(stem)).replace(new RegExp(`(\\s)${String(wasMm).replace('.', '\\.')}(\\s)`), `$1${s.widthMm}$2`) : null;
    const made = (v.files ?? []).some(f => f.sha256);
    out.inputs[key] = { stem, sheetMm: s.widthMm, ...(how ? { how } : {}), files: (v.files ?? []).map(f => ({ path: f.path.replace(v.stem, stem), sha256: null })), status: 'to fit', fates: null };
    if (made || key === 'drawingVectors') redo.push(`${key}: fit again at ${s.widthMm} mm across (it was fitted at ${wasMm} mm), then tag and pin${how ? `: ${how}` : ''}`);
  }
  redo.push(`named forms: copy the reviewed folder named-forms/${rec.id}/ to named-forms/${newId}/ (the forms are in the source's pixels; the receipt names the same source)`);
  redo.push('the prepared folder and the Auto painting: make again at the release tag (they are painted on the sheet)');
  if (s.cells > pw) redo.push(`NOTE: the file is ${pw} px across and the standard sheet ${s.cells} cells: the picture is painted enlarged ${(s.cells / pw).toFixed(2)} times, and every run says so`);
  return { record: out, redo };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i < 0 ? null : a.splice(i, 2)[1]; };
  const as = opt('--as'), from = opt('--from'), into = opt('--registry'), print = a.includes('--print'), id = a.find(x => !x.startsWith('--'));
  try {
    if (!id || (!into && !print)) throw new Error('usage: node tools/paint/reregister.mjs ID [--as NEWID] [--from SUBJECTS.json] --registry FILE | --print');
    const { loadRegistry } = await import('./subjects.mjs');
    const reg = from ? loadRegistry(from) : loadRegistry(), rec = reg.subjects.find(s => s.id === id);
    if (!rec) throw new Error(`no subject "${id}" in ${reg.file}`);
    const { record, redo } = reRegistered(rec, as ? { newId: as } : {});
    if (print) console.log(JSON.stringify(record, null, 1));
    else {
      const doc = fs.existsSync(into) ? JSON.parse(fs.readFileSync(into, 'utf8')) : { subjects: [] };
      if (doc.subjects.some(s => s.id === record.id || s.name === record.name)) throw new Error(`${into} already holds ${record.id}: a registration is never rewritten; take another id (--as)`);
      doc.subjects.push(record); fs.writeFileSync(into, JSON.stringify(doc, null, 1) + '\n');
      console.error(`${record.id}: added to ${into} (${record.sheet.cellsAcross.full} cells, ${record.sheet.widthMm} x ${record.sheet.heightMm} mm; ${rec.id} was ${rec.sheet.cellsAcross.full} cells, ${rec.sheet.widthMm} mm across and is left as it is)`);
    }
    console.error(`To make again for ${record.id}:\n${redo.map(l => `  - ${l}`).join('\n')}`);
  } catch (e) { console.error(`reregister: ${e.message}`); process.exit(2); }
}
