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
  // an edit that cannot be laid as asked stops the run; every fault of it is written out for its author (plan-edit-faults.json)
  let got; try { got = applyPlanEdit(plan, edit, ctx); } catch (e) { if (e.planEditFaults) fs.writeFileSync(path.join(out, 'plan-edit-faults.json'), JSON.stringify({ faults: e.planEditFaults, message: e.message }, null, 1) + '\n'); throw e; }
  const { plan: edited, record } = got;
  fs.writeFileSync(path.join(out, 'plan-edit-record.json'), JSON.stringify(record, null, 1) + '\n');
  console.log(`wash plan: an author's edit of the code planner's plan: ${editLine(record)}${record.notes.length ? `; ${record.notes.join('; ')}` : ''}`);
  return edited;
}
