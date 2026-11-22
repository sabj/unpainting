#!/usr/bin/env node
// The author's one step back before paint. After its script has compiled, the author is shown the compiled plan
// preview beside the source and the middle study (target guard gentle, as the looks of bench/v4v5), the numbers of
// each passage as compiled (brush, strokes, area, planned value, the named forms it lies on) and a short checklist,
// and answers once: a revised script, or "keep". Both versions and what changed are kept.
//
//   node tools/paint/step-back.mjs <run folder of a model author's plan> [--no-plan]
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

/** Kinds of named form that take rounds only, and the widest round allowed inside them (mm). */
const LIVING = new Set(['face', 'eye', 'animal', 'fur', 'figure', 'hair', 'clothing']), MOST_ROUND_MM = 17;

/** The numbers of each script passage as compiled: [{id, what, stage, brushMm, strokes, areaMm2, move, L, rgb, charges}]. */
export function passageNumbers(valuePlan, script) {
  const rows = new Map(script.passages.map(p => [p.id, { id: p.id, what: p.what ?? '', stage: p.stage ?? null, brushMm: 0, strokes: 0, areaMm2: 0, move: null, L: null, rgb: null, charges: 0 }]));
  for (const q of valuePlan.passes ?? []) {
    const id = String(q.script?.passage ?? ''), row = rows.get(id) ?? rows.get(id.replace(/-(c\d+|small)$/, '')); if (!row) continue;
    if (q.kind === 'charge') { row.charges++; continue; }
    row.brushMm = Math.max(row.brushMm, Number(q.widestBrushMm) || 0); row.strokes += q.strokes?.length ?? 0; row.areaMm2 += Number(q.areaMm2) || 0;
    if (rows.has(id)) { row.move = q.move ?? null; row.L = q.script?.planned?.[0] ?? null; row.rgb = q.script?.plannedRGB ?? null; }
  }
  return [...rows.values()];
}

/** The named forms a passage lies on, sampled at its regions' corners, edge middles and centres (or its strokes' points). */
export function formsTouched(p, mask, forms, sheetWidthMm) {
  const k = mask.width / sheetWidthMm, hit = new Map(), pts = [];
  for (const P of p.regions?.length ? p.regions : p.region?.length ? [p.region] : []) {
    P.forEach((a, i) => { const b = P[(i + 1) % P.length]; pts.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); });
    const c = [P.reduce((s, a) => s + a[0], 0) / P.length, P.reduce((s, a) => s + a[1], 0) / P.length]; pts.push(c, ...P.map(a => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]));
  }
  for (const s of Array.isArray(p.strokes) ? p.strokes : []) pts.push(...(s.points ?? []));
  for (const P of p.paths ?? []) pts.push(...P);
  for (const [x, y] of pts) {
    const X = Math.floor(x * k), Y = Math.floor(y * k); if (X < 0 || Y < 0 || X >= mask.width || Y >= mask.height) continue;
    const id = mask.data[Y * mask.width + X]; if (id) hit.set(id, (hit.get(id) ?? 0) + 1);
  }
  return [...hit].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ ...(forms.find(f => f.id === id) ?? { id, name: `form ${id}`, kind: 'other' }), share: +(n / pts.length).toFixed(2) }));
}

/** The table the author reads: one line a passage, with the faults a number can show said in capitals. */
export function numbersTable(rows, touched = {}) {
  let lightest = null;
  return rows.map(r => {
    const forms = touched[r.id] ?? [], living = forms.filter(f => LIVING.has(f.kind) && f.share >= 0.15), flags = [];
    if (r.brushMm > MOST_ROUND_MM + 0.01 && living.length) flags.push(`BRUSH OVER ${MOST_ROUND_MM} mm IN ${living.map(f => f.name).join(', ')}`);
    if (!r.strokes) flags.push('NOTHING LAID');
    if (r.L != null) { if (lightest != null && r.stage != null && r.stage <= 2 && r.L < 60) flags.push('A DARK IN THE FIRST STAGES'); lightest = Math.max(lightest ?? 0, r.L); }
    return `${r.id} | stage ${r.stage ?? '?'} | brush ${r.brushMm || '?'} mm | ${r.strokes} strokes | ${Math.round(r.areaMm2)} mm2 | ${r.move ?? '?'} | ${r.L != null ? `the sheet there after it: L* ${Math.round(r.L)}, rgb ${r.rgb?.join('/')}` : 'value not computed'}${r.charges ? ` | ${r.charges} charges` : ''} | on ${forms.slice(0, 3).map(f => `${f.name} (${f.kind})`).join(', ') || 'no named form'} | ${r.what.slice(0, 70)}${flags.length ? ` | !! ${flags.join('; ')}` : ''}`;
  });
}

