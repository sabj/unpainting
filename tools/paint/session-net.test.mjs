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
  const toolbox = { dir: '/tb', python: '/venv/bin/python', env: { PATH: '/tb/bin:/bin', ZDOTDIR: '/tb' } };
  const c = sessionCall({ key: 'argon-m', cli: 'agy', id: 'm' }, { prompt: 'P', cwd: '/c', deny: ['/repo'], gate: { url: 'http://127.0.0.1:9' }, toolbox });
  assert.equal(c.env.HTTPS_PROXY, 'http://127.0.0.1:9'); assert.equal(c.env.NO_PROXY, 'localhost,127.0.0.1,::1'); assert.equal(c.env.PATH, '/tb/bin:/bin'); assert.equal(c.gated, true);
  assert.match(c.profile, /\(allow file-read\* \(subpath "\/venv"\)\)/, 'the toolbox Python\'s folder is read again after the denials'); assert.doesNotMatch(c.profile, /\*:443/); assert.match(c.closed, /a gate passes its own service's hosts/);
  assert.deepEqual(proxyEnv('u').all_proxy, 'u');
});
