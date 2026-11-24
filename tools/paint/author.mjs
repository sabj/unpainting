// A model as the author of the wash plan. The model gets the run's locked inputs (the source, the opening drawing,
// the registered studies and the named forms, each with a millimetre grid, and the kit) under the brief
// AUTHOR-BRIEF.md, and answers with a painting script (docs/painting-script.md). The script is checked here and the
// painter executes it through --washplan script:FILE, the same engine that lays the code planner's plan.
//
// This is the one-reply route (--work reply). The default is a working session that starts from the code planner's
// plan (session.mjs); it uses this module's packet, checks and labels.
// A model is called once, read-only, for one reply: it may open the pictures of its folder and nothing else is asked
// of it. Its folder is a temporary one outside the repository, holding copies of the pictures only, and the prompt
// names files by their path inside that folder. An author "script:FILE.json" replays a kept script without a model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { BOX } from '../../src/crop/box.mjs';
import { checkScript, upgradeScript } from '../../src/paint/methods/script-washes.mjs';

/** Minutes a model may take over one reply. */
const AUTHOR_MINUTES = 40;
/** Brushes of the kit that lay no wash, and the paint the brief does not offer (black is mixed, not squeezed). */
const NOT_WASH = new Set(['pen', 'dry']), NOT_OFFERED = new Set(['lampblack']);
/** The most paints a script may name. The painter's sheet holds 16 pigments (src/media/gpu/stepfull.mjs: 'GpuSheet: at most 16
 * pigments'); the drawing's ink takes one and its graphite another, so 14 are left for paint. A plan compiles with more
 * (it is made on the CPU); the painting would then stop on the GPU, so the check refuses it before anything is made. */
const SCRIPT_PAINTS_MOST = 14;
/** The runner names of bench/models.json and the command each is called with here. */
const CLI_OF_RUNNER = { claude: 'claude', codex: 'codex', agy: 'agy', muse: 'muse' };
/** What each command needs before it can be called, by name only. */
const NEEDS = { claude: 'the `claude` command, logged in (or ANTHROPIC_API_KEY)', codex: 'the `codex` command, logged in (or OPENAI_API_KEY)', agy: 'the `agy` command, logged in', muse: 'the `muse` command, logged in' };

/** The author an --author word names: auto, a kept script, a kept edit of the code planner's plan, or a model (authors.json, else bench/models.json). */
export function authorOf(word, authors, benchModels = []) {
  if (word === 'auto') return { key: 'auto', name: 'auto', id: null, cli: null, effort: null };
  if (word.startsWith('choice:')) return { key: word, name: 'A kept choice', id: null, cli: 'choice', effort: null, dir: path.resolve(word.slice(7)) };
  if (word.startsWith('edit:')) return { key: word, name: 'A kept edit of the code planner\'s plan', id: null, cli: 'edit', effort: null, file: path.resolve(word.slice(5)) };
  if (word.startsWith('script:')) { const file = path.resolve(word.slice(7)); return { key: word, ...keptScriptAuthor(file), id: null, cli: 'script', effort: null, file }; }
  const own = authors.find(x => x.key === word); if (own) return { ...own };
  const m = benchModels.find(x => x.key === word);
  if (m && CLI_OF_RUNNER[m.runner]) return { key: m.key, name: m.name, id: m.id, effort: m.effort === 'n/a' ? null : m.effort, cli: CLI_OF_RUNNER[m.runner] };
  if (m) throw new Error(`--author ${word}: its runner "${m.runner}" cannot be called as an author here (claude, codex, agy and muse can)`);
  throw new Error(`--author ${word}: auto, script:FILE.json, edit:FILE.json, or one of ${[...authors.map(x => x.key), ...benchModels.filter(x => CLI_OF_RUNNER[x.runner] && !authors.some(a => a.key === x.key)).map(x => x.key)].join(', ')}`);
}
export const needsOf = cli => NEEDS[cli] ?? 'an unknown command';
/** The briefs by their file, as a sheet names them. */
const BRIEFS = { 'AUTHOR-BRIEF.md': 'brief v2', 'AUTHOR-BRIEF-v1.md': 'brief v1' };
export const briefName = file => (file ? BRIEFS[path.basename(file)] ?? 'its own brief' : null);
/**
 * Who wrote a kept script, in plain words, never the file's name: the model of the run the script lies in (run.json
 * beside its folder), else the script's own "author", and whether it is the script as revised after a step back.
 * {name, wrote}.
 */
