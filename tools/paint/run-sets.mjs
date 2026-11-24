// The benchmark's run sets (bench/run-sets.json): which pictures the benchmark paints and how deep each is run.
// core: five pictures, one of each group, on the whole ladder (levels 1 to 4, and Auto). extended: all fifteen, the
// core five as in the core and the other ten at Auto and level 2. The runners read it here: a set's name stands for
// its pictures wherever a subject is named (`npm run paint -- core paint --author neon-m --level L3`), and only the
// pictures that run at the level asked for are painted. Nothing here starts a painting or a session.
//   node tools/paint/run-sets.mjs [core|extended]     every painting the set asks for, as a list; starts nothing
//   node tools/paint/run-sets.mjs check [core|extended]   is every picture of the set registered under the one-area
//     sheet rule and prepared (every input there, pinned and matching)? One line a picture; exit 1 when any is not.
//     Run it at the release tag before a benchmark run. Reads the subject list; starts and writes nothing.
// A benchmark picture is painted only from a registration made under the sheet rule (sheet-rule.mjs): the file names
// only such registrations, and a run of one that is not is refused (standardSheetOnly).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SHEET_RULE, QUARTER_SHEET_MM } from './sheet-rule.mjs';

const FILE = new URL('../../bench/run-sets.json', import.meta.url);
const LEVELS = ['Auto', 'L1', 'L2', 'L3', 'L4'];

/** The run sets file, checked: a fault in it stops every runner that reads it. */
export function loadRunSets(doc = JSON.parse(fs.readFileSync(FILE, 'utf8'))) {
  const bad = why => { throw new Error(`bench/run-sets.json: ${why}`); };
  if (!Array.isArray(doc.pictures) || !doc.pictures.length) bad('no "pictures" list');
  const ids = new Set();
  for (const p of doc.pictures) {
    if (!p.id || !p.title || !p.group || typeof p.core !== 'boolean') bad(`a picture needs id, title, group and core (true or false): ${JSON.stringify(p)}`);
    if (ids.has(p.id)) bad(`picture ${p.id} is listed twice`); ids.add(p.id);
  }
  for (const [name, d] of Object.entries(doc.depths ?? {})) if (!Array.isArray(d.levels) || d.levels.some(l => !LEVELS.includes(l))) bad(`depth ${name}: levels from ${LEVELS.join(', ')}`);
  const depth = name => doc.depths?.[name]?.levels ?? bad(`no depth "${name}"`);
  const sets = {};
  for (const [name, s] of Object.entries(doc.sets ?? {})) {
    const own = typeof s.depth === 'string' ? { core: s.depth, others: s.depth } : s.depth;
    if (!own?.core || !own?.others) bad(`set ${name}: a depth, or one for the core and one for the others`);
    const pictures = s.pictures === 'all' ? doc.pictures : s.pictures === 'those marked core' ? doc.pictures.filter(p => p.core) : bad(`set ${name}: pictures is "all" or "those marked core"`);
    sets[name] = { name, what: s.what ?? '', pictures: pictures.map(p => ({ ...p, levels: depth(p.core ? own.core : own.others) })) };
  }
  if (!Object.keys(sets).length) bad('no "sets"');
  return { sets, names: Object.keys(sets) };
}

/** Whether a word names a run set. */
export const isRunSet = (word, runSets = loadRunSets()) => Object.hasOwn(runSets.sets, word);

/** The pictures of a set that run at `level` (Auto, L1 to L4; null: every picture of the set), in the file's order. */
export function picturesAt(setName, level = null, runSets = loadRunSets()) {
  const set = runSets.sets[setName];
  if (!set) throw new Error(`no run set "${setName}" (bench/run-sets.json has: ${runSets.names.join(', ')})`);
  if (level != null && !LEVELS.includes(level)) throw new Error(`run set ${setName}: level ${level} is not one of ${LEVELS.join(', ')}`);
  return set.pictures.filter(p => level == null || p.levels.includes(level));
}

