#!/usr/bin/env node
// The author's one step back before paint. After its script has compiled, the author is shown the compiled plan
// preview beside the source and the middle study (target guard gentle, as the looks of bench/v4v5), the numbers of
// each passage as compiled (brush, strokes, area, planned value, the named forms its footprint covers), each named
// form's mean lightness and darks in the study and in the plan (marked both ways: too dark, too pale) and a checklist,
// and answers once: a revised script, or "keep". Both versions and what changed are kept.
//
//   node tools/paint/step-back.mjs <run folder of a model author's plan> [--out <folder>] [--no-plan]
// (This is the one-reply route, --work reply. A working session has its own counted looks: session.mjs.)
//
// writes <run>/step-back/: inputs/, prompt.txt, R.out.txt, script-first.json, script-revised.json, step-back.json,
// and (unless --no-plan or the author kept its script) revised/, the revised script planned by `npm run paint`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { gridImage, askAuthor, jsonWith, authorOf } from './author.mjs';
import { footprint } from '../../src/paint/methods/script-washes.mjs';
import { labOf } from '../../src/eval/colour.mjs';

/** Kinds of named form that take rounds only, and the widest round allowed inside them (mm). */
const LIVING = new Set(['face', 'eye', 'animal', 'fur', 'figure', 'hair', 'clothing']), MOST_ROUND_MM = 17;
/** A passage is "in" a form when this share of its footprint lies on it; a form is judged when it has this many cells. */
const IN_FORM_SHARE = 0.1, FORM_LEAST_CELLS = 50;
/** A form's mean lightness may differ from the study's by this much (L*), and its darks by this much, before it is marked. */
const MEAN_L_OFF = 6, DARK_L_OFF = 10;

const baseId = id => String(id ?? '').replace(/-(c\d+|small)$/, '');

/** The numbers of each script passage as compiled: [{id, what, stage, brushMm, strokes, areaMm2, move, L, rgb, charges}]. */
export function passageNumbers(valuePlan, script) {
  const rows = new Map(script.passages.map(p => [p.id, { id: p.id, what: p.what ?? '', stage: p.stage ?? null, brushMm: 0, strokes: 0, areaMm2: 0, move: null, L: null, rgb: null, charges: 0 }]));
  for (const q of valuePlan.passes ?? []) {
    const id = String(q.script?.passage ?? ''), row = rows.get(id) ?? rows.get(baseId(id)); if (!row) continue;
    if (q.kind === 'charge') { row.charges++; continue; }
    row.brushMm = Math.max(row.brushMm, Number(q.widestBrushMm) || 0); row.strokes += q.strokes?.length ?? 0; row.areaMm2 += Number(q.areaMm2) || 0;
    if (rows.has(id)) { row.move = q.move ?? null; row.L = q.script?.planned?.[0] ?? null; row.rgb = q.script?.plannedRGB ?? null; }
  }
  return [...rows.values()];
}

/**
 * The named forms each passage's compiled strokes really cover: the footprint of its strokes (each point's disc, joined
 * along the stroke) laid on the id map. {passage id: [{id, name, kind, share}]}, share of the footprint, largest first.
 */
export function formsCovered(valuePlan, mask, forms, sheetWidthMm) {
  const by = new Map();
  for (const q of valuePlan.passes ?? []) if (q.kind !== 'charge' && q.strokes?.length) { const id = baseId(q.script?.passage); by.set(id, [...(by.get(id) ?? []), ...q.strokes]); }
  const out = {};
  for (const [id, strokes] of by) {
    const m = footprint(strokes, mask.width, mask.height, sheetWidthMm / mask.width), hit = new Map(); let total = 0;
    for (let i = 0; i < m.length; i++) if (m[i]) { total++; const f = mask.data[i]; if (f) hit.set(f, (hit.get(f) ?? 0) + 1); }
    out[id] = [...hit].sort((x, y) => y[1] - x[1]).map(([f, n]) => ({ ...(forms.find(x => x.id === f) ?? { id: f, name: `form ${f}`, kind: 'other' }), share: +(n / total).toFixed(2) })).filter(f => f.share >= 0.01);
  }
  return out;
}

/** Each form's mean lightness and its darks (the L* its darkest twentieth lies under) in a picture on the id map's grid (RGB). */
export function formValues(rgb, mask, forms) {
  const L = new Map();
  for (let i = 0; i < mask.data.length; i++) { const f = mask.data[i]; if (!f) continue; if (!L.has(f)) L.set(f, []); L.get(f).push(labOf(rgb, i, [255, 255, 255])[0]); }
  return forms.filter(f => (L.get(f.id)?.length ?? 0) >= FORM_LEAST_CELLS).map(f => { const v = L.get(f.id).sort((x, y) => x - y); return { id: f.id, name: f.name, kind: f.kind, cells: v.length, meanL: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1), darkL: +v[Math.floor(v.length * 0.05)].toFixed(1) }; });
}

