#!/usr/bin/env node
// Run the ordinary seven painting stages, then replay only their final deposited pigment.
// node --max-old-space-size=18432 tools/lab/final-render-proof.mjs REFERENCE REPS -- PAINT_PLATE_ARGS...
// Or REFERENCE REPS --subject ID --out DIRECTORY [--frames COUNT] for checked registry inputs.
// REFERENCE is a repository tree containing the comparison's src/media/subcell-grain.mjs.
// No target pixels, brush commands, water steps or physical constants enter the replay.
import '../plate/load-order.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createJSONLWriter } from '../painter/jsonl-writer.mjs';
import { onCheckFailure } from '../../src/media/checks.mjs';
import { setup } from '../plate/setup.mjs';
import { plan } from '../plate/plan.mjs';
import { sheetAndBrushes } from '../plate/sheet.mjs';
import { penPlan } from '../plate/pen.mjs';
import { drawing } from '../plate/drawing.mjs';
import { paint } from '../plate/paint.mjs';
import { finish } from '../plate/finish.mjs';
import { loadRegistry, resolveSubject, checkInputs } from '../paint/subjects.mjs';
import { buildCommand, shellLine } from '../paint/command.mjs';
import { layersOf, coherent } from '../../src/media/sheet.mjs';
import { paperRelief } from '../../src/media/paper-relief.mjs';
import { subcellSpread, SUBCELL_GAIN } from '../../src/media/subcell-grain.mjs';
import { renderCells } from '../../src/media/km.mjs';

const [reference, repsArg, separator, ...args] = process.argv.slice(2), reps = Number(repsArg);
if (!reference || !Number.isInteger(reps) || reps < 1 || !['--', '--subject'].includes(separator))
  throw Error('usage: final-render-proof.mjs REFERENCE REPS -- PAINT_PLATE_ARGS...');
