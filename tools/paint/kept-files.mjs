// A final painted again from a kept session (--from) holds the session's own files, unchanged: what it handed in
// (author/folder with choice.json, its script, its lines), its looks, the record of what it handed over and its
// commands. So that run is accepted as a later try's --previous, and can itself be painted again with --from.
import fs from 'node:fs';
import path from 'node:path';

/** The session's own files, under its author/ folder, that a run painted from it keeps. */
export const SESSION_FILES = ['folder', 'looks', 'handed-over.json', 'S.commands.txt', 'session-prompt.txt', 'assessment.md', 'self-review.md', 'looks.jsonl'];

/**
 * Copy the session's own files from `fromAuthor` (the kept session's author/) into `toAuthor`, never over a file that
 * is there. Returns the names copied. A kept session without its folder is refused: there is nothing to keep.
 */
export function keepSessionFiles(fromAuthor, toAuthor) {
  if (!fs.existsSync(path.join(fromAuthor, 'folder', 'choice.json'))) throw new Error(`--from: ${fromAuthor} has no folder/choice.json: the session's own files are not there to keep`);
  fs.mkdirSync(toAuthor, { recursive: true });
  const done = [];
  for (const name of SESSION_FILES) {
    const from = path.join(fromAuthor, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(toAuthor, name), { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
    done.push(name);
  }
  return done;
}
