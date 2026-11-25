// --studies author (open tools): before it writes its script, the author may brief its own block-in studies. It
// answers with up to three study briefs (one for each role it wants to replace); the local image model (Qwen Image
// Edit through mflux, started by assisted-studies.py, after codex/04-recovery) makes them from the subject alone; the
// author then gets its own studies in place of the registered ones of those roles and reviews them as it writes.
// The registered studies are never changed: the author's studies are new files in the run folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROLES = ['block-in', 'middle', 'fine'];
const MODEL = 'mlx-community/qwen-image-edit-2511-8bit', LORA = 'lightx2v/Qwen-Image-Edit-2511-Lightning';
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hub = home => path.join(home, '.cache', 'huggingface', 'hub');

/**
 * The local study route, found or said to be missing piece by piece. base is the folder SUBJECTS.json lives in.
 * {ready, missing: [text], driver, launcher, python, modelRevision, loraRevision}
 */
export function qwenRoute(base, { env = process.env, home = os.homedir(), exists = fs.existsSync, read = f => fs.readFileSync(f, 'utf8'), list = d => fs.readdirSync(d) } = {}) {
  const r = { driver: env.UNPAINT_QWEN_DRIVER || path.join(base, 'guides', 'tools', 'qwen_onboard_local.py'), launcher: env.UNPAINT_QWEN_LAUNCHER || path.join(base, 'bin', 'one-model'),
    python: env.UNPAINT_QWEN_PYTHON || path.join(home, '.local', 'share', 'uv', 'tools', 'mflux', 'bin', 'python'), modelRevision: null, loraRevision: null, missing: [] };
  if (!exists(r.driver)) r.missing.push(`the local Qwen driver (${r.driver}; set UNPAINT_QWEN_DRIVER)`);
  if (!exists(r.launcher)) r.missing.push(`the one-model launcher (${r.launcher}; set UNPAINT_QWEN_LAUNCHER)`);
  if (!exists(r.python)) r.missing.push(`the mflux python (${r.python}; set UNPAINT_QWEN_PYTHON, or \`uv tool install mflux\`)`);
  const ref = path.join(hub(home), `models--${MODEL.replace('/', '--')}`, 'refs', 'main'), snaps = path.join(hub(home), `models--${LORA.replace('/', '--')}`, 'snapshots');
  if (exists(ref)) r.modelRevision = read(ref).trim(); else r.missing.push(`the model ${MODEL} in the Hugging Face cache`);
  const lora = exists(snaps) ? list(snaps).find(s => exists(path.join(snaps, s, 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors'))) : null;
  if (lora) r.loraRevision = lora; else r.missing.push(`the 8-step Lightning LoRA of ${LORA} in the Hugging Face cache`);
  if (r.loraRevision && exists(r.driver) && !read(r.driver).includes(r.loraRevision)) r.missing.push(`a driver written for the installed LoRA revision ${r.loraRevision}`);
  r.ready = !r.missing.length;
  return r;
}

/** The text asking the author which studies it wants to brief itself. `brief` is the filled author's brief. */
export function studyRequestPrompt(brief, files) {
  return `${brief}

## THIS TURN: your own studies (open tools)

Do not write the script yet. The STUDIES above were made for you by an image-editing model from fixed prompts. You may
replace any of the three with a study made to YOUR brief: the same model is given the SUBJECT alone and your words, and
returns one picture of the whole sheet. Ask where a given study loses something you need (a face flattened to one
shape, a dark animal collapsed to a silhouette, a sky without its soft value masses). A brief is one paragraph for an
image model: say what kind of study it is (a painter's block-in of this watercolour on its existing sheet), what must
be preserved (framing, proportions, the named forms that matter), how far to simplify, what to keep as bare paper, and
what to leave out (outlines, text, labels, detail finer than the study's role).

The pictures are files in the current directory (${files.map(f => `\`${f}\``).join(', ')}). Open and compare them first.
Answer with ONE JSON object only:
{"seen": "<two or three sentences: where the given studies serve and where they fail you>",
 "studies": [{"role": "block-in" | "middle" | "fine", "brief": "<the paragraph for the image model>", "why": "<one sentence>"}]}
At most one brief for each role; "studies": [] when the given studies are enough.`;
}

/** The author's answer checked: [{role, index, brief, why}], at most one for each role. Throws with the reason. */
export function parseStudyRequests(answer) {
  if (!answer || !Array.isArray(answer.studies)) throw new Error('study requests: the answer needs a "studies" list');
  const seen = new Set();
  return answer.studies.map(s => {
    const index = ROLES.indexOf(s?.role);
    if (index < 0) throw new Error(`study requests: role "${s?.role}" is not one of ${ROLES.join(', ')}`);
    if (seen.has(index)) throw new Error(`study requests: two briefs for the ${s.role} study`); seen.add(index);
    const brief = String(s.brief ?? '').trim();
    if (brief.length < 80 || brief.length > 4000 || /[|#\r]/.test(brief)) throw new Error(`study requests: the ${s.role} brief must be one paragraph of 80 to 4,000 letters without | or #`);
    return { role: s.role, index, brief: brief.replace(/\s*\n\s*/g, ' '), why: String(s.why ?? '') };
  });
}

