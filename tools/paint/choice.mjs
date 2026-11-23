// What a model author submits from its working session (session.mjs): its choice. One JSON file, choice.json:
//   {"kind": "settings", "settings": {"study1.shapes": 60, "floors": "8,4,2"}, "why": "..."}   the code planner, tuned
//   {"kind": "script", "script": "script.json", "why": "..."}                                    its own painting script
//   {"kind": "plan", "plan": "my-plan.json", "why": "..."}                                       the code planner's plan, edited
// A settings choice with no settings is the code planner alone: it paints exactly what `--author auto` paints.
// An edited plan is a copy of auto/plan-to-edit.json with washes changed, merged, left out or added
// (src/paint/methods/plan-edit.mjs): the painter builds the code planner's plan again and applies the edit, so a wash
// the edit does not touch is laid exactly as the code planner would lay it.
// Beside its kind a choice may use three more tools (session-tools.mjs):
//   "lines": "my-lines.json"       which lines of the drawing are drawn before the washes, after them, or not, and how dark
//   "forms": "my-forms.json"       the named forms merged, split, renamed or given another kind (a settings choice)
//   "perForm": {"cat face": {"study1.clusters": 24, "study3.lay": 1}}    planner settings inside one named form (a settings choice)
//   "medium": "pencil" | "pen" | "none"   the medium of the drawing, whatever the source shows (any kind of choice)
//   "ink": "waterproof" | "soluble"        the pen's ink: set before the washes, or one a wash rewets (any kind of choice)
// In a session (levels.mjs: no level has the code's plan) the only kind is "script": the settings and plan kinds, and "forms" and
// "perForm", are refused with OWN_SCRIPT_ONLY.
// A choice is refused only when it cannot be read or the painter cannot lay it. A value that may spoil the painting
// (a per-form setting outside its usual range) is taken as written and listed in the choice's `warnings`.
import crypto from 'node:crypto';
import { DRAWING_MEDIA } from './lines-edit.mjs';
import { OWN_SCRIPT_ONLY } from './levels.mjs';

/** The pen's inks a choice may name (command.mjs maps them to the painter's inkfast 1 and 0). */
export const PEN_INKS = Object.freeze(['waterproof', 'soluble']);

/** The planner settings a session lists, with their meaning in plain words. `per`: one for each study, or the first only. */
export const SETTINGS = Object.freeze([
  { key: 'floors', per: 'all', meaning: 'the least shape (mm2) each study lays, coarse to fine, as three numbers "a,b,c". Larger: fewer, broader shapes. Smaller: more small shapes.' },
  { key: 'shapes', per: 'first', default: 160, meaning: 'the most shapes the block-in (study 1) may have; the smallest join the neighbour nearest in colour. 0: no limit. Fewer: broader, simpler masses.' },
  { key: 'clusters', per: 'each', default: 16, meaning: 'how many colours the study is read into. Fewer: flatter, calmer colour. More: closer colours stay apart (and a face can turn into a mosaic).' },
  { key: 'join', per: 'each', default: 10, meaning: 'colours nearer than this (Lab units) are read as one colour. Larger: fewer colour families. Smaller: more.' },
  { key: 'formbrush', per: 'first', default: 17, meaning: 'the widest wash brush (mm) inside a face, an eye, an animal, fur, a figure, hair or clothing. The kit\'s rounds are 17, 13, 10 mm and smaller.' },
  { key: 'formbase', per: 'first', default: 1, meaning: '1: every soft named form (face, fur, animal, hair, figure, clothing, sky, water) begins with one pale wash over the whole form, laid into clean water. 0: no such base wash.' },
  { key: 'round', per: 'first', default: null, meaning: 'the radius (mm) the block-in shapes\' corners are rounded to. Larger: softer, rounder shapes.' },
  { key: 'lay', per: 'later', default: 1, meaning: '1: what this study adds over the block-in is laid. 0: nothing of this study is laid (then turn it on for single forms with "perForm").' },
  { key: 'largest', per: 'later', default: 15, meaning: 'the largest touch (mm2) kept of what this study adds; larger changes are left to the washes. Larger: more of the study is laid, as bigger marks.' },
  { key: 'lightest', per: 'later', default: 40, meaning: 'only touches at least this dark (L*, 0 black to 100 white) are kept of what this study adds. Higher: paler touches are laid too (more of the study).' },
]);

/**
 * The planner settings a choice may give for ONE named form ("perForm"), as the model writes them: studyN.<name>.
 * `to`: the planner's own name; `studies`: the block-in (first), the later studies, or all; the value's bounds.
 */
