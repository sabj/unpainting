// Did the model open the pictures it was handed? A later try is handed its own previous painting, the replay sheet
// and the arrows sheet; a level 4 session the automatic painter's painting. Two of the three commands leave a line in
// their log for a picture they read (claude: Read FILE; agy: a file tool with the path); codex's log shows shell
// commands and messages only, and a picture it views leaves no line. So the terms are the same for every model: before
// its first plan it writes one line on each handed picture into seen.md (FILE: what the picture shows), the session
// does not plan until each has its line, and the record keeps the lines beside what the log could show.
// Pure: nothing is read or written here.

/** The least a line on a picture must say (letters), so that a bare file name is not taken as having looked. */
export const LEAST_SAID = 20;

/**
 * seen.md read against the pictures handed over. `files`: their paths in the session's folder. A line counts for a
 * file when it begins with the file's path or bare name, then a colon, then at least LEAST_SAID letters.
 * {ok, missing: [file], said: {file: text}}.
 */
export function readSeen(text, files) {
  const said = {}, lines = String(text ?? '').split('\n').map(l => l.replace(/^[\s>*-]+/, '').replace(/[`*]/g, ''));
  for (const f of files) {
    const names = [f, f.split('/').pop()];
    for (const l of lines) { const n = names.find(x => l.startsWith(`${x}:`)); if (!n) continue; const t = l.slice(n.length + 1).trim(); if (t.length >= LEAST_SAID) { said[f] = t.slice(0, 600); break; } }
  }
  const missing = files.filter(f => !(f in said));
  return { ok: !missing.length, missing, said };
}

/** The words that ask for the lines, for the session's task and for a refused plan. */
export function seenAsk(files) {
  return `Before your first plan, open each of these pictures and write one line on each into \`seen.md\`, as \`FILE: what the picture shows and what you take from it\`: ${files.map(f => `\`${f}\``).join(', ')}. The session does not plan until each has its line.`;
}

/**
 * What the command's own log shows for each handed picture: true (a file tool read it), false (the log would show a
 * read and shows none), or null (this command's log cannot show a picture being read: codex). `commands`: the
 * transcript's commands in order (session.mjs readTranscript).
 */
export function logReads(cli, commands, files) {
  const out = {};
  for (const f of files) {
    if (cli === 'codex') { out[f] = null; continue; }
    const tool = cli === 'claude' ? /^Read\s/ : /^(read_file|view_file|view_image|read_image)\s/;
    out[f] = commands.some(c => tool.test(c) && (c.includes(`/${f}`) || c.trim().endsWith(` ${f}`)));
  }
  return out;
}
