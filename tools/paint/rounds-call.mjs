// The model's side of fixed rounds (rounds.mjs): each round is one call of the provider's own command in its
// single-prompt print mode, with no shell and no tools, the pictures attached, plain text back. The conversation of
// one level is continued with the command's own resume flag, which is what keeps the provider's prompt cache; when a
// continued call fails, the round is asked once more as a fresh call that carries the transcript so far, and the
// round's record says so (never silently).
//   claude  -p, the message (text and pictures) on stdin as stream-json, --tools "" (no tool at all), --resume ID
//   codex   exec --json -s read-only -i PICTURE (its shell cannot be removed, only made read-only: it works in a
//           folder that holds the pictures and nothing else), exec resume THREAD
//   agy     -p --mode plan --sandbox, the pictures named by path for its one allowed tool (read_file), --conversation ID
//   muse    exec --image PICTURE --disable-shell --disable-write --disable-web-tools, no workspace, the same --session-id
// A stand-in ("dry": dryModel below) answers from a script, for tests and a dry run: no model is called.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readTranscript, cleanEnv, museFiles, transcriptFile } from './session.mjs';
import { museUsage } from '../../bench/scripts/runners.mjs';

/** Minutes a model may take over one round's reply. */
export const ROUND_MINUTES = 40;
/** The commands rounds can call, and what each needs. */
export const ROUNDS_CLIS = Object.freeze({
  claude: 'the `claude` command, logged in',
  codex: 'the `codex` command, logged in',
  agy: 'the `agy` command, logged in',
  muse: 'the `muse` command, logged in',
  dry: 'nothing: a scripted stand-in',
});

/**
 * Replies asked for at once, a provider's command: every (model, picture) run is independent and they all run together,
 * held only by each provider's rate limits (agy: three at once in separate folders did not interrupt one another).
 */
export const ROUNDS_AT_ONCE = Object.freeze({ claude: 6, codex: 6, agy: 3, muse: 3, dry: 12 });

const mediaOf = f => (/\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png');

/**
 * The command of one round. `state` {id: the conversation's id once known, uuid: one made for this level}; `resume`:
 * continue the conversation. {cmd, args, env, stdin, parse(stdout) -> {text, tokens, costUSD, id}}.
 */
export function roundCall(author, { text, images, cwd, state, resume }) {
  const split = (cli, out) => { const t = readTranscript(cli, out), s = t.tokenSplit?.reported ? t.tokenSplit : null; return { text: t.text, costUSD: t.costUSD, tokens: s ? { fresh: s.freshIn ?? 0, cached: s.cachedIn ?? 0, output: s.out ?? 0, ...(s.cacheWriteIn != null ? { cacheWrite: s.cacheWriteIn } : {}), ...(s.thinking != null ? { thinking: s.thinking } : {}) } : null }; };
  const deltaTokens = (prev, cur) => {
    if (!cur) return null;
    if (!prev) return { ...cur };
    const out = {};
    for (const k of Object.keys(cur)) out[k] = Math.max(0, (cur[k] ?? 0) - (prev[k] ?? 0));
    return out;
  };
  const effort = author.effort && author.effort !== 'n/a' ? author.effort : null;
  if (author.cli === 'claude') {
    const content = [{ type: 'text', text }, ...images.map(f => ({ type: 'image', source: { type: 'base64', media_type: mediaOf(f), data: fs.readFileSync(f).toString('base64') } }))];
    return { cmd: 'claude', env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
      args: ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', author.id, ...(effort ? ['--effort', effort] : []), '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--setting-sources', 'project', ...(resume ? ['--resume', state.uuid] : ['--session-id', state.uuid])],
      stdin: JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n',
      // (claude's own cost figure is the session's running total: a resumed call's cost is what it added)
      parse: out => { const got = split('claude', out), total = got.costUSD; if (total != null) { got.costUSD = +(resume ? Math.max(0, total - (state.costSoFar ?? 0)) : total).toFixed(6); state.costSoFar = total; } return { ...got, id: state.uuid }; } };
  }
  if (author.cli === 'codex') {
    const pics = images.flatMap(f => ['-i', f]);
    return { cmd: 'codex', env: {}, unset: ['DO_NOT_TRACK'],
      args: ['exec', '--json', '-m', author.id, ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), '-s', 'read-only', '--skip-git-repo-check', '-C', cwd, ...(resume ? ['resume', state.id, ...pics, '--', text] : [...pics, '--', text])],
      parse: out => {
        let id = state.id ?? null;
        for (const l of out.split('\n')) { try { const d = JSON.parse(l); if (d.type === 'thread.started' && d.thread_id) id = d.thread_id; } catch { /* not an event */ } }
        // codex exec resume emits cumulative thread totals in turn.completed; subtract prior totals so rounds never double-count
        const got = split('codex', out), raw = got.tokens;
        if (raw) {
          const prev = resume ? state.codexSoFar : null;
          got.tokens = deltaTokens(prev, raw);
          state.codexSoFar = raw;
        }
        return { ...got, id };
      } };
  }
  if (author.cli === 'agy') {
    const rel = images.map(f => path.relative(cwd, f)), allow = ['read_file', 'read_file(*)', ...images.flatMap(f => [`read_file(${f})`, `read_file(${path.relative(cwd, f)})`])];
    return { cmd: 'agy', env: { DO_NOT_TRACK: '1' }, serial: true,
      args: ['--settings', JSON.stringify({ permissions: { allow } }), '-p', `${rel.length ? `Open each of these pictures directly before answering (${rel.map(f => `\`${f}\``).join(', ')}); use no shell and no other tool; answer in one reply.\n\n` : 'Use no shell and no tool; answer in one reply.\n\n'}${text}`, '--model', author.id, '--mode', 'plan', '--sandbox', '--output-format', 'stream-json', '--print-timeout', '0', ...(resume ? ['--conversation', state.id] : [])],
      parse: out => { let id = state.id ?? null; for (const l of out.split('\n')) { try { const d = JSON.parse(l); const c = d.conversation_id ?? d.init?.conversation_id; if (c) id = c; } catch { /* not an event */ } } return { ...split('agy', out), id }; } };
  }
  if (author.cli === 'muse') {
    const promptFile = path.join(cwd, `prompt-${crypto.randomBytes(4).toString('hex')}.txt`);
    return { cmd: 'muse', env: {}, before: () => fs.writeFileSync(promptFile, text),
      args: ['exec', '--model', author.id, ...(effort ? ['--effort', effort] : []), '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-web-tools', '--disable-reminders', '--disable-shell', '--disable-write', '--disable-request-user-input', '--session-id', state.uuid, ...images.flatMap(f => ['--image', f]), '--prompt-file', promptFile],
      // read full token split (fresh/cached/output/thinking) from Muse's session.jsonl with cumulative delta tracking; fall back to museUsage
      parse: out => {
        fs.writeFileSync(path.join(cwd, 'muse-session.txt'), state.uuid + '\n');
        const logRoot = museFiles(os.homedir()).sessions;
        const logFile = transcriptFile({ log: { root: logRoot, id: state.uuid } }, '');
        if (logFile && fs.existsSync(logFile)) {
          const got = split('muse', fs.readFileSync(logFile, 'utf8'));
          if (got.tokens) {
            const raw = got.tokens, prev = resume ? state.museSoFar : null;
            const d = deltaTokens(prev, raw);
            state.museSoFar = raw;
            return { text: out.trim(), costUSD: null, tokens: d, tokensTotal: (d.fresh ?? 0) + (d.cached ?? 0) + (d.output ?? 0), id: state.uuid };
          }
        }
        const u = museUsage(cwd);
        return { text: out.trim(), costUSD: null, tokens: null, tokensTotal: u.tokens ?? null, id: state.uuid };
      } };
  }
  throw new Error(`author ${author.key}: rounds cannot call "${author.cli}" (${Object.keys(ROUNDS_CLIS).join(', ')} can)`);
}

