import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROVIDER_HOSTS, allowed, startGate, makeToolbox, proxyEnv, toolsText, INSTALLERS } from './session-net.mjs';
import { seatbelt, sessionCall } from './session.mjs';

const connect = (port, target) => new Promise(resolve => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)); let got = '';
  s.on('data', d => { got += d; if (got.includes('\r\n\r\n')) { s.destroy(); resolve(got.split('\r\n')[0]); } }); s.on('error', () => resolve(got.split('\r\n')[0] || 'reset'));
});

test('the gate passes the provider\'s hosts and refuses every other, keeping each refusal with its host', async () => {
  assert.ok(allowed('daily-cloudcode-pa.googleapis.com', PROVIDER_HOSTS.agy)); assert.ok(allowed('lh3.googleusercontent.com', PROVIDER_HOSTS.agy));
  assert.ok(!allowed('pypi.org', PROVIDER_HOSTS.agy)); assert.ok(!allowed('googleapis.com.evil.example', PROVIDER_HOSTS.agy)); assert.ok(!allowed('registry.npmjs.org', PROVIDER_HOSTS.agy));
  // a stand-in for the provider on loopback, allowed by name, so nothing leaves this machine
  const up = net.createServer(s => s.end()); await new Promise(r => up.listen(0, '127.0.0.1', r));
  const gate = await startGate([/^127\.0\.0\.1$/], { now: () => 't' });
  try {
    assert.match(await connect(gate.port, `127.0.0.1:${up.address().port}`), /403/, 'a port other than 443 is refused even for an allowed host');
    assert.match(await connect(gate.port, 'pypi.org:443'), /^HTTP\/1\.1 403/);
    assert.match(await connect(gate.port, 'registry.npmjs.org:443'), /^HTTP\/1\.1 403/);
    const plain = await new Promise(r => http.get({ host: '127.0.0.1', port: gate.port, path: 'http://example.com/x' }, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => r([res.statusCode, b])); }));
    assert.equal(plain[0], 403); assert.match(plain[1], /no network/);
    assert.deepEqual(gate.refused.map(x => [x.host, x.how]), [['127.0.0.1', 'CONNECT'], ['pypi.org', 'CONNECT'], ['registry.npmjs.org', 'CONNECT'], ['example.com', 'GET']]);
    assert.deepEqual(gate.passed, {});
  } finally { await gate.stop(); up.close(); }
});

