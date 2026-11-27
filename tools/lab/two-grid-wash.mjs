// Two grids, phase (b): a 40 mm French ultramarine square poured on dry cold press and dried, on one grid or on the
// split grid (water on the coarse grid, pigment N times finer). Writes the dried pigment plane and a summary line.
//   node tools/lab/two-grid-wash.mjs --mm 0.26                 one grid at 0.26 mm
//   node tools/lab/two-grid-wash.mjs --mm 0.26 --fine 4        water 0.26 mm, pigment 0.065 mm
// CPU water, one thread. two-grid-gpu-wash.mjs runs the fine GPU phases.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, dry, totals, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { physicalOf, physicsFields } from '../../src/media/pigment-physical.mjs';
import { attachFine, finePour, fineTotals, fineBytes } from '../../src/media/fine-pigment.mjs';
import { renderFine } from '../../src/media/fine-optics.mjs';
import { setStrict, continuedSummary } from '../../src/media/checks.mjs';
import { dryFine } from './two-grid-dry.mjs';
import { assertHealthy } from '../../src/media/gpu/device-health.mjs';

setStrict(true); // A step limit or physical check must fail this engineering run, never fix it by drying in place.

export async function runWash(transport = null) {
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const mm = Number(arg('mm', 0.26)), N = Number(arg('fine', 1)), out = arg('out', fileURLToPath(new URL('../../work/lead-04/work/proof/two-grids/out', import.meta.url)));
if (!(mm > 0 && Number.isFinite(mm)) || !Number.isInteger(N) || N < 1) throw new Error('mm must be positive and fine must be a positive integer');
if (transport && N < 2) throw new Error('GPU fine transport requires --fine at least 2');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
const ULTRAMARINE = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) };
const O = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const SIZE = 46, CONC = 1.2;
const inside = (X, Y) => X > 3 && X < 43 && Y > 3 && Y < 43;
const paperOf = (w, m) => makePaper(w, w, { cockle: { rmsMm: 0 }, seed: 9, mmPerCell: m, coldPress: { mmPerCell: m } });

const t0 = performance.now(), w = Math.round(SIZE / mm);
const sheet = createSheet(paperOf(w, mm), [ULTRAMARINE]);
let fine = null;
if (N > 1) fine = attachFine(sheet, paperOf(w * N, mm / N), N, O);
for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (inside((x + 0.5) * mm, (y + 0.5) * mm)) deposit(sheet, y * w + x, 0.3, N > 1 ? null : [CONC * 0.3]);
// the pigment goes down on the fine grid where its own cells are inside the square (the brush path at its resolution)
if (fine) finePour(fine, inside, CONC * 0.3);
const before = fine ? fineTotals(fine) : totals(sheet).pig[0];
const tBuild = performance.now();
let steps = 0, peakFineBytes = fine ? fineBytes(fine) : 0;
const onStep = () => {
  if (fine) peakFineBytes = Math.max(peakFineBytes, fineBytes(fine));
  steps++;
};
if (fine) await dryFine(fine, transport, { onStep });
else dry(sheet, 200000, O, { levelMax: 200, dt: 2, onStep });
if (transport) assertHealthy(transport.health);
const tDry = performance.now();
const after = fine ? fineTotals(fine) : totals(sheet).pig[0];
// the dried plane: total pigment per cell at the pigment grid's own resolution
const pw = fine ? w * N : w, plane = new Float32Array(pw * pw);
if (fine) {
  for (const layer of fine.layers) for (let i = 0; i < plane.length; i++) plane[i] += layer[0][i];
  for (let i = 0; i < plane.length; i++) plane[i] += Math.fround(fine.G[0][i] + fine.D[0][i] + fine.P[0][i]);
} else for (const layer of layersOf(sheet)) { const a = layer[0]; for (let i = 0; i < plane.length; i++) plane[i] += a[i]; }
const tag = fine ? `split-${mm}-x${N}` : `single-${mm}`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${tag}.f32`), Buffer.from(plane.buffer));
let nativeExport = null;
if (fine) {
  const t = performance.now(), ground = new Uint8Array(fine.fn * 3);
  for (let i = 0; i < fine.fn; i++) ground.set([246, 245, 239], i * 3);
  const rgb = renderFine(fine, ground);
  await sharp(rgb, { raw: { width: pw, height: pw, channels: 3 } }).png().toFile(join(out, `${tag}.png`));
  nativeExport = { file: `${tag}.png`, width: pw, height: pw, seconds: (performance.now() - t) / 1000,
    rgbSha256: createHash('sha256').update(rgb).digest('hex'), fullPaletteSnapshot: false };
}
const summary = { tag, revision, dirty, backend: transport ? 'hybrid' : 'cpu', gpuPhases: transport ? ['fine-water-reconstruction', 'fine-flux-dct', 'fine-film-advection', 'fine-absorption', 'fine-diffusion', 'fine-settling-lift-stranding', 'fine-grain-slide', 'fine-pore-advection'] : [], fallback: false, continuedChecks: continuedSummary().total, width: pw, waterWidth: w, waterMm: mm, pigmentMm: mm / N, N, cells: pw * pw, waterCells: sheet.n, steps, buildS: +((tBuild - t0) / 1000).toFixed(2), dryS: +((tDry - tBuild) / 1000).toFixed(2),
  fineS: fine ? +(fine.ms / 1000).toFixed(2) : 0, before, after, conservation: after / before - 1, rssMB: Math.round(process.memoryUsage().rss / 2 ** 20), peakRssMB: process.resourceUsage().maxRSS / 1024, fineMB: fine ? +(fineBytes(fine) / 2 ** 20).toFixed(3) : 0, peakFineMB: Math.max(peakFineBytes, fine ? fineBytes(fine) : 0) / 2 ** 20, fineBytesPerCell: fine ? fineBytes(fine) / fine.fn : 0,
  gpuBufferMB: transport ? transport.bytes() / 2 ** 20 : 0, nativeExport,
  planeSha256: createHash('sha256').update(Buffer.from(plane.buffer)).digest('hex') };
writeFileSync(join(out, `${tag}.json`), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
return summary;
}

if (import.meta.main) await runWash();