function launch(call, { cwd, outFile, errFile, minutes }) {
  return new Promise(resolve => {
    const env = { ...cleanEnv(), ...call.env }; for (const k of call.unset ?? []) delete env[k];
    const out = fs.openSync(outFile, 'w'), err = fs.openSync(errFile, 'w'), close = () => { fs.closeSync(out); fs.closeSync(err); };
    let child; try { call.before?.(); child = spawn(call.cmd, call.args, { cwd, env, stdio: [call.stdin != null ? 'pipe' : 'ignore', out, err] }); } catch (e) { close(); resolve({ exit: null, error: e.message }); return; }
    if (call.stdin != null) { child.stdin.on('error', () => {}); child.stdin.end(call.stdin); }
    const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60 * 1000);
    child.on('error', e => { clearTimeout(timer); close(); resolve({ exit: null, error: e.code === 'ENOENT' ? `\`${call.cmd}\` is not installed or not on PATH` : e.message }); });
    child.on('close', (code, signal) => { clearTimeout(timer); close(); resolve({ exit: code, error: signal ? `ended by ${signal} (time limit ${minutes} min)` : null }); });
  });
}

/** The transcript so far as one text, for a command that could not continue its conversation. */
function resent(history, text) {
  return `This conversation is continued in a fresh call; what was said so far follows, then the present message.\n\n${history.map((h, i) => `=== MESSAGE ${i} TO YOU ===\n${h.sent}\n\n=== YOUR ANSWER ${i} ===\n${h.reply}`).join('\n\n')}\n\n=== THE PRESENT MESSAGE ===\n${text}`;
}

/**
 * The asker of one level's conversation for `author`: ask({text, images, round}) -> {ok, text, error, seconds,
 * tokens, costUSD, continuedBy}. `dir`: where each round's output is kept (R<n>.out.txt, R<n>.err.txt, R<n>.call.json).
 * The model works in a temporary folder outside the repository that holds copies of the pictures only; close() removes it.
 * `slot(fn)`: how calls of this command wait for a place (agy: one at a time).
 */
