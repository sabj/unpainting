// Eyes only (bench/docs/rules.md: "The model may not read the subject's pixels with code", the one disqualification).
// At levels 2 to 4 the PICTURES a session is given are for looking at, not for code:
//   inputs/source.png            the subject (the original)
//   inputs/study-N.png           the three colour studies
//   <handed folder>/<picture>    a retry's own earlier painting beside the subject, its replay sheet, its arrows sheet
//   looks/N/beside.png, stages.png   a look's pictures: they show the subject beside the sheet
// The DATA the levels give stays readable by any script: inputs/forms.json and inputs/forms-ids.png (the named forms),
// inputs/forms.png and inputs/drawing.png (pictures of that data), drawing/lines.json and drawing/all-lines.png (the
// fitted drawing), resources/shapes.json (level 4: the studies' traced shapes), a look's numbers.txt, plan.json and
// plan.png, and looks/N/sheet.png: the session's own dried sheet alone, with nothing of the subject in it (the old
// rule: "Your own frames ... are readable", bench/v3/BRIEF.md).
// How it is held. Refused: the session's seatbelt profile lets only the model command's own program (its image
// viewer) read a picture's bytes; every other process (python, node, cat, cp, a link, a move) is refused. Detected:
// after the session its transcript is read for refused reads and for scripts that name a picture, and either
// disqualifies the try, in level 1's words (bench/scripts/v3.mjs). Counted: the input pictures are put away when the
// session plans or looks, and `./unpaint show` brings one back (session.mjs); every showing is in the ledger.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** The input pictures that are for looking at only, as paths in the session's folder; and the original among them. */
const EYES_ONLY_INPUT = /^inputs\/(source|study-\d+)\.png$/, ORIGINAL = 'inputs/source.png';
/** A look's pictures that show the subject, as a path in the folder (they stay: a look bought them). */
const LOOK_PICTURES = 'looks/[0-9]+/(beside|stages)\\.png';
export const isOriginal = file => file === ORIGINAL;

/** The eyes-only pictures of a session: of the packet's `files`, and every handed picture (session.mjs writeSession). */
export const eyesOnlyOf = (files, handedPictures = []) => [...files.filter(f => EYES_ONLY_INPUT.test(f)), ...handedPictures];

/** The words a session is told, and a record carries. */
export const EYES_ONLY_WORDS = 'the pictures are for looking at with your own image viewer; a program that reads one is refused, and reading a picture with code disqualifies the try';

/** The model command's own program, which views pictures: where it is found and where that leads. Throws when it is not installed. */
export function viewersOf(cli, which = c => execFileSync('/usr/bin/which', [c], { encoding: 'utf8' }).trim()) {
  let at; try { at = which(cli); } catch { at = null; }
  if (!at) throw new Error(`eyes only: the \`${cli}\` command is not on PATH, so its image viewer cannot be told from a script; the session is not started`);
  let real = at; try { real = fs.realpathSync(at); } catch { /* as found */ }
  // muse is a shell launcher that execs a sibling muse-bin-* program beside it; seatbelt checks the exec'd program's path
  const siblings = cli === 'muse' ? [...new Set([path.dirname(at), path.dirname(real)])].flatMap(d => {
    try { return fs.readdirSync(d).filter(f => /^muse-bin/.test(f)).flatMap(f => { const p = path.join(d, f); try { return [p, fs.realpathSync(p)]; } catch { return [p]; } }); } catch { return []; }
  }) : [];
  return [...new Set([at, real, ...siblings])];
}

const q = s => `"${String(s).replace(/[\\"]/g, '\\$&')}"`, rx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The seatbelt rules that hold a session's pictures to looking (session.mjs seatbelt puts them last, so they win).
 * `cwd`: the session's folder, its real path; `pictures`: eyesOnlyOf(); `viewers`: the programs that may read them
 * (viewersOf). Nothing in the folders that hold them can be written, moved or linked from inside the session (a
 * moved picture would be an ordinary file), nor the folder itself moved; a picture's bytes are read by a viewer only.
 */
