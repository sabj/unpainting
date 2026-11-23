// The final painting's wash plan, kept as a file so that a look can be painted from it. A plan-only run (the CPU plan a
// session makes of every choice, at the final sheet's size) writes it beside its other files; a look, painted on fewer
// cells, reads it and brings it onto its own grid (plan-shrink.mjs) instead of planning again. Beside it a small note
// in plain JSON: the grid, the paints, how many washes, and the plan's hash.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeEntry, readEntry } from '../run-cache.mjs';

export const PLAN_FILE = 'final-plan.bin';
const PLAN_NOTE = 'final-plan.json';

/**
 * A plan's hash: its washes in order, each with its mix, move, brushes and strokes (millimetres), and the mixes. Two
 * plans with one hash lay the same washes; nothing told cell by cell is in it, so it is the same on a look's grid.
 */
export function planHash(plan) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(plan.mixes ?? null));
  for (const q of plan.instructions) h.update(JSON.stringify([q.id, q.kind, q.stage, q.mixId, q.move, q.phase, q.load?.water ?? null, q.strokes ?? null, q.outline ?? null]));
  return h.digest('hex').slice(0, 16);
}

/** The paints of a plan as the painter's --paints takes them: each pigment's box key, or null when one has none. */
export const paintKeys = pigments => (pigments.every(p => typeof p.key === 'string' && p.key) ? pigments.map(p => p.key) : null);

/** Write a plan made on a grid of w x h cells into `dir`. Returns the note. */
export function writePlanFile(dir, { plan, w, h, sheetWidthMm, pigments }) {
  const note = { kind: 'the final painting\'s wash plan, for looks painted on fewer cells (src/paint/methods/plan-file.mjs)', w, h, sheetWidthMm, paints: paintKeys(pigments), pigments: pigments.map(p => p.name ?? p.key ?? null), washes: plan.instructions.length, hash: planHash(plan) };
  const file = path.join(dir, PLAN_FILE), tmp = `${file}.${process.pid}.tmp`;
  writeEntry(tmp, { reads: [], logs: [], value: { note, plan } }); fs.renameSync(tmp, file);
  fs.writeFileSync(path.join(dir, PLAN_NOTE), JSON.stringify(note, null, 1) + '\n');
  return note;
}

/** Read a plan file: { note, plan }. A file that is not one, or whose plan is not the one its note describes, is an error. */
export function readPlanFile(file) {
  if (!fs.existsSync(file)) throw new Error(`plan file: ${file} is not there (a look is painted from the plan its final was planned with: plan the choice first)`);
  const { note, plan } = readEntry(file).value ?? {};
  if (!note || !plan?.instructions || !plan.layers) throw new Error(`plan file: ${file} holds no wash plan`);
  if (planHash(plan) !== note.hash || plan.instructions.length !== note.washes) throw new Error(`plan file: ${file} does not hold the plan its note describes`);
  return { note, plan };
}

/** The note beside a plan file in `dir`, or null when no plan was kept there. */
export function readPlanNote(dir) {
  const f = path.join(dir, PLAN_NOTE);
  return fs.existsSync(f) && fs.existsSync(path.join(dir, PLAN_FILE)) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
