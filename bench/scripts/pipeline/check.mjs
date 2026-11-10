#!/usr/bin/env node
// The admission check for a V4 or V5 plan: the refusals before any painting (plan-args.mjs), then the painter's
// planning step (value plan, no painting) at the full painting width, which catches plans the painter cannot paint
// (for example straight reserve or region edges that no target edge supports). The model runs it as
// `bash bench/check.sh`; the harness runs the same check before it paints. The last line is ADMITTED or REFUSED.
//
// This file is copied into the model's worktree as bench/check.mjs, next to plan-args.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePlan } from './plan-args.mjs';
import { readPreview, writePreviewCompare, previewText } from './preview.mjs';

/** Pigments the painter will paint with, from its planning log: the palette in order plus the drawing inks. */
function paletteOf(log) {
  const lines = log.split('\n');
  let names = [], inks = [], at = false;
  for (const l of lines) {
    if (l.startsWith('palette: ') && l.includes(' pigments')) { at = true; names = []; continue; }
    if (at && l.startsWith('  ') && l.includes(': K ')) { names.push(l.split(': K ')[1].split(' ').slice(1).join(' ').trim()); continue; }
    at = false;
    if (l.startsWith('drawing material profiles: ')) {
      try { const d = JSON.parse(l.slice('drawing material profiles: '.length)); inks = Object.entries(d).map(([k, v]) => `${k}=${v?.pigment?.name}`).sort(); } catch { /* not JSON */ }
    }
  }
  return names.length ? { palette: names, inks } : null;
}

/**
 * The planning step: paint-plate with the plan's args and --valuepreviewonly. `passed` is the value plan being made (the
 * plan is paintable); the step then goes on to write the CPU plan preview and exits by itself. previewSeconds is the
 * time from the value plan to that exit.
 */
function planningStep({ repo, args, logFile, timeoutMs }) {
  return new Promise(resolve => {
    fs.writeFileSync(logFile, '');
    const child = spawn(process.execPath, args, { cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '', passed = false, passedAt = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const take = b => { const s = b.toString(); log += s; fs.appendFileSync(logFile, s); if (!passed && /^target values: /m.test(log)) { passed = true; passedAt = Date.now(); } };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('close', code => { clearTimeout(timer); resolve({ passed, code, log, previewSeconds: passed ? +((Date.now() - passedAt) / 1000).toFixed(1) : 0 }); });
  });
}

/**
 * Check a plan. spec: {width, sheetmm}. Returns {ok, failures, refusal, args, layering, palette, variant}.
 * repo: the tree whose painter runs the planning step; work: a scratch folder for its output.
 */
export async function checkPlan({ repo, spec, planDir, variant, target, work, timeoutMs = 15 * 60 * 1000 }) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const plan = resolvePlan({ spec, planDir, variant, target, out: path.join(work, 'out'), compile: true });
  const failures = plan.problems.map(reason => ({ code: 4, reason }));
  let palette = null, preview = null, previewSeconds = 0;
  const t0 = Date.now();
  if (!failures.length) {
    const r = await planningStep({ repo, args: plan.args, logFile: path.join(work, 'planning.log'), timeoutMs });
    palette = paletteOf(r.log);
    if (!r.passed) {
      const err = r.log.split('\n').find(l => /^(Error|[A-Za-z]*Error)[: ]/.test(l)) || `the planning step exited ${r.code} without a value plan`;
      failures.push({ code: 4, reason: 'the painter refused the plan: ' + err.trim() });
      try {
        const seams = JSON.parse(fs.readFileSync(path.join(work, 'out', 'value-region-check.json'), 'utf8')).band1UnsupportedAxisEdges || [];
        if (seams.length) failures.push({ code: 4, reason: 'straight edges with no target edge under them (value-plan cells): ' + JSON.stringify(seams.slice(0, 8)) });
      } catch { /* no region check written */ }
    } else {
      // an admitted plan always has its CPU preview; a step that made the plan and not the preview is a failure, not a plan without one
      previewSeconds = r.previewSeconds;
      try {
        const out = path.join(work, 'out'), found = readPreview(out), compare = path.join(work, 'preview.jpg');
        await writePreviewCompare({ target: path.resolve(repo, target), ledger: found.ledger, dest: compare });
        preview = { report: found.report, compare: path.relative(repo, compare) || compare, text: null };
        preview.text = previewText({ report: found.report, compare: preview.compare });
      } catch (e) { failures.push({ code: 4, reason: `the plan preview failed: ${e.message}` }); }
    }
  }
  return {
    ok: failures.length === 0, failures, refusal: failures.map(f => f.reason), variant: plan.variant,
    args: plan.args, layering: plan.layering, palette, preview, seconds: +((Date.now() - t0) / 1000).toFixed(1), previewSeconds,
  };
}

/**
 * The spec the model's own `bash bench/check.sh` plans with. Its worktree has the benchmark's tracked files removed by the
 * harness, so the painter's dirty-tree refusal would turn every check away; the planning step paints nothing, and the
 * dirty state is still written to code-state.json. The harness's own admission check runs in the clean repository
 * and keeps the refusal.
 */
export const modelCheckSpec = frozen => ({ ...frozen, offlineFixture: true });

// CLI, from the worktree root: node bench/check.mjs (bash bench/check.sh)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const frozen = JSON.parse(fs.readFileSync(path.join(root, 'bench', 'frozen.json'), 'utf8'));
  const vf = path.join(root, 'bench', 'variant.txt');
  const variant = (fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8') : '').replace(/\s+/g, '') || 'region_w13';
  const r = await checkPlan({ repo: root, spec: modelCheckSpec(frozen), planDir: 'bench/plan', variant, target: 'bench/plan/target.png', work: 'bench/check-out' });
  console.log(JSON.stringify({ ok: r.ok, failures: r.failures, args: r.args, layering: r.layering, palette: r.palette }, null, 1));
  if (r.preview) console.log(r.preview.text);
  fs.appendFileSync(path.join('bench', 'check-log.jsonl'), JSON.stringify({ ok: r.ok, seconds: r.seconds, previewSeconds: r.previewSeconds }) + '\n');
  console.log(r.ok ? 'ADMITTED' : `REFUSED: ${r.refusal.join('; ')}`);
  process.exit(r.ok ? 0 : 4);
}
