// Level 1's model command is closed as a level 2 to 4 session is (pipeline/closed.mjs). Real processes under the real
// profile, a real gate on loopback, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REPO } from './lib.mjs';
import { closeTurn, closable, probe } from './pipeline/closed.mjs';
import { runTurn } from './pipeline/harness.mjs';
import { segPythonFor } from '../../tools/paint/run.mjs';

const PY = segPythonFor(REPO);
const skip = process.platform !== 'darwin' ? 'the profile is macOS seatbelt' : !fs.existsSync(PY) ? `the toolbox's Python is not at ${PY} (set PAINTER_SEG_PYTHON)` : false;

test('a runner whose service the gate does not know is refused, never started open', () => {
  for (const r of ['claude', 'agy', 'dry-run']) assert.doesNotThrow(() => closable(r));
  for (const r of ['codex', 'muse', 'together']) assert.throws(() => closable(r), new RegExp(`the ${r} runner has no gate yet.*It is not started open`));
});

test('a closed level 1 turn reads and writes its own folder, and nothing of the repository, the home folder or another attempt', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-')), other = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-')), ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(ws, 'bench'), { recursive: true }); fs.writeFileSync(path.join(ws, 'bench', 'BRIEF.md'), 'brief'); fs.writeFileSync(path.join(other, 'theirs.txt'), 'x');
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
  const turn = await closeTurn({ cmd: '/bin/sh', args: ['-c', 'true'], env: { FROM_TURN: '1' } }, { runner: 'dry-run', tmp, extraEnv: { BENCH_SEED: '1' }, env: { ...process.env, CLAUDECODE: '1', SECRET_OF_THE_OPERATOR: 'x', UNPAINT_SESSION_DENY: '' } });
  try {
    assert.equal(turn.cmd, 'sandbox-exec'); assert.deepEqual(turn.args.slice(2), ['/bin/sh', '-c', 'true']);
    // the environment: what a command line needs, the turn's own, the gate and the toolbox; nothing else of the operator's
    assert.equal(turn.env.SECRET_OF_THE_OPERATOR, undefined); assert.equal(turn.env.CLAUDECODE, undefined);
    assert.equal(turn.env.BENCH_SEED, '1'); assert.equal(turn.env.FROM_TURN, '1'); assert.match(turn.env.HTTPS_PROXY, /^http:\/\/127\.0\.0\.1:\d+$/); assert.match(turn.env.PATH, /unpaint-toolbox-/);
    const run = (cmd, ...a) => spawnSync('sandbox-exec', ['-p', turn.profile, cmd, ...a], { cwd: ws, env: turn.env, encoding: 'utf8', timeout: 60000 });
    const ok = (cmd, ...a) => run(cmd, ...a).status === 0;
    assert.doesNotThrow(() => probe(turn, { ownFile: path.join(ws, 'bench', 'BRIEF.md') }), 'the probe the runner makes before the model starts');
    assert.equal(ok('/bin/cat', path.join(ws, 'bench', 'BRIEF.md')), true, 'its brief is read');
    assert.equal(ok('/usr/bin/touch', path.join(ws, 'bench', 'mine.mjs')), true, 'its folder is written');
    assert.equal(ok('/bin/cat', path.join(REPO, 'package.json')), false, 'a file of the repository is not read');
    assert.equal(ok('/bin/cat', path.join(REPO, 'bench', 'v3', 'crops.json')), false, 'the benchmark\'s own files are not read');
    assert.equal(ok('/bin/ls', os.homedir()), false, 'the home folder is not listed');
    assert.equal(ok('/bin/cat', path.join(other, 'theirs.txt')), false, 'another attempt\'s folder is not read');
    assert.equal(ok('/usr/bin/touch', path.join(REPO, 'bench', 'x.tmp')), false, 'nothing is written in the repository');
    // what level 1 needs: node, the node modules the kit imports (through the worktree's link), the toolbox's Python
    const node = run(process.execPath, '--input-type=module', '-e', 'import sharp from "sharp"; import fs from "node:fs"; fs.writeFileSync("bench/out.txt", typeof sharp); console.log("painted")');
    assert.equal(node.status, 0, node.stderr); assert.match(node.stdout, /painted/);
    assert.match(run('/bin/sh', '-c', 'python3 -c "import numpy, PIL; print(\'py ok\')"').stdout, /py ok/);
    assert.notEqual(run('/bin/sh', '-c', 'pip install requests').status, 0, 'an install is answered by the toolbox, not run');
    // the network: an outside host is refused at the gate and recorded; around the gate nothing leaves at all
    // (the gate answers in this process, so the request is made without blocking it)
    const asked = await new Promise(done => spawn('sandbox-exec', ['-p', turn.profile, '/usr/bin/curl', '-sS', '-m', '10', 'https://example.com/'], { cwd: ws, env: turn.env, stdio: 'ignore' }).on('close', done));
    assert.notEqual(asked, 0);
    assert.deepEqual(turn.gate.refused.map(r => r.host), ['example.com']);
    assert.notEqual(run('/usr/bin/curl', '-sS', '-m', '5', '--noproxy', '*', 'https://1.1.1.1/').status, 0, 'no way out around the gate');
    // a probe that finds the repository readable stops the run
    assert.throws(() => probe({ can: () => true }, { ownFile: 'x' }), /does not hold/); assert.throws(() => probe({ can: () => false }, { ownFile: 'x' }), /cannot be started/);
    // through the harness: the turn's output is piped to files that lie where the turn itself may not read
    const logs = fs.mkdtempSync(path.join(REPO, 'bench', 'closed-test-')), events = path.join(logs, 'events.jsonl'), stderr = path.join(logs, 'stderr.log');
    try {
      const said = await closeTurn({ cmd: process.execPath, args: ['-e', 'console.log("to the log"); console.error("and the other")'] }, { runner: 'dry-run', tmp });
      const r = await runTurn(said, { cwd: ws, env: said.env, base: {}, piped: true, events, stderr, capMs: 60000 }); await said.done();
      assert.equal(r.code, 0); assert.equal(fs.readFileSync(events, 'utf8'), 'to the log\n'); assert.equal(fs.readFileSync(stderr, 'utf8'), 'and the other\n');
    } finally { fs.rmSync(logs, { recursive: true, force: true }); }
  } finally { const net = await turn.done(); assert.equal(net.gated, true); assert.equal(net.refused.length, 1); for (const d of [tmp, other]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a closed claude turn has its own sandbox off, no user settings and no kept session; an agy turn its settings folder', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-'));
  try {
    const claude = await closeTurn({ cmd: 'claude', args: ['-p', '--model', 'm'] }, { runner: 'claude', tmp, home: '/home/x' }); await claude.done();
    assert.deepEqual(claude.args.slice(2, 6), ['claude', '-p', '--model', 'm']); assert.ok(claude.args.includes('--no-session-persistence'));
    assert.equal(claude.args[claude.args.indexOf('--setting-sources') + 1], 'project'); assert.deepEqual(JSON.parse(claude.args[claude.args.indexOf('--settings') + 1]), { sandbox: { enabled: false } });
    assert.match(claude.profile, /\(deny file-read\* \(subpath "\/home\/x"\)/); assert.match(claude.profile, /\(allow file-read\* \(subpath "\/home\/x\/Library\/Keychains"\)\)/); assert.match(claude.closed, /passes its own service's hosts/);
    const agy = await closeTurn({ cmd: 'agy', args: ['-p', 'P'] }, { runner: 'agy', tmp, home: '/home/x' }); await agy.done();
    assert.match(agy.profile, /\(allow file-write\* \(subpath "\/home\/x\/\.gemini"\)/); assert.match(agy.profile, /Application Support\/antigravity/); assert.equal(agy.env.DO_NOT_TRACK, '1');
    await assert.rejects(() => closeTurn({ cmd: 'codex', args: [] }, { runner: 'codex', tmp }), /no gate yet/);
    await assert.rejects(() => closeTurn({ cmd: 'x', args: [] }, { runner: 'dry-run', tmp, python: '/no/such/python' }), /toolbox needs its Python/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
