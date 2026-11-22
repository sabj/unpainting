// The command line of `npm run paint`:
//   npm run paint -- <subject[,subject...]> plan|paint [--author auto|<model key>[,...]] [--studies locked|author]
//                    [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--no-open]
// Nothing here touches a file: it turns the words into one request object, or throws with the usage.

export const USAGE = `usage: npm run paint -- <subject[,subject...]> plan|paint [options]

  plan                  the wash plan only, on the CPU (minutes)
  paint                 the whole painting, on the GPU
  --author a[,b...]     who writes the wash plan: auto (the code planner, the control), a model key of
                        tools/paint/authors.json or bench/models.json, or script:FILE.json (a kept script).
                        Several authors make a grid, subjects down and authors across. Default auto.
  --studies locked|author
                        locked: the author gets the registered studies as they are (default).
                        author: the author first briefs its own studies; the local image model makes them.
  --set key=value       one setting for this run, repeatable. drawing=<stem>, width=<cells>, sheetmm=<mm>,
                        masks=<receipt.json>|none, floors=6,4,2, study2.clusters=20 (a
                        wash-plan setting of the second study), heapmb=<MB>; any other key is a paint-plate option.
  --jobs N              GPU paintings at once (default 2; 6 on an otherwise idle M5 Max: docs/running.md). Paintings
                        started elsewhere count; a queue waits for a free place, and a failed painting is
                        recorded in its cell while the rest go on. A running queue takes a new
                        number written into <out>/jobs.
  --out <dir>           where the run is written (default work/paint/<time>-<subjects>-<mode>)
  --dry-run             print what would run and stop
  --no-open             do not open the sheet in Preview

A subject may name a variant kept in tools/paint/variants.json: h36:approved.
"all" is every registered subject not already named: all, or a,b,all to paint a and b first.`;

const VALUED = new Set(['--author', '--studies', '--set', '--out', '--jobs']);
const FLAGS = new Set(['--dry-run', '--no-open']);

/** {subjects: [{id, variant}], mode, authors, studies, sets: [[key, value]], jobs, out, dryRun, open}. Throws on anything unknown. */
export function parseArgs(argv) {
  const words = [], given = { '--set': [] }, flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS.has(a)) { flags.add(a); continue; }
    if (VALUED.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--set') given[a].push(v); else if (a in given) throw new Error(`${a} is given twice`); else given[a] = v;
      continue;
    }
    if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    words.push(a);
  }
  if (words.length !== 2) throw new Error('give the subject(s) and plan or paint');
  const [names, mode] = words;
  if (!['plan', 'paint'].includes(mode)) throw new Error(`the second word is plan or paint, not "${mode}"`);
  const subjects = list(names).map(s => { const [id, variant = null, more] = s.split(':'); if (!id || more !== undefined) throw new Error(`subject "${s}": write name or name:variant`); return { id, variant }; });
  const authors = list(given['--author'] ?? 'auto');
  for (const [what, l] of [['subject', subjects.map(s => `${s.id}:${s.variant}`)], ['author', authors]]) {
    if (!l.length) throw new Error(`no ${what} named`);
    if (new Set(l).size !== l.length) throw new Error(`a ${what} is named twice`);
  }
  const studies = given['--studies'] ?? 'locked';
  if (!['locked', 'author'].includes(studies)) throw new Error('--studies is locked or author');
  if (studies === 'author' && authors.every(a => a === 'auto')) throw new Error('--studies author needs a model as --author (the code planner makes no studies)');
  const sets = given['--set'].map(s => {
    const at = s.indexOf('=');
    if (at < 1 || at === s.length - 1) throw new Error(`--set ${s}: write key=value`);
    return [s.slice(0, at), s.slice(at + 1)];
  });
  const keys = sets.map(([k]) => k);
  if (new Set(keys).size !== keys.length) throw new Error('a --set key is given twice');
  const jobs = given['--jobs'] === undefined ? null : Number(given['--jobs']);
  if (jobs !== null && !(Number.isInteger(jobs) && jobs >= 1 && jobs <= 16)) throw new Error('--jobs: a whole number of paintings at once, 1 to 16');
  return { subjects, mode, authors, studies, sets, jobs, out: given['--out'] ?? null, dryRun: flags.has('--dry-run'), open: !flags.has('--no-open') };
}

function list(s) { return s.split(',').map(x => x.trim()).filter(Boolean); }
