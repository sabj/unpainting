// A kept session and the files that carry its choice. Two rules, both against a silent fallback:
// - a session is painted again (--from) only from a folder that holds everything its choice names; a folder that lacks
//   a file is refused, with the file named;
// - a kept script or plan edit that lies in a session's folder (--author script:FILE, edit:FILE) belongs to that
//   session's choice: when the session chose its own drawing lines it is painted with them, or refused. It is never
//   painted with the standard drawing in their place.
import fs from 'node:fs';
import path from 'node:path';

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

/** The files a session's folder must hold for its handed-over choice to be painted again, as paths in the folder. */
export function neededOfSession(submitted) {
  const need = ['author/S.commands.txt'];
  if (submitted.kind === 'script') need.push(`author/folder/${submitted.script}`);
  if (submitted.kind === 'plan') need.push(`author/folder/${submitted.plan}`, 'author/plans/auto/plan-to-edit.json');
  for (const k of ['lines', 'forms']) if (submitted.tools?.[k]) need.push(`author/folder/${submitted.tools[k]}`);
  return need;
}

/** Refuses a --from folder that lacks a file its choice needs: the files are named, nothing is painted in its place. */
export function checkSessionFolder(run, submitted) {
  const missing = neededOfSession(submitted).filter(f => !fs.existsSync(path.join(run, f)));
  if (missing.length) throw new Error(`--from: the session folder ${run} lacks ${missing.join(', ')}: a session is painted from its whole folder as it was kept (${submitted.what}), and nothing else is painted in its place`);
}

/** The session a kept file lies in (RUN/author/FILE, RUN/author/folder/FILE): {run, submitted, reusedFrom}, or null when it lies in none. */
export function sessionOfFile(file) {
  const parts = path.resolve(file).split(path.sep);
  for (let i = parts.length - 2; i > 0; i--) {
    if (parts[i] !== 'author') continue;
    const run = parts.slice(0, i).join(path.sep) || path.sep;
    let session = null; try { session = readJson(path.join(run, 'run.json'))?.author?.session ?? null; } catch { /* no run here */ }
    // (a painting made --from a session holds that session's record and names the folder it was painted from)
    if (session?.submitted) return { run, submitted: session.submitted, reusedFrom: session.reusedFrom ?? null };
  }
  return null;
}

/**
 * A kept script (`kind` 'script') or plan edit ('plan') named by its file: null when it belongs to no session, or to a
 * session that chose no lines of its own (the standard drawing is then what was handed over). Otherwise the lines it
 * must be painted with: {run, lines (the file's name), linesFile, what}. Throws, naming the file, when the lines file
 * is missing, and when FILE is not the script or plan edit that session handed over.
 */
export function linesOfKept(file, kind) {
  const s = sessionOfFile(file), lines = s?.submitted.tools?.lines ?? null;
  if (!lines) return null;
  const { run, submitted } = s, word = kind === 'script' ? 'script' : 'plan edit', name = kind === 'script' ? submitted.script : submitted.plan;
  const again = `paint the session itself (--author <its model> --from ${run})`;
  const handed = name && submitted.kind === kind ? [path.join(run, 'author', 'folder', name), path.join(run, 'author', kind === 'script' ? 'script.json' : 'plan-edit.json')].filter(f => fs.existsSync(f)) : [];
  const text = f => JSON.stringify(readJson(f));
  if (!handed.some(f => path.resolve(f) === path.resolve(file) || text(f) === text(file))) throw new Error(`${file} lies in the folder of a session that handed over ${submitted.what}, with its own drawing lines (${lines}), and is not the ${word} it handed over${name && submitted.kind === kind ? ` (author/folder/${name})` : ''}: it is not painted with that session's lines, nor with the standard drawing as if it were the session's work. To paint what the session handed over, ${again}; to paint this file by itself, copy it out of the session's folder`);
  const places = [run, s.reusedFrom].filter(Boolean).map(d => path.join(d, 'author', 'folder', lines)), linesFile = places.find(f => fs.existsSync(f)) ?? places[0];
  if (!fs.existsSync(linesFile)) throw new Error(`${file} was handed over with its session's own drawing lines, and the lines file is missing: ${places.join(' (nor ')}${places.length > 1 ? ')' : ''}. It is not painted with the standard drawing in their place; restore the file, or ${again}`);
  return { run, lines, linesFile, what: submitted.what };
}

/**
 * The drawing a kept script or plan edit is painted with: never chosen for it unasked. `asked` is --lines: a lines
 * file, the word 'standard', or null. {standard: true, said} for the registered drawing whole, or {lines, linesFile,
 * what, run, said} for a choice of lines. In order: what was asked for by name; else what the file's session handed
 * over (its lines, or none); else, for a file in no session's folder, a refusal that says how to name it.
 */
export function drawingOfKept(file, kind, asked = null) {
  const word = kind === 'script' ? 'script' : 'plan edit', s = sessionOfFile(file), own = s?.submitted.tools?.lines ?? null;
  if (asked === 'standard') return { standard: true, said: `the standard drawing, whole, asked for by name (--lines standard)${own ? `; NOT the lines its session chose (${own})` : ''}` };
  if (asked) {
    const linesFile = path.resolve(asked);
    if (!fs.existsSync(linesFile)) throw new Error(`--lines ${asked}: no such file (a choice of lines as a session writes it, or the word standard)`);
    return { lines: 'lines.json', linesFile, what: `${kind === 'script' ? 'own script' : 'edited plan'} with a choice of lines named on the command line`, run: null, said: `the lines named on the command line (${linesFile})` };
  }
  if (!s) throw new Error(`${file} lies in no session's folder, so nothing says which drawing this ${word} was handed over with: name it, --lines standard (the registered drawing, whole) or --lines FILE.json (its choice of lines). A ${word} is never given the standard drawing unasked`);
  const tied = linesOfKept(file, kind);
  return tied ? { ...tied, said: `the drawing lines its session handed over (${tied.linesFile})` } : { standard: true, said: `the standard drawing, whole: its session (${s.run}) chose no lines of its own` };
}
