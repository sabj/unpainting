// The automatic plan of a subject is a PREPARED INPUT, made once at a commit before any session and found by a
// session in seconds: no session makes it on its own clock. For level 4 the automatic painter's full-size painting
// and its three sheets (work-sheets.mjs) are prepared the same way. A session whose prepared input is missing does
// not start, and says the command that makes it:
//   npm run paint -- <subject> prepare [--level L4] [--set ...]
// Where: $UNPAINT_PREPARED, else the folder `prepared` beside SUBJECTS.json, then
//   <subject>[-variant]/<commit, 8>[-dirty-<diff, 8>][-set-<settings, 8>]/
//     prepared.json     what was made, when, with which code and settings
//     plan/             the code planner's plan (CPU): value-plan.json, plan-to-edit.json, its picture
//     painting/         level 4: the full-size painting as a run (run.json, plate/)
//     sheets/           level 4: the painting beside the subject, the replay sheet, the arrows sheet
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_FILES } from './work-sheets.mjs';

const sha8 = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);

/** Where the prepared inputs are kept. */
export function preparedRoot(registryBase, env = process.env) {
  return path.resolve(env.UNPAINT_PREPARED || path.join(registryBase, 'prepared'));
}

/** The folder of one subject's prepared inputs for this code and these run settings (relative to the root). */
export function preparedKey({ id, variant = null, commit, dirty = false, diffSha256 = null, sets = [] }) {
  if (!commit) throw new Error('prepared inputs are kept for a commit, and this checkout has none');
  const mine = sets.filter(([k]) => !['video', 'frames'].includes(k)).map(([k, v]) => `${k}=${v}`).sort();
  return path.join(variant ? `${id}-${variant}` : id, `${commit.slice(0, 8)}${dirty ? `-dirty-${String(diffSha256 ?? 'unknown').slice(0, 8)}` : ''}${mine.length ? `-set-${sha8(mine.join('\n'))}` : ''}`);
}

/** The command that prepares a subject, as a person types it. */
export function prepareCommand({ subject, level = 'L2', sets = [] }) {
  return `npm run paint -- ${subject} prepare${level === 'L4' ? ' --level L4' : ''}${sets.map(([k, v]) => ` --set ${k}=${v}`).join('')}`;
}

/**
 * The prepared inputs found in `folder`, checked: {plan: the plan's folder, record, painting: {run, sheets: [{from,
 * name}]} or null}. `painting`: the level needs the automatic painting too. Throws with a plain message naming the
 * prepare command when anything is missing: a session never makes these itself and nothing stands in for them.
 */
export function readPrepared(folder, { painting = false, command }) {
  const miss = what => new Error(`${what} is not prepared for this code and these settings (looked in ${folder}). It is a prepared input: a session never makes it on its own clock. Make it once with:\n  ${command}`);
  let record; try { record = JSON.parse(fs.readFileSync(path.join(folder, 'prepared.json'), 'utf8')); } catch { throw miss('the automatic plan of this subject'); }
  const plan = path.join(folder, 'plan');
  for (const f of ['value-plan.json', 'plan-to-edit.json']) if (!fs.existsSync(path.join(plan, f))) throw miss(`the automatic plan of this subject (its ${f})`);
  if (!painting) return { plan, record, painting: null };
  const run = path.join(folder, 'painting'), sheets = Object.values(SHEET_FILES).map(name => ({ from: path.join(folder, 'sheets', name), name }));
  if (!record.painting || !fs.existsSync(path.join(run, 'run.json'))) throw miss('the automatic painter\'s full-size painting of this subject (level 4 hands it to the session)');
  for (const s of sheets) if (!fs.existsSync(s.from)) throw miss(`the automatic painting's ${s.name}`);
  return { plan, record, painting: { run, sheets } };
}

/** prepared.json written: what was made, with which code and settings. */
export function writePrepared(folder, record) {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'prepared.json'), JSON.stringify({ schema: 'unpaint-paint/prepared@1', ...record }, null, 1) + '\n');
}
