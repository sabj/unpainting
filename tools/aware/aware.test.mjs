// Stops and take-over (pause.mjs, state-io.mjs, --pausedir and --resumestate in tools/paint-plate.mjs): saved state
// round-trips, and a painting saved at a boundary and taken over by a fresh process ends as the same picture as one
// painted without a break.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { writeState, readState } from './state-io.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('saved state round-trips typed arrays, shared references, Sets, Maps and special numbers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aware-state-'));
  const a = Float32Array.from([1, 2, 3]), z = new Uint8Array(1000);
  const v = { a, again: a, z, nested: [{ s: new Set([1, 'x']), m: new Map([['k', Int16Array.from([-2, 5])]]) }], nan: NaN, inf: -Infinity, u: undefined, f: () => 1 };
  const r = writeState(dir, v);
  assert.equal(r.zeros, 1);
  const back = readState(dir);
  assert.deepEqual([...back.a], [1, 2, 3]);
  assert.equal(back.again, back.a);
  assert.equal(back.z.length, 1000);
  assert.ok(back.nested[0].s.has('x'));
  assert.deepEqual([...back.nested[0].m.get('k')], [-2, 5]);
  assert.ok(Number.isNaN(back.nan));
  assert.equal(back.inf, -Infinity);
  assert.ok('u' in back && back.u === undefined);
  assert.ok(!('f' in back));
  fs.rmSync(dir, { recursive: true, force: true });
});

const ARGS = ['tools/paint-plate.mjs', '--recipe', 'none', '--image', 'bench/v2/targets/hills.png', '--width', '64', '--scale', '1', '--sheetmm', '80', '--palettewide', '1',
  '--physical', '1', '--order', 'painter', '--shapedmarks', '1', '--midlayers', '2', '--touchpoints', '1', '--drawing', 'both', '--outlinemedium', 'ink', '--texture', '0',
  '--mode', 'fast', '--marks', '1', '--video', '0', '--targetguard', 'gentle', '--seed', '0', '--gpu', 'off'];
const run = (args, log) => new Promise(resolve => {
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'a')] });
  p.on('close', resolve);
});
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v));

test('a painting saved at a passage boundary and taken over by a fresh process ends identical', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aware-identity-'));
  const A = path.join(work, 'a'), B = path.join(work, 'b'), pa = path.join(work, 'pa'), pb = path.join(work, 'pb');
  fs.mkdirSync(pa); writeJson(path.join(pa, 'control.json'), { stopAt: 'end', seq: 1 });
  assert.equal(await run([...ARGS, '--out', A, '--pausedir', pa], path.join(work, 'a.log')), 0);
  // B: stop at boundary 2, save and exit 75, then a fresh process takes the painting over
  fs.mkdirSync(pb); writeJson(path.join(pb, 'control.json'), { stopAt: 2, seq: 1 });
  const answer = setInterval(() => {
    for (const f of fs.readdirSync(pb)) { const m = /^offer-(.+)\.json$/.exec(f); if (m && !fs.existsSync(path.join(pb, `go-${m[1]}.json`))) writeJson(path.join(pb, `go-${m[1]}.json`), { action: 'save-exit' }); }
  }, 50);
  const first = await run([...ARGS, '--out', B, '--pausedir', pb], path.join(work, 'b1.log'));
  clearInterval(answer);
  assert.equal(first, 75, fs.readFileSync(path.join(work, 'b1.log'), 'utf8').slice(-800));
  const saved = JSON.parse(fs.readFileSync(path.join(pb, 'saved.json'), 'utf8'));
  assert.equal(saved.at.kind, 'pass');
  writeJson(path.join(pb, 'control.json'), { stopAt: 'end', seq: 2 });
  assert.equal(await run([...ARGS, '--out', B, '--pausedir', pb, '--resumestate', saved.dir], path.join(work, 'b2.log')), 0, fs.readFileSync(path.join(work, 'b2.log'), 'utf8').slice(-800));
  const [a, b] = await Promise.all([A, B].map(d => sharp(path.join(d, 'painting.png')).raw().toBuffer()));
  assert.ok(a.equals(b), 'the paintings differ');
  for (const f of ['marks.json', 'frames.json']) assert.equal(fs.readFileSync(path.join(A, f), 'utf8'), fs.readFileSync(path.join(B, f), 'utf8'), f);
  fs.rmSync(work, { recursive: true, force: true });
});