export function keptScriptAuthor(file, read = f => JSON.parse(fs.readFileSync(f, 'utf8'))) {
  let who = null, brief = null;
  try { const run = read(path.join(path.dirname(path.dirname(file)), 'run.json')); if (run.author?.name && run.author.key !== 'auto') { who = run.author.name; brief = run.author.brief ?? null; } } catch { /* not in a run folder */ }
  if (!who) { try { const a = read(file).author; if (typeof a === 'string' && a.trim()) who = a.trim().slice(0, 40); } catch { /* the script is checked when it is read */ } }
  const revised = /revised/.test(path.basename(file));
  return { name: who ?? 'A kept script (author not recorded)', wrote: `its own script${revised ? ', revised after one step back' : ''}${brief ? `, ${brief}` : ''}, written earlier` };
}
/**
 * The heading of an author's column on a sheet, in plain words: "Code planner alone", "<Model>, tuning the code
 * planner" (a working session that handed over settings, or has not ended yet), "<Model>, its own script".
 */
export function authorLabel(a) {
  if (a.key === 'auto') return 'Code planner alone';
  if (a.cli === 'script') return `${a.name}, ${a.wrote ?? 'its own script, written earlier'}`;
  if (a.cli === 'choice') return `A kept choice${a.chose ? `: ${a.chose}` : ''}`;
  if (a.cli === 'edit') return a.planEdit?.unchanged ? 'The code planner\'s plan, written out and read back unchanged' : a.name;
  if (a.work === 'session') return a.session?.submitted?.kind === 'script' ? `${a.name}, its own script` : a.session?.submitted?.kind === 'plan' ? `${a.name}, editing the code planner's plan` : `${a.name}, tuning the code planner`;
  return `${a.name}, its own script${a.brief ? `, ${a.brief}` : ''}`;
}

/** The brief with this run's sheet, inputs, kit, paints and named forms written in. */
export function fillBrief(template, { sheet, inputs, brushes, paints, forms, medium, skills = '' }) {
  const ink = /^ink/.test(medium);
  return template.replaceAll('SHEET_W', String(sheet.widthMm)).replaceAll('SHEET_H', String(sheet.heightMm))
    .replace('INPUT_LIST', inputs.map(i => `- \`${i.file}\`: ${i.what}`).join('\n'))
    .replace('DRAWING_NOTE', ink
      ? 'The drawing is waterproof ink (with light pencil where the picture has no pen line) and is already on the sheet before you start. Your washes go over it; do not script it. It carries the form: your darks follow its forms and your washes run over its lines freely.'
      : 'The drawing is a light pencil lay-in and is already on the sheet before you start. Your washes go over it; do not script it. It only places the forms: the paint must carry the form, the values and the edges.')
    .replaceAll('KIT_LIST', Object.entries(brushes).filter(([k]) => !NOT_WASH.has(k)).map(([k, b]) => `${k}: ${b.width_mm}`).join(', '))
    .replaceAll('PAINTS_MOST', String(SCRIPT_PAINTS_MOST))
    .replace('PAINT_LIST', paints.filter(p => !NOT_OFFERED.has(p.key)).map(p => `\`${p.key}\` (${p.name})`).join(', '))
    .replace('FORMS_LIST', forms?.length ? forms.map(f => `- ${f.id}. ${f.name} (${f.kind})${f.boxMm ? `: box x ${f.boxMm[0]} to ${f.boxMm[2]}, y ${f.boxMm[1]} to ${f.boxMm[3]} mm` : ''}`).join('\n') : 'No named forms were made for this subject.')
    .replace('SKILLS_TEXT', () => skills);
}

/** The project skills a plan follows, as text for the brief: each file without its front matter, under its path. */
const SKILL_FILES = ['painting-planner/SKILL.md', 'watercolor-technique/SKILL.md', 'watercolor-technique/references/fur-and-faces.md', 'watercolor-technique/references/trees-and-skies.md', 'watercolor-technique/references/dry-brush-and-detail.md'];
export function skillsText(root) {
  return SKILL_FILES.map(f => `### Skill file ${f}\n\n${fs.readFileSync(path.join(root, '.agents/skills', f), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\]\([^)]*\)/g, ']').trim()}`).join('\n\n');
}

/** The first JSON object in a reply that has the key `key` (a model may wrap its answer in words or a code fence). */
export function jsonWith(text, key) {
  const end = text.lastIndexOf('}'); let tries = 0;
  for (let i = text.indexOf('{'); i >= 0 && i < end && tries < 300; i = text.indexOf('{', i + 1), tries++) {
    try { const v = JSON.parse(text.slice(i, end + 1)); if (v && typeof v === 'object' && key in v) return v; } catch { /* not this brace */ }
  }
  return null;
}