let painterArgs = args, checkRenderer = null;
if (separator === '--subject') {
  const [id, ...rest] = args; let out, frames = '120';
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--out' && rest[i + 1]) out = rest[i + 1];
    else if (rest[i] === '--check-renderer' && rest[i + 1]) checkRenderer = rest[i + 1];
    else if (rest[i] === '--frames' && Number.isInteger(Number(rest[i + 1])) && Number(rest[i + 1]) > 0) frames = rest[i + 1];
    else throw Error('subject proof accepts --out DIRECTORY and --frames COUNT');
  }
  if (!id || !out) throw Error('subject proof needs an ID and --out DIRECTORY');
  const spec = checkInputs(resolveSubject(loadRegistry(), id, { sets: [['frames', frames]] }));
  const command = buildCommand(spec, { mode: 'paint', out: path.resolve(out), known: new Set(['thingmasks', 'frames']), dirty: false });
  painterArgs = command.argv;
  console.log(shellLine(command));
}
const referenceFile = path.resolve(reference, 'src/media/subcell-grain.mjs');
const previous = await import(pathToFileURL(referenceFile).href);
const sourceHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const currentFile = fileURLToPath(new URL('../../src/media/subcell-grain.mjs', import.meta.url));
const currentSourceHash = sourceHash(currentFile), referenceSourceHash = sourceHash(referenceFile);
const identityFile = checkRenderer ? path.resolve(checkRenderer, 'src/media/subcell-grain.mjs') : null;
const identity = identityFile ? { ...(await import(pathToFileURL(identityFile).href)), sourceSha256: sourceHash(identityFile) } : null;
process.argv = [process.argv[0], fileURLToPath(new URL('../paint-plate.mjs', import.meta.url)), ...painterArgs];
const JSONL = createJSONLWriter(), removeHook = onCheckFailure(JSONL.flush);
process.on('exit', JSONL.close);
process.on('uncaughtExceptionMonitor', JSONL.flush);
const ctx = { WASH_FLAT_SPLAY: 0.03, ENTRY_FILE: process.argv[1], JSONL, sheet: null };
try {
  for (const stage of [setup, plan, sheetAndBrushes, penPlan, drawing, paint, finish]) await stage(ctx);
  const paintingPeakRssGiB = process.resourceUsage().maxRSS * 1024 / 1024 ** 3;
  if (process.exitCode) throw Error(`ordinary painting failed with exit code ${process.exitCode}`);
  if (ctx.GPU_INFO.backend !== 'gpu' || ctx.GPU_INFO.fallback) throw Error('proof requires an actual GPU painting');
  coherent(ctx.sheet); ctx.sheet._gpu?.syncLower(ctx.sheet);
  // Release the GPU while the CPU performs the same final reconstruction used by finish.mjs.
  ctx.sheet._gpu?.close(); ctx.sheet._gpu = null;
  const N = ctx.INKRES ? ctx.INKRES.N : Math.round(ctx.num('subgrid', 0));
  if (!(N >= 2) || !ctx.CP_MM) throw Error('proof requires a physical cold-press subgrid final');
  const layers = layersOf(ctx.sheet), pigments = ctx.SHEET_PIGS;
  const hash = a => createHash('sha256').update(a).digest('hex');
  const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  const source = () => {
    const h = createHash('sha256'), mass = new Float64Array(pigments.length);
    for (const layer of layers) for (let k = 0; k < pigments.length; k++) {
      const a = layer[k]; h.update(bytes(a));
      for (const v of a) mass[k] += v;
    }
    return { sha256: h.digest('hex'), mass: Array.from(mass) };
  };
  const before = source(), FW = ctx.W2 * N, FH = ctx.H2 * N, FN = FW * FH;
  const Kp = pigments.map(p => p.K), Sp = pigments.map(p => p.S);
  const production = await sharp(path.join(ctx.out, 'painting.png')).removeAlpha().raw().toBuffer();
  const variants = [
    { name: 'current', spread: subcellSpread, sourceSha256: currentSourceHash },
    { name: 'reference', spread: previous.subcellSpread, sourceSha256: referenceSourceHash },
    ...(identity ? [{ name: 'identity-reference', spread: identity.subcellSpread, sourceSha256: identity.sourceSha256 }] : []),
  ].map(v => ({ ...v, samples: [], imageSha256: null }));
  for (let rep = -1; rep < reps; rep++) for (const v of rep % 2 ? variants : variants.toReversed()) {
    const start = performance.now(), cpuStart = process.cpuUsage();
    const relief = paperRelief(FW, FH, ctx.CP_MM / N, { seed: ctx.PAPER_OPTS.seed, relief: ctx.PAPER_OPTS.relief ?? 'cold' }).height;
    const spread = v.spread(pigments, ctx.sheet.paper, N, { gain: SUBCELL_GAIN * ctx.num('subgridgain', 1) });
    const background = new Uint8Array(FN * 3);
    for (let i = 0; i < FN; i++) {
      const shade = 1 - ctx.SHADE + ctx.SHADE * relief[i];
      for (let ch = 0; ch < 3; ch++) background[i * 3 + ch] = Math.round(Math.min(255, ctx.paperRGB[ch] * shade));
    }
    const under = new Float64Array(FN * 3), out = new Uint8ClampedArray(FN * 3);
    for (let i = 0; i < under.length; i++) under[i] = background[i] / 255;
    const prepared = performance.now(); let spreadMs = 0, opticsMs = 0;
    const fineMass = rep === -1 ? new Float64Array(pigments.length) : null;
    for (let l = 0; l < layers.length; l++) {
      const t = performance.now(), fine = spread(layers[l]), u = performance.now();
      renderCells([fine], Kp, Sp, background, 0, FN, 1, null, l === layers.length - 1 ? out : null, under, under);
      spreadMs += u - t; opticsMs += performance.now() - u;
      if (fineMass) for (let k = 0; k < fine.length; k++) for (const value of fine[k]) fineMass[k] += value / (N * N);
    }
    if (!layers.length) out.set(background);
    const reconstructed = performance.now();
    const rgb = ctx.INKRES ? ctx.INKRES.composeFine(Buffer.from(out.buffer)) : Buffer.from(out.buffer);
    let written = rgb;
    if (!ctx.INKRES) {
      const acc = new Float64Array(ctx.W2 * ctx.H2 * 3);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const c = Math.floor(y / N) * ctx.W2 + Math.floor(x / N);
        for (let ch = 0; ch < 3; ch++) acc[c * 3 + ch] += rgb[(y * FW + x) * 3 + ch];
      }
      written = Buffer.from(Uint8Array.from(acc, value => Math.round(value / (N * N))));
    }
    const end = performance.now(), cpu = process.cpuUsage(cpuStart);
    const imageSha256 = hash(rgb);
    if (v.imageSha256 && imageSha256 !== v.imageSha256) throw Error('repeated final replay differs');
    v.imageSha256 = imageSha256;
    if (fineMass) {
      v.massRatios = Array.from(fineMass, (value, k) => before.mass[k] ? value / before.mass[k] : value === 0 ? 1 : Infinity);
      if (v.massRatios.some(r => Math.abs(r - 1) > 1e-6)) throw Error('final replay lost pigment');
    }
    if (v.name === 'current') {
      if (!written.equals(production)) throw Error('replay differs from the production painting.png');
      v.productionPixelsMatch = true;
    }
    if (rep >= 0) v.samples.push({ repetition: rep, prepareMs: prepared - start, spreadMs, opticsMs, compositeMs: end - reconstructed, totalMs: end - start, cpuMs: (cpu.user + cpu.system) / 1000 });
    if (rep === reps - 1) await sharp(rgb, { raw: { width: FW, height: FH, channels: 3 } }).png().toFile(path.join(ctx.out, `final-${v.name}.png`));
    console.log(`final proof ${v.name} repetition ${rep}: ${((end - start) / 1000).toFixed(3)} s`);
  }
  const after = source();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('replay changed deposited pigment');
  const median = a => a.toSorted((a, b) => a - b)[a.length >> 1];
  for (const v of variants) {
    v.medians = Object.fromEntries(['prepareMs', 'spreadMs', 'opticsMs', 'compositeMs', 'totalMs', 'cpuMs'].map(k => [k, median(v.samples.map(s => s[k]))]));
    delete v.spread;
  }
  const [current, baseline] = variants;
  const report = {
    kind: 'final reconstruction of one full-size GPU painting; identical deposited layers, paper and optics',
    backend: ctx.GPU_INFO.backend, fallback: Boolean(ctx.GPU_INFO.fallback), gpu: ctx.GPU_INFO,
    rendererBackend: 'cpu', code: ctx.CODE_STATE.commit, sourceWidth: ctx.srcMeta.width,
    nativePixels: [ctx.W2, ctx.H2], finalPixels: [FW, FH], mmPerCell: ctx.CP_MM, N,
    pigments: pigments.length, layers: layers.length, deposited: before,
    productionPixelsMatch: current.productionPixelsMatch,
    identityReferencePixelsMatch: identity ? current.imageSha256 === variants[2].imageSha256 : null,
    warmups: 1, repetitions: reps, method: 'alternating order; reconstruction, optics and pen composition or averaging included; PNG and hashing outside timing',
    variants, totalRatio: current.medians.totalMs / baseline.medians.totalMs,
    pairedMedianRatio: median(current.samples.map((s, i) => s.totalMs / baseline.samples[i].totalMs)),
    paintingPeakRssGiB, peakRssGiB: process.resourceUsage().maxRSS * 1024 / 1024 ** 3,
  };
  fs.writeFileSync(path.join(ctx.out, 'final-render-proof.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ totalRatio: report.totalRatio, pairedMedianRatio: report.pairedMedianRatio, peakRssGiB: report.peakRssGiB, productionPixelsMatch: report.productionPixelsMatch }));
} finally {
  try { ctx.sheet?._gpu?.close(); } catch {}
  JSONL.close(); removeHook();
  process.off('exit', JSONL.close); process.off('uncaughtExceptionMonitor', JSONL.flush);
}
process.exit(process.exitCode ?? 0);