/** The table of forms: the study's and the plan's mean and darks for each, marked both ways (too dark, too pale). */
export function formsTable(study, plan) {
  return study.map(s => {
    const p = plan.find(x => x.id === s.id); if (!p) return null;
    const dm = Math.round(p.meanL - s.meanL), dd = Math.round(p.darkL - s.darkL), flags = [];
    if (dm >= MEAN_L_OFF) flags.push(`PALER THAN THE STUDY BY ${dm}`); else if (dm <= -MEAN_L_OFF) flags.push(`DARKER THAN THE STUDY BY ${-dm}`);
    if (dd >= DARK_L_OFF) flags.push(`ITS DARKS DO NOT REACH THE STUDY'S (short by ${dd})`); else if (dd <= -DARK_L_OFF) flags.push(`ITS DARKS PASS THE STUDY'S BY ${-dd}`);
    return `${s.name} (${s.kind}) | study: mean L* ${Math.round(s.meanL)}, darks L* ${Math.round(s.darkL)} | your plan, all layers down: mean L* ${Math.round(p.meanL)}, darks L* ${Math.round(p.darkL)}${flags.length ? ` | !! ${flags.join('; ')}` : ' | close'}`;
  }).filter(Boolean);
}

/** The table the author reads: one line a passage, with the faults a number can show said in capitals. */
export function numbersTable(rows, covered = {}) {
  return rows.map(r => {
    const forms = covered[r.id] ?? [], living = forms.filter(f => LIVING.has(f.kind) && f.share >= IN_FORM_SHARE), flags = [];
    if (r.brushMm > MOST_ROUND_MM + 0.01 && living.length) flags.push(`BRUSH OVER ${MOST_ROUND_MM} mm IN ${living.map(f => `${f.name} (${Math.round(100 * f.share)}% of its footprint)`).join(', ')}`);
    if (!r.strokes) flags.push('NOTHING LAID');
    return `${r.id} | stage ${r.stage ?? '?'} | brush ${r.brushMm || '?'} mm | ${r.strokes} strokes | ${Math.round(r.areaMm2)} mm2 | ${r.move ?? '?'} | ${r.L != null ? `the sheet there after it: L* ${Math.round(r.L)}, rgb ${r.rgb?.join('/')}` : 'value not computed'}${r.charges ? ` | ${r.charges} charges` : ''} | covers ${forms.slice(0, 4).map(f => `${f.name} ${Math.round(100 * f.share)}%`).join(', ') || 'no named form'} | ${r.what.slice(0, 70)}${flags.length ? ` | !! ${flags.join('; ')}` : ''}`;
  });
}

/** The prompt of the step back: the first prompt, the author's script, the compiled numbers, the checklist. */
export function stepBackPrompt({ firstPrompt, script, table, formTable = [], files }) {
  return `${firstPrompt}

# The step back, before any paint

Your script compiled. Nothing is painted yet. This is your ONE look at the compiled plan: step back from it as a painter steps back from the easel, then answer once.

Pictures in the current directory, all on the same millimetre grid:
- \`${files.plan}\`: the PLAN PREVIEW compiled from your script (each passage's mix where its strokes fall, all layers down). It shows intended shapes and values, not wet edges or brush texture: a lost edge is drawn hard here.
- \`${files.source}\`: the subject.
- \`${files.study}\`: the middle study, your value and colour reference.

Each passage as compiled (id | stage | widest brush | strokes | area covered | how it is laid | the value of the sheet there once it is down | the named forms its strokes really cover, as shares of its footprint | what; a fault a number shows is marked !!):

${table.join('\n')}
${formTable.length ? `
Each named form, measured: the middle study's mean lightness and its darks (the L* its darkest twentieth lies under), then the same for your plan with every layer down. The finished form should MATCH the study, both ways: a form paler than the study is as wrong as one darker.

${formTable.join('\n')}
` : ''}
The checklist. Answer each line to yourself from the pictures and the numbers, form by form:
1. Is each form's first wash pale and connected (one wash over the whole form, lights reserved, no patchwork)? A dark form's base is a mid-tone; that is right.
2. Does any stroke or wash leave its form (fur over the background, hair across the face, a wash over a reserved light)? Read the footprint shares.
3. Is any brush over ${MOST_ROUND_MM} mm inside a face, a figure or an animal?
4. Are the darks later than the lights? And do the dark forms (dark hair, a dark dress, black fur, the background where the study is dark) REACH the study's darks by the end, built in their drops and glazes?
5. For each named form: is it darker or more saturated than the middle study, OR paler and weaker than it? Use the measured table. Bring each marked form to the study's mean and darks: strengthen the swatches of its drops and glazes where it is too pale, weaken them where it is too dark. Do not make everything paler.
6. More than about four layers at any spot?

Judge each stage by its job, and fix the EARLIEST stage at fault before adding any detail; keep what works.

Answer with ONE JSON object and nothing else. Either the WHOLE revised script, in the same format, with two more keys at the top, "review": [one short sentence for each of the six checklist lines, saying what you saw], and "changed": [one short sentence for each change you made, naming the passage ids]; or, when the plan needs no change, {"keep": true, "review": [the six sentences], "why": "<one sentence>"}.

Your script as compiled:

${JSON.stringify(script)}
`;
}