export function roundsAsker(author, { dir, minutes = ROUND_MINUTES, run = launch, slot = fn => fn() }) {
  if (author.cli === 'dry') return dryModel(author);
  roundCall(author, { text: '', images: [], cwd: '', state: { uuid: 'x', id: 'x' }, resume: false });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `unpaint-rounds-${author.key}-`)), state = { uuid: crypto.randomUUID(), id: null }, history = [], firstImages = [];
  fs.mkdirSync(dir, { recursive: true });
  const once = async ({ text, images, round, resume, stem, maxMinutes = null }) => {
    const call = roundCall(author, { text, images, cwd, state, resume }), at = f => path.join(dir, `${stem}.${f}`), t0 = Date.now();
    const done = await slot(() => run(call, { cwd, outFile: at('out.txt'), errFile: at('err.txt'), minutes: maxMinutes != null ? Math.min(minutes, maxMinutes) : minutes }));
    const seconds = Math.round((Date.now() - t0) / 1000), stdout = fs.existsSync(at('out.txt')) ? fs.readFileSync(at('out.txt'), 'utf8') : '';
    const got = call.parse(stdout), errTail = fs.existsSync(at('err.txt')) ? fs.readFileSync(at('err.txt'), 'utf8').trim().split('\n').slice(-3).join(' ').slice(0, 300) : '';
    let error = null;
    if (done.error) error = `the model could not be called: ${done.error} (needs ${ROUNDS_CLIS[author.cli]})`;
    else if (done.exit !== 0 || !got.text?.trim()) error = `the model's command ended with exit ${done.exit} and ${got.text?.trim() ? 'an answer' : 'no answer'}${errTail ? `: ${errTail}` : ''}`;
    if (!error && got.id) state.id = got.id;
    fs.writeFileSync(at('call.json'), JSON.stringify({ author: author.key, model: author.id, effort: author.effort ?? null, cli: author.cli, round, resume, command: [call.cmd, ...call.args.map(a => (a.length > 200 ? `<${a.length} characters>` : a.replaceAll(cwd, '<its folder>')))], seconds, exit: done.exit, tokens: got.tokens ?? null, tokensTotal: got.tokensTotal ?? null, costUSD: got.costUSD ?? null, error }, null, 1) + '\n');
    return { ok: !error, text: got.text ?? '', error, seconds, tokens: got.tokens ?? null, tokensTotal: got.tokensTotal ?? null, costUSD: got.costUSD ?? null };
  };
  const ask = async ({ text, images = [], round, maxMinutes = null }) => {
    // the pictures as copies in its folder, named for the round
    const mine = images.map((f, i) => { const to = path.join(cwd, round === 0 ? path.basename(f) : `round-${round}-${i + 1}${path.extname(f)}`); fs.copyFileSync(f, to); return to; });
    if (round === 0) firstImages.push(...mine);
    // claude and muse continue under the id given them; codex and agy under the id their first call reported
    const canResume = author.cli === 'claude' || author.cli === 'muse' || Boolean(state.id);
    let got = round > 0 && !canResume ? { ok: false, seconds: 0, error: 'the command reported no conversation id to continue' } : await once({ text, images: mine, round, resume: round > 0, stem: `R${round}`, maxMinutes }), continuedBy = round > 0 ? 'the command\'s own resume' : null;
    if (!got.ok && round > 0) {
      // the command could not continue: once more as a fresh call that carries the transcript, and the record says so
      state.uuid = crypto.randomUUID(); state.id = null;
      const again = await once({ text: resent(history, text), images: [...firstImages, ...mine], round, resume: false, stem: `R${round}-resent`, maxMinutes });
      got = { ...again, seconds: got.seconds + again.seconds, resumeError: got.error }; continuedBy = 'the transcript, sent again in a fresh call (the resume failed)';
    }
    if (got.ok) history.push({ sent: text, reply: got.text });
    return { ...got, continuedBy };
  };
  ask.close = () => fs.rmSync(cwd, { recursive: true, force: true });
  return ask;
}

/**
 * The stand-in model: answers from a script of replies, no model called. `author.replies` is a list of texts or
 * functions (sent -> text); when it runs out, it says it is done. Its tokens are counted from the characters sent and
 * answered (four to a token), so a dry run's records are complete.
 */
export function dryModel(author) {
  let n = 0, sentSoFar = 0;
  const ask = async ({ text, images = [] }) => {
    const r = author.replies?.[n++], reply = typeof r === 'function' ? r({ text, images }) : r ?? '{"done": true}';
    const fresh = Math.round(text.length / 4) + 1000 * images.length, cached = sentSoFar; sentSoFar += fresh + Math.round(reply.length / 4);
    return { ok: true, text: reply, error: null, seconds: 0, tokens: { fresh, cached, output: Math.round(reply.length / 4) }, costUSD: null, continuedBy: n > 1 ? 'the stand-in keeps no conversation' : null };
  };
  ask.close = () => {};
  return ask;
}
