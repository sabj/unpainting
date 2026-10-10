// Keyframe sequence validation, matching site/shared/art-sequence.mjs validateSequence: a canvas, and frames
// with unique id, label, image and position increasing from 0 to 1.

/** Throws if the plan is not a sequence the site's player would accept. Returns the plan. */
export function checkSequence(plan) {
  const bad = m => { throw new Error(`keyframe manifest: ${m}`); };
  if (!plan || !Array.isArray(plan.frames) || plan.frames.length < 2) bad('needs at least two frames');
  if (!Array.isArray(plan.canvas) || plan.canvas.length !== 2 || plan.canvas.some(n => !Number.isInteger(n) || n < 1 || n > 8192))
    bad(`canvas must be two whole numbers from 1 to 8192, not ${JSON.stringify(plan.canvas)}`);
  const ids = new Set();
  for (const [i, f] of plan.frames.entries()) {
    if (!f.id || ids.has(f.id)) bad(`frame ${i} needs an id of its own, not ${JSON.stringify(f.id)}`);
    if (!f.label) bad(`frame ${f.id} needs a label`);
    if (!f.src) bad(`frame ${f.id} needs an image`);
    if (!Number.isFinite(f.position) || f.position < 0 || f.position > 1) bad(`frame ${f.id} sits at ${f.position}, outside 0 to 1`);
    if (i && f.position <= plan.frames[i - 1].position) bad(`frame ${f.id} at ${f.position} does not come after ${plan.frames[i - 1].id} at ${plan.frames[i - 1].position}`);
    ids.add(f.id);
  }
  if (plan.frames[0].position !== 0) bad('the first frame must sit at 0');
  if (plan.frames.at(-1).position !== 1) bad('the last frame must sit at 1');
  return plan;
}
