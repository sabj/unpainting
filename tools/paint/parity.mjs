// The record a parity check needs. When a session ends, what it handed over is written down with the hash of every
// file its choice names (handed-over.json, beside the kept folder). When that choice is painted, at once or later
// with --from, the same files are hashed again where the painter reads them: a difference stops the painting, and the
// run records what was compared. So a final can be shown to be the painting of exactly what the session left.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The files a handed-over choice names, as [role, name]. */
export function filesOf(submitted) {
  return [['script', submitted.kind === 'script' ? submitted.script : null], ['plan', submitted.kind === 'plan' ? submitted.plan : null], ['lines', submitted.tools?.lines ?? null], ['forms', submitted.tools?.forms ?? null]].filter(([, n]) => n);
}

/**
 * What a session handed over, with the hash of each file as it lies in `folder` (the kept copy of the session's
 * folder). `run`: {subject: {id, sourceSha256}, sheet, commit, settings}. A file that is missing is a throw.
 */
export function handedOverRecord(folder, submitted, run = {}) {
  const files = Object.fromEntries(filesOf(submitted).map(([role, name]) => {
    const f = path.join(folder, name); if (!fs.existsSync(f)) throw new Error(`handed over: ${name} (its ${role}) is not in the kept folder ${folder}`);
    return [role, { name, sha256: sha(f) }];
  }));
  return { schema: 'unpaint-paint/handed-over@1', kind: submitted.kind, what: submitted.what, settings: submitted.settings ?? {}, perForm: submitted.tools?.perForm ?? null, medium: submitted.tools?.medium ?? null, files, from: submitted.from ?? null, ...run };
}

/**
 * The kept folder checked against a handed-over record: {same: true, compared: [roles]} or a throw that names each
 * file that differs or is missing. `record` null (a session kept before the record was written): {same: null, why}.
 */
export function checkHandedOver(folder, record) {
  if (!record) return { same: null, why: 'this session was kept before handed-over.json was written, so its files could not be compared' };
  const wrong = [];
  for (const [role, f] of Object.entries(record.files ?? {})) {
    const at = path.join(folder, f.name);
    if (!fs.existsSync(at)) wrong.push(`${f.name} (its ${role}) is missing`); else if (sha(at) !== f.sha256) wrong.push(`${f.name} (its ${role}) is not the file the session handed over`);
  }
  if (wrong.length) throw new Error(`parity: the kept session folder ${folder} does not hold what the session handed over: ${wrong.join('; ')}. Nothing is painted in its place`);
  return { same: true, compared: Object.keys(record.files ?? {}) };
}

/** Whether a choice read back for painting is the one the record says was handed over (kind, settings, medium, per-form settings). Throws on a difference. */
export function checkChoice(record, choice) {
  if (!record) return;
  const now = { kind: choice.kind, settings: Object.fromEntries(choice.sets), medium: choice.tools?.medium ?? null, perForm: choice.tools?.perFormGiven ?? null };
  const was = { kind: record.kind, settings: record.settings ?? {}, medium: record.medium ?? null, perForm: record.perForm ?? null };
  if (JSON.stringify(now) !== JSON.stringify(was)) throw new Error(`parity: the choice read for painting (${JSON.stringify(now)}) is not the one the session handed over (${JSON.stringify(was)})`);
}
