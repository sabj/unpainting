#!/usr/bin/env node
// Summarize explicitly paired, warmed GPU cards. Never accept CPU fallback,
// mismatched paper/physics, incomplete drys, or a single lucky timing.
// node tools/lab/fibre-runtime.mjs pairs.json > runtime.json
// pairs.json: { warmup: { before: "dir", after: "dir" }, pairs: [same shape, ...] }
// Paths are relative to the manifest. The discarded warmup is checked too.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const MATCH_KEYS = ['kind', 'adapter', 'seed', 'mmPerCell', 'sizeMm', 'w', 'h', 'pigments', 'O', 'dryOptions'];

function validRun(run) {
  if (run.playback) throw new Error('runtime proof excludes observed playback runs');
  if (run.backend !== 'gpu' || run.fallback !== false) throw new Error('runtime proof requires GPU and fallback:false');
  const info = run.adapter?.adapterInfo;
  if (!info || !Object.values(info).some(v => typeof v === 'string' && v.trim())) throw new Error('runtime proof needs recorded adapter identity');
  if (/swiftshader|llvmpipe|lavapipe|software/i.test(Object.values(info).join(' '))) throw new Error('runtime proof needs a hardware GPU adapter');
  if (!/^[a-f0-9]{40}$/.test(run.commit)) throw new Error('runtime proof needs the full commit');
  if (!(run.paintSeconds > 0) || !Number.isFinite(run.paintSeconds)) throw new Error('runtime proof needs a finite painting time');
  if (!Number.isSafeInteger(run.w) || run.w <= 0 || run.h !== run.w || run.sourceWidth !== run.w || run.paintedWidth !== run.w || run.sourcescale !== 1) throw new Error('runtime proof requires native source scale');
  if (!Number.isSafeInteger(run.seed) || !(run.mmPerCell >= 0.05 && run.mmPerCell <= 1) || !(run.sizeMm > 0) || Math.round(run.sizeMm / run.mmPerCell) !== run.w) throw new Error('runtime proof needs physical paper dimensions and seed');
  if (!run.O || !run.pigments?.length || !run.dryOptions) throw new Error('runtime proof needs recorded materials and solver options');
  if (run.checks?.strict !== true || run.checks.total !== 0) throw new Error('runtime proof cannot include continued physics checks');
  const expected = { bloom: 1, landscape: 3 }[run.kind];
  if (!expected || run.drys?.length !== expected || !run.frames?.includes('painting.png')) throw new Error('runtime proof needs every completed dry band and painting');
  for (const dry of run.drys) {
    if (!Number.isInteger(dry.steps) || dry.steps <= 0 || dry.steps >= 200000 || !(dry.seconds > 0) || !Number.isFinite(dry.seconds)) throw new Error('runtime proof has an incomplete dry');
    if (dry.pigmentErrors?.length !== run.pigments.length || dry.pigmentErrors.some(e => !Number.isFinite(e) || e < 0 || e > 1e-5)) throw new Error('runtime proof needs conserved pigment in every dry');
  }
}

export function checkRuntimePair(before, after) {
  validRun(before); validRun(after);
  if (before.commit === after.commit) throw new Error('runtime comparison needs different revisions');
  for (const key of MATCH_KEYS) {
    if (stable(before[key]) !== stable(after[key])) throw new Error(`runtime comparison changes ${key}`);
  }
  return after.paintSeconds / before.paintSeconds;
}

export function runtimeSummary(warmup, pairs) {
  if (!warmup || !Array.isArray(pairs) || pairs.length < 5) throw new Error('runtime proof needs a discarded warmup pair and at least five measured pairs');
  checkRuntimePair(warmup.before, warmup.after);
  const ratios = pairs.map(({ before, after }) => {
    checkRuntimePair(before, after);
    // No switching adapter, materials or revisions between timing samples.
    for (const [run, reference] of [[before, warmup.before], [after, warmup.after]]) {
      if (run.commit !== reference.commit) throw new Error('runtime samples mix revisions');
      for (const key of MATCH_KEYS) if (stable(run[key]) !== stable(reference[key])) throw new Error(`runtime samples change ${key}`);
    }
    return after.paintSeconds / before.paintSeconds;
  });
  const sorted = [...ratios].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  const ratio = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    criterion: 'median paired complete painting time, <=1% increase; warmup excluded',
    beforeCommit: warmup.before.commit, afterCommit: warmup.after.commit, kind: warmup.before.kind,
    adapter: warmup.before.adapter, seed: warmup.before.seed, mmPerCell: warmup.before.mmPerCell,
    samples: ratios.length, ratios,
    times: pairs.map(({ before, after }) => ({ before: before.paintSeconds, after: after.paintSeconds, beforeSteps: before.drys.map(d => d.steps), afterSteps: after.drys.map(d => d.steps) })),
    medianRatio: ratio, minRatio: sorted[0], maxRatio: sorted.at(-1), changePercent: (ratio - 1) * 100, pass: ratio <= 1.01,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = path.resolve(process.argv[2] ?? ''), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set();
  const read = rel => {
    const dir = fs.realpathSync(path.resolve(path.dirname(file), rel));
    if (seen.has(dir)) throw new Error('runtime manifest repeats a run directory');
    seen.add(dir);
    return JSON.parse(fs.readFileSync(path.join(dir, 'run-card.json'), 'utf8'));
  };
  const pair = p => ({ before: read(p.before), after: read(p.after) });
  const result = runtimeSummary(pair(manifest.warmup), manifest.pairs.map(pair));
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}
