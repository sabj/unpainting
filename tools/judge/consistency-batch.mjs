#!/usr/bin/env node
// One iteration of the ink/wash consistency test over several subjects: the painter's CPU plan preview (planned wash,
// no ink) and then tools/judge/ink-wash-consistency.mjs on each. Planning only; nothing is painted.
//
//   node tools/judge/consistency-batch.mjs --iter it1 --targets DIR --lines DIR --plan plan.json \
//     --subjects h36a,guardi,h36 --out ROOT [--planargs "--bandround 1 --washinkfree 1"] [--note "what changed"]
//
// Writes ROOT/<iter>/<subject>/{plan/,metrics.json,*.png} and ROOT/<iter>/card.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const need = k => { const v = opt(k); if (!v) throw Error(`--${k} is required`); return v; };

// The line study's shared drawing and wash conditions (work/lines/REPORT.md), unchanged.
const SHARED = ['--drawing', 'first', '--outlinemedium', 'ink', '--inkprofile', 'black-ink', '--inkconc', '12',
  '--width', '720', '--mode', 'fast', '--video', '0', '--targetguard', 'strict', '--paperlights', '0', '--paperrel', '0'];

const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

function main() {
  const iter = need('iter'), targets = need('targets'), lines = need('lines'), plan = need('plan'), outRoot = need('out');
  const subjects = need('subjects').split(','), extra = (opt('planargs', '') || '').split(' ').filter(Boolean);
  const dir = path.join(outRoot, iter);
  fs.mkdirSync(dir, { recursive: true });
  const card = {
    iter, note: opt('note', ''), branch: git(['rev-parse', '--abbrev-ref', 'HEAD']), sha: git(['rev-parse', '--short', 'HEAD']),
    dirty: git(['status', '--porcelain', '--untracked-files=no']) !== '',
    sim: 'CPU marks-only plan preview (tools/painter/value-plan-preview.mjs); no physics, no GPU',
    planSource: `${path.basename(plan)} (${fs.readFileSync(plan, 'utf8').trim()})`, lines: path.resolve(lines),
    prep: 'targets as sent to the line study (work/lines/send/targets); lines from tools/seg/sketch-lines.py with the study maps',
    settings: [...SHARED, ...extra].join(' '), date: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'card.json'), JSON.stringify(card, null, 2));
  for (const s of subjects) {
    const target = path.join(targets, `${s}.png`), base = path.join(lines, s), sd = path.join(dir, s), planDir = path.join(sd, 'plan');
    fs.mkdirSync(planDir, { recursive: true });
    const log = execFileSync('node', [path.join(root, 'tools/paint-plate.mjs'), '--image', target, '--valueplan', plan, '--valuepreviewonly', '1',
      '--drawingfile', base, ...SHARED, ...extra, '--out', planDir], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    fs.writeFileSync(path.join(planDir, 'plan.log'), log);
    const result = execFileSync('node', [path.join(root, 'tools/judge/ink-wash-consistency.mjs'), '--original', target,
      '--wash', path.join(planDir, 'planned-wash.png'), '--lines', `${base}-lines.json`, '--out', sd,
      '--card', path.join(dir, 'card.json')], { cwd: root, encoding: 'utf8' });
    console.log(`${iter} ${s}: ${result.trim()}`);
    // keep the iteration light: drop the plan's stage boards and path dumps, keep the wash and the logs
    for (const f of fs.readdirSync(planDir)) if (/stage-\d|compile-lighttodark.*\.png$|value-compiled-paths|value-shaped-paths/.test(f)) fs.rmSync(path.join(planDir, f));
  }
}

main();
