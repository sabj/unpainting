#!/usr/bin/env node
// Quality gate for Unpainting plates. Measures each run against its target, writes gate.json, gate.md and a
// contact sheet (sheet.html with thumbnails), and with --prev compares against an earlier gate.json.
//
//   node bench/scripts/plate-gate.mjs --manifest runs.json --out DIR [--prev DIR/gate.json] [--width 300]
//
// runs.json: [{ "name": "mittens opus/1", "subject": "mittens", "run": "/path/to/run-dir", "target": "/path/to/target.png" }]
// A run dir is a paint-plate output: painting.png, plan.jpg, frames f*.jpg + frames.json, stages/, cheat-risk.json,
// paint.log, run-card.json. Nothing here reads the target during painting; it only measures finished plates.
//
// Criteria (per subject, against the previous step when --prev is given):
//   paper share and dark share closer to the target; p95 edge energy closer to the target and not lower;
//   pigment delivered over planned closer to the 0.9-1.1 band; cheat checks clean and not materially worse
//   (hfCorr under its ceiling and up by no more than 0.02, strokes up by no more than 10%, small share up by no
//   more than 0.02, guard violations 0); lights before dark in the playback frames.
// Absolute targets (fable-report.md): paper and dark share within 25% relative of target, p95 edge >= 85% of target,
// delivered over planned 0.9-1.1 per pan.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ABS = { shareRel: 0.25, edgeMin: 0.85, deliveryLo: 0.9, deliveryHi: 1.1 };
const WORSE = { hf: 0.02, strokesRel: 0.10, small: 0.02 };
const DARK_L = 35, PAPER_TOL = 4;

function args(argv) {
  const o = { width: 300, prev: null, manifest: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--manifest') o.manifest = v(); else if (a === '--out') o.out = v(); else if (a === '--prev') o.prev = v(); else if (a === '--width') o.width = Number(v());
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.manifest || !o.out) throw new Error('usage: plate-gate.mjs --manifest runs.json --out DIR [--prev gate.json]');
  return o;
}

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lstar = (r, g, b) => { const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };

/** Value, paper and edge statistics of one image at a common width. */
export async function imageStats(file, width) {
  const { data, info } = await sharp(file).flatten({ background: '#fff' }).resize({ width }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = lstar(data[3 * i], data[3 * i + 1], data[3 * i + 2]);
  const sorted = Float32Array.from(L).sort();
  const q = f => sorted[Math.floor(f * (n - 1))];
  let paperL = 0; const from = Math.floor(0.9 * n); for (let i = from; i < n; i++) paperL += sorted[i]; paperL /= n - from;
  let paper = 0, dark = 0, mid = 0;
  for (let i = 0; i < n; i++) { if (L[i] >= paperL - PAPER_TOL) paper++; if (L[i] < DARK_L) dark++; if (L[i] >= 50 && L[i] < 80) mid++; }
  const g = [];
  for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) { const i = y * info.width + x; g.push(Math.hypot(L[i + 1] - L[i - 1], L[i + info.width] - L[i - info.width]) / 2); }
  g.sort((a, b) => a - b);
  const r3 = v => +v.toFixed(3), r1 = v => +v.toFixed(1);
  return { w: info.width, h: info.height, paperL: r1(paperL), paperShare: r3(paper / n), darkShare: r3(dark / n), midShare: r3(mid / n), L5: r1(q(0.05)), L50: r1(q(0.5)), L95: r1(q(0.95)), gradP50: +g[Math.floor(0.5 * g.length)].toFixed(2), gradP95: +g[Math.floor(0.95 * g.length)].toFixed(2), meanL: r1(L.reduce((a, b) => a + b, 0) / n) };
}

/** Horizontal lane streaks at native size: row-mean L* detrended over a 15 mm window, strongest autocorrelation peak
 * between 8 and 60 mm (the mop lanes are 20 to 40 mm; paper grain sits under 2 mm). A high r is banding
 * (fable/streaks.mjs). mmPerRow comes from the run card; without it 0.23 mm (280 mm over 1200 px) is assumed. */
async function streaks(file, mmPerRow = 280 / 1200) {
  const { data, info } = await sharp(file).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const H = info.height, W = info.width, rows = new Float64Array(H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { const i = 3 * (y * W + x); s += lstar(data[i], data[i + 1], data[i + 2]); } rows[y] = s / W; }
  const k = Math.max(2, Math.round(7.5 / mmPerRow)), d = new Float64Array(H);
  for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let q = y - k; q <= y + k; q++) if (q >= 0 && q < H) { s += rows[q]; n++; } d[y] = rows[y] - s / n; }
  let v = 0; for (const x of d) v += x * x; v /= H;
  let best = { lag: 0, r: 0 };
  for (let lag = Math.max(3, Math.round(8 / mmPerRow)); lag <= Math.min(H >> 1, Math.round(60 / mmPerRow)); lag++) { let s = 0; for (let y = 0; y + lag < H; y++) s += d[y] * d[y + lag]; const r = s / ((H - lag) * v); if (r > best.r) best = { lag, r }; }
  return { rms: +Math.sqrt(v).toFixed(3), lagRows: best.lag, lagMm: +(best.lag * mmPerRow).toFixed(1), r: +best.r.toFixed(2), height: H };
}

