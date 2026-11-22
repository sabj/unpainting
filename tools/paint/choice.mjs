// What a model author submits from its working session (session.mjs): its choice. One JSON file, choice.json:
//   {"kind": "settings", "settings": {"study1.shapes": 60, "floors": "8,4,2"}, "why": "..."}   the code planner, tuned
//   {"kind": "script", "script": "script.json", "why": "..."}                                    its own painting script
//   {"kind": "plan", "plan": "my-plan.json", "why": "..."}                                       the code planner's plan, edited
// A settings choice with no settings is the code planner alone: it paints exactly what `--author auto` paints.
// An edited plan is a copy of auto/plan-to-edit.json with washes changed, merged, left out or added
// (src/paint/methods/plan-edit.mjs): the painter builds the code planner's plan again and applies the edit, so a wash
// the edit does not touch is laid exactly as the code planner would lay it.
import crypto from 'node:crypto';

/** The planner settings a session lists, with their meaning in plain words. `per`: one for each study, or the first only. */
export const SETTINGS = Object.freeze([
  { key: 'floors', per: 'all', meaning: 'the least shape (mm2) each study lays, coarse to fine, as three numbers "a,b,c". Larger: fewer, broader shapes. Smaller: more small shapes.' },
  { key: 'shapes', per: 'first', default: 160, meaning: 'the most shapes the block-in (study 1) may have; the smallest join the neighbour nearest in colour. 0: no limit. Fewer: broader, simpler masses.' },
  { key: 'clusters', per: 'each', default: 16, meaning: 'how many colours the study is read into. Fewer: flatter, calmer colour. More: closer colours stay apart (and a face can turn into a mosaic).' },
  { key: 'join', per: 'each', default: 10, meaning: 'colours nearer than this (Lab units) are read as one colour. Larger: fewer colour families. Smaller: more.' },
  { key: 'formbrush', per: 'first', default: 17, meaning: 'the widest wash brush (mm) inside a face, an eye, an animal, fur, a figure, hair or clothing. The kit\'s rounds are 17, 13, 10 mm and smaller.' },
  { key: 'formbase', per: 'first', default: 1, meaning: '1: every soft named form (face, fur, animal, hair, figure, clothing, sky, water) begins with one pale wash over the whole form, laid into clean water. 0: no such base wash.' },
  { key: 'round', per: 'first', default: null, meaning: 'the radius (mm) the block-in shapes\' corners are rounded to. Larger: softer, rounder shapes.' },
]);

/** Settings a session may not change: the locked inputs, the guard, and what the harness sets itself. */
const LOCKED = new Set(['drawing', 'width', 'sheetmm', 'masks', 'heapmb', 'targetguard', 'notargetlooks', 'valueplan', 'plan', 'seed', 'mode', 'video', 'runcache', 'canarystop', 'brushes', 'valuemaps', 'marks']);
const NAME = /^[a-z][a-z0-9]*(\.[a-z]+)?$/;

/** The settings with this subject's present values: [{set, now, meaning}], `set` being the key a choice writes. */
export function settingsList(spec) {
  const out = [];
  for (const s of SETTINGS) {
    if (s.per === 'all') { out.push({ set: s.key, now: spec.studies.map(st => st.floorMm2 ?? '?').join(','), meaning: s.meaning }); continue; }
    spec.studies.forEach((st, i) => { if (s.per === 'each' || i === 0) out.push({ set: `study${i + 1}.${s.key}`, now: st.read?.[s.key] ?? s.default ?? 'the planner\'s own', meaning: `study ${i + 1} (${st.role.split(' (')[0]}): ${s.meaning}` }); });
  }
  return out;
}

/**
 * A choice checked: {kind, sets: [[key, value]], script: file name or null, why}. Throws with the reason, said so
 * that its author can correct it. Checks the form only: the planner is what refuses a value it cannot use.
 */
export function readChoice(given) {
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error('choice.json: one JSON object, {"kind": "settings" | "plan" | "script", ...}');
  const why = typeof given.why === 'string' ? given.why.slice(0, 600) : null;
  const FILE = /^[A-Za-z0-9._-]+\.json$/;
  if (given.kind === 'plan') {
    if (typeof given.plan !== 'string' || !FILE.test(given.plan)) throw new Error('choice.json: kind "plan" names its file in this folder, your edited copy of auto/plan-to-edit.json: {"kind": "plan", "plan": "my-plan.json"}');
    if (given.settings && Object.keys(given.settings).length) throw new Error('choice.json: an edited plan is an edit of the code planner\'s plan as it stands in auto/; it takes no planner settings');
    return { kind: 'plan', sets: [], script: null, plan: given.plan, why };
  }
  if (given.kind === 'script') {
    if (typeof given.script !== 'string' || !FILE.test(given.script)) throw new Error('choice.json: kind "script" names its file in this folder: {"kind": "script", "script": "script.json"}');
    if (given.settings && Object.keys(given.settings).length) throw new Error('choice.json: a script is laid as written; it takes no planner settings');
    return { kind: 'script', sets: [], script: given.script, why };
  }
  if (given.kind !== 'settings') throw new Error('choice.json: "kind" is "settings" (the code planner, tuned), "plan" (the code planner\'s plan, edited) or "script" (your own painting script)');
  const settings = given.settings ?? {};
  if (typeof settings !== 'object' || Array.isArray(settings)) throw new Error('choice.json: "settings" is an object of name: value');
  const sets = Object.entries(settings).map(([k, v]) => {
    if (!NAME.test(k)) throw new Error(`choice.json: setting "${k}" is not a setting name`);
    if (LOCKED.has(k)) throw new Error(`choice.json: setting "${k}" is locked (the inputs, the guard and the run's own settings stay as they are)`);
    if (!['string', 'number'].includes(typeof v) || !/^[A-Za-z0-9.,:+-]+$/.test(String(v))) throw new Error(`choice.json: setting "${k}": a number or a plain word, not ${JSON.stringify(v)}`);
    return [k, String(v)];
  });
  return { kind: 'settings', sets: sets.sort((a, b) => a[0].localeCompare(b[0])), script: null, why };
}

/** One word for what a checked choice is, as the record and the sheet say it. */
export function choiceKind(choice) {
  return choice.kind === 'script' ? 'own script' : choice.kind === 'plan' ? 'edited plan' : choice.sets.length ? 'settings' : 'nothing changed';
}

/** A fingerprint of a choice (and the text of its script or edited plan): two looks at the same choice are the same plan. */
export function choiceKey(choice, fileText = '') {
  return crypto.createHash('sha256').update(JSON.stringify([choice.kind, choice.sets, choice.kind === 'settings' ? '' : fileText])).digest('hex').slice(0, 16);
}

/** The run's --set list with a settings choice laid over it; the choice wins where both name a key. */
export function withChoice(sets, choice) {
  const mine = new Map(choice.sets);
  return [...sets.filter(([k]) => !mine.has(k)), ...choice.sets];
}