/** The request file assisted-studies.py runs, with every input pinned. Writes the brief files; returns {file, jobs}. */
export function writeStudyRequest({ dir, authorKey, source, route, seed, requests }) {
  fs.mkdirSync(dir, { recursive: true });
  const jobs = requests.map(r => {
    const prompt = path.join(dir, `${r.role}.txt`); fs.writeFileSync(prompt, r.brief + '\n');
    return { role: r.role, prompt, promptSHA256: sha256(prompt), output: path.join(dir, `${r.role}.png`), seed };
  });
  const file = path.join(dir, 'request.json');
  fs.writeFileSync(file, JSON.stringify({ mode: 'tool-assisted', round: 'A', author: authorKey, source: { path: source.abs, sha256: source.sha256 }, model: MODEL, modelRevision: route.modelRevision,
    loraRevision: route.loraRevision, steps: 8, guidance: 1, freshSourceOnly: true, tool: route.driver, toolSHA256: sha256(route.driver), jobs }, null, 2) + '\n');
  return { file, jobs };
}

/**
 * Make the studies of a request with the local image model: one at a time on this machine (the launcher waits for
 * memory), minutes each. Resolves [{role, index, file, sha256}]; throws when the tool fails or a study is not returned.
 */
export function makeStudies({ root, request, requests, route, python = 'python3', run = runTool }) {
  return run(python, [path.join(root, 'tools', 'paint', 'assisted-studies.py'), request.file, '--python', route.python, '--launcher', route.launcher], path.join(path.dirname(request.file), 'tool.log')).then(exit => {
    if (exit !== 0) throw new Error(`the study tool ended with exit ${exit}; see ${path.join(path.dirname(request.file), 'tool.log')} and qwen-local.log beside it`);
    return request.jobs.map((j, i) => { if (!fs.existsSync(j.output)) throw new Error(`the image model returned no ${j.role} study`); return { role: j.role, index: requests[i].index, file: j.output, sha256: sha256(j.output) }; });
  });
}
function runTool(cmd, args, logFile) {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logFile, 'w'), child = spawn(cmd, args, { stdio: ['ignore', log, log] });
    child.on('error', e => { fs.closeSync(log); reject(e); }); child.on('close', code => { fs.closeSync(log); resolve(code); });
  });
}

/** The run's studies with the author's own in place of the registered ones of the same role. */
export function withAuthorStudies(studies, made) {
  return studies.map((s, i) => { const m = made.find(x => x.index === i); return m ? { ...s, abs: m.file, path: `author/studies/${path.basename(m.file)}`, sha256: m.sha256, byAuthor: true, role: `${s.role}, made to the author's own brief` } : s; });
}
