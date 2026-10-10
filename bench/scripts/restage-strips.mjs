#!/usr/bin/env node
// Rebuild every runs/**/<crop>-stages.webp in the current strip format from an older five-frame strip
// (10, 25, 50, 75 and 100% side by side). The raw stage frames are not kept, so this works from the strip itself.
// Strips already in the four-frame format are left alone, so it is safe to run twice.
//   node bench/scripts/restage-strips.mjs [--runs bench/runs]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RUNS } from './lib.mjs';
import { GAP, STAGES, STRIP_STAGES, writeStageStrip } from './images.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--runs');
const runsDir = path.resolve(i >= 0 ? argv[i + 1] : RUNS);

/** Number of frames in a strip, from the finished thumbnail's aspect ratio. */
async function frameCount(strip, final) {
  const s = await sharp(strip).metadata();
  const f = await sharp(final).metadata();
  const panelW = s.height * f.width / f.height;
  return Math.round((s.width + GAP) / (panelW + GAP));
}

async function restage(file) {
  const final = file.replace(/-stages\.webp$/, '.webp');
  if (!fs.existsSync(final)) throw new Error(`${file}: no finished thumbnail beside it`);
  const n = await frameCount(file, final);
  if (n === STRIP_STAGES.length) return false;
  if (n !== STAGES.length) throw new Error(`${file}: expected ${STAGES.length} frames, found ${n}`);
  const { width, height } = await sharp(file).metadata();
  const step = (width + GAP) / STAGES.length;
  const panelW = Math.round(step - GAP);
  const src = fs.readFileSync(file);
  const panels = await Promise.all(STRIP_STAGES.map((_, k) => sharp(src)
    .extract({ left: Math.round(k * step), top: 0, width: panelW, height }).png().toBuffer()));
  await writeStageStrip(panels, file);
  return true;
}

const files = fs.readdirSync(runsDir, { recursive: true }).filter(f => f.endsWith('-stages.webp')).sort().map(f => path.join(runsDir, f));
let changed = 0;
for (const f of files) if (await restage(f)) changed++;
console.log(`restaged ${changed} of ${files.length} strips`);
