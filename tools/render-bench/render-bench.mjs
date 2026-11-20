#!/usr/bin/env node
// The renderer benchmark: a fixed, seeded set of procedural mushroom plates (demos/fungi/mushrooms.mjs) painted on the
// CPU sheet and on the GPU sheet at two sheet widths. The plates need no target image and no model, so what changes
// between runs is the renderer: the brush, the sheet's flow and drying, and the GPU backend.
// It prints and writes, per plate: wall seconds, strokes and strokes per second, peak memory, the CPU-against-GPU
// difference of the finished sheet in L*, and a checksum and coarse fingerprint to say "same" or "changed" against an
// earlier run (--compare). The finished sheet is the pigment layers rendered over plain paper (no ink, no labels).
//   npm run bench:render [-- --sizes 256,512 --count 6 --out FILE --compare FILE --cpu-only]
// With no GPU it stops with an error; --cpu-only runs the CPU half on purpose.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { coherent, layersOf } from '../../src/media/sheet.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { attachGpu, gpuStats } from '../../src/media/gpu/link.mjs';
import { generateSpecimen, nativePlateStudy, nativePlateWashes, nativePlateSeed, simulateNativePassages, lamellarCoverage, NATIVE_PAINT_LIMITS, NATIVE_TRANSPORT } from '../../demos/fungi/mushrooms.mjs';
import { nodeMaskRasterizer } from './mask.mjs';
import { lstarDiff, fingerprint, checksum, verdict, table } from './score.mjs';

const PLATES = Object.freeze(['amanita-1', 'bolete-1', 'chanterelle-1', 'morel-1', 'oyster-1', 'coral-1']);
const PAPER = [247, 244, 236];

function args(argv) {
  const get = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
  const known = new Set(['--sizes', '--count', '--out', '--compare', '--cpu-only']);
  for (const a of argv) if (a.startsWith('--') && !known.has(a)) throw new Error(`unknown flag ${a}`);
  const sizes = get('sizes', '256,512').split(',').map(Number);
  if (!sizes.every(s => Number.isInteger(s) && s >= 64)) throw new Error('--sizes takes widths in cells, at least 64');
  const count = Number(get('count', PLATES.length));
  if (!Number.isInteger(count) || count < 1 || count > PLATES.length) throw new Error(`--count takes 1 to ${PLATES.length}`);
  return { sizes, count, out: path.resolve(get('out', path.join(os.tmpdir(), 'unpainting-render-bench.json'))), compare: get('compare', null), cpuOnly: argv.includes('--cpu-only') };
}

// Peak memory: the resident set sampled every 50 ms while the plate paints (the process's own maxRSS never falls, so
// it cannot show one plate's peak after a larger one).
function rssSampler() {
  let peak = process.memoryUsage().rss; const t = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 50);
  return () => { clearInterval(t); return Math.max(peak, process.memoryUsage().rss); };
}

// The GPU sheet's step always answers "still wet" (it does not count wet cells per step), and the plate's drying loop
// waits for a step that answers "dry". So on the GPU each step then reads the GPU's own wet-cell counter (the one its
// dry() reads; 32 bytes) and answers "dry" when it is zero. anyWet is the CPU's rule (sheet.mjs wetBoxes), kept to check
// the counter against it at the end of each plate.
export const anyWet = ({ M, s, n, paper }) => { for (let i = 0; i < n; i++) if (M[i] || s[i] > 0.02 * paper.capacity[i]) return true; return false; };
function reportWet(sheet) {
  const link = sheet._gpu, plain = link.step.bind(link);
  link.step = (sh, o) => { plain(sh, o); link.call({ op: 'counters' }); return link.ctrl[1] !== 0; };
}