/** What changed between two scripts: passages added, removed and changed (which fields), and brushes. */
export function scriptDiff(a, b) {
  const A = new Map(a.passages.map(p => [p.id, p])), B = new Map(b.passages.map(p => [p.id, p])), same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const changed = [...B].filter(([id, p]) => A.has(id) && !same(p, A.get(id))).map(([id, p]) => ({ id, fields: [...new Set([...Object.keys(p), ...Object.keys(A.get(id))])].filter(k => !same(p[k], A.get(id)[k])) }));
  return { added: [...B.keys()].filter(id => !A.has(id)), removed: [...A.keys()].filter(id => !B.has(id)), changed, brushes: same(a.brushes, b.brushes) ? null : { first: a.brushes, revised: b.brushes }, lights: same(a.lights ?? [], b.lights ?? []) ? null : { first: (a.lights ?? []).length, revised: (b.lights ?? []).length }, order: same([...A.keys()].filter(id => B.has(id)), [...B.keys()].filter(id => A.has(id))) ? 'same' : 'reordered' };
}

/**
 * The one revision turn. `packet` {dir, files} holds the three pictures; returns {kept, script, review, changed, diff,
 * seconds, tokens, costUSD, error}. A refused or missing answer keeps the first script and says why: never a throw.
 */
export async function stepBack(author, { packet, firstPrompt, script, table, formTable = [], sheetWidthMm, run }) {
  const files = { plan: packet.files.find(f => /plan/.test(f)), source: packet.files.find(f => /source/.test(f)), study: packet.files.find(f => /study/.test(f)) };
  const prompt = stepBackPrompt({ firstPrompt, script, table, formTable, files });
  const leak = [os.homedir(), os.userInfo().username].find(w => w && prompt.includes(w));
  if (leak) throw new Error('step back: the prompt would carry a path or name of this machine; it is not sent');
  fs.writeFileSync(path.join(packet.dir, 'prompt.txt'), prompt);
  const got = await askAuthor(author, { ...packet, prompt }, { stem: 'R', prompt, sheetWidthMm, ...(run ? { run } : {}) });
  const use = { seconds: got.seconds, tokens: got.tokens, costUSD: got.costUSD };
  if (got.ok) {
    const { review = null, changed = null, ...revised } = got.script, diff = scriptDiff(script, revised);
    const none = !diff.added.length && !diff.removed.length && !diff.changed.length && !diff.brushes && !diff.lights && diff.order === 'same';
    return { kept: none, script: revised, review, changed, diff, error: null, ...use };
  }
  const keep = jsonWith(got.raw ?? '', 'keep');
  if (keep?.keep === true) return { kept: true, script, review: keep.review ?? null, changed: [], why: keep.why ?? null, diff: null, error: null, ...use };
  return { kept: true, script, review: null, changed: [], diff: null, error: `the revision was not usable and the first script stands: ${got.error}`, ...use };
}

/** A picture as RGB on the id map's grid; a plan preview taller than the sheet keeps its top (its caption is cut off). */
export async function onGrid(file, mask) {
  const m = await sharp(file).metadata(), rows = Math.min(m.height, Math.round(m.width * mask.height / mask.width));
  return sharp(file).extract({ left: 0, top: 0, width: m.width, height: rows }).flatten({ background: '#ffffff' }).removeAlpha().resize(mask.width, mask.height, { fit: 'fill' }).raw().toBuffer();
}

/**
 * The step back of one run: the look is prepared in `out` from the run's record, its first script and the folder its
 * plan compiled into, the author is asked once, and both scripts and what changed are written there. `run` is the
 * record of `npm run paint` (sheet, subject, studies, masks); `launch` replaces the model's command in tests.
 * Returns stepBack()'s result with {numbers, table, formTable, revisedFile}.
 */