export const FORM_SETTINGS = Object.freeze([
  { name: 'clusters', to: 'clusters', studies: 'first', min: 2, max: 64, meaning: 'how many colours the block-in is read into inside this form. More: more, closer shapes there. Fewer: broader, calmer shapes.' },
  { name: 'join', to: 'join', studies: 'first', min: 1, max: 40, meaning: 'colours nearer than this (Lab units) are one colour inside this form.' },
  { name: 'shapes', to: 'shapes', studies: 'first', min: 1, max: 400, meaning: 'the most block-in shapes this form may have; the smallest join the neighbour nearest in colour.' },
  { name: 'floor', to: 'floor', studies: 'all', min: 0.2, max: 5000, meaning: 'the least shape (mm2) this study lays inside this form.' },
  { name: 'brush', to: 'formbrush', studies: 'first', min: 1, max: 40, meaning: 'the widest wash brush (mm) inside this form, whatever its kind.' },
  { name: 'base', to: 'formbase', studies: 'first', min: 0, max: 1, meaning: '1: this form begins with one pale wash over the whole of it, laid into clean water, whatever its kind. 0: it gets none.' },
  { name: 'lay', to: 'lay', studies: 'later', min: 0, max: 1, meaning: '1: what this study adds is laid in this form. 0: nothing of this study is laid in it.' },
  { name: 'largest', to: 'largest', studies: 'later', min: 1, max: 5000, meaning: 'the largest touch (mm2) kept of what this study adds in this form.' },
  { name: 'lightest', to: 'lightest', studies: 'later', min: 0, max: 100, meaning: 'touches at least this dark (L*) are kept of what this study adds in this form; higher lays paler ones too.' },
]);

/** Settings a session may not change: the locked inputs, the guard, and what the harness sets itself. */
const LOCKED = new Set(['drawing', 'width', 'finalwidth', 'planfile', 'sheetmm', 'masks', 'heapmb', 'targetguard', 'notargetlooks', 'valueplan', 'plan', 'seed', 'mode', 'video', 'runcache', 'canarystop', 'brushes', 'valuemaps', 'marks']);
const NAME = /^[a-z][a-z0-9]*(\.[a-z]+)?$/;

/** The settings with this subject's present values: [{set, now, meaning}], `set` being the key a choice writes. */
export function settingsList(spec) {
  const out = [];
  for (const s of SETTINGS) {
    if (s.per === 'all') { out.push({ set: s.key, now: spec.studies.map(st => st.floorMm2 ?? '?').join(','), meaning: s.meaning }); continue; }
    spec.studies.forEach((st, i) => { if (s.per === 'each' || (s.per === 'later' ? i > 0 : i === 0)) out.push({ set: `study${i + 1}.${s.key}`, now: st.read?.[s.key] ?? s.default ?? 'the planner\'s own', meaning: `study ${i + 1} (${st.role.split(' (')[0]}): ${s.meaning}` }); });
  }
  return out;
}

/**
 * A choice checked: {kind, sets: [[key, value]], script: file name or null, why}. Throws with the reason, said so
 * that its author can correct it. Checks the form only: the planner is what refuses a value it cannot use.
 * `codePlan`: the level hands over the code's plan and planner (the preflight); without them a choice is the author's own
 * script, with its lines and medium, and anything else is refused with OWN_SCRIPT_ONLY.
 */
export function readChoice(given, { codePlan = true } = {}) {
  if (!codePlan) return ownScriptOnly(given);
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error('choice.json: one JSON object, {"kind": "settings" | "plan" | "script", ...}');
  const why = typeof given.why === 'string' ? given.why.slice(0, 600) : null;
  const FILE = /^[A-Za-z0-9._-]+\.json$/;
  const tools = readTools(given, FILE);
  const got = readKind(given, why, FILE);
  if (got.kind !== 'settings' && (tools.forms || tools.perForm)) throw new Error(`choice.json: "forms" and "perForm" change what the code planner plans, so they go with kind "settings"; ${got.kind === 'script' ? 'a script is laid as written' : 'an edited plan is an edit of the plan made from the forms as given'}`);
  const { warnings, ...mine } = tools;
  return { ...got, ...(mine.lines || mine.forms || mine.perForm || mine.medium || mine.ink ? { tools: mine } : {}), warnings };
}

