// The painter's side of an edited wash plan (src/paint/methods/plan-edit.mjs; tools/paint/SESSION-README.md, "Editing the plan").
// --washplan edit:EDIT.json,STUDY.png[:MIN],...: the study plan is built as always, then the edit is applied to it.
// Every study plan is also written out as the file an author edits (plan-to-edit.json).
import fs from 'node:fs';
import path from 'node:path';
import { planListing, applyPlanEdit, editLine } from '../../src/paint/methods/plan-edit.mjs';

/** A --washplan value split into [the edit file or null, the studies]. */
export function splitPlanEdit(washPlan) {
  if (!washPlan.startsWith('edit:')) return [null, washPlan];
  const at = washPlan.indexOf(',');
  if (at < 6 || at === washPlan.length - 1) throw Error('--washplan edit:EDIT.json,STUDY.png[:MIN],...: the edit file, then the studies the plan is built from');
  return [washPlan.slice(5, at), washPlan.slice(at + 1)];
}

/**
 * Writes <out>/plan-to-edit.json (the plan as built, for an author to edit) and, with an edit file, returns the
 * edited plan and writes <out>/plan-edit-record.json (what the edit changed, counted). A bad edit stops the run.
 */
export function planEditStep({ plan, file, out, ctx }) {
  fs.writeFileSync(path.join(out, 'plan-to-edit.json'), JSON.stringify(planListing(plan, ctx), null, 1) + '\n');
  if (!file) return plan;
  let edit; try { edit = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw Error(`--washplan edit:${file}: ${e.message}`); }
  const { plan: edited, record } = applyPlanEdit(plan, edit, ctx);
  fs.writeFileSync(path.join(out, 'plan-edit-record.json'), JSON.stringify(record, null, 1) + '\n');
  console.log(`wash plan: an author's edit of the code planner's plan: ${editLine(record)}${record.notes.length ? `; ${record.notes.join('; ')}` : ''}`);
  return edited;
}