const readJson = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const readMaybeGz = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : fs.existsSync(f + '.gz') ? zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString() : null);

/** Per-pan delivered over planned from paint.log, plus the share of pans inside the 0.9-1.1 band. */
export function delivery(run) {
  const log = readMaybeGz(path.join(run, 'paint.log')) || '';
  const m = [...log.matchAll(/pigment delivered over planned: (.*)/g)].at(-1);
  if (!m) return null;
  const pans = m[1].split(',').map(s => Number(s.trim().split(/\s+/)[1])).filter(Number.isFinite);
  const inBand = pans.filter(v => v >= ABS.deliveryLo && v <= ABS.deliveryHi).length;
  const dist = pans.map(v => Math.max(0, ABS.deliveryLo - v, v - ABS.deliveryHi));
  return { pans, min: Math.min(...pans), max: Math.max(...pans), mean: +(pans.reduce((a, b) => a + b, 0) / pans.length).toFixed(3), inBand: `${inBand}/${pans.length}`, bandDistance: +(dist.reduce((a, b) => a + b, 0) / pans.length).toFixed(3) };
}

function cheat(run) {
  const c = readJson(path.join(run, 'cheat-risk.json'));
  if (!c) return null;
  const prog = Object.fromEntries(Object.entries(c.prog || {}).map(([k, v]) => [k, { stage: v.stage, dark: v.dark, p95: v.p95, hf: v.hf }]));
  return { strokes: c.strokes, smallShare: c.smallShare, hfCorr: c.hfCorr, hfCeiling: c.hfCeiling, risk: c.risk, level: c.level, parts: c.parts, flags: c.flags || [], guardViolations: c.guard?.violations ?? null, pixelFit: c.guard?.pixelFit ?? null, prog };
}

/** Lights before dark: dark share and mean L per saved frame, in order, and the first frame that shows paint. */
async function playback(run, width) {
  const fj = readJson(path.join(run, 'frames.json'));
  const frames = fj?.frames?.length ? fj.frames : fs.readdirSync(run).filter(f => /^f\d+\.jpg$/.test(f)).sort().map(src => ({ src, stage: '?' }));
  const rows = [];
  for (const f of frames) {
    const file = path.join(run, f.src);
    if (!fs.existsSync(file)) continue;
    const s = await imageStats(file, Math.min(width, 200));
    rows.push({ src: f.src, stage: [f.stage, f.step].filter(Boolean).join(' '), meanL: s.meanL, darkShare: s.darkShare, paperShare: s.paperShare });
  }
  if (!rows.length) return null;
  const paper = rows[0];
  const first = rows.find(r => r.stage.startsWith('paint') || r.stage.startsWith('wash')) || rows.find(r => paper.meanL - r.meanL > 2) || rows[0];
  const final = rows.at(-1);
  const paintRows = rows.filter(r => r.stage.startsWith('paint') || r.stage.startsWith('finished'));
  let drops = 0;
  for (let i = 1; i < paintRows.length; i++) if (paintRows[i].darkShare < paintRows[i - 1].darkShare - 0.01) drops++;
  const lightsFirst = first.darkShare <= Math.max(0.01, 0.25 * final.darkShare) && paper.meanL - first.meanL < 0.5 * (paper.meanL - final.meanL);
  return { frames: rows.length, firstPaint: first, final: { meanL: final.meanL, darkShare: final.darkShare }, darkShareDrops: drops, lightsFirst };
}

function runCard(run) {
  const c = readJson(path.join(run, 'run-card.json'));
  if (!c) return null;
  return { codeSHA: c.code?.commit ?? c.codeSHA ?? null, dirty: c.code?.dirty ?? c.dirty ?? null, seconds: c.seconds ?? c.elapsedSec ?? null, gpu: c.gpu?.backend ?? c.gpu?.adapter ?? (c.gpu ? 'yes' : null), paintWidth: c.dimensions?.paintWidth ?? c.provenance?.geometry?.W2 ?? null, sheetMm: c.provenance?.geometry?.sheetMm ?? null };
}