export function eyesRule({ cwd, pictures, viewers }) {
  const folders = [...new Set([...pictures.map(f => f.split('/')[0]), 'looks'])].map(d => `(subpath ${q(path.join(cwd, d))})`);
  const above = []; for (let p = cwd; p !== path.dirname(p); p = path.dirname(p)) above.push(`(literal ${q(p)})`);
  const held = [...pictures.map(f => `(literal ${q(path.join(cwd, f))})`), `(regex #"^${rx(cwd)}/${LOOK_PICTURES}$")`];
  const but = viewers.length ? ` (require-not (require-any ${viewers.map(v => `(process-path ${q(v)})`).join(' ')}))` : '';
  return [`(deny file-write* ${folders.join(' ')})`, `(deny file-write-unlink ${above.join(' ')})`, `(deny file-read-data (require-all (require-any ${held.join(' ')})${but}))`];
}

const DENIED = /operation not permitted|permission denied|EPERM|EACCES/i;
const INLINE = /\b(python[\d.]*|node|ruby|perl)\s+(-c|-e|--eval|-p|-\s*<<|<<)/;
/** Whether a file of the folder is a program, by its name. */
export const isProgram = name => /\.(py|m?js|cjs|ts|sh|zsh|bash|rb|pl|r|jl|swift|c|go)$/i.test(name);

/**
 * A session's transcript and scripts read for pictures read with code. `steps`: readTranscript()'s tool steps
 * ({kind, text, output, denied}); `scripts`: [{name, text}] the programs it wrote; `pictures`: eyesOnlyOf().
 * {blocked: [a refused read: the command and what the system said], scripts: [a program that names a picture],
 * commands: [another shell command that names one: recorded, never by itself a disqualification]}.
 */
export function pictureReadsByCode({ steps = [], scripts = [], pictures = [] }) {
  const names = [...new Set(pictures.flatMap(f => [f, path.basename(f)]))].map(rx);
  const named = new RegExp(`(^|[^A-Za-z0-9_-])(${[...names, LOOK_PICTURES, '(beside|stages)\\.png'].join('|')})(?![A-Za-z0-9_-])`);
  const cut = t => String(t).replace(/\s+/g, ' ').trim().slice(0, 300);
  const blocked = [], inScripts = [], commands = [];
  for (const s of steps) {
    if (s.kind !== 'shell') continue;
    // the viewer's own command is not code reading a picture: ./unpaint show FILE
    const text = String(s.text).split(/[\n;&|]+/).filter(part => !/^\s*(\.\/)?unpaint\s+show\b/.test(part)).join('\n');
    const said = [...(s.denied ?? []), ...String(s.output ?? '').split('\n')].find(l => DENIED.test(l) && named.test(l));
    if (said) blocked.push({ command: cut(s.text), said: cut(said) });
    else if (named.test(text)) (INLINE.test(text) ? inScripts : commands).push({ ...(INLINE.test(text) ? { name: 'a program in a shell command' } : {}), command: cut(s.text), names: named.exec(text)[2] });
  }
  for (const f of scripts) { const line = String(f.text ?? '').split('\n').find(l => named.test(l)); if (line && isProgram(f.name)) inScripts.push({ name: f.name, line: cut(line), names: named.exec(line)[2] }); }
  return { blocked, scripts: inScripts, commands };
}

/**
 * The record of a session's guard and what it means for the try, in the words of level 1's (bench/scripts/v3.mjs):
 * {guard: {blockedImageReads, scriptsNamingPictures, commandsNamingPictures, ...the lists}, cheat: {disqualified,
 * readTargetPixels, reason}}. A refused read or a script that names a picture disqualifies; nothing else does.
 */
export function guardRecord(found, { held }) {
  const dq = found.blocked.length > 0 || found.scripts.length > 0;
  return {
    guard: { how: held ? 'refused by the session\'s sandbox to every program but the model command\'s own, and detected from its transcript' : 'detected from its transcript only: this command\'s sandbox does not hold the pictures', blockedImageReads: found.blocked.length, scriptsNamingPictures: found.scripts.length, commandsNamingPictures: found.commands.length, blocked: found.blocked.slice(0, 40), scripts: found.scripts.slice(0, 40), commands: found.commands.slice(0, 40) },
    cheat: { disqualified: dq, readTargetPixels: dq, reason: dq ? (found.blocked.length ? `${found.blocked.length} blocked picture read(s) by code` : `scripts refer to the picture files: ${[...new Set(found.scripts.map(s => s.names))].join(', ')}`) : null },
  };
}
