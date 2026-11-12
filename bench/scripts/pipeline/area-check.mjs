#!/usr/bin/env node
// The admission check for a V4 or V5 area plan: the refusals before any painting (area-args.mjs), then the painter's
// planning step with the area plan (--areaplanonly 1) at the full painting width. That step validates every area and
// pass (tools/painter/semantic-areas.mjs), cuts the value ladder, and compiles each pass into its wash; it stops loudly on
// any plan the painter cannot paint (a value cell no pass takes, a shared edge left out, a pass above the ladder). The
// model runs it as `bash bench/check.sh`; the harness runs the same check before it paints. Last line: ADMITTED or REFUSED.
//
// On admission it writes bench/check-out/areas.jpg: the target beside the plan's area map (each area in its own colour,
// as the painter rasterised it), and prints how many cells and ladder pieces each pass took.
//
// This file is copied into the model's worktree as bench/check.mjs on the area route, beside area-args.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { resolveAreaPlan } from './area-args.mjs';

function planningStep({ repo, args, logFile, timeoutMs }) {
  return new Promise(resolve => {
    fs.writeFileSync(logFile, '');
    const child = spawn(process.execPath, args, { cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const take = b => { const s = b.toString(); log += s; fs.appendFileSync(logFile, s); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('close', code => { clearTimeout(timer); resolve({ code, log }); });
  });
}

/** Pigments the painter will paint with, from its planning log (same reading as the token route's check). */
function paletteOf(log) {
  let names = [], at = false;
  for (const l of log.split('\n')) {
    if (l.startsWith('palette: ') && l.includes(' pigments')) { at = true; names = []; continue; }
    if (at && l.startsWith('  ') && l.includes(': K ')) { names.push(l.split(': K ')[1].split(' ').slice(1).join(' ').trim()); continue; }
    at = false;
  }
  return names.length ? { palette: names, inks: [] } : null;
}

// distinct colours for the area map, in order; an area past the list reuses them (its id is printed beside the colour)
const COLOURS = [[230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0], [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128]];

/** target | area map as one JPEG, at the run's grid size. Returns the legend rows. */
export async function writeAreaMap({ target, ownershipFile, areas, dest }) {
  const own = JSON.parse(fs.readFileSync(ownershipFile, 'utf8')), { w, h, data } = own;
  const buf = Buffer.alloc(w * h * 3, 255);
  for (let i = 0; i < data.length; i++) { const j = data[i]; if (j < 0) continue; const c = COLOURS[j % COLOURS.length]; buf[3 * i] = c[0]; buf[3 * i + 1] = c[1]; buf[3 * i + 2] = c[2]; }
  const map = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const left = await sharp(target).resize({ width: w, height: h, fit: 'fill' }).flatten({ background: '#fff' }).removeAlpha().png().toBuffer();
  await sharp({ create: { width: w * 2, height: h, channels: 3, background: '#fff' } }).composite([{ input: left, left: 0, top: 0 }, { input: map, left: w, top: 0 }]).jpeg({ quality: 88 }).toFile(dest);
  return areas.map((a, j) => `${a.id}: rgb(${COLOURS[j % COLOURS.length].join(',')})`);
}

/**
 * Check an area plan. spec: {width, sheetmm, medium}. Returns {ok, failures, refusal, args, layering, palette, coverage}.
 * repo: the tree whose painter runs the planning step; work: a scratch folder for its output.
 */
export async function checkAreaPlan({ repo, spec, planDir, target, work, timeoutMs = 15 * 60 * 1000 }) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const out = path.join(work, 'out');
  const plan = resolveAreaPlan({ spec, planDir, target, out, work, compile: true });
  const failures = plan.problems.map(reason => ({ code: 4, reason }));
  let palette = null, coverage = null, map = null, legend = [];
  const t0 = Date.now();
  if (!failures.length) {
    const r = await planningStep({ repo, args: plan.args, logFile: path.join(work, 'planning.log'), timeoutMs });
    palette = paletteOf(r.log);
    const covFile = path.join(out, 'semantic-coverage.json');
    coverage = fs.existsSync(covFile) ? JSON.parse(fs.readFileSync(covFile, 'utf8')) : null;
    if (r.code !== 0) {
      const err = r.log.split('\n').find(l => /^(Error|[A-Za-z]*Error)[: ]/.test(l)) || `the planning step exited ${r.code}`;
      failures.push({ code: 4, reason: 'the painter refused the area plan: ' + err.trim() });
    } else if (!coverage?.planComplete) failures.push({ code: 4, reason: 'the planning step wrote no complete coverage (semantic-coverage.json)' });
    else {
      try {
        const doc = JSON.parse(fs.readFileSync(plan.planFile, 'utf8'));
        map = path.join(work, 'areas.jpg');
        legend = await writeAreaMap({ target: path.resolve(repo, target), ownershipFile: path.join(out, 'semantic-ownership.json'), areas: doc.areas, dest: map });
      } catch (e) { failures.push({ code: 4, reason: `the area map failed: ${e.message}` }); }
    }
  }
  return {
    ok: failures.length === 0, failures, refusal: failures.map(f => f.reason), variant: null, route: 'area',
    args: plan.args, layering: plan.layering, palette, coverage, map, legend, seconds: +((Date.now() - t0) / 1000).toFixed(1), previewSeconds: 0,
  };
}

/** What the model reads after an admitted check: the map, the legend and each pass's share of the sheet. */
export function coverageText({ coverage, map, legend }) {
  const cells = coverage?.geometryCoveredCells || 1;
  const rows = (coverage?.passes ?? []).map(p => `  ${p.id}: ${p.compiledShapes ? `${p.ladderPieces} ladder pieces in one wash` : 'nothing to lay (no ladder value of the area falls in its valueRange)'}`);
  const areas = (coverage?.areaCells ?? []).map(a => `  ${a.id}: ${(100 * a.owned / cells).toFixed(1)}% of the sheet`);
  return [`Area map: ${map} (target left, your areas right). Colours:`, ...legend.map(l => '  ' + l), 'Areas (cells each owns):', ...areas,
    `Passes (value ladder: values 1-${coverage?.ladderTop ?? '?'} on this run):`, ...rows].join('\n');
}

export const modelCheckSpec = frozen => ({ ...frozen, offlineFixture: true });

// CLI, from the worktree root: node bench/check.mjs (bash bench/check.sh)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const frozen = JSON.parse(fs.readFileSync(path.join(root, 'bench', 'frozen.json'), 'utf8'));
  const r = await checkAreaPlan({ repo: root, spec: modelCheckSpec(frozen), planDir: 'bench/plan', target: 'bench/plan/target.png', work: 'bench/check-out' });
  console.log(JSON.stringify({ ok: r.ok, failures: r.failures, args: r.args, layering: r.layering, palette: r.palette }, null, 1));
  if (r.ok) console.log(coverageText(r));
  fs.appendFileSync(path.join('bench', 'check-log.jsonl'), JSON.stringify({ ok: r.ok, seconds: r.seconds, previewSeconds: 0 }) + '\n');
  console.log(r.ok ? 'ADMITTED' : `REFUSED: ${r.refusal.join('; ')}`);
  process.exit(r.ok ? 0 : 4);
}