async function measure(entry, width) {
  const run = entry.run;
  const painting = ['painting.png', 'painting.jpg'].map(f => path.join(run, f)).find(fs.existsSync);
  if (!painting) return { ...entry, error: 'no painting' };
  const plan = path.join(run, 'plan.jpg');
  const [p, t] = await Promise.all([imageStats(painting, width), imageStats(entry.target, width)]);
  const pl = fs.existsSync(plan) ? await imageStats(plan, width) : null;
  const card = runCard(run), mmPerRow = card?.sheetMm && card?.paintWidth ? card.sheetMm / card.paintWidth : undefined;
  return { ...entry, painting, target: entry.target, planPreview: fs.existsSync(plan) ? plan : null, paint: p, targetStats: t, plan: pl, streaks: await streaks(painting, mmPerRow), delivery: delivery(run), cheat: cheat(run), playback: await playback(run, width), card };
}

/** Absolute checks against the target. */
export function absolute(r) {
  if (r.error) return {};
  const rel = (a, b) => (b > 0 ? Math.abs(a - b) / b : Math.abs(a - b));
  const c = {};
  c.paperShare = rel(r.paint.paperShare, r.targetStats.paperShare) <= ABS.shareRel;
  c.darkShare = rel(r.paint.darkShare, r.targetStats.darkShare) <= ABS.shareRel;
  c.edgeP95 = r.paint.gradP95 >= ABS.edgeMin * r.targetStats.gradP95;
  c.delivery = r.delivery ? r.delivery.pans.every(v => v >= ABS.deliveryLo && v <= ABS.deliveryHi) : null;
  c.cheatLow = r.cheat ? r.cheat.level === 'low' && !r.cheat.guardViolations && !r.cheat.pixelFit : null;
  c.hfUnderCeiling = r.cheat ? r.cheat.hfCorr <= r.cheat.hfCeiling : null;
  c.lightsFirst = r.playback ? r.playback.lightsFirst : null;
  return c;
}

/** Against the previous step: closer to target, not lower edge, delivery not farther, cheat not materially worse. */
export function compare(r, p) {
  if (!p || p.error || r.error) return null;
  const d = (a, t) => Math.abs(a - t), t = r.targetStats;
  const c = {};
  c.paperShare = d(r.paint.paperShare, t.paperShare) <= d(p.paint.paperShare, t.paperShare);
  c.darkShare = d(r.paint.darkShare, t.darkShare) <= d(p.paint.darkShare, t.darkShare);
  c.edgeP95 = d(r.paint.gradP95, t.gradP95) <= d(p.paint.gradP95, t.gradP95) && r.paint.gradP95 >= p.paint.gradP95;
  c.delivery = r.delivery && p.delivery ? r.delivery.bandDistance <= p.delivery.bandDistance : null;
  c.cheat = r.cheat && p.cheat ? r.cheat.hfCorr <= Math.max(r.cheat.hfCeiling, p.cheat.hfCorr + WORSE.hf) && r.cheat.strokes <= p.cheat.strokes * (1 + WORSE.strokesRel) && (r.cheat.smallShare ?? 0) <= (p.cheat.smallShare ?? 0) + WORSE.small && !r.cheat.guardViolations : null;
  c.lightsFirst = r.playback ? r.playback.lightsFirst : null;
  c.pass = Object.values(c).every(v => v !== false);
  return c;
}

const mark = v => (v === true ? 'pass' : v === false ? 'FAIL' : '-');
function table(results, prev) {
  const head = ['subject', 'paper (t)', 'dark (t)', 'edge p95 (t, plan)', 'delivered/planned', 'hfCorr/ceil', 'strokes', 'small', 'risk', 'streak r (lag mm)', 'lights first', 'abs', prev ? 'vs prev' : null].filter(Boolean);
  const rows = results.map(r => {
    if (r.error) return [r.name, r.error];
    const a = r.abs, c = r.vsPrev;
    const absS = Object.entries(a).map(([k, v]) => `${k} ${mark(v)}`).join(', ');
    return [r.name, `${r.paint.paperShare} (${r.targetStats.paperShare})`, `${r.paint.darkShare} (${r.targetStats.darkShare})`, `${r.paint.gradP95} (${r.targetStats.gradP95}, ${r.plan?.gradP95 ?? '-'})`,
      r.delivery ? `${r.delivery.min}-${r.delivery.max}, ${r.delivery.inBand} in band` : '-', r.cheat ? `${r.cheat.hfCorr}/${r.cheat.hfCeiling}` : '-', r.cheat?.strokes ?? '-', r.cheat?.smallShare ?? '-', r.cheat ? `${r.cheat.risk} ${r.cheat.level}` : '-', r.streaks ? `${r.streaks.r} (${r.streaks.lagMm})` : '-',
      r.playback ? `${mark(r.playback.lightsFirst)} (first ${r.playback.firstPaint.stage}: dark ${r.playback.firstPaint.darkShare}, L ${r.playback.firstPaint.meanL})` : '-', absS, ...(prev ? [c ? `${c.pass ? 'PASS' : 'FAIL'}: ${Object.entries(c).filter(([k]) => k !== 'pass').map(([k, v]) => `${k} ${mark(v)}`).join(', ')}` : 'no prev'] : [])];
  });
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
}

