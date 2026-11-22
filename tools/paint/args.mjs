// The command line of `npm run paint`:
//   npm run paint -- <subject[,subject...]> plan|paint|prepare [--author auto|<model key>[,...]] [--studies locked|author]
//                    [--work session|reply] [--level L2|L3|L4] [--try N] [--previous <dir>] [--critique FILE]
//                    [--looks N] [--wallminutes N] [--graceminutes N] [--reverts N] [--from <dir>] [--lines FILE.json|standard]
//                    [--set key=value ...] [--jobs N] [--out <dir>] [--dry-run] [--no-open]
// Nothing here touches a file: it turns the words into one request object, or throws with the usage.

export const USAGE = `usage: npm run paint -- <subject[,subject...]> plan|paint|prepare [options]

  plan                  the wash plan only, on the CPU (minutes)
  paint                 the whole painting, on the GPU
  prepare               make the subject's prepared inputs for this code, once, before any session: the code
                        planner's plan (CPU); with --level L4 also its full-size painting (GPU) and that painting's
                        sheets. A session finds them in seconds and does not start without them
  --author a[,b...]     who writes the wash plan: auto (the code planner, the control), a model key of
                        tools/paint/authors.json or bench/models.json, or script:FILE.json (a kept script).
                        Several authors make a grid, subjects down and authors across. Default auto.
  --work session|reply  how a model author works. session (default): a working session with a shell in its own
                        folder, the code planner's plan as its starting point; it hands over planner settings,
                        an edited plan or its own script. Its work is measured (usage.json), not capped.
                        reply: one read-only reply holding a whole script (the earlier route).
  --level L2|L3|L4      what a session is handed (default L2). L2: the subject's inputs and the code planner's
                        plan, one try. L3: tries in a row; a try after the first is handed its previous try
                        (--previous, --critique). L4: as L3, and every try is also handed the automatic painter's
                        full-size painting, its replay sheet and its arrows sheet (a prepared input)
  --try N               which try this is (L3, L4; default 1). No number of tries is the most
  --previous <dir>      the run folder of the try before this one (its finished full-size painting)
  --critique FILE       a teacher's words on that painting, as plain text; never a score
  --looks N             the benchmark's resource budget, looks: the most looks one try may take (default 100).
                        Each look paints the present choice for real, small, on the GPU
  --wallminutes N       the benchmark's resource budget, time: minutes on the wall clock for one try, looks and
                        planning included (default 60). When either budget is reached the session is asked to
                        hand in what it has and the run says so; it is not a failure. The full-size final is
                        painted after the session, outside this clock
  --graceminutes N      minutes a session has to hand in once the time budget is reached (default 10)
  --reverts N           how often a session may go back to a choice it had left (default 20); every return is
                        counted and reported, and past this number a return is refused
  --from <dir>          paint what the sessions of an earlier run handed over (its --out folder), calling no model:
                        plan first, look, then paint the same choices.
  --lines FILE.json|standard
                        the drawing of a kept script or plan edit (--author script:FILE, edit:FILE) that lies in
                        no session's folder: a choice of lines as a session writes it, or the word standard for
                        the registered drawing, whole. Such a file is refused without it: the drawing is never
                        chosen for it unasked. A file in its session's folder takes that session's lines.
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

const VALUED = new Set(['--author', '--studies', '--set', '--out', '--jobs', '--work', '--looks', '--wallminutes', '--graceminutes', '--reverts', '--level', '--try', '--previous', '--critique', '--from', '--lines']);
const FLAGS = new Set(['--dry-run', '--no-open']);

/**
 * {subjects: [{id, variant}], mode, prepare, authors, studies, work, level, tryNumber, previous, critique, looks,
 * wallMinutes, graceMinutes, reverts, from, sets: [[key, value]], jobs, out, dryRun, open}. `prepare`: the word was
 * prepare; `mode` is then plan (the plan alone) or paint (level 4: the painting too). Throws on anything unknown.
 */
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
    if (a === '--minutes') throw new Error('--minutes is gone: a session\'s own minutes are measured, not capped. The benchmark\'s time budget for one try is --wallminutes (default 60)');
    if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    words.push(a);
  }
  if (words.length !== 2) throw new Error('give the subject(s) and plan, paint or prepare');
  const [names, word] = words;
  if (!['plan', 'paint', 'prepare'].includes(word)) throw new Error(`the second word is plan, paint or prepare, not "${word}"`);
  const level = given['--level'] ?? 'L2';
  if (!['L2', 'L3', 'L4'].includes(level)) throw new Error('--level is L2, L3 or L4');
  const prepare = word === 'prepare', mode = prepare ? (level === 'L4' ? 'paint' : 'plan') : word;
  const subjects = list(names).map(s => { const [id, variant = null, more] = s.split(':'); if (!id || more !== undefined) throw new Error(`subject "${s}": write name or name:variant`); return { id, variant }; });
  const authors = list(given['--author'] ?? 'auto');
  if (prepare && (authors.length !== 1 || authors[0] !== 'auto')) throw new Error('prepare makes the automatic plan (and painting): it takes no --author');
  if (prepare) for (const f of ['--from', '--previous', '--critique', '--try', '--out']) if (given[f] !== undefined) throw new Error(`prepare takes no ${f}`);
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
  const looks = whole('--looks', 1, 100000), wallMinutes = whole('--wallminutes', 1, 100000), graceMinutes = whole('--graceminutes', 0, 600), reverts = whole('--reverts', 0, 100000), tryNumber = whole('--try', 1, 100000) ?? 1;
  const sets = given['--set'].map(s => {
    const at = s.indexOf('=');
    if (at < 1 || at === s.length - 1) throw new Error(`--set ${s}: write key=value`);
    return [s.slice(0, at), s.slice(at + 1)];
  });
  const keys = sets.map(([k]) => k);
  if (new Set(keys).size !== keys.length) throw new Error('a --set key is given twice');
  const jobs = given['--jobs'] === undefined ? null : Number(given['--jobs']);
  if (jobs !== null && !(Number.isInteger(jobs) && jobs >= 1 && jobs <= 16)) throw new Error('--jobs: a whole number of paintings at once, 1 to 16');
  return { subjects, mode, prepare, authors, studies, work, level, tryNumber, previous: given['--previous'] ?? null, critique: given['--critique'] ?? null, looks, wallMinutes, graceMinutes, reverts, from: given['--from'] ?? null, lines: given['--lines'] ?? null, sets, jobs, out: given['--out'] ?? null, dryRun: flags.has('--dry-run'), open: !flags.has('--no-open') };
}

function list(s) { return s.split(',').map(x => x.trim()).filter(Boolean); }