/** The prompt of the step back: the first prompt, the author's script, the compiled numbers, the checklist. */
export function stepBackPrompt({ firstPrompt, script, table, files }) {
  return `${firstPrompt}

# The step back, before any paint

Your script compiled. Nothing is painted yet. This is your ONE look at the compiled plan: step back from it as a painter steps back from the easel, then answer once.

Pictures in the current directory, all on the same millimetre grid:
- \`${files.plan}\`: the PLAN PREVIEW compiled from your script (each passage's mix where its strokes fall, all layers down). It shows intended shapes and values, not wet edges or brush texture: a lost edge is drawn hard here.
- \`${files.source}\`: the subject.
- \`${files.study}\`: the middle study, your value and colour reference.

Each passage as compiled (id | stage | widest brush | strokes | area covered | how it is laid | the value of the sheet there once it is down | named forms it lies on | what; a fault a number shows is marked !!):

${table.join('\n')}

The checklist. Answer each line to yourself from the pictures and the numbers, form by form:
1. Is each form's first wash pale and connected (one wash over the whole form, lights reserved, no patchwork)?
2. Does any stroke or wash leave its form (fur over the background, hair across the face, a wash over a reserved light)?
3. Is any brush over ${MOST_ROUND_MM} mm inside a face, a figure or an animal?
4. Are the darks later than the lights, and few?
5. Is anything darker or more saturated than the middle study at the same place? (Compare the plan preview with the study, place by place.)
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
export async function stepBack(author, { packet, firstPrompt, script, table, sheetWidthMm, run }) {
  const files = { plan: packet.files.find(f => /plan/.test(f)), source: packet.files.find(f => /source/.test(f)), study: packet.files.find(f => /study/.test(f)) };
  const prompt = stepBackPrompt({ firstPrompt, script, table, files });
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

async function main() {
  const args = process.argv.slice(2), dir = args.find(a => !a.startsWith('--')), noPlan = args.includes('--no-plan');
  if (!dir) { console.error('usage: node tools/paint/step-back.mjs <run folder of a model author\'s plan> [--no-plan]'); process.exit(2); }
  const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')), W = run.sheet.widthMm;
  if (!run.results?.planPreview || run.failure) { console.error(`step back: ${dir} has no compiled plan`); process.exit(1); }
  const script = JSON.parse(fs.readFileSync(path.join(dir, 'author', 'script.json'), 'utf8')), plan = JSON.parse(fs.readFileSync(path.join(run.plate, 'value-plan.json'), 'utf8'));
  const out = path.join(dir, 'step-back'), inp = path.join(out, 'inputs'); fs.mkdirSync(inp, { recursive: true });
  const study = run.studies[Math.min(1, run.studies.length - 1)];
  for (const [f, img] of [['plan.png', run.results.planPreview], ['source.png', run.subject.sourceAbs], ['study-middle.png', study.abs]]) fs.writeFileSync(path.join(inp, f), await gridImage(img, W));
  let touched = {};
  if (run.masks?.mask) {
    const { data, info } = await sharp(run.masks.mask).greyscale().raw().toBuffer({ resolveWithObject: true }), mask = { data, width: info.width, height: info.height };
    touched = Object.fromEntries(script.passages.map(p => [p.id, formsTouched(p, mask, run.masks.forms, W)]));
  }
  const numbers = passageNumbers(plan, script), table = numbersTable(numbers, touched);
  const author = authorOf(run.author.key, JSON.parse(fs.readFileSync(path.join(HERE, 'authors.json'), 'utf8')).authors, JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'models.json'), 'utf8')).models);
  const firstPrompt = fs.readFileSync(path.join(dir, 'author', 'prompt.txt'), 'utf8').replace(/\nThe pictures are files in the current directory[^\n]*$/, '\n(That was the brief you wrote your script from; its pictures are replaced by the three named below.)');
  console.log(`step back: asking ${author.name} to look at its compiled plan (${numbers.length} passages; ${table.filter(l => l.includes('!!')).length} marked)`);
  const got = await stepBack(author, { packet: { dir: out, files: ['inputs/plan.png', 'inputs/source.png', 'inputs/study-middle.png'] }, firstPrompt, script, table, sheetWidthMm: W });
  fs.writeFileSync(path.join(out, 'script-first.json'), JSON.stringify(script, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'script-revised.json'), JSON.stringify(got.script, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'step-back.json'), JSON.stringify({ schema: 'unpaint-paint/step-back@1', subject: run.subject.id, author: run.author.key, model: run.author.id, kept: got.kept, error: got.error, why: got.why ?? null, review: got.review, changed: got.changed, diff: got.diff, seconds: got.seconds, tokens: got.tokens, costUSD: got.costUSD, numbersFirst: numbers, table }, null, 1) + '\n');
  console.log(`step back: ${got.error ?? (got.kept ? 'the author keeps its script' : `revised: ${got.diff.changed.length} passages changed, ${got.diff.added.length} added, ${got.diff.removed.length} removed`)}; ${got.seconds} s${got.tokens ? `, ${got.tokens} tokens` : ''}`);
  for (const c of got.changed ?? []) console.log(`  - ${c}`);
  if (got.kept || noPlan) return;
  const done = spawnSync('npm', ['run', 'paint', '--', run.subject.id, 'plan', '--author', `script:${path.join(out, 'script-revised.json')}`, '--out', path.join(out, 'revised'), '--no-open'], { cwd: ROOT, stdio: 'inherit' });
  if (done.status !== 0) { console.error('step back: the revised script did not plan; the first script stands'); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
