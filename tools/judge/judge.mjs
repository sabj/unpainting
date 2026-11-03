#!/usr/bin/env node
// Judge a painting against the real ink-and-wash scans in $JUDGE_REFS (default work/refs/real/, not in the repository). Measures line quality, instrument fit,
// wash quality, value structure, paper and overall human-ness, each from numbers rather than from a look.
//
//   node tools/judge/judge.mjs sheet work/pc-face11.jpg            one of this project's comparison sheets
//   node tools/judge/judge.mjs pair target.png painting.png        two images of the same crop
//   node tools/judge/judge.mjs solo work/refs/real/met-339000-...jpg    one picture on its own (no instrument fit)
//   node tools/judge/judge.mjs calibrate [--res 384] [glob...]     what the real sheets measure, band by band
//   node tools/judge/judge.mjs rank work/pc-*.jpg                  every sheet scored, worst first
//   node tools/judge/judge.mjs discriminate                        whether the measures tell the groups apart
// Options: --res N working resolution (default 1200 whole sheets, panels are used at their own size),
//          --json write the full measurements, --quiet one line per subject.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDensity, panelsOf, quantile } from '../../src/eval/image.mjs';
import { measureImage, summary } from '../../src/eval/measure.mjs';
import { alignShift, instrumentFit } from '../../src/eval/instruments.mjs';
import { paperAgreement } from '../../src/eval/paper.mjs';
import { toneAgreement, structureAgreement } from '../../src/eval/fidelity.mjs';
import { sniffPanels } from '../../src/eval/panels.mjs';
import { writeNegatives } from '../../src/eval/synthetic.mjs';
import { summarise, separation, verdictLine } from '../../src/eval/discriminate.mjs';
import { judge } from '../../src/eval/score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const REFS = path.resolve(ROOT, process.env.JUDGE_REFS || 'work/refs/real');
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['json', 'quiet', 'solo'].includes(argv[i - 1].slice(2))));
const cmd = files.shift();
const RES = Number(opt('res', 1200));
const COLS = opt('cols', null) ? opt('cols', null).split(',').map(Number) : null;

const bar = s => (s === null ? '  --  ' : '█'.repeat(Math.round(s)).padEnd(10, '·'));
const line = (name, d) => `  ${name.padEnd(16)} ${d.score === null ? ' -- ' : d.score.toFixed(1).padStart(4)}  ${bar(d.score)}  ${d.why}`;

// The craft half on its own, so a real sheet (which has no target) can be set against a synthetic fault.
const CRAFT = ['line quality', 'wash quality', 'value structure', 'paper'];
function craftScore(v) {
  const live = CRAFT.map(k => v.dims[k]).filter(d => d && d.score !== null);
  if (!live.length) return NaN;
  // Caps are craft findings, so they cap the craft score too: evenly scattered dots must not average up high.
  const cap = (v.caps || []).reduce((a, c) => Math.min(a, c.at), 10);
  return Math.min(live.reduce((a, d) => a + d.score, 0) / live.length, cap);
}

function report(title, m, extra = {}) {
  const v = judge(m, extra);
  if (v.overall === null && !v.soloOnly) return { text: `${title}\n  ${v.why}`, verdict: v };
  const out = [`${title}`];
  for (const [k, d] of Object.entries(v.dims)) out.push(line(k, d));
  out.push(`  ${'human-ness'.padEnd(16)} ${v.overall === null ? ' -- ' : v.overall.toFixed(1).padStart(4)}  ${bar(v.overall)}  ${v.why}`);
  if (v.caps.length) out.push(`  held to ${Math.min(...v.caps.map(c => c.at))} from ${v.uncapped.toFixed(1)}`);
  return { text: out.join('\n'), verdict: v };
}