export async function lookAtPlan({ run, author, script, plate, planPreview, firstPromptFile, out, launch }) {
  const W = run.sheet.widthMm, inp = path.join(out, 'inputs'); fs.mkdirSync(inp, { recursive: true });
  const plan = JSON.parse(fs.readFileSync(path.join(plate, 'value-plan.json'), 'utf8')), study = run.studies[Math.min(1, run.studies.length - 1)];
  for (const [f, img] of [['plan.png', planPreview], ['source.png', run.subject.sourceAbs], ['study-middle.png', study.abs]]) fs.writeFileSync(path.join(inp, f), await gridImage(img, W));
  let covered = {}, formTable = [], formValuesOf = null;
  if (run.masks?.mask) {
    const { data, info } = await sharp(run.masks.mask).greyscale().raw().toBuffer({ resolveWithObject: true }), mask = { data, width: info.width, height: info.height };
    covered = formsCovered(plan, mask, run.masks.forms, W);
    formValuesOf = { study: formValues(await onGrid(study.abs, mask), mask, run.masks.forms), plan: formValues(await onGrid(planPreview, mask), mask, run.masks.forms) };
    formTable = formsTable(formValuesOf.study, formValuesOf.plan);
  }
  const numbers = passageNumbers(plan, script), table = numbersTable(numbers, covered);
  const firstPrompt = fs.readFileSync(firstPromptFile, 'utf8').replace(/\nThe pictures are files in the current directory[^\n]*$/, '\n(That was the brief you wrote your script from; its pictures are replaced by the three named below.)');
  const got = await stepBack(author, { packet: { dir: out, files: ['inputs/plan.png', 'inputs/source.png', 'inputs/study-middle.png'] }, firstPrompt, script, table, formTable, sheetWidthMm: W, run: launch });
  const revisedFile = path.join(out, 'script-revised.json');
  fs.writeFileSync(path.join(out, 'script-first.json'), JSON.stringify(script, null, 1) + '\n');
  fs.writeFileSync(revisedFile, JSON.stringify(got.script, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'step-back.json'), JSON.stringify({ schema: 'unpaint-paint/step-back@2', subject: run.subject.id, author: author.key, model: author.id, kept: got.kept, error: got.error, why: got.why ?? null, review: got.review, changed: got.changed, diff: got.diff, seconds: got.seconds, tokens: got.tokens, costUSD: got.costUSD, numbersFirst: numbers, table, formsFirst: formValuesOf, formTable }, null, 1) + '\n');
  return { ...got, numbers, table, formTable, revisedFile };
}

async function main() {
  const args = process.argv.slice(2), at = args.indexOf('--out'), outArg = at < 0 ? null : args.splice(at, 2)[1], dir = args.find(a => !a.startsWith('--')), noPlan = args.includes('--no-plan');
  if (!dir) { console.error('usage: node tools/paint/step-back.mjs <run folder of a model author\'s plan> [--out <folder>] [--no-plan]'); process.exit(2); }
  const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  if (!run.results?.planPreview || run.failure) { console.error(`step back: ${dir} has no compiled plan`); process.exit(1); }
  const script = JSON.parse(fs.readFileSync(path.join(dir, 'author', 'script.json'), 'utf8')), out = path.resolve(outArg ?? path.join(dir, 'step-back'));
  const author = authorOf(run.author.key, JSON.parse(fs.readFileSync(path.join(HERE, 'authors.json'), 'utf8')).authors, JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'models.json'), 'utf8')).models);
  console.log(`step back: asking ${author.name} to look at its compiled plan`);
  const got = await lookAtPlan({ run, author, script, plate: run.plate, planPreview: run.results.planPreview, firstPromptFile: path.join(dir, 'author', 'prompt.txt'), out });
  console.log(`step back: ${got.table.filter(l => l.includes('!!')).length} of ${got.table.length} passages and ${got.formTable.filter(l => l.includes('!!')).length} of ${got.formTable.length} forms were marked`);
  for (const l of got.formTable) console.log(`  ${l}`);
  console.log(`step back: ${got.error ?? (got.kept ? 'the author keeps its script' : `revised: ${got.diff.changed.length} passages changed, ${got.diff.added.length} added, ${got.diff.removed.length} removed`)}; ${got.seconds} s${got.tokens ? `, ${got.tokens} tokens` : ''}`);
  for (const c of got.changed ?? []) console.log(`  - ${c}`);
  if (got.kept || noPlan) return;
  const done = spawnSync('npm', ['run', 'paint', '--', run.subject.id, 'plan', '--author', `script:${got.revisedFile}`, '--out', path.join(out, 'revised'), '--no-open'], { cwd: ROOT, stdio: 'inherit' });
  if (done.status !== 0) { console.error('step back: the revised script did not plan; the first script stands'); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