/**
 * A script checked for this run: the format, the sheet it was written for, its palette against the box, no numbered
 * study shapes. Returns {script, paints}; throws with what is wrong, said so that its author can correct it.
 */
export function checkAuthored(given, { sheetWidthMm, keys = BOX.map(p => p.key) }) {
  const script = upgradeScript(given);
  if (!Array.isArray(script?.palette) || !script.palette.length) throw new Error('painting script: no palette');
  const unknown = script.palette.filter(k => !keys.includes(k));
  if (unknown.length) throw new Error(`painting script: palette names ${unknown.join(', ')}, not in the box (${keys.join(', ')})`);
  if (script.palette.length > SCRIPT_PAINTS_MOST) throw new Error(`painting script: palette names ${script.palette.length} paints; the painter's sheet holds 16 pigments and the drawing's ink and graphite take two, so a script may name ${SCRIPT_PAINTS_MOST} at most: leave out the ${script.palette.length - SCRIPT_PAINTS_MOST} you need least`);
  checkScript(script, { keys: script.palette, sheetWidthMm });
  const named = (script.passages ?? []).filter(p => p.shapes || p.reserve || (Array.isArray(p.strokes) && p.strokes.some(s => s?.along != null)));
  if (named.length) throw new Error(`painting script: passages ${named.map(p => p.id).join(', ')} name study shapes by number (shapes, reserve or along); this run has no numbered shapes: write regions and points in millimetres`);
  if ((script.lights ?? []).some(l => l?.shapes)) throw new Error('painting script: a light names study shapes by number; write its region in millimetres');
  return { script, paints: script.palette };
}
/** A kept script file read and checked. */
export function readScript(file, opts) {
  if (!fs.existsSync(file)) throw new Error(`author: no script at ${file}`);
  let given; try { given = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`author: ${file} is not JSON (${e.message})`); }
  return checkAuthored(given, opts);
}

/** A picture with the sheet's millimetre grid over it: a line every 10 mm (5 on a small sheet), red numbers across, blue down. PNG. */
export async function gridImage(image, sheetWidthMm, { width = 1400, pad = 40 } = {}) {
  const meta = await sharp(image).metadata(), W = width, H = Math.round(width * meta.height / meta.width), s = W / sheetWidthMm, step = sheetWidthMm > 120 ? 10 : 5, parts = [];
  for (let mm = 0; mm * s <= W + 0.5; mm += step) {
    const x = (pad + mm * s).toFixed(1), major = mm % 50 === 0;
    parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + H}" stroke="#ff0000" stroke-opacity="${major ? 0.6 : 0.24}" stroke-width="${major ? 2 : 1}"/>`);
    if (mm % 10 === 0) parts.push(`<text x="${x}" y="24" text-anchor="middle" fill="#c80000">${mm}</text><text x="${x}" y="${pad + H + 24}" text-anchor="middle" fill="#c80000">${mm}</text>`);
  }
  for (let mm = 0; mm * s <= H + 0.5; mm += step) {
    const y = (pad + mm * s).toFixed(1), major = mm % 50 === 0;
    parts.push(`<line x1="${pad}" y1="${y}" x2="${pad + W}" y2="${y}" stroke="#0000ff" stroke-opacity="${major ? 0.6 : 0.24}" stroke-width="${major ? 2 : 1}"/><text x="3" y="${Number(y) + 5}" fill="#0000c8">${mm}</text>`);
  }
  const body = await sharp(image).resize(W, H, { fit: 'fill' }).flatten({ background: '#ffffff' }).png().toBuffer();
  const grid = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2 * pad}" height="${H + 2 * pad}" font-family="Helvetica, Arial, sans-serif" font-size="15">${parts.join('')}</svg>`);
  return sharp({ create: { width: W + 2 * pad, height: H + 2 * pad, channels: 3, background: '#ffffff' } }).composite([{ input: body, left: pad, top: pad }, { input: grid, left: 0, top: 0 }]).png().toBuffer();
}

/** Each form's box in sheet millimetres [x0, y0, x1, y1], read from the id map (8-bit grey, 0 unnamed). */
export async function formBoxes(maskFile, forms, sheetWidthMm) {
  const { data, info } = await sharp(maskFile).greyscale().raw().toBuffer({ resolveWithObject: true }), box = new Map(), k = sheetWidthMm / info.width;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const id = data[(y * info.width + x) * info.channels]; if (!id) continue;
    const b = box.get(id); if (!b) box.set(id, [x, y, x, y]); else { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  }
  return forms.map(f => ({ ...f, boxMm: box.has(f.id) ? box.get(f.id).map((v, i) => Math.round((v + (i > 1 ? 1 : 0)) * k)) : null }));
}