// One panel pair of a comparison sheet, or two whole files.
async function judgePair(targetFile, paintingFile, rects = [null, null], label = '') {
  const [ti, pi] = await Promise.all([
    loadDensity(targetFile, { rect: rects[0], maxDim: rects[0] ? 0 : RES }),
    loadDensity(paintingFile, { rect: rects[1], maxDim: rects[1] ? 0 : RES }),
  ]);
  // Two whole files of different sizes are stretched onto the target's grid, because instrument fit and
  // paper agreement are pixel-for-pixel questions. Panels of a sheet are already the same size.
  let painting = pi;
  if (!rects[1] && (ti.w !== pi.w || ti.h !== pi.h)) painting = await loadDensity(paintingFile, { resizeTo: [ti.w, ti.h] });
  // Read the painting at the target's scale, so both are cut into line and passage the same way.
  const tm = measureImage(ti), pm = measureImage(painting, tm.scale2);
  const same = ti.w === painting.w && ti.h === painting.h;
  let fit = null, pair = null, tone = null, structure = null;
  if (same) {
    const shift = alignShift(tm.field, pm.field, 4);
    fit = instrumentFit(tm.field, pm.field, tm.instruments, pm.instruments, shift);
    pair = paperAgreement(tm.field, pm.field);
    tone = toneAgreement(tm.field, pm.field, shift);
    structure = structureAgreement(tm.field, pm.field, shift);
  }
  const r = report(label || path.basename(paintingFile), pm, { fit, pair, tone, structure });
  return { ...r, target: tm, painting: pm, fit, pair, tone, structure, aligned: same };
}

async function judgeSheet(file) {
  // Known layouts first because they name their panels; anything else is split on its own gutters.
  const found = (COLS ? null : await panelsOf(file, opt('layout', null))) || await sniffPanels(file, COLS);
  if (!found) throw new Error(`${path.basename(file)}: no target-and-painting panels found in it; use "pair" instead`);
  if (found.layout === 'ambiguous') throw new Error(`${path.basename(file)}: ${found.why}`);
  const results = [];
  for (const p of found.panels) {
    const r = await judgePair(file, file, [p.target, p.painting], `${path.basename(file)} · ${p.name}`);
    results.push({ panel: p.name, ...r });
  }
  return { layout: found.layout, results };
}

const listFiles = (roots) => roots.flatMap(f => (fs.statSync(f).isDirectory()
  ? fs.readdirSync(f).filter(x => /\.(jpe?g|png|webp)$/i.test(x)).map(x => path.join(f, x)) : [f]));

