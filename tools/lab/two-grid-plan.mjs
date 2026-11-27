// Run a stroke plan on the two-grid solver (coarse water, fine pigment) via
// strokeFine + dryFine + bounded renderFine, on CPU or Metal WebGPU.
import crypto from 'node:crypto';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip } from '../../src/media/brush.mjs';
import { attachFine, fineTotals, fineBytes } from '../../src/media/fine-pigment.mjs';
import { strokeFine } from '../../src/media/fine-brush.mjs';
import { renderFine } from '../../src/media/fine-optics.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { dryFine } from './two-grid-dry.mjs';

const DRY_OPTS = { levelMax: 140, dt: 2 };

function brushFor(cmd, mm, seed) {
  const b = cmd.brush;
  return createBrush({
    flat: b.kind === 'flat', radius: b.widthMm / 2 / mm, bristles: 24,
    loadWater: cmd.load.capacityMm3 / mm ** 2, belly: 12, give: 0.9,
    feed: b.feed ?? 0.4, free: b.free ?? 0.4, film: b.film ?? 0.25, wetMix: b.wetMix ?? 0.85,
    splay: 0.03, stiffness: Math.max(1, Math.round(3 / mm)), bridge: 0.98, bridgeSoft: 3,
    seed: seed + parseInt(crypto.createHash('sha256').update(cmd.id).digest('hex').slice(0, 7), 16),
  });
}

export async function runTwoGridPlan(plan, { waterMm = 0.52, N = 8, transport = null, dryOpts = DRY_OPTS, sheetOpts = null } = {}) {
  const g = plan.grid, physW = g.w * g.mmPerCell, physH = g.h * g.mmPerCell;
  const cw = Math.max(4, Math.round(physW / waterMm)), ch = Math.max(4, Math.round(physH / waterMm));
  const fineMm = waterMm / N, FW = cw * N, FH = ch * N;
  const pigments = plan.palette.map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));
  const paperOpts = mm => ({
    ...plan.paper, seed: plan.paperSeed ?? 1, mmPerCell: mm, cockle: { rmsMm: 0 },
    coldPress: plan.paper?.coldPress ? { ...plan.paper.coldPress, mmPerCell: mm } : { mmPerCell: mm },
  });
  const t0 = performance.now();
  const coarsePaper = makePaper(cw, ch, paperOpts(waterMm));
  const finePaper = makePaper(FW, FH, paperOpts(fineMm));
  const sheet = createSheet(coarsePaper, pigments);
  const opts = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1, ...sheetOpts };
  const F = attachFine(sheet, finePaper, N, opts);
  const tBuild = performance.now();
  let strokes = 0, dries = 0, totalSteps = 0, peakFineBytes = fineBytes(F);
  const onStep = () => { peakFineBytes = Math.max(peakFineBytes, fineBytes(F)); totalSteps++; };
  for (const cmd of plan.commands) {
    if (cmd.operation === 'dry') {
      await dryFine(F, transport, { ...dryOpts, onStep });
      dries++;
      continue;
    }
    const brush = brushFor(cmd, fineMm, plan.paperSeed ?? 1);
    dip(brush, {
      water: cmd.load.waterQuantityMm3 / cmd.load.capacityMm3,
      conc: plan.palette.map(k => cmd.load.concentration?.[k] ?? 0),
    });
    const upright = cmd.brush.orientation === 'sweep' ? 'sweep' : false;
    const paths = cmd.paths.map(ps => ps.map(q => ({
      x: q.x * FW, y: q.y * FH, p: q.p ?? 0.85, r: (q.rMm ?? cmd.brush.widthMm / 2) / fineMm,
    })));
    sheet.wetting = cmd.role === 'clean-water';
    for (const pts of paths) { strokeFine(F, brush, pts, { upright }); strokes++; }
    sheet.wetting = false;
  }
  if (plan.commands.at(-1)?.operation !== 'dry') {
    await dryFine(F, transport, { ...dryOpts, onStep });
    dries++;
  }
  const tDry = performance.now();
  const [pr, pg, pb] = plan.paperRGB ?? [246, 245, 239];
  const ground = new Uint8Array(F.fn * 3);
  for (let i = 0; i < F.fn; i++) { ground[i * 3] = pr; ground[i * 3 + 1] = pg; ground[i * 3 + 2] = pb; }
  const rgb = renderFine(F, ground);
  const tRender = performance.now();
  const totals = pigments.map((_, k) => fineTotals(F, k));
  return {
    F, rgb, width: FW, height: FH, waterWidth: cw, waterHeight: ch, waterMm, pigmentMm: fineMm, N,
    strokes, dries, layers: F.layers.length, steps: totalSteps, totals,
    buildS: +((tBuild - t0) / 1000).toFixed(2),
    paintS: +((tDry - tBuild) / 1000).toFixed(2),
    fineS: +(F.ms / 1000).toFixed(2),
    renderS: +((tRender - tDry) / 1000).toFixed(2),
    fineMB: +(fineBytes(F) / 2 ** 20).toFixed(2),
    peakFineMB: +(peakFineBytes / 2 ** 20).toFixed(2),
    gpuBufferMB: transport ? +(transport.bytes() / 2 ** 20).toFixed(2) : 0,
    rssMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    peakRssMB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  };
}
