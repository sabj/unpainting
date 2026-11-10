// Plan-time check of the value plan against the target, CPU only: the plan's ledger (every passage booked flat, as the
// painter books it) rendered through the sheet's optics on flat paper, as plan.jpg is after a painting, and its value
// statistics beside the target's at the quality gate's size. Written by --valuepreviewonly; nothing is painted.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderLayers } from '../../src/media/km.mjs';
import { planLedger, valueStats } from '../../src/eval/plan-values.mjs';

const GATE_WIDTH = 300;
async function statsAt(rgb, w, h) {
  const { data, info } = await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength), { raw: { width: w, height: h, channels: 3 } }).resize({ width: GATE_WIDTH }).raw().toBuffer({ resolveWithObject: true });
  return valueStats(data, info.width * info.height);
}

export async function writePlanValueCheck({ plan, out, w, h, pigments, paperRGB, rgb }) {
  const n = w * h, k = pigments.length, ledger = planLedger(plan, n, k);
  const layer = pigments.map((_, j) => Float32Array.from({ length: n }, (_, i) => ledger[i * k + j]));
  const flat = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = paperRGB[c];
  const planned = renderLayers([layer], pigments, flat, n, 1);
  await sharp(Buffer.from(planned.buffer, planned.byteOffset, planned.byteLength), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'plan-ledger.png'));
  const report = { kind: 'plan ledger through the sheet optics on flat paper against the target, both at 300 px; plan time, nothing painted', plan: await statsAt(planned, w, h), target: await statsAt(rgb, w, h) };
  fs.writeFileSync(path.join(out, 'plan-value-check.json'), JSON.stringify(report, null, 2));
  return report;
}
