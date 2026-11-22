// The command line of `npm run paint`:
//   npm run paint -- <subject[,subject...]> plan|paint [--author auto|<model key>[,...]] [--studies locked|author]
//                    [--work session|reply] [--looks N] [--minutes N] [--from <dir>]
//                    [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--no-open]
// Nothing here touches a file: it turns the words into one request object, or throws with the usage.

export const USAGE = `usage: npm run paint -- <subject[,subject...]> plan|paint [options]

  plan                  the wash plan only, on the CPU (minutes)
  paint                 the whole painting, on the GPU
  --author a[,b...]     who writes the wash plan: auto (the code planner, the control), a model key of
                        tools/paint/authors.json or bench/models.json, or script:FILE.json (a kept script).
                        Several authors make a grid, subjects down and authors across. Default auto.
  --work session|reply  how a model author works. session (default): a working session with a shell in its own
                        folder, the code planner's plan as its starting point, uncapped planning and a fixed
                        number of counted looks at its plan; it hands over planner settings or its own script.
                        reply: one read-only reply holding a whole script (the earlier route).
  --looks N             looks a session may take (default 4): each paints its present choice for real, small, on the
                        GPU and shows it the dried sheet; a look's painting waits for a place among --jobs
  --minutes N           minutes of its own time a session may take; waiting for the tools is not counted (default 85)
  --from <dir>          paint what the sessions of an earlier run handed over (its --out folder), calling no model:
                        plan first, look, then paint the same choices.
  --studies locked|author
                        locked: the author gets the registered studies as they are (default).
                        author: the author first briefs its own studies; the local image model makes them
                        (with --work reply only: a session cannot make studies yet).
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

const VALUED = new Set(['--author', '--studies', '--set', '--out', '--jobs', '--work', '--looks', '--minutes', '--from']);
const FLAGS = new Set(['--dry-run', '--no-open']);

/** {subjects: [{id, variant}], mode, authors, studies, work, looks, minutes, from, sets: [[key, value]], jobs, out, dryRun, open}. Throws on anything unknown. */
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
  const work = given['--work'] ?? 'session';
  if (!['session', 'reply'].includes(work)) throw new Error('--work is session or reply');
  if (studies === 'author' && work === 'session') throw new Error('--studies author needs --work reply: a working session cannot make its own studies yet');
  const whole = (flag, least, most) => { if (given[flag] === undefined) return null; const n = Number(given[flag]); if (!(Number.isInteger(n) && n >= least && n <= most)) throw new Error(`${flag}: a whole number, ${least} to ${most}`); return n; };
  const looks = whole('--looks', 0, 20), minutes = whole('--minutes', 1, 600);
  const sets = given['--set'].map(s => {
    const at = s.indexOf('=');
    if (at < 1 || at === s.length - 1) throw new Error(`--set ${s}: write key=value`);
    return [s.slice(0, at), s.slice(at + 1)];
  });
  const keys = sets.map(([k]) => k);
  if (new Set(keys).size !== keys.length) throw new Error('a --set key is given twice');
  const jobs = given['--jobs'] === undefined ? null : Number(given['--jobs']);
  if (jobs !== null && !(Number.isInteger(jobs) && jobs >= 1 && jobs <= 16)) throw new Error('--jobs: a whole number of paintings at once, 1 to 16');
  return { subjects, mode, authors, studies, work, looks, minutes, from: given['--from'] ?? null, sets, jobs, out: given['--out'] ?? null, dryRun: flags.has('--dry-run'), open: !flags.has('--no-open') };
}

function list(s) { return s.split(',').map(x => x.trim()).filter(Boolean); }