/**
 * The author's packet in `dir`: inputs/ (the gridded pictures), and the prompt as one text. The pictures are named by
 * their path inside the folder; nothing of this machine's paths or of the person running it goes into the prompt.
 */
export async function preparePacket({ dir, root, run, drawingPng, briefFile }) {
  const inp = path.join(dir, 'inputs'); fs.mkdirSync(inp, { recursive: true });
  const inputs = [], W = run.sheet.widthMm;
  const put = async (file, what, image) => { fs.writeFileSync(path.join(inp, file), await gridImage(image, W)); inputs.push({ file: `inputs/${file}`, what }); };
  await put('source.png', 'the SUBJECT: the picture to paint', run.subject.sourceAbs);
  await put('drawing.png', `the DRAWING: the opening drawing (${run.drawing.medium.split(',')[0]})`, drawingPng);
  for (const [i, s] of run.studies.entries()) await put(`study-${i + 1}.png`, `STUDY ${i + 1}, the ${s.role}: the subject simplified into flat shapes, lights left as paper`, s.abs);
  let forms = null;
  if (run.masks?.mask) {
    forms = await formBoxes(run.masks.mask, run.masks.forms, W);
    await put('forms.png', 'the NAMED FORMS: each named form of the subject as one flat colour (the FORMS list names them)', run.masks.formsPng);
  }
  const brushes = JSON.parse(fs.readFileSync(path.join(root, 'src/paint/brushes.json'), 'utf8')).brushes;
  const template = fs.readFileSync(briefFile, 'utf8');
  const brief = fillBrief(template, { sheet: run.sheet, inputs, brushes, paints: BOX, forms, medium: run.drawing.medium, skills: template.includes('SKILLS_TEXT') ? skillsText(root) : '' });
  const prompt = `${brief}\nThe pictures are files in the current directory (${inputs.map(i => `\`${i.file}\``).join(', ')}). Open and look at each before answering. Write the script now. Answer with the JSON object only.`;
  const leak = [os.homedir(), os.userInfo().username].find(w => w && prompt.includes(w));
  if (leak) throw new Error('author: the prompt would carry a path or name of this machine; it is not sent');
  fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt);
  return { dir, prompt, brief, images: inputs.map(i => path.join(dir, i.file)), files: inputs.map(i => i.file) };
}

/** The prompt of the one retry: the first prompt, the refused answer and why it was refused. */
export function retryPrompt(prompt, previous, why) {
  return `${prompt}\n\nYour previous answer was refused and nothing was painted. The reason:\n${why}\n\nYour previous answer follows. Correct it and answer again with the WHOLE corrected JSON object only.\n\n${previous.slice(0, 200000)}`;
}

/**
 * The command that asks `author` for one reply, read-only, in the folder `cwd` (a copy of the packet's pictures).
 * {cmd, args, env, parse(stdout) -> {text, tokens, costUSD}}.
 */
export function authorCall(author, { prompt, images, cwd }) {
  if (author.cli === 'claude') {
    return { cmd: 'claude', env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }, unset: [],
      args: ['-p', `${prompt}\n\nOpen the named pictures with Read before answering.`, '--model', author.id, ...(author.effort ? ['--effort', author.effort] : []), '--allowedTools', 'Read', '--setting-sources', 'project', '--no-session-persistence', '--output-format', 'json'],
      parse: out => { try { const d = JSON.parse(out), u = d.usage ?? {}; return { text: String(d.result ?? ''), tokens: ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].reduce((a, k) => a + (u[k] || 0), 0) || null, costUSD: d.total_cost_usd ?? null }; } catch { return { text: out, tokens: null, costUSD: null }; } } };
  }
  if (author.cli === 'codex') {
    return { cmd: 'codex', env: {}, unset: ['DO_NOT_TRACK'],
      args: ['exec', '--json', '-m', author.id, ...(author.effort ? ['-c', `model_reasoning_effort="${author.effort}"`] : []), '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', cwd, ...images.flatMap(f => ['-i', f]), '--', prompt],
      parse: out => {
        let text = '', usage = null;
        for (const l of out.split('\n')) { let d; try { d = JSON.parse(l); } catch { continue; } if (d.type === 'item.completed' && d.item?.type === 'agent_message' && d.item.text) text = d.item.text; if (d.type === 'turn.completed') usage = d.usage; }
        return { text: text || out, tokens: usage ? (usage.input_tokens || 0) + (usage.output_tokens || 0) : null, costUSD: null };
      } };
  }
  if (author.cli === 'agy') {
    const allow = ['read_file', 'read_file(*)', ...images.flatMap(f => [`read_file(${f})`, `read_file(${path.relative(cwd, f)})`])];
    return { cmd: 'agy', env: { DO_NOT_TRACK: '1' }, unset: [], serial: true,
      args: ['--settings', JSON.stringify({ permissions: { allow } }), '-p', `Open each named picture directly, use no shell, and answer in one reply.\n\n${prompt}`, '--model', author.id, '--mode', 'plan', '--sandbox'],
      parse: out => ({ text: out, tokens: null, costUSD: null }) };
  }
  throw new Error(`author ${author.key}: "${author.cli}" is called as a working session only here (--work session), not for one reply`);
}

function launch(call, { cwd, outFile, errFile, minutes }) {
  return new Promise(resolve => {
    const env = { ...process.env, ...call.env }; for (const k of call.unset ?? []) delete env[k];
    const out = fs.openSync(outFile, 'w'), err = fs.openSync(errFile, 'w'), close = () => { fs.closeSync(out); fs.closeSync(err); };
    let child; try { child = spawn(call.cmd, call.args, { cwd, env, stdio: ['ignore', out, err] }); } catch (e) { close(); resolve({ exit: null, error: e.message }); return; }
    const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60 * 1000);
    child.on('error', e => { clearTimeout(timer); close(); resolve({ exit: null, error: e.code === 'ENOENT' ? `\`${call.cmd}\` is not installed or not on PATH` : e.message }); });
    child.on('close', (code, signal) => { clearTimeout(timer); close(); resolve({ exit: code, error: signal ? `ended by ${signal} (time limit ${minutes} min)` : null }); });
  });
}

