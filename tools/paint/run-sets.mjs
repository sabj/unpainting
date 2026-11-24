// The benchmark's run sets (bench/run-sets.json): which pictures the benchmark paints and how deep each is run.
// core: five pictures, one of each group, on the whole ladder (levels 1 to 4, and Auto). extended: all fifteen, the
// core five as in the core and the other ten at Auto and level 2. The runners read it here: a set's name stands for
// its pictures wherever a subject is named (`npm run paint -- core paint --author neon-m --level L3`), and only the
// pictures that run at the level asked for are painted. Nothing here starts a painting or a session.
//   node tools/paint/run-sets.mjs [core|extended]     every painting the set asks for, as a list; starts nothing
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const runSets = loadRunSets(), name = process.argv[2] ?? 'extended', pictures = picturesAt(name, null, runSets);
  console.log(`Run set ${name}: ${runSets.sets[name].what}. Nothing is started by this list.\n`);
  console.log('| Picture | Subject id | Group | Runs at | Level 1 target |\n|---|---|---|---|---|');
  for (const p of pictures) console.log(`| ${p.title} | ${p.id} | ${p.group}${p.core ? ' (core)' : ''} | ${p.levels.join(', ')} | ${p.levels.includes('L1') ? p.levelOne ?? 'not prepared' : 'not run'} |`);
  const count = l => pictures.filter(p => p.levels.includes(l)).length;
  console.log(`\nFor one model: ${LEVELS.slice(1).map(l => `${count(l)} at ${l}`).join(', ')}; and ${count('Auto')} Auto paintings once, whatever the number of models.`);
}