/** A session's choice, at every level: the author's own script with its lines and medium (and its erase passages, in the script). */
function ownScriptOnly(given) {
  const ONLY = `choice.json: ${OWN_SCRIPT_ONLY}. Here your choice is your own painting script: {"kind": "script", "script": "script.json", "why": "..."}, with "lines" and "medium" beside it if you wish`;
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error(`choice.json: one JSON object, {"kind": "script", "script": "script.json", "why": "..."}`);
  if (given.kind !== 'script' || given.forms != null || given.perForm != null || given.plan != null || (given.settings && Object.keys(given.settings).length)) throw new Error(ONLY);
  return readChoice(given);
}

/** The tools of a choice beside its kind: {lines, forms (file names or null), perForm ([[form name, [[study, planner key, value]]]] or null)}. */
function readTools(given, FILE) {
  for (const k of ['lines', 'forms']) if (given[k] != null && (typeof given[k] !== 'string' || !FILE.test(given[k]))) throw new Error(`choice.json: "${k}" names its file in this folder: {"${k}": "my-${k}.json"}`);
  if (given.medium != null && !DRAWING_MEDIA.includes(given.medium)) throw new Error(`choice.json: "medium" is the drawing's medium, one of ${DRAWING_MEDIA.join(', ')}`);
  if (given.ink != null && !PEN_INKS.includes(given.ink)) throw new Error(`choice.json: "ink" is the pen's ink, ${PEN_INKS.join(' or ')}`);
  let perForm = null; const warnings = [];
  if (given.perForm != null) {
    if (typeof given.perForm !== 'object' || Array.isArray(given.perForm)) throw new Error('choice.json: "perForm" is an object, a named form to its settings: {"cat face": {"study1.clusters": 24}}');
    perForm = Object.entries(given.perForm).map(([form, set]) => {
      if (!set || typeof set !== 'object' || Array.isArray(set) || !Object.keys(set).length) throw new Error(`choice.json: "perForm", ${form}: an object of setting: number`);
      return [form, Object.entries(set).map(([k, v]) => {
        const m = /^study([1-9])\.([a-z]+)$/.exec(k), s = m && FORM_SETTINGS.find(x => x.name === m[2]);
        if (!s || (s.studies === 'first' && m[1] !== '1') || (s.studies === 'later' && m[1] === '1')) throw new Error(`choice.json: "perForm", ${form}: "${k}" is not a setting of a form (study1.${FORM_SETTINGS.filter(x => x.studies !== 'later').map(x => x.name).join(', study1.')}; for a later study N: ${FORM_SETTINGS.filter(x => x.studies !== 'first').map(x => `studyN.${x.name}`).join(', ')})`);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`choice.json: "perForm", ${form}: "${k}" is a number (usually ${s.min} to ${s.max})`);
        if (!(v >= s.min && v <= s.max)) warnings.push(`"perForm", ${form}: "${k}" is ${v}, outside the usual ${s.min} to ${s.max}; it is given to the planner as you wrote it, and the planner says so if it cannot use it`);
        return [Number(m[1]), s.to, v];
      }).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))];
    }).sort((a, b) => a[0].localeCompare(b[0]));
    if (!perForm.length) perForm = null;
  }
  return { lines: given.lines ?? null, forms: given.forms ?? null, perForm, perFormGiven: perForm ? given.perForm : null, ...(given.medium != null ? { medium: given.medium } : {}), ...(given.ink != null ? { ink: given.ink } : {}), warnings };
}

function readKind(given, why, FILE) {
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
  const kind = choice.kind === 'script' ? 'own script' : choice.kind === 'plan' ? 'edited plan' : choice.sets.length ? 'settings' : null, t = choice.tools;
  const with_ = t ? [t.lines && 'its choice of lines', t.medium && `the drawing ${t.medium === 'none' ? 'left out' : `in ${t.medium}`}`, t.ink && `${t.ink} ink`, t.forms && 'its own forms', t.perForm && 'settings per form'].filter(Boolean) : [];
  return kind ? `${kind}${with_.length ? ` with ${with_.join(', ')}` : ''}` : with_.length ? `the code planner with ${with_.join(', ')}` : 'nothing changed';
}

/** A fingerprint of a choice (and the text of its script or edited plan): two looks at the same choice are the same plan. */
export function choiceKey(choice, fileText = '') {
  return crypto.createHash('sha256').update(JSON.stringify([choice.kind, choice.sets, choice.kind === 'settings' ? '' : fileText, ...(choice.tools ? [choice.tools] : [])])).digest('hex').slice(0, 16);
}

/** The run's --set list with a settings choice laid over it; the choice wins where both name a key. */
export function withChoice(sets, choice) {
  const mine = new Map(choice.sets);
  return [...sets.filter(([k]) => !mine.has(k)), ...choice.sets];
}