/**
 * Ask the model once. Writes <stem>.out.txt, <stem>.err.txt and <stem>.call.json in the packet folder. Returns
 * {ok, script, paints, raw, seconds, tokens, costUSD, error}: a refused or missing answer is a result, never a throw.
 * `want` names the key the answer must hold: passages (a script, checked) or another (returned as `answer`).
 */
export async function askAuthor(author, packet, { stem = 'A', prompt = packet.prompt, sheetWidthMm, minutes = AUTHOR_MINUTES, run = launch, want = 'passages' } = {}) {
  // the model works in a temporary folder outside the repository that holds only copies of the pictures
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `unpaint-author-${author.key}-`)), t0 = Date.now(), at = f => path.join(packet.dir, `${stem}.${f}`);
  try {
    for (const f of packet.files) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.copyFileSync(path.join(packet.dir, f), path.join(cwd, f)); }
    const call = authorCall(author, { prompt, images: packet.files.map(f => path.join(cwd, f)), cwd });
    const done = await run(call, { cwd, outFile: at('out.txt'), errFile: at('err.txt'), minutes });
    const seconds = Math.round((Date.now() - t0) / 1000), stdout = fs.existsSync(at('out.txt')) ? fs.readFileSync(at('out.txt'), 'utf8') : '';
    const got = call.parse(stdout), result = { ok: false, raw: got.text, seconds, tokens: got.tokens, costUSD: got.costUSD, exit: done.exit, error: null };
    const errTail = fs.existsSync(at('err.txt')) ? fs.readFileSync(at('err.txt'), 'utf8').trim().split('\n').slice(-3).join(' ').slice(0, 300) : '';
    if (done.error) result.error = `the model could not be called: ${done.error} (needs ${needsOf(author.cli)})`;
    else if (done.exit !== 0 || !got.text.trim()) result.error = `the model's command ended with exit ${done.exit} and ${got.text.trim() ? 'an answer' : 'no answer'}${errTail ? `: ${errTail}` : ''} (needs ${needsOf(author.cli)})`;
    else {
      const given = jsonWith(got.text, want);
      if (!given) result.error = `the answer holds no JSON object with "${want}"`;
      else if (want !== 'passages') Object.assign(result, { answer: given, ok: true });
      else { try { Object.assign(result, checkAuthored(given, { sheetWidthMm }), { ok: true }); } catch (e) { result.error = e.message; } }
    }
    fs.writeFileSync(at('call.json'), JSON.stringify({ author: author.key, model: author.id, effort: author.effort, cli: author.cli, command: [call.cmd, ...call.args.map(a => (a.length > 200 ? `<${a.length} characters>` : a.replaceAll(cwd, '<its folder>')))], seconds, exit: done.exit, tokens: got.tokens, costUSD: got.costUSD, ok: result.ok, error: result.error }, null, 1) + '\n');
    return result;
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}