/**
 * A command's subjects with each run set's name replaced by its pictures at `level`, at the place it was written:
 * [{id, variant}] in, the same out, with `said`: one plain line for each set expanded. A set takes no variant, and a
 * picture named twice (by a set and by hand) is painted once. A set with no picture at the level stops the command.
 */
export function expandRunSets(subjects, level, runSets = loadRunSets()) {
  const said = [], seen = new Set(), out = [];
  for (const s of subjects) {
    if (!isRunSet(s.id, runSets)) { if (!seen.has(s.id)) { seen.add(s.id); out.push(s); } continue; }
    if (s.variant) throw new Error(`run set ${s.id}: a set is written without a variant`);
    const all = picturesAt(s.id, null, runSets), now = picturesAt(s.id, level, runSets);
    if (!now.length) throw new Error(`run set ${s.id} runs no picture at ${level}`);
    said.push(`run set ${s.id}${level ? ` at ${level}` : ''}: ${now.length} of its ${all.length} pictures (${now.map(p => p.id).join(', ')})${now.length < all.length ? `; the other ${all.length - now.length} are not run at ${level}` : ''}`);
    for (const p of now) if (!seen.has(p.id)) { seen.add(p.id); out.push({ id: p.id, variant: null }); }
  }
  return { subjects: out, said };
}

/**
 * The level 1 targets (bench/v3/crops.json tasks) of a set, for the level 1 runner. Throws, naming them, when a
 * picture that runs at level 1 has no target prepared: level 1 of a set is never run on part of it in silence.
 */
export function levelOneTargets(setName, runSets = loadRunSets()) {
  const at = picturesAt(setName, 'L1', runSets), none = at.filter(p => !p.levelOne);
  if (none.length) throw new Error(`run set ${setName}, level 1: no level 1 target is prepared for ${none.map(p => p.id).join(', ')} (bench/run-sets.json "levelOne"; make each with npm run bench:add-target on the standard sheet)`);
  return at.map(p => p.levelOne);
}

/** Whether a subject id is one of the benchmark's pictures (any set). */
export const isBenchmarkPicture = (id, runSets = loadRunSets()) => Object.values(runSets.sets).some(s => s.pictures.some(p => p.id === id));

/**
 * The benchmark's pictures are all painted on one area of paper. A resolved subject (subjects.mjs) that is one of
 * them and whose registration is not under the rule is refused here, before anything runs. Any other subject (an
 * earlier registration named by its own id, for an earlier result) passes: its run says which sheet it has.
 */
export function standardSheetOnly(spec, runSets = loadRunSets()) {
  if (!isBenchmarkPicture(spec.id, runSets) || spec.sheet?.rule === SHEET_RULE) return spec;
  throw new Error(`subject ${spec.id} is a benchmark picture, and its registration is not under the one-area sheet rule (every benchmark picture is painted on the area of a quarter sheet, ${QUARTER_SHEET_MM.map(v => v / 10).join(' x ')} cm; this one is registered at ${spec.sheet?.cells} cells, ${spec.sheet?.widthMm} mm across). It is not run. Register it under the rule (node tools/paint/reregister.mjs) and name that registration in bench/run-sets.json`);
}

/**
 * Whether each picture of a set can be run: [{id, title, levels, ok, faults: [plain], notes: [plain]}]. A picture is
 * ready when its id is in the registry, registered under the sheet rule, its study seed final, every input (source,
 * drawing files, studies, labels, named forms) pinned by a sha256 and matching on disk, and, where it runs at level 1,
 * its level 1 target named. `resolve(id)` -> a resolved subject, `check(spec)` -> the spec with its files read
 * (subjects.mjs resolveSubject and checkInputs); `record(id)` -> the registry's own record or null.
 */