if (cmd === 'solo') {
  for (const f of listFiles(files)) {
    const sheet = await sniffPanels(f);
    if (sheet && !flag('force')) { console.log(`${path.basename(f)}\n  ${sheet.layout === 'ambiguous' ? `this is a comparison sheet, ${sheet.why}` : `this is a comparison sheet of ${sheet.panels.length} target-and-painting pairs, not one picture; measuring it whole would mix the target into the answer. Use "sheet".`}\n`); continue; }
    const img = await loadDensity(f, { maxDim: RES, trim: true });
    const m = measureImage(img);
    const r = report(path.basename(f), m);
    console.log(r.text + '\n');
    if (flag('json')) console.log(JSON.stringify(summary(m)));
  }
} else if (cmd === 'pair') {
  const r = await judgePair(files[0], files[1]);
  console.log(r.text);
  if (!r.aligned) console.log('  note: the two images are different sizes, so instrument fit and paper agreement were skipped');
  if (flag('json')) console.log(JSON.stringify({ target: summary(r.target), painting: summary(r.painting) }, null, 1));
} else if (cmd === 'sheet') {
  for (const f of listFiles(files)) {
    const { layout, results } = await judgeSheet(f);
    console.log(`${path.basename(f)}  [${layout}]`);
    for (const r of results) console.log(r.text + '\n');
  }
} else if (cmd === 'rank') {
  // Every panel of every sheet, worst first, with the one change to make.
  const rows = [];
  for (const f of listFiles(files)) {
    try {
      const { results } = await judgeSheet(f);
      for (const r of results) rows.push({ sheet: path.basename(f), panel: r.panel, v: r.verdict });
    } catch (e) { console.error(`${path.basename(f)}: ${e.message}`); }
  }
  rows.sort((a, b) => (a.v.overall ?? 99) - (b.v.overall ?? 99));
  for (const r of rows) {
    if (r.v.overall === null) { console.log(` --   ${r.sheet} · ${r.panel}  ${r.v.why}`); continue; }
    console.log(`${r.v.overall.toFixed(1)}  ${(r.sheet + ' · ' + r.panel).padEnd(34)} ${Object.entries(r.v.dims).map(([k, d]) => `${k[0]}${k.split(' ')[1] ? k.split(' ')[1][0] : ''}=${d.score === null ? '-' : d.score.toFixed(1)}`).join(' ')}`);
    console.log(`     ${r.v.why}`);
  }
} else if (cmd === 'calibrate') {
  // What the real work measures. Every band in score.mjs should contain most of this.
  const roots = files.length ? files : [REFS];
  const rows = [];
  for (const f of listFiles(roots)) {
    const img = await loadDensity(f, { maxDim: RES, trim: true });
    const m = measureImage(img);
    const v = judge(m);
    rows.push({ file: path.basename(f).slice(0, 44), v, m });
    console.error(`${path.basename(f)} craft ${Number.isFinite(craftScore(v)) ? craftScore(v).toFixed(1) : '--'}`);
  }
  rows.sort((a, b) => (craftScore(a.v) || 99) - (craftScore(b.v) || 99));
  console.log(`# real reference work at ${RES} px by craft score, worst first. These sheets have no target, so there is\n# no overall score for them; anything low here is a measure to fix, not a bad drawing.`);
  for (const r of rows) console.log(`${Number.isFinite(craftScore(r.v)) ? craftScore(r.v).toFixed(1).padStart(4) : ' -- '}  ${r.file.padEnd(46)} ${Object.entries(r.v.dims).map(([k, d]) => `${k.split(' ')[0].slice(0, 4)}=${d.score === null ? '-' : d.score.toFixed(1)}`).join(' ')}`);
  const col = k => rows.map(r => r.v.dims[k]?.score).filter(Number.isFinite);
  console.log('\n# score spread over the real corpus');
  for (const k of ['line quality', 'instrument fit', 'wash quality', 'value structure', 'paper']) {
    const c = col(k);
    console.log(`  ${k.padEnd(16)} n=${String(c.length).padStart(3)}  p10=${c.length ? quantile(c, 0.1).toFixed(1) : '-'} median=${c.length ? quantile(c, 0.5).toFixed(1) : '-'} p90=${c.length ? quantile(c, 0.9).toFixed(1) : '-'}`);
  }
  if (flag('json')) fs.writeFileSync(opt('json', 'work/calibrate.json'), JSON.stringify(rows.map(r => ({ file: r.file, craft: craftScore(r.v), dims: Object.fromEntries(Object.entries(r.v.dims).map(([k, d]) => [k, d.score])), m: summary(r.m) })), null, 1));
} else if (cmd === 'discriminate') {
  const negDir = path.join(ROOT, 'work/negatives');
  fs.mkdirSync(negDir, { recursive: true });
  const negs = await writeNegatives(negDir);
  const realDirs = [REFS];

  // 1. Craft: real sheets against the synthetic faults.
  const realCraft = [], realRows = [];
  for (const f of listFiles(realDirs)) {
    const m = measureImage(await loadDensity(f, { maxDim: 384, trim: true }));
    const v = judge(m); if (v.overall === null && !v.soloOnly) continue;
    const c = craftScore(v); if (Number.isFinite(c)) { realCraft.push(c); realRows.push({ f: path.basename(f), c }); }
  }
  const negCraft = [];
  for (const n of negs) {
    const m = measureImage(await loadDensity(n.file, {}));
    const c = craftScore(judge(m));
    negCraft.push(c);
    console.log(`  negative ${n.name.padEnd(14)} craft ${Number.isFinite(c) ? c.toFixed(1) : ' -- '}   ${n.fault}`);
  }

  // 2. Fidelity control with a known answer: a real sheet against itself, and against a different one.
  const sample = listFiles([REFS]).slice(0, 10);
  const selfFid = [], crossFid = [];
  for (let i = 0; i < sample.length; i++) {
    const self = await judgePair(sample[i], sample[i]);
    if (self.verdict.fidelity) selfFid.push(Math.min(...Object.values(self.verdict.fidelity)));
    const other = sample[(i + 3) % sample.length];
    const cross = await judgePair(sample[i], other);
    if (cross.verdict.fidelity) crossFid.push(Math.min(...Object.values(cross.verdict.fidelity)));
  }

  // 3. Overall: current renders against earlier renders rejected on review.
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'judge/groups.json'), 'utf8'));
  const scoreGroup = async list => {
    const out = [];
    for (const item of list) {
      const file = item.file.startsWith('/') ? item.file : path.join(ROOT, item.file);
      if (!fs.existsSync(file)) { console.error(`  missing: ${file}`); continue; }
      try {
        const found = (item.cols ? null : await panelsOf(file)) || await sniffPanels(file, item.cols || null);
        if (!found || found.layout === 'ambiguous') { console.error(`  unreadable: ${path.basename(file)}`); continue; }
        for (const p of found.panels) {
          const r = await judgePair(file, file, [p.target, p.painting], '');
          if (r.verdict.overall !== null) out.push({ file: path.basename(file), panel: p.name, score: r.verdict.overall, why: r.verdict.why });
        }
      } catch (e) { console.error(`  ${path.basename(file)}: ${e.message}`); }
    }
    return out;
  };
  const ours = await scoreGroup(groups.ours), bad = await scoreGroup(groups.bad);

  console.log(`\n# craft, real reference sheets against deliberately bad pictures`);
  console.log(`  real      ${JSON.stringify(summarise(realCraft))}`);
  console.log(`  synthetic ${JSON.stringify(summarise(negCraft))}`);
  console.log(verdictLine('craft: real over synthetic faults', separation(realCraft, negCraft)));
  console.log(`\n# fidelity control, a real sheet against itself and against a different sheet`);
  console.log(`  self  ${JSON.stringify(summarise(selfFid))}`);
  console.log(`  cross ${JSON.stringify(summarise(crossFid))}`);
  console.log(verdictLine('fidelity: self over cross', separation(selfFid, crossFid)));
  console.log(`\n# overall, our current renders against the rejected ones`);
  console.log(`  ours     ${JSON.stringify(summarise(ours.map(r => r.score)))}`);
  console.log(`  rejected ${JSON.stringify(summarise(bad.map(r => r.score)))}`);
  console.log(verdictLine('overall, per panel', separation(ours.map(r => r.score), bad.map(r => r.score))));
  // A sheet is what gets accepted or rejected, and a sheet is as good as its worst panel.
  const bySheet = rows => Object.values(rows.reduce((a, r) => { (a[r.file] ||= []).push(r.score); return a; }, {})).map(v => Math.min(...v));
  const oursSheet = bySheet(ours), badSheet = bySheet(bad);
  console.log(`  ours, worst panel per sheet     ${JSON.stringify(summarise(oursSheet))}`);
  console.log(`  rejected, worst panel per sheet ${JSON.stringify(summarise(badSheet))}`);
  console.log(verdictLine('overall, per sheet on its worst panel', separation(oursSheet, badSheet)));
  for (const r of bad.sort((a, b) => a.score - b.score)) console.log(`    rejected ${r.score.toFixed(1)}  ${r.file} · ${r.panel}: ${r.why.slice(0, 110)}`);
  if (flag('json')) fs.writeFileSync(opt('json', 'work/discriminate.json'), JSON.stringify({ realCraft: realRows, negCraft, selfFid, crossFid, ours, bad }, null, 1));
} else {
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split("\n").slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(1);
}
