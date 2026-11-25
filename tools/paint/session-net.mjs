// A session's way out to the network, and its toolbox. The model's command reaches its own provider and nothing else:
// the seatbelt profile (session.mjs seatbelt) lets the whole process tree out only to this machine's loopback, and a
// small gate here, on loopback, passes a tunnel only to the provider's hosts (HTTPS_PROXY in the command's
// environment). Its shell inherits the same: a download, an install or a request to any other host is refused at the
// gate, and every refusal is kept with the host asked for, for usage.json. The toolbox: a fixed Python with its
// libraries, and shims that answer an install with a plain sentence.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROBE = "import sys, numpy, PIL, scipy, skimage, cv2; print(f'Python {sys.version.split()[0]} with numpy {numpy.__version__}, pillow {PIL.__version__}, scipy {scipy.__version__}, scikit-image {skimage.__version__} and opencv {cv2.__version__}')";

/** The hosts each model command needs to reach its own service (and nothing else is passed). */
export const PROVIDER_HOSTS = Object.freeze({
  agy: [/(^|\.)googleapis\.com$/, /(^|\.)googleusercontent\.com$/],
  claude: [/^api\.anthropic\.com$/],
  // codex, signed in with a ChatGPT account, asks chatgpt.com (measured without a model: under the session's profile
  // its model list is fetched there through the gate). auth.openai.com (where that sign-in is renewed) and
  // api.openai.com (asked when it is signed in with an API key) are read from the program's own text, not yet measured
  // in a session. A host it needs beyond these shows in the gate's refusals of its preflight.
  codex: [/^chatgpt\.com$/, /^auth\.openai\.com$/, /^api\.openai\.com$/],
  // muse: api.meta.ai is the service its sign-in file names (measured without a model: under the session's profile its
  // model list is answered through the gate by this host alone). auth.meta.com is where its launcher signs in, read
  // from the launcher, for a sign-in renewed in a session (not yet measured). Its update download host is left out:
  // the launcher's update is off in a session.
  muse: [/^api\.meta\.ai$/, /^auth\.meta\.com$/],
});

/** Whether `host` is one of `allow`. */
export const allowed = (host, allow) => allow.some(re => re.test(String(host).toLowerCase()));

/**
 * Start the gate on 127.0.0.1. `allow`: host patterns. Resolves {url, port, refused: [{host, port, at}], passed:
 * {host: count}, stop()}. A plain (non-tunnel) request is refused too: nothing goes out unencrypted.
 */
export function startGate(allow, { now = () => new Date().toISOString() } = {}) {
  const refused = [], passed = {}, open = new Set();
  const server = http.createServer((q, r) => { let host = q.headers.host ?? q.url; try { host = new URL(q.url).hostname; } catch { /* a relative url */ } refused.push({ host: String(host).slice(0, 200), port: null, at: now(), how: q.method }); r.writeHead(403, { 'content-type': 'text/plain' }); r.end(`${NO_NETWORK}\n`); });
  server.on('connect', (q, sock, head) => {
    sock.on('error', () => sock.destroy()); // a client that hangs up on a refusal ends only its own socket
    const at = String(q.url).lastIndexOf(':'), host = at > 0 ? q.url.slice(0, at) : q.url, port = Number(at > 0 ? q.url.slice(at + 1) : 443) || 443;
    if (!allowed(host, allow) || port !== 443) { refused.push({ host: host.slice(0, 200), port, at: now(), how: 'CONNECT' }); sock.end(`HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\n${NO_NETWORK}\n`); return; }
    passed[host] = (passed[host] ?? 0) + 1;
    const up = net.connect(port, host, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) up.write(head); up.pipe(sock); sock.pipe(up); });
    open.add(up); open.add(sock); const end = () => { up.destroy(); sock.destroy(); open.delete(up); open.delete(sock); };
    up.on('error', end); sock.on('error', end); up.on('close', end); sock.on('close', end);
  });
  server.on('clientError', (e, sock) => sock.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); resolve({ url: `http://127.0.0.1:${port}`, port, refused, passed, stop: () => new Promise(done => { for (const s of open) s.destroy(); server.close(() => done()); }) }); });
  });
}