export function readiness(setName, { record, resolve, check }, runSets = loadRunSets()) {
  return picturesAt(setName, null, runSets).map(p => {
    const faults = [], notes = [], row = { id: p.id, title: p.title, levels: p.levels, faults, notes };
    const rec = record(p.id);
    if (!rec) {
      // the earlier registration it would be made from, and how far that one is
      const base = p.id.endsWith('-qs') ? record(p.id.slice(0, -3)) : null;
      faults.push(base ? `not registered under the sheet rule yet: make it from ${base.id} (node tools/paint/reregister.mjs ${base.id} --registry <the subject list>); ${base.id} is at ${base.sheet?.cellsAcross?.full} cells, its study seed ${base.studySeed?.final === true ? `final (${base.studySeed.chosen})` : 'not final'}` : 'not registered: no such subject in the subject list');
    }
    else {
      if (rec.sheet?.rule !== SHEET_RULE) faults.push(`not under the one-area sheet rule (registered at ${rec.sheet?.cellsAcross?.full} cells, ${rec.sheet?.widthMm} mm across)`);
      if (rec.studySeed?.final !== true) faults.push(`its study seed is not final (${rec.studySeed?.status ?? 'none chosen'})`);
      let spec = null;
      try { spec = resolve(p.id); } catch (e) { faults.push(e.message.split('\n')[0]); }
      if (spec) {
        const open = [['source', spec.source], ...spec.drawing.files.map(f => ['drawing file', f]), ...spec.studies.map((s, i) => [`study ${i + 1}`, s]), ...(spec.labels ? [['labels', spec.labels]] : [])].filter(([, f]) => !f.sha256);
        if (open.length) faults.push(`not pinned by a checksum: ${open.map(([what, f]) => `${what} ${f.path}`).join(', ')}`);
        try { check(spec); if (!spec.masks?.receipt) faults.push(`no named forms (${spec.masks?.none ?? 'no receipt'})`); } catch (e) { faults.push(...e.message.split('\n').slice(1).map(l => l.trim())); }
        const px = spec.source.px?.[0];
        if (px > 0 && spec.sheet.cells > px) notes.push(`painted enlarged ${(spec.sheet.cells / px).toFixed(2)} times (the file is ${px} px across, the sheet ${spec.sheet.cells} cells)`);
      }
    }
    if (p.levels.includes('L1') && !p.levelOne) faults.push('no level 1 target (bench/run-sets.json "levelOne")');
    return { ...row, ok: !faults.length };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === 'check') {
  const { loadRegistry, resolveSubject, checkInputs } = await import('./subjects.mjs');
  const name = process.argv[3] ?? 'extended';
  let rows;
  try { const reg = loadRegistry(); rows = readiness(name, { record: id => reg.subjects.find(s => s.id === id) ?? null, resolve: id => resolveSubject(reg, id), check: checkInputs }); } catch (e) { console.error(`run-sets check: ${e.message}`); process.exit(2); }
  for (const r of rows) console.log(`${r.ok ? 'ready    ' : 'NOT READY'} ${r.id}${r.ok ? '' : `: ${r.faults.join('; ')}`}${r.notes.length ? ` [${r.notes.join('; ')}]` : ''}`);
  const bad = rows.filter(r => !r.ok).length;
  console.log(`\nRun set ${name}: ${rows.length - bad} of ${rows.length} pictures are under the sheet rule and prepared${bad ? `; ${bad} are not, and a benchmark run of them is refused` : ''}.`);
  process.exit(bad ? 1 : 0);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const runSets = loadRunSets(), name = process.argv[2] ?? 'extended', pictures = picturesAt(name, null, runSets);
  console.log(`Run set ${name}: ${runSets.sets[name].what}. Nothing is started by this list.\n`);
  console.log('| Picture | Subject id | Group | Runs at | Level 1 target |\n|---|---|---|---|---|');
  for (const p of pictures) console.log(`| ${p.title} | ${p.id} | ${p.group}${p.core ? ' (core)' : ''} | ${p.levels.join(', ')} | ${p.levels.includes('L1') ? p.levelOne ?? 'not prepared' : 'not run'} |`);
  const count = l => pictures.filter(p => p.levels.includes(l)).length;
  console.log(`\nFor one model: ${LEVELS.slice(1).map(l => `${count(l)} at ${l}`).join(', ')}; and ${count('Auto')} Auto paintings once, whatever the number of models.`);
}