async function thumbs(results, out) {
  const dir = path.join(out, 'img'); fs.mkdirSync(dir, { recursive: true });
  const put = async (src, name, width = 420) => { if (!src || !fs.existsSync(src)) return null; const f = `${name}.jpg`; await sharp(src).flatten({ background: '#fff' }).resize({ width }).jpeg({ quality: 82 }).toFile(path.join(dir, f)); return `img/${f}`; };
  for (const [i, r] of results.entries()) {
    if (r.error) continue;
    const k = `${i}-${r.subject}`;
    r.img = { target: await put(r.target, `${k}-target`), plan: await put(r.planPreview, `${k}-plan`), painting: await put(r.painting, `${k}-painting`), strip: await put(path.join(r.run, 'stages', 'strip.jpg'), `${k}-strip`, 1200) };
    r.img.frames = [];
    for (const f of (r.playback ? fs.readdirSync(r.run).filter(x => /^f\d+\.jpg$/.test(x)).sort() : [])) r.img.frames.push({ src: await put(path.join(r.run, f), `${k}-${f.replace('.jpg', '')}`, 160), label: f });
  }
}

function sheet(results, title) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fig = (src, cap) => (src ? `<figure><img src="${src}"><figcaption>${esc(cap)}</figcaption></figure>` : '');
  const sec = results.map(r => r.error ? `<section><h2>${esc(r.name)}</h2><p>${esc(r.error)}</p></section>` : `<section><h2>${esc(r.name)}</h2>
<div class="row">${fig(r.img.target, `target: paper ${r.targetStats.paperShare} dark ${r.targetStats.darkShare} edge ${r.targetStats.gradP95}`)}${fig(r.img.plan, `plan preview: edge ${r.plan?.gradP95 ?? '-'}`)}${fig(r.img.painting, `painting: paper ${r.paint.paperShare} dark ${r.paint.darkShare} edge ${r.paint.gradP95}; delivered ${r.delivery ? r.delivery.min + '-' + r.delivery.max : '-'}; hf ${r.cheat?.hfCorr ?? '-'}; strokes ${r.cheat?.strokes ?? '-'}`)}</div>
${r.img.strip ? `<div class="strip">${fig(r.img.strip, 'stages 10/25/50/75/100% of strokes')}</div>` : ''}
<div class="frames">${r.img.frames.map(f => fig(f.src, f.label)).join('')}</div>
<p class="checks">abs: ${Object.entries(r.abs).map(([k, v]) => `${k} ${mark(v)}`).join(', ')}${r.vsPrev ? ` | vs prev: ${r.vsPrev.pass ? 'PASS' : 'FAIL'}` : ''}</p></section>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{margin:0;padding:12px;background:#6f6f6f;color:#fff;font:12px/1.3 -apple-system,sans-serif}section{background:#4e4e4e;padding:8px;margin-bottom:18px}h2{margin:0 0 6px;font-size:14px}.row{display:flex;gap:8px;align-items:flex-start}.row img{width:420px;display:block;background:#fff}.strip img{width:1280px;display:block;margin-top:8px}.frames{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}.frames img{height:120px;display:block}figure{margin:0}figcaption{font-size:11px;margin-top:2px;max-width:420px}.checks{margin:6px 0 0}</style>
<h1 style="font-size:16px;margin:0 0 10px">${esc(title)}</h1>${sec}`;
}

async function main() {
  const o = args(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));
  const prev = o.prev ? JSON.parse(fs.readFileSync(o.prev, 'utf8')) : null;
  fs.mkdirSync(o.out, { recursive: true });
  const results = [];
  for (const e of manifest) {
    const r = await measure(e, o.width);
    r.abs = absolute(r);
    r.vsPrev = prev ? compare(r, prev.results.find(p => p.name === r.name) || prev.results.find(p => p.subject === r.subject)) : null;
    results.push(r);
  }
  await thumbs(results, o.out);
  const title = `${path.basename(o.out)} gate (${o.width} px stats)`;
  fs.writeFileSync(path.join(o.out, 'gate.json'), JSON.stringify({ generatedAt: new Date().toISOString(), width: o.width, prev: o.prev, results }, null, 1));
  fs.writeFileSync(path.join(o.out, 'gate.md'), `# ${title}\n\n${table(results, prev)}\n`);
  fs.writeFileSync(path.join(o.out, 'sheet.html'), sheet(results, title));
  console.log(table(results, prev));
  if (prev) { const failed = results.filter(r => r.vsPrev && !r.vsPrev.pass).map(r => r.name); console.log(failed.length ? `GATE FAIL: ${failed.join('; ')}` : 'GATE PASS'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
}