async function paintPlate(typeId, index, width, backend) {
  const genome = generateSpecimen(`bench-${index}`, typeId), study = nativePlateWashes(nativePlateStudy({ genome, scene: 'plain' }));
  let sheet = null, info = null;
  const onSheet = s => {
    sheet = s;
    if (backend === 'gpu') { info = attachGpu(s, NATIVE_TRANSPORT, { mode: 'on', log: () => {} }); reportWet(s); }
  };
  global.gc?.(); const stop = rssSampler(), t0 = performance.now();
  try {
    const result = await simulateNativePassages(study, { width, seed: nativePlateSeed(genome, 'plain'), maskFor: nodeMaskRasterizer({ coverage: lamellarCoverage }), yieldWork: async () => {}, onSheet, limits: { ...NATIVE_PAINT_LIMITS, maxMs: 3.6e6 } });
    coherent(sheet);
    if (anyWet(sheet)) throw new Error(`${typeId} ${width} ${backend}: the finished sheet is still wet`);
    const seconds = (performance.now() - t0) / 1000, peakRss = stop();
    const n = sheet.n, rgb = renderLayers(layersOf(sheet), sheet.pigments, Buffer.alloc(n * 3).map((_, i) => PAPER[i % 3]), n, 1);
    const g = backend === 'gpu' ? gpuStats(sheet) : null;
    return { plate: typeId, seed: `bench-${index}`, width: sheet.w, height: sheet.h, backend, adapter: info?.adapter ?? null, seconds, strokes: result.strokes, segments: result.strokeSegments, flowSteps: result.steps, strokesPerSecond: result.strokes / seconds, peakRssMiB: peakRss / 2 ** 20, gpuSteps: g?.steps ?? null, gpuStrokes: g?.strokes ?? null, rgb };
  } finally { stop(); sheet?._gpu?.close(); }
}

async function main() {
  const o = args(process.argv.slice(2));
  const before = o.compare ? JSON.parse(fs.readFileSync(o.compare, 'utf8')) : null;
  const backends = o.cpuOnly ? ['cpu'] : ['cpu', 'gpu'];
  const rows = [], runs = [];
  for (const width of o.sizes) for (let i = 0; i < o.count; i++) {
    const typeId = PLATES[i], done = {};
    for (const backend of backends) {
      process.stderr.write(`${typeId} ${width} ${backend} ... `);
      let r;
      try { r = await paintPlate(typeId, i, width, backend); }
      catch (e) {
        if (backend === 'gpu') throw new Error(`GPU run failed (${e.message}). Run with --cpu-only to benchmark the CPU sheet on purpose.`);
        throw e;
      }
      process.stderr.write(`${r.seconds.toFixed(1)} s\n`);
      r.checksum = checksum(r.rgb); const fp = fingerprint(r.rgb, r.width, r.height); r.fingerprint = fp.hash; r.grid = fp.cells;
      done[backend] = r;
    }
    const agree = done.gpu ? lstarDiff(done.cpu.rgb, done.gpu.rgb) : null;
    for (const backend of backends) {
      const r = done[backend], key = `${r.plate}/${width}/${backend}`;
      const prior = before?.runs?.find(p => p.key === key);
      const { rgb, ...keep } = r;
      runs.push({ key, ...keep, cpuGpu: agree, verdict: verdict(r, prior) });
      rows.push({ plate: r.plate, cells: `${r.width}x${r.height}`, backend, seconds: r.seconds, strokes: r.strokes, sps: r.strokesPerSecond, mem: r.peakRssMiB, meanL: backend === 'gpu' ? agree.mean : null, worstL: backend === 'gpu' ? agree.worst : null, fp: `${r.fingerprint}/${r.checksum}`, verdict: verdict(r, prior) });
    }
  }
  const f = d => v => v.toFixed(d);
  const text = table([
    { key: 'plate', label: 'plate' }, { key: 'cells', label: 'sheet' }, { key: 'backend', label: 'backend' },
    { key: 'seconds', label: 'wall s', fmt: f(1) }, { key: 'strokes', label: 'strokes' }, { key: 'sps', label: 'strokes/s', fmt: f(1) },
    { key: 'mem', label: 'peak RSS MiB', fmt: f(0) }, { key: 'meanL', label: 'mean dL*', fmt: f(3) }, { key: 'worstL', label: 'worst dL*', fmt: f(2) },
    { key: 'fp', label: 'fingerprint/checksum' }, { key: 'verdict', label: 'vs compare' },
  ], rows);
  console.log(text);
  console.log('dL*: CPU sheet against GPU sheet, same plate and size. Peak RSS: resident set sampled every 50 ms during the plate.');
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  fs.writeFileSync(o.out, JSON.stringify({ format: 'unpainting-render-bench', version: 1, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, sizes: o.sizes, cpuOnly: o.cpuOnly, runs }, null, 1));
  console.log(`wrote ${o.out}`);
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) main().then(() => process.exit(0), e => { console.error(`render bench: ${e.message}`); process.exit(1); });
