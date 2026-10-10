#!/usr/bin/env node
// The painter, from your side: bash bench/paint.sh <command>. Commands: start, wait, look, next, run <pass>|closing,
// finish, revise [then next|run <pass>|run closing|finish], status. Each command is a request to the harness (files in
// bench/paint-io/); the answer is printed. Commands that wait for the painter return within about two minutes; if the
// painter is still working, the answer says so and `bash bench/paint.sh wait` continues waiting.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname), io = path.join(here, 'paint-io');
fs.mkdirSync(io, { recursive: true });
const [cmd = 'status', ...args] = process.argv.slice(2);
const KNOWN = ['start', 'wait', 'look', 'next', 'run', 'finish', 'revise', 'status', 'help'];
if (!KNOWN.includes(cmd)) { console.log(`unknown command "${cmd}". Commands: ${KNOWN.join(', ')}`); process.exit(2); }
if (cmd === 'help') { console.log(fs.readFileSync(path.join(here, 'PAINT.md'), 'utf8')); process.exit(0); }
const seqFile = path.join(io, 'seq');
let seq = 1; try { seq = Number(fs.readFileSync(seqFile, 'utf8')) + 1; } catch { /* first request */ }
fs.writeFileSync(seqFile, String(seq));
const req = { seq, cmd, args, t: new Date().toISOString() };
fs.writeFileSync(path.join(io, `req-${seq}.json.tmp`), JSON.stringify(req));
fs.renameSync(path.join(io, `req-${seq}.json.tmp`), path.join(io, `req-${seq}.json`));
const res = path.join(io, `res-${seq}.json`), t0 = Date.now(), LIMIT = 100 * 1000;
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (;;) {
  if (fs.existsSync(res)) {
    let r = null; try { r = JSON.parse(fs.readFileSync(res, 'utf8')); } catch { sleep(200); continue; }
    console.log(r.text);
    process.exit(r.exit ?? 0);
  }
  if (Date.now() - t0 > LIMIT) { console.log('No answer yet (the harness is busy). Run `bash bench/paint.sh wait` to keep waiting, or `bash bench/paint.sh status`.'); process.exit(0); }
  sleep(500);
}
