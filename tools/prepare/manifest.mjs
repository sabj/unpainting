// The shipped inputs of the benchmark's pictures as one list with checksums, so a copy can be verified file by file.
// For every picture of a run set (bench/run-sets.json): the registration it runs from, its sheet, its study seed and
// why that seed, and every input file with its sha256, size and, where the registry holds it, its generation record
// (prompt, seed, steps, machine). A picture not yet registered under the sheet rule is listed from its earlier
// registration and marked so; a file that is not on disk or not pinned is listed as absent, never left out.
//   node tools/prepare/manifest.mjs write [extended|core] --out FILE     reads the subject list (UNPAINT_SUBJECTS); writes FILE
//   node tools/prepare/manifest.mjs verify FILE [--root DIR]             every file under DIR (default: the subject
//     list's folder) against the manifest; one line a fault; exit 1 when any file is missing or differs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHEET_RULE } from '../paint/sheet-rule.mjs';

const SCHEMA = 'unpaint-inputs@1';
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** A record's input files: [{role, path, sha256 (the registry's pin, or null), made}]. `formsDir`: named-forms folder, relative to the root. */
export function filesOf(rec, { formsDir = 'named-forms' } = {}) {
  const out = [], add = (role, f, made = null) => { if (f?.path) out.push({ role, path: f.path, sha256: f.sha256 ?? null, ...(made ? { made } : {}) }); };
  const made = e => (e?.made ? Object.fromEntries(['prompt', 'seed', 'steps', 'host', 'chosenFrom', 'record'].filter(k => e.made[k] != null).map(k => [k, e.made[k]])) : null);
  add('source', rec.source);
  if (rec.class?.file) add('line classification', { path: rec.class.file, sha256: rec.class.sha256 });
  add('drawing picture', rec.inputs?.drawing, made(rec.inputs?.drawing));
  for (const f of rec.inputs?.drawingVectors?.files ?? []) add('drawing vectors', f);
  if (rec.inputs?.linemap?.path) add('line map', rec.inputs.linemap);
  (rec.inputs?.studies ?? []).forEach((s, i) => add(`study ${i + 1}`, s, made(s)));
  add('labels', rec.labels);
  for (const n of ['receipt.json', 'named-sam.png', 'labels.json']) out.push({ role: 'named forms', path: path.posix.join(formsDir, rec.id, n), sha256: null, unpinnedInRegistry: true });
  return out;
}

/** The manifest of `pictures` ([{id, title}]) from registry `subjects`, files read under `root`. */
export function buildManifest(pictures, subjects, root, { hash = sha256, exists = fs.existsSync, size = f => fs.statSync(f).size, now = new Date().toISOString().slice(0, 10) } = {}) {
  let bytes = 0;
  const rows = pictures.map(p => {
    const own = subjects.find(s => s.id === p.id), rec = own ?? (p.id.endsWith('-qs') ? subjects.find(s => s.id === p.id.slice(0, -3)) : null);
    if (!rec) return { id: p.id, title: p.title, registered: false, underRule: false, prepared: false, absent: ['the picture is not in the subject list'], files: [] };
    const absent = [], files = filesOf(rec).map(f => {
      const abs = path.join(root, f.path);
      if (!exists(abs)) { absent.push(`${f.role}: ${f.path} is not on disk`); return { ...f, sha256: f.sha256, bytes: null, absent: true }; }
      const got = hash(abs), n = size(abs); bytes += n;
      if (f.sha256 && got !== f.sha256) absent.push(`${f.role}: ${f.path} is not the file the subject list pins (${got.slice(0, 12)}, pinned ${f.sha256.slice(0, 12)})`);
      else if (!f.sha256 && !f.unpinnedInRegistry) absent.push(`${f.role}: ${f.path} is on disk but not pinned in the subject list`);
      const { unpinnedInRegistry, ...rest } = f;
      return { ...rest, sha256: got, bytes: n };
    });
    const seed = rec.studySeed ?? {};
    if (seed.final !== true) absent.push(`the study seed is not final (${seed.status ?? 'none chosen'})`);
    const underRule = rec.sheet?.rule === SHEET_RULE && rec.id === p.id;
    if (!underRule) absent.push(`not registered under the sheet rule: listed from the earlier registration ${rec.id}`);
    return { id: p.id, title: p.title, registered: Boolean(own), listedFrom: rec.id, inputId: rec.inputId ?? rec.id, underRule,
      sheet: { rule: rec.sheet.rule === SHEET_RULE ? SHEET_RULE : 'as registered, before the one-area rule', widthMm: rec.sheet.widthMm, heightMm: rec.sheet.heightMm ?? null, cellsAcross: rec.sheet.cellsAcross.full },
      sourcePx: rec.source.px ?? null, studySeed: { chosen: seed.chosen ?? null, final: seed.final === true, seedsMade: seed.seedsOnDisk ?? [], why: seed.why ?? null, rule: seed.rule ?? null },
      prepared: !absent.length, absent, files };
  });
  return { schema: SCHEMA, written: now, what: 'The inputs of the benchmark\'s pictures: every file with its sha256. Paths are relative to the inputs\' root (the folder of the subject list). node tools/prepare/manifest.mjs verify checks a copy against it.',
    pictures: rows, prepared: rows.filter(r => r.prepared).length, of: rows.length, totalBytes: bytes };
}

