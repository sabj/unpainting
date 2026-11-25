// A two-minute preflight of a model through the session harness, before it is given a real session: can its command
// be started in a closed folder, does it open a picture it is given, can it run ./unpaint, and does it write a file.
// Nothing is painted. The task is the same for every model; the row says what was seen, never a guess.
// Pure: the words of the task and the reading of what came back; cli.mjs runs it.

/** Minutes a preflight may take on the clock, and to hand in. */
export const PREFLIGHT_MINUTES = 2, PREFLIGHT_GRACE_MINUTES = 1;
export const PREFLIGHT_FILE = 'preflight.txt';

/** The task of a preflight. `picture`: a picture of the folder to open. */
export function preflightTask(picture) {
  return `# A two-minute check of your tools

This is not a painting session. Do these three things in this folder, in this order, then stop:

1. Open the picture \`${picture}\` and look at it. Write one line into \`seen.md\`, as \`${picture}: what the picture shows\` (a sentence of your own, twenty letters or more).
2. Run \`./unpaint plan\` once (if it answers "still working", run \`./unpaint wait\` until it answers).
3. Write the first line of that answer into the file \`${PREFLIGHT_FILE}\`.

Nothing is painted and nothing is scored. Then say "done".
`;
}

/**
 * The row of one preflight. `done`: how the command ended (session.mjs runSession); `kept`: the server's record;
 * `seen`: the transcript read; `file`: the text of preflight.txt or null; `logRead`: what the log shows of the
 * picture being read (true, false, or null when this command's log cannot show it).
 */
export function preflightRow({ author, done, kept, seen, file, logRead }) {
  const started = done.ended !== 'not started', described = Boolean(kept?.pictures && !kept.pictures.missing.length), planned = (kept?.plans ?? []).some(p => p.ok), wrote = Boolean(file && /compiles/i.test(file));
  const row = { model: author.id, key: author.key, cli: author.cli, effort: author.effort ?? null, started, describedThePicture: described, logShowsRead: logRead, ranPlan: planned, wroteTheFile: wrote,
    said: kept?.pictures ? Object.values(kept.pictures.said)[0] ?? null : null, seconds: kept ? kept.wallSeconds : null, tokens: seen?.tokens ?? null, costUSD: seen?.costUSD ?? null, ended: done.ended, error: done.error ?? null };
  return { ...row, ok: started && described && planned && wrote };
}

/** One line a row, for the table printed at the end. */
export function preflightLine(r) {
  const yn = v => (v === true ? 'yes' : v === false ? 'NO' : 'cannot show');
  return `${String(r.model).padEnd(28)} ${String(r.cli).padEnd(6)} ${String(r.effort ?? '-').padEnd(7)} started ${yn(r.started).padEnd(4)} described the picture ${yn(r.describedThePicture).padEnd(4)} log shows a read ${yn(r.logShowsRead).padEnd(11)} ran plan ${yn(r.ranPlan).padEnd(4)} wrote the file ${yn(r.wroteTheFile).padEnd(4)} ${r.seconds ?? '?'} s  ${r.ok ? 'OK' : `NOT READY${r.error ? `: ${r.error}` : ''}`}`;
}