export const NO_NETWORK = 'This session has no network: only the model\'s own service is reached. Nothing can be downloaded or installed; the tools listed in README.md ("Tools") are all there is.';
const NO_INSTALL = 'Installing software is not part of this session: nothing can be downloaded or installed. The tools listed in README.md ("Tools") are all there is.';
/** Commands that install software, answered by a shim with a plain sentence and exit 1. */
export const INSTALLERS = Object.freeze(['pip', 'pip3', 'npm', 'npx', 'pnpm', 'yarn', 'brew', 'conda', 'mamba', 'uv', 'pipx', 'gem', 'cargo', 'easy_install']);

/**
 * The session's toolbox in a folder of its own outside the session's folder: `bin/python3` and `bin/python` run
 * `python` (the fixed Python with its libraries), and each installer is a shim. Returns {dir, bin, env}: `env` puts
 * `bin` first on PATH and turns pip's own index off. Throws when `python` is not there: no silent fallback.
 */
export function makeToolbox(python, { tmp = os.tmpdir(), pathNow = process.env.PATH ?? '/usr/bin:/bin' } = {}) {
  if (!python || !fs.existsSync(python)) throw new Error(`the session's toolbox needs its Python (${python ?? 'not set'}): set PAINTER_SEG_PYTHON to a Python with numpy, pillow, scipy, scikit-image and opencv`);
  let said; try { said = execFileSync(python, ['-c', PROBE], { encoding: 'utf8', timeout: 60000 }).trim(); } catch (e) { throw new Error(`the session's toolbox Python (${python}) lacks a library it must have (numpy, pillow, scipy, scikit-image, opencv): ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
  const dir = fs.mkdtempSync(path.join(tmp, 'unpaint-toolbox-')), bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const put = (name, body) => { fs.writeFileSync(path.join(bin, name), body); fs.chmodSync(path.join(bin, name), 0o755); };
  for (const p of ['python3', 'python']) put(p, `#!/bin/sh\nfor a in "$@"; do case "$a" in pip|ensurepip) echo ${JSON.stringify(NO_INSTALL)} >&2; exit 1;; esac; done\nexec ${JSON.stringify(python)} "$@"\n`);
  for (const i of INSTALLERS) put(i, `#!/bin/sh\necho ${JSON.stringify(NO_INSTALL)} >&2\nexit 1\n`);
  // a shell started inside reads its start-up files from here, not the user's (whose own PATH would put other Pythons and npm first)
  const first = `# the session's toolbox first on PATH\nexport PATH=${JSON.stringify(bin)}:"$PATH"\n`;
  for (const f of ['.zshenv', '.zprofile', '.zshrc', 'bashenv']) fs.writeFileSync(path.join(dir, f), first);
  // what the Python reads to run: its venv, and the interpreter the venv stands on (its real place and the one pyvenv.cfg names)
  const venv = path.dirname(path.dirname(python)), real = fs.realpathSync(python), cfg = (() => { try { return /^home\s*=\s*(.+)$/m.exec(fs.readFileSync(path.join(venv, 'pyvenv.cfg'), 'utf8'))?.[1].trim(); } catch { return null; } })();
  const readable = [...new Set([dir, venv, fs.realpathSync(venv), path.dirname(path.dirname(real)), ...(cfg ? [path.dirname(cfg)] : [])])];
  return { dir, bin, python, said, readable, env: { PATH: `${bin}:${pathNow}`, ZDOTDIR: dir, BASH_ENV: path.join(dir, 'bashenv'), ENV: path.join(dir, 'bashenv'), PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONNOUSERSITE: '1' } };
}

/** The proxy variables a command and its children read, for the gate at `url`; loopback is left direct. */
export const proxyEnv = url => ({ HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, ALL_PROXY: url, all_proxy: url, NO_PROXY: 'localhost,127.0.0.1,::1', no_proxy: 'localhost,127.0.0.1,::1' });

/** The README's "Tools" paragraph: for a closed session (`python`: its version and libraries, as said), or for one without a toolbox. */
export const toolsText = python => `Your shell has \`python3\` (${python}) and \`node\`, and the usual command-line tools of macOS. That is the whole toolbox: this session has no network beyond the model's own service, so nothing can be downloaded or installed (\`pip\`, \`npm\` and the like answer so, and every try is recorded).`;
export const TOOLS_OPEN = 'Your shell has the command-line tools of this machine.';