/** Faults of a copy under `root` against a manifest: [plain lines]. Absent entries of the manifest are faults too. */
export function verifyManifest(doc, root, { hash = sha256, exists = fs.existsSync } = {}) {
  if (doc.schema !== SCHEMA) return [`not an inputs manifest (${SCHEMA})`];
  const faults = [];
  for (const p of doc.pictures) {
    for (const a of p.absent ?? []) faults.push(`${p.id}: the manifest itself lists it as not prepared: ${a}`);
    for (const f of p.files) {
      if (f.absent) continue;
      const abs = path.join(root, f.path);
      if (!exists(abs)) faults.push(`${p.id}: missing ${f.role} ${f.path}`);
      else if (hash(abs) !== f.sha256) faults.push(`${p.id}: ${f.role} ${f.path} differs from the manifest`);
    }
  }
  return faults;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i < 0 ? null : a.splice(i, 2)[1]; };
  const out = opt('--out'), rootArg = opt('--root'), [cmd, arg] = a;
  try {
    const { loadRegistry } = await import('../paint/subjects.mjs');
    if (cmd === 'write') {
      if (!out) throw new Error('write: --out FILE');
      const { picturesAt } = await import('../paint/run-sets.mjs');
      const reg = loadRegistry(), doc = buildManifest(picturesAt(arg ?? 'extended'), reg.subjects, reg.base);
      fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
      console.log(`${out}: ${doc.prepared} of ${doc.of} pictures prepared and under the sheet rule; ${(doc.totalBytes / 1e6).toFixed(0)} MB of input files listed`);
      for (const p of doc.pictures) console.log(`  ${p.prepared ? 'prepared ' : 'NOT READY'} ${p.id}: ${(p.files.reduce((n, f) => n + (f.bytes ?? 0), 0) / 1e6).toFixed(1)} MB in ${p.files.filter(f => !f.absent).length} files${p.absent.length ? `; ${p.absent.length} things absent` : ''}`);
    } else if (cmd === 'verify' && arg) {
      const faults = verifyManifest(JSON.parse(fs.readFileSync(arg, 'utf8')), path.resolve(rootArg ?? loadRegistry().base));
      for (const f of faults) console.log(f);
      console.log(faults.length ? `${faults.length} faults: this copy is not the manifest's inputs` : 'every file matches the manifest');
      process.exit(faults.length ? 1 : 0);
    } else throw new Error('usage: manifest.mjs write [extended|core] --out FILE | verify FILE [--root DIR]');
  } catch (e) { console.error(`manifest: ${e.message}`); process.exit(2); }
}
