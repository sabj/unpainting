// A model as the author of the wash plan. The model gets the run's locked inputs (source, opening drawing, studies,
// named forms, the kit) with the brief, in a folder of its own, and writes a painting script (docs/painting-script.md);
// the painter executes the script through --washplan script:FILE, the same engine that lays the code planner's plan.
// The model is launched the way the benchmark launches one (bench/scripts/runners.mjs, bench/models.json).
// An author "script:FILE.json" replays a kept script without a model.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { BOX } from '../../src/crop/box.mjs';
import { checkScript, upgradeScript } from '../../src/paint/methods/script-washes.mjs';
import { turnCommand, usage, KEYS } from '../../bench/scripts/runners.mjs';

/** Minutes a model may take to write its script. */
const AUTHOR_MINUTES = 30;
/** Brushes of the kit that lay paint (the pen and the dry brush are not wash brushes). */
const NOT_WASH = new Set(['pen', 'dry']);

/** The author an --author word names: auto, a kept script, or a model of bench/models.json. */
export function authorOf(word, models) {
  if (word === 'auto') return { key: 'auto', name: 'auto', id: null, runner: null };
  if (word.startsWith('script:')) { const file = path.resolve(word.slice(7)); return { key: word, name: `script ${path.basename(file, '.json')}`, id: null, runner: 'script', file }; }
  const m = models.find(x => x.key === word);
  if (!m) throw new Error(`--author ${word}: auto, script:FILE.json, or one of ${models.map(x => x.key).join(', ')} (bench/models.json)`);
  return { ...m };
}

/** The brief with this run's sheet, inputs, kit and paints written in. */
export function fillBrief(template, { sheet, inputs, brushes, paints }) {
  return template.replaceAll('SHEET_W', String(sheet.widthMm)).replaceAll('SHEET_H', String(sheet.heightMm))
    .replace('INPUT_LIST', inputs.map(i => `- \`inputs/${i.file}\`: ${i.what}`).join('\n'))
    .replace('KIT_LIST', Object.entries(brushes).filter(([k]) => !NOT_WASH.has(k)).map(([k, b]) => `- ${k}: ${b.width_mm}`).join('\n'))
    .replace('PAINT_LIST', paints.join(', '));
}

/**
 * A script read and checked for this run: the format, the sheet it was written for, its palette against the box.
 * Returns {script, paints}. A script that names study shapes by number is refused: this base has no numbered list.
 */
export function readScript(file, { sheetWidthMm, keys = BOX.map(p => p.key) }) {
  if (!fs.existsSync(file)) throw new Error(`author: no script at ${file}`);
  let script;
  try { script = upgradeScript(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { throw new Error(`author: ${file} is not JSON (${e.message})`); }
  checkScript(script, { keys, sheetWidthMm });
  const named = (script.passages ?? []).filter(p => p.shapes || p.reserve || (p.strokes ?? []).some?.(s => s?.along != null));
  if (named.length) throw new Error(`author: passages ${named.map(p => p.id).join(', ')} name study shapes by number; resolve the script first (tools/painter/script-resolve.mjs with its shape list)`);
  if (!script.palette?.length) throw new Error('author: the script has no palette');
  return { script, paints: script.palette };
}

/** The author's folder: inputs/ (PNG copies of the locked inputs), BRIEF.md, FORMAT.md. Returns {ws, brief, images}. */
export async function prepareWorkspace({ dir, root, run, pics, briefFile }) {
  const ws = path.join(dir, 'ws'), inp = path.join(ws, 'inputs'); fs.mkdirSync(inp, { recursive: true });
  const inputs = [], put = async (file, what, image) => { await sharp(image).png().toFile(path.join(inp, file)); inputs.push({ file, what }); };
  await put('source.png', 'the picture to paint', run.subject.sourceAbs);
  await put('drawing.png', `the opening drawing already on the sheet (${run.drawing.medium})`, pics.drawing);
  for (const [i, s] of run.studies.entries()) await put(`study-${i + 1}.png`, `a block-in study, ${s.role}: the subject in flat shapes, lights left as paper`, s.abs);
  if (pics.forms) {
    await put('forms.png', `the named forms, one flat colour each: ${run.masks.forms.map(f => `${f.name} (${f.kind})`).join(', ')}`, pics.forms);
  }
  const brushes = JSON.parse(fs.readFileSync(path.join(root, 'src/paint/brushes.json'), 'utf8')).brushes;
  const brief = fillBrief(fs.readFileSync(briefFile, 'utf8'), { sheet: run.sheet, inputs, brushes, paints: BOX.map(p => p.key) });
  fs.writeFileSync(path.join(ws, 'BRIEF.md'), brief);
  fs.copyFileSync(path.join(root, 'docs/painting-script.md'), path.join(ws, 'FORMAT.md'));
  return { ws, brief, briefPath: path.join(ws, 'BRIEF.md'), images: inputs.map(i => path.join(inp, i.file)) };
}

/**
 * Launch the model once in its folder and wait for script.json. Returns {file, tokens, seconds, exit}.
 * The model runs with its permission prompts off, as in the benchmark: run real trials in a disposable machine.
 */
export async function authorWithModel(model, { dir, work, minutes = AUTHOR_MINUTES, launch = launchTurn }) {
  const raw = path.join(dir, 'raw'); fs.mkdirSync(raw, { recursive: true });
  const logFile = path.join(raw, 'events-1.jsonl'), out = path.join(work.ws, 'script.json');
  const text = `${work.brief}\n\nYou are in a folder holding BRIEF.md (this text), FORMAT.md and inputs/. Write script.json here.`;
  const turn = turnCommand(model, { ws: work.ws, raw, text, images: work.images, sessionId: crypto.randomUUID(), turn: 1, briefFile: work.briefPath, logFile, minutes, done: 'any' });
  const t0 = Date.now(), exit = await launch(turn, { cwd: work.ws, logFile, minutes });
  const seconds = Math.round((Date.now() - t0) / 1000), { tokens } = usage(model.runner, logFile);
  if (!fs.existsSync(out)) throw new Error(`author ${model.key}: the session ended (exit ${exit}, ${seconds} s) without writing script.json; its log is ${logFile}`);
  return { file: out, tokens, seconds, exit };
}

/** What a runner needs before it can be launched, said plainly. */
export const runnerNeeds = runner => { const k = KEYS[runner]; return k ? `\`${k.cli}\` on PATH (${k.env.length ? `${k.env.join(', ')} ${k.note}` : k.note})` : 'an unknown runner'; };

function launchTurn(turn, { cwd, logFile, minutes }) {
  return new Promise((resolve, reject) => {
    const child = spawn(turn.cmd, turn.args, { cwd, env: { ...process.env, ...(turn.env ?? {}) }, stdio: [turn.stdinFile ? fs.openSync(turn.stdinFile, 'r') : 'ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile + '.err', 'a')] });
    const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60 * 1000);
    child.on('error', e => { clearTimeout(timer); reject(new Error(`author: could not start ${turn.cmd} (${e.message})`)); });
    child.on('close', code => { clearTimeout(timer); resolve(code); });
  });
}