test('the toolbox: its Python first on PATH, installers answered in a plain sentence, the shell\'s start-up files its own; a missing Python fails loudly', () => {
  assert.throws(() => makeToolbox('/no/such/python'), /needs its Python \(\/no\/such\/python\)/);
  const py = process.env.PAINTER_SEG_PYTHON ?? path.resolve('..', '..', '.venv-seg', 'bin', 'python'), sys = '/usr/bin/python3';
  let t; try { t = makeToolbox(fs.existsSync(py) ? py : sys); } catch (e) { assert.match(e.message, /lacks a library it must have/); return; }
  try {
    assert.match(t.said, /^Python [\d.]+ with numpy [\d.]+, pillow [\d.]+, scipy [\d.]+, scikit-image [\d.]+ and opencv [\d.]+$/); assert.match(toolsText(t.said), /no network beyond the model's own service/);
    assert.ok(t.env.PATH.startsWith(`${t.bin}:`)); assert.equal(t.env.ZDOTDIR, t.dir); assert.equal(t.env.PIP_NO_INDEX, '1');
    for (const i of INSTALLERS) assert.ok(fs.existsSync(path.join(t.bin, i)));
    const said = run => { try { execFileSync('/bin/sh', ['-c', run], { env: { ...t.env, HOME: os.tmpdir() }, encoding: 'utf8', stdio: 'pipe' }); return 'exit 0'; } catch (e) { return `exit ${e.status}: ${e.stderr.trim()}`; } };
    assert.match(said('pip install six'), /^exit 1: Installing software is not part of this session/); assert.match(said('npm install x'), /^exit 1: Installing software/);
    assert.match(said('python3 -m pip install six'), /^exit 1: Installing software/); assert.equal(said('python3 -c "import numpy"'), 'exit 0');
    assert.match(fs.readFileSync(path.join(t.dir, '.zshenv'), 'utf8'), new RegExp(`export PATH="${t.bin}":`));
  } finally { fs.rmSync(t.dir, { recursive: true, force: true }); }
});

test('a gated session\'s profile lets out only to loopback; its command gets the proxy and the toolbox', () => {
  const open = seatbelt({ deny: ['/repo'], write: ['/w'], cwd: '/c', local: true }), shut = seatbelt({ deny: ['/repo'], write: ['/w'], cwd: '/c', local: true, gated: true, readable: ['/tb'] });
  assert.match(open, /remote tcp "\*:443"/); assert.doesNotMatch(shut, /\*:443|\*:53|mDNSResponder/); assert.match(shut, /\(allow network-outbound \(remote ip "localhost:\*"\)\)/); assert.match(shut, /\(allow file-read\* \(subpath "\/tb"\)\)/);
  const toolbox = { dir: '/tb', python: '/venv/bin/python', readable: ['/tb', '/venv'], env: { PATH: '/tb/bin:/bin', ZDOTDIR: '/tb' } };
  const c = sessionCall({ key: 'argon-m', cli: 'agy', id: 'm' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], gate: { url: 'http://127.0.0.1:9' }, toolbox });
  assert.equal(c.env.HTTPS_PROXY, 'http://127.0.0.1:9'); assert.equal(c.env.NO_PROXY, 'localhost,127.0.0.1,::1'); assert.equal(c.env.PATH, '/tb/bin:/bin'); assert.equal(c.gated, true);
  assert.match(c.profile, /\(allow file-read\* \(subpath "\/venv"\)\)/, 'the toolbox Python\'s folder is read again after the denials'); assert.doesNotMatch(c.profile, /\*:443/); assert.match(c.closed, /a gate passes its own service's hosts/);
  assert.deepEqual(proxyEnv('u').all_proxy, 'u');
  // nothing of the home folder, other users or other volumes can be listed or read in a gated session, save its own program, settings and toolbox
  const hid = seatbelt({ deny: [], write: ['/home/x/.gemini'], cwd: '/c', gated: true, readable: ['/home/x/venv'], hidden: ['/home/x', '/Users', '/Volumes'] });
  assert.match(hid, /\(deny file-read\* \(subpath "\/home\/x"\) \(subpath "\/Users"\) \(subpath "\/Volumes"\)\)\n\(allow file-read\* \(subpath "\/home\/x\/\.gemini"\)\)\n\(deny file-read\* file-write\*  \(regex #"\/unpaint-session-"\) \(regex #"\/unpaint-bench-"\)\)\n\(allow file-read\* file-write\* \(subpath "\/c"\)\)\n\(allow file-read\* \(subpath "\/home\/x\/venv"\)\)/);
  const g = sessionCall({ key: 'argon-m', cli: 'agy', id: 'm' }, { prompt: 'P', cwd: '/c', deny: [], gate: { url: 'u' }, toolbox, home: '/home/x' });
  assert.match(g.profile, /\(deny file-read\* \(subpath "\/home\/x"\)/);
});

test('a gated Claude session: the whole command under the profile with its own sandbox off, out only through the gate, of the home folder only its program and the login keychain', () => {
  const toolbox = { dir: '/tb', python: '/venv/bin/python', readable: ['/tb', '/venv'], env: { PATH: '/tb/bin:/bin' } };
  const c = sessionCall({ key: 'sonnet-m', cli: 'claude', id: 'claude-sonnet-5-5', effort: 'medium' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], gate: { url: 'http://127.0.0.1:9' }, toolbox, home: '/home/x' });
  assert.equal(c.cmd, 'sandbox-exec'); assert.equal(c.args[2], 'claude'); assert.equal(c.env.HTTPS_PROXY, 'http://127.0.0.1:9'); assert.equal(c.gated, true);
  assert.ok(c.args.includes('--dangerously-skip-permissions')); // headless, a permission prompt is a refusal: the harness's profile holds it
  assert.deepEqual(JSON.parse(c.args[c.args.indexOf('--settings') + 1]).sandbox, { enabled: false });
  assert.match(c.profile, /\(deny file-read\* \(subpath "\/home\/x"\)/); assert.match(c.profile, /\(allow file-read\* \(subpath "\/home\/x\/Library\/Keychains"\)\)/); assert.doesNotMatch(c.profile, /\.claude/);
  assert.deepEqual(c.signIn, ['/home/x/Library/Keychains']); assert.match(c.closed, /the model tool's own secret and list keychain entry names; accepted by the owner/);
  assert.ok(allowed('api.anthropic.com', PROVIDER_HOSTS.claude)); assert.ok(!allowed('mcp-proxy.anthropic.com', PROVIDER_HOSTS.claude));
});

test('a gated Codex session: the whole command under the profile, out only through the gate, of the home folder only its own folder, the user\'s settings not loaded', () => {
  const toolbox = { dir: '/tb', python: '/venv/bin/python', readable: ['/tb', '/venv'], env: { PATH: '/tb/bin:/bin' } };
  const c = sessionCall({ key: 'sol-m', cli: 'codex', id: 'gpt-6.1-sol', effort: 'medium' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], images: ['/c/inputs/source.png'], gate: { url: 'http://127.0.0.1:9' }, toolbox, home: '/home/x' });
  assert.equal(c.cmd, 'sandbox-exec'); assert.deepEqual(c.args.slice(2, 7), ['codex', 'exec', '--json', '-m', 'gpt-6.1-sol']); assert.deepEqual(c.args.slice(-2), ['--', 'P']);
  assert.ok(c.args.includes('model_reasoning_effort="medium"') && c.args.includes('--ignore-user-config') && c.args.includes('analytics.enabled=false') && c.args.includes('--dangerously-bypass-approvals-and-sandbox') && c.args.includes('--ephemeral'));
  assert.equal(c.env.HTTPS_PROXY, 'http://127.0.0.1:9'); assert.equal(c.env.PATH, '/tb/bin:/bin'); assert.equal(c.gated, true); assert.deepEqual(c.signIn, ['/home/x/.codex']);
  assert.doesNotMatch(c.profile, /\*:443|\*:53/); assert.match(c.profile, /\(allow network-outbound \(remote ip "localhost:\*"\)\)/);
  assert.match(c.profile, /\(deny file-read\* \(subpath "\/home\/x"\)/); assert.match(c.profile, /\(allow file-read\* \(subpath "\/home\/x\/\.codex"\)/); assert.doesNotMatch(c.profile, /Keychains/);
  assert.match(c.closed, /a gate passes its own service's hosts/);
  // without a gate (the check of an author before a run) it is the earlier open form, and says so
  const open = sessionCall({ key: 'sol-m', cli: 'codex', id: 'gpt-6.1-sol', effort: 'medium' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], home: '/home/x' });
  assert.match(open.profile, /remote tcp "\*:443"/); assert.ok(!open.args.includes('--ignore-user-config')); assert.match(open.closed, /reaches the network on port 443 only/);
});

test('a gated Muse session: the whole command under the profile with its own sandbox off, a session id of the harness\'s, its log named, the update off', () => {
  const toolbox = { dir: '/tb', python: '/venv/bin/python', readable: ['/tb', '/venv'], env: { PATH: '/tb/bin:/bin' } };
  const c = sessionCall({ key: 'wonderfull-m', cli: 'muse', id: 'muse-wonder-full-1.0', effort: 'medium' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], gate: { url: 'http://127.0.0.1:9' }, toolbox, home: '/home/x' });
  assert.equal(c.cmd, 'sandbox-exec'); assert.deepEqual(c.args.slice(2, 8), ['muse', 'exec', '--json', '--model', 'muse-wonder-full-1.0', '--effort']); assert.equal(c.args[8], 'medium'); assert.equal(c.args.at(-1), 'P');
  for (const f of ['--disable-sandbox', '--disable-approval', '--disable-web-tools', '--disable-reminders', '--no-foreign-personal-context']) assert.ok(c.args.includes(f), f);
  assert.equal(c.args[c.args.indexOf('--contributor-mode') + 1], 'off'); assert.equal(c.args[c.args.indexOf('--workspace') + 1], '/c');
  assert.ok(!c.args.includes('--max-model-steps') && !c.args.includes('--max-tool-output-bytes'), 'no step or output limit of the tool\'s is set: the harness counts the steps');
  const id = c.args[c.args.indexOf('--session-id') + 1]; assert.match(id, /^[0-9a-f-]{36}$/); assert.deepEqual(c.log, { root: '/home/x/.local/share/muse/sessions', id });
  assert.equal(c.env.MUSE_NO_AUTO_UPDATE, '1'); assert.equal(c.env.HTTPS_PROXY, 'http://127.0.0.1:9'); assert.equal(c.env.PATH, '/tb/bin:/bin'); assert.equal(c.gated, true);
  assert.deepEqual(c.signIn, ['/home/x/.config/muse', '/home/x/Library/Keychains']);
  assert.doesNotMatch(c.profile, /\*:443|\*:53/); assert.match(c.profile, /\(deny file-read\* \(subpath "\/home\/x"\)/);
  assert.match(c.profile, /\(allow file-write\* \(subpath "\/home\/x\/\.config\/muse"\) \(subpath "\/home\/x\/\.local\/share\/muse"\)/); assert.match(c.profile, /\(allow file-read\* \(subpath "\/home\/x\/Library\/Keychains"\)\)/);
  assert.doesNotMatch(c.profile, /\.claude|\.codex|\.gemini/); assert.match(c.closed, /its own sandbox and permission prompts off inside it.*a gate passes its own service's hosts/);
  assert.deepEqual(c.probe('/repo/x').args.slice(-2), ['/bin/cat', '/repo/x']);
});

test('each of the four commands has a gate, and each gate passes its own provider\'s hosts and no other\'s', () => {
  const own = { agy: ['daily-cloudcode-pa.googleapis.com', 'lh3.googleusercontent.com'], claude: ['api.anthropic.com'], codex: ['chatgpt.com', 'auth.openai.com', 'api.openai.com'], muse: ['api.meta.ai', 'auth.meta.com'] };
  assert.deepEqual(Object.keys(PROVIDER_HOSTS).sort(), ['agy', 'claude', 'codex', 'muse']);
  for (const [cli, hosts] of Object.entries(own)) {
    for (const h of hosts) assert.ok(allowed(h, PROVIDER_HOSTS[cli]), `${cli} reaches ${h}`);
    for (const [other, theirs] of Object.entries(own)) if (other !== cli) for (const h of theirs) assert.ok(!allowed(h, PROVIDER_HOSTS[cli]), `${cli} does not reach ${other}'s ${h}`);
    for (const h of ['pypi.org', 'registry.npmjs.org', 'github.com', 'example.com', `${hosts[0]}.evil.example`, ...(cli === 'agy' ? [] : [`evil-${hosts[0]}`, `x.${hosts[0]}`])]) assert.ok(!allowed(h, PROVIDER_HOSTS[cli]), `${cli} does not reach ${h}`);
  }
  // (agy's gate passes any host under googleapis.com and googleusercontent.com, as it did before)
  // codex and muse are held to the named hosts, not to a whole domain; muse's update download host is not passed
  for (const h of ['openai.com', 'cdn.openai.com', 'x.chatgpt.com', 'platform.openai.com']) assert.ok(!allowed(h, PROVIDER_HOSTS.codex), h);
  for (const h of ['meta.ai', 'meta.com', 'www.meta.ai', 'lookaside.facebook.com', 'facebook.com']) assert.ok(!allowed(h, PROVIDER_HOSTS.muse), h);
});

test('the command line itself parses (a name clash there passes every unit test and stops every run)', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  for (const f of ['cli.mjs', 'session.mjs', 'session-net.mjs', 'tool-use.mjs', 'look-cost.mjs']) execFileSync(process.execPath, ['--check', path.join(here, f)]);
});

test('the command line starts: a dry run of a model session and of a plan resolves everything and exits 0', t => {
  const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '..', '..');
  const run = args => { try { return { code: 0, out: execFileSync(process.execPath, [path.join(here, 'cli.mjs'), ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 120000 }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; } };
  const plan = run(['mittens-closeup', 'plan', '--dry-run']);
  if (plan.code !== 0 && /no subject list at|not registered|no such subject|registry/i.test(plan.out)) { t.skip('the subject list is not on this machine'); return; }
  // A list copied to a machine without the pictures: the record is found but none of its files are. Skipped only when
  // the source itself is absent and every complaint is a missing file; one file gone beside a present source fails.
  const faults = plan.out.split('\n').filter(l => /^ {2,}\S/.test(l) && !/^\s+at /.test(l)).map(l => l.trim());
  if (plan.code !== 0 && /inputs do not match the record/.test(plan.out) && faults.length && faults.every(l => l.startsWith('missing ')) && faults.some(l => l.startsWith('missing source: '))) {
    t.skip(`the subject's files are not on this machine (${faults.length} missing, the source among them)`); return;
  }
  assert.equal(plan.code, 0, plan.out.slice(-600)); assert.match(plan.out, /dry run: nothing was started/);
  const rounds = run(['mittens-closeup', 'paint', '--author', 'argon-m', '--level', 'L2', '--work', 'rounds', '--dry-run']);
  assert.equal(rounds.code, 0, rounds.out.slice(-600)); assert.match(rounds.out, /dry run: nothing was started/);
  assert.match(rounds.out, /fixed rounds.*level L2/); assert.doesNotMatch(rounds.out, /starts from the code planner's prepared plan/);
  const session = run(['mittens-closeup', 'paint', '--author', 'argon-m', '--level', 'L4', '--work', 'session', '--dry-run']);
  assert.equal(session.code, 0, session.out.slice(-600)); assert.match(session.out, /dry run: nothing was started/);
  assert.match(session.out, /level L4, try 1;.*it gets level 3's inputs/); assert.doesNotMatch(session.out, /starts from the code planner's prepared plan/);
});
