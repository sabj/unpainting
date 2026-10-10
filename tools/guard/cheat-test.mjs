#!/usr/bin/env node
// Deliberate-cheat test of the default painter path. Paints a small plate with tools/paint-plate.mjs in its default
// guard mode, with tools/guard/cheat-inject.mjs loaded into the same process. The injected code tries to read the target
// file four ways while the painter is painting. The test passes when every attempt is blocked and the painter's
// target-guard.json records them.
//
//   node tools/guard/cheat-test.mjs [--image examples/targets/white-ships.jpg] [--width 160] [--out work/cheat-test]
//   exit 0 when every attempt was blocked and recorded, 1 otherwise
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const image = path.resolve(root, opt('image', 'examples/targets/white-ships.jpg'));
const out = path.resolve(root, opt('out', 'work/cheat-test'));
const width = opt('width', '160');
if (!fs.existsSync(image)) { console.error(`cheat-test: no image at ${image}`); process.exit(2); }
if (fs.existsSync(out)) fs.rmSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(root, 'work', '.cheat-scratch-'));

const args = ['--import', path.join(root, 'tools/guard/cheat-inject.mjs'), path.join(root, 'tools/paint-plate.mjs'),
  '--image', image, '--width', width, '--mode', 'fast', '--out', out];
console.log(`cheat-test: node ${args.map(a => path.relative(root, a) || a).join(' ')}`);
const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, CHEAT_TARGET: image, CHEAT_SCRATCH: scratch }, maxBuffer: 1 << 28 });
fs.rmSync(scratch, { recursive: true, force: true });
const lines = `${run.stdout}\n${run.stderr}`.split('\n');
const cheats = lines.filter(l => l.startsWith('cheat: '));
cheats.forEach(l => console.log(l));
for (const l of lines.filter(l => /^(target guard|cheat risk)/.test(l))) console.log(`painter: ${l}`);

const blocked = cheats.filter(l => l.startsWith('cheat: blocked')).length;
const missed = cheats.filter(l => l.includes('NOT BLOCKED')).length;
const reportFile = path.join(out, 'target-guard.json');
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
const failures = [];
if (run.status !== 0) failures.push(`the painter exited with ${run.status}`);
if (blocked !== 4) failures.push(`${blocked} of 4 attempts blocked`);
if (missed) failures.push(`${missed} attempts not blocked`);
if (!report) failures.push('no target-guard.json');
else {
  if (report.mode !== 'gentle') failures.push(`guard mode was ${report.mode}, not the default gentle`);
  if (report.blockedAttempts < 1) failures.push('target-guard.json records no blocked attempt');
  console.log(`target-guard.json: mode ${report.mode}, category ${report.category}, ${report.blockedAttempts} blocked attempts (${(report.records ?? []).map(r => r.detail).join(', ')})`);
}
console.log(failures.length ? `cheat-test: FAIL (${failures.join('; ')})` : 'cheat-test: pass, every attempt was blocked and recorded');
process.exit(failures.length ? 1 : 0);
