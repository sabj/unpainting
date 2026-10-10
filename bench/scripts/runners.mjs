// How each kind of model is launched, and how its token use is read back from its event log.
import fs from 'node:fs';
import path from 'node:path';
import { BENCH } from './lib.mjs';

/** Install the V2 technique guides in the runner discovery directories. V1 receives no guides. */
export function installSkills(roundKey, ws) {
  if (roundKey !== 'skill') return;
  fs.cpSync(path.join(BENCH, 'v2', 'skill', 'skills'), path.join(ws, '.agents', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.claude'), { recursive: true });
  fs.symlinkSync('../.agents/skills', path.join(ws, '.claude', 'skills'));
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
const PROMPT_NAMES = { hills: 'Hills', 'south-france': 'France', sargent: 'Ships', mittens: 'Mittens', trumbull: 'Trumbull' };

/** The one-line prompt of protocol v2, for the crops of this run. Identical to v2 when all five are painted. */
export function prompt(crops) {
  return `Read bench/BRIEF.md in this directory and do what it says. The ${WORDS[crops.length]} target crops are attached in order: ${crops.map(c => PROMPT_NAMES[c] || c).join(', ')}. Work without asking questions; nobody will answer.`;
}

/** The v2 brief for a round, cut to the crops of this run. Identical to the frozen brief when all five are painted. */
export function brief(roundKey, crops, viewDir) {
  const src = path.join(BENCH, 'v2', roundKey === 'skill' ? 'skill' : 'naive', 'BRIEF.md');
  const lines = fs.readFileSync(src, 'utf8').split('\n')
    .filter(l => { const m = l.match(/^\| `(\w+)` \|/); return !m || crops.includes(m[1]); });
  return lines.join('\n').replace(/\bfive\b/g, WORDS[crops.length]).replaceAll('TARGET_DIR', viewDir);
}

/** The env variables a runner needs, by name only. A CLI that is logged in needs none of them. */
export const KEYS = {
  claude: { cli: 'claude', env: ['ANTHROPIC_API_KEY'], note: 'or a logged-in Claude Code CLI' },
  codex: { cli: 'codex', env: ['OPENAI_API_KEY'], note: 'or a logged-in Codex CLI' },
  together: { cli: 'python3', env: ['TOGETHER_API_KEY'], note: 'required' },
};

/** Stream-json input: prompt followed by labelled crop images. */
export function claudeInput(text, viewDir, crops) {
  const content = [{ type: 'text', text }];
  for (const t of crops) {
    content.push({ type: 'text', text: `Target: ${t}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(path.join(viewDir, `${t}.png`)).toString('base64') } });
  }
  return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}

/** {cmd, args, stdinFile?} for a model. raw is the raw output folder of the try. */
export function command(model, { ws, viewDir, raw, crops, text, sessionCapMin }) {
  const effort = model.effort && model.effort !== 'n/a' ? model.effort : null;
  if (model.runner === 'claude') {
    const input = path.join(raw, 'input.jsonl');
    fs.writeFileSync(input, claudeInput(text, viewDir, crops));
    return {
      cmd: 'claude', stdinFile: input,
      args: ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', model.id,
        ...(effort ? ['--effort', effort] : []), '--disable-slash-commands', '--dangerously-skip-permissions'],
    };
  }
  if (model.runner === 'codex') {
    return {
      cmd: 'codex',
      args: ['exec', '--json', '--skip-git-repo-check', '-m', model.id, ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []),
        '--dangerously-bypass-approvals-and-sandbox', '-C', ws, ...crops.flatMap(t => ['-i', path.join(viewDir, `${t}.png`)]), '--', text],
    };
  }
  if (model.runner === 'together') {
    return {
      cmd: 'python3',
      // The loop process must read the targets to attach them to the prompt, so it runs without the Python guard
      // (run.mjs puts the guard on PYTHONPATH for every child). oss_loop.py gives the guard back to the model's own
      // commands through BENCH_PYGUARD.
      env: { BENCH_CROPS: crops.join(','), PYTHONPATH: '' },
      args: [path.join(BENCH, 'v2', 'runners', 'oss_loop.py'), '--model', model.id, '--cwd', ws, '--brief', path.join(ws, 'bench', 'BRIEF.md'),
        '--images', viewDir, '--log', path.join(raw, 'events.jsonl'), '--usd', '2.4', '--minutes', String(sessionCapMin - 1)],
    };
  }
  throw new Error(`unknown runner ${model.runner}`);
}

/** Return {cmd, args, stdinFile?, env?} for a benchmark turn. Resume preserves context where supported.
 * images contains PNG attachments; done is 'paintings' (requires every final.png) or 'any'.
 * Runners without resume use briefFile and saved work for each turn. */
export function turnCommand(model, { ws, raw, text, images = [], sessionId = null, resume = false, turn = 1, briefFile = null, crops = [], logFile, minutes = 30, done = 'paintings' }) {
  const effort = model.effort && model.effort !== 'n/a' ? model.effort : null;
  if (model.runner === 'claude') {
    const common = ['--output-format', 'stream-json', '--verbose', '--model', model.id, ...(effort ? ['--effort', effort] : []), '--disable-slash-commands', '--dangerously-skip-permissions'];
    // The shell timeout must exceed bench/paint.sh's 100-second wait.
    const env = { BASH_DEFAULT_TIMEOUT_MS: '300000', BASH_MAX_TIMEOUT_MS: '600000' };
    if (resume) return { cmd: 'claude', env, args: ['-p', text, ...common, '--resume', sessionId] };
    const content = [{ type: 'text', text }];
    for (const f of images) {
      content.push({ type: 'text', text: `Target: ${path.basename(f, '.png')}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(f).toString('base64') } });
    }
    const input = path.join(raw, `input-${turn}.jsonl`);
    fs.writeFileSync(input, JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
    return { cmd: 'claude', env, stdinFile: input, args: ['-p', '--input-format', 'stream-json', ...common, '--session-id', sessionId] };
  }
  if (model.runner === 'codex') {
    const base = ['exec', '--json', '--skip-git-repo-check', '-m', model.id, ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []), '--dangerously-bypass-approvals-and-sandbox', '-C', ws];
    const att = images.flatMap(f => ['-i', f]);
    return { cmd: 'codex', args: resume ? [...base, 'resume', sessionId, text, ...att] : [...base, ...att, '--', text] };
  }
  if (model.runner === 'together') {
    const brief = path.join(raw, `turn-${turn}.md`);
    fs.writeFileSync(brief, fs.readFileSync(briefFile, 'utf8') + '\n\n---\n\n' + text + '\n');
    const imgDir = images.length ? path.dirname(images[0]) : null;
    return {
      cmd: 'python3', env: { BENCH_CROPS: crops.join(','), PYTHONPATH: '' },
      args: [path.join(BENCH, 'v2', 'runners', 'oss_loop.py'), '--model', model.id, '--cwd', ws, '--brief', brief, ...(imgDir ? ['--images', imgDir] : []),
        '--log', logFile, '--usd', '2.4', '--minutes', String(minutes), '--done', done],
    };
  }
  throw new Error(`unknown runner ${model.runner}`);
}

/** Read the thread ID from the event log; return null if absent. */
export function codexThread(eventsFile) {
  for (const d of lines(eventsFile)) if (d.type === 'thread.started' && d.thread_id) return d.thread_id;
  return null;
}

function* lines(file) {
  if (!fs.existsSync(file)) return;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { yield JSON.parse(l); } catch { /* a partial last line */ }
  }
}

/** {tokens, costUSD} from a runner's event log. Cost is reported only by the per-token runner. */
export function usage(runner, eventsFile) {
  if (runner === 'claude') {
    let result = null; const per = new Map();
    for (const d of lines(eventsFile)) {
      if (d.type === 'result') result = d;
      if (d.type === 'assistant' && d.message?.id) per.set(d.message.id, d.message.usage || {});
    }
    const us = result ? [result.usage || {}] : [...per.values()];
    const keys = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
    const tokens = us.reduce((a, u) => a + keys.reduce((s, k) => s + (u[k] || 0), 0), 0);
    return { tokens: tokens || null, costUSD: null };
  }
  if (runner === 'codex') {
    let last = null;
    for (const d of lines(eventsFile)) if (d.type === 'turn.completed') last = d.usage;
    return { tokens: last ? (last.input_tokens || 0) + (last.output_tokens || 0) : null, costUSD: null };
  }
  for (const d of lines(eventsFile)) {
    if (d.final) return { tokens: (d.final.input_tokens || 0) + (d.final.output_tokens || 0), costUSD: d.final.usd ?? null };
  }
  return { tokens: null, costUSD: null };
}
