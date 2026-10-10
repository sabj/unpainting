#!/usr/bin/env node
// Builds the README pipeline map (docs/img/pipeline-map.png): four stage cards with arrows between them, drawn as HTML
// and screenshot by headless Chrome with a transparent background, so the map sits on GitHub's light and dark themes.
//
//   node tools/readme/pipeline-map.mjs --site DIR --run DIR [--out docs/img/pipeline-map.png] [--fonts DIR] [--playwright DIR]
//
// --site    the Part 1 post's images/pipeline folder (samjackson.org), which holds the pictures for cards 01, 03 and 04:
//           the beach study's regions, palette, stroke samples, saved stages and review.
// --run     a painter run (tools/paint-plate.mjs --out DIR) with frames.json. Card 02 shows its blank paper
//           (the first "paper" frame), its reserved lights (the frisket, laid over the run's
//           source.jpg; see tapeReserve), and its drawing (the last "pen" or "prep" frame before any wash).
// --fonts   a folder with eb-garamond-normal.woff2 and eb-garamond-normal-600.woff2 for the titles (default
//           docs/lab/fonts, which has only the regular face; samjackson.org's site/fonts has both).
// --playwright  a folder whose node_modules holds playwright, when this repository has none installed.
//
// Only resizing, cropping and the reserve overlay are applied. No painting frame is recoloured or generated.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const USAGE = 'usage: node tools/readme/pipeline-map.mjs --site DIR --run DIR [--out FILE] [--fonts DIR] [--playwright DIR]';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const SITE = flag('site'), RUN = flag('run');
const OUT = path.resolve(flag('out') ?? path.join(ROOT, 'docs/img/pipeline-map.png'));
if (!SITE || !RUN) { console.error(USAGE); process.exit(2); }

// Card geometry: 1900 x 500, four 451 px cards and three 32 px arrows. Each card's picture area is 419 x 376.
const MAP_W = 1900, MAP_H = 500, ARROW_W = 32, LINE = 1.5;
// Card 02: a 143 px column (paper over reserved lights) beside the 266 px pen drawing.
const COL_W = 143, DRAW_W = 266, AREA_H = 376, GAP = 10;
// The reserve panel: the target dimmed toward paper, so the reserved shapes read as the bare paper they will stay.
const DIM = 0.42, LIFT_GAIN = 12, OUTLINE = [153, 84, 58];

const need = (file, what) => { if (!fs.existsSync(file)) { console.error(`missing ${what}: ${file}`); process.exit(2); } return file; };
const siteImage = name => need(path.join(SITE, name), 'site image');

async function loadPlaywright() {
  const from = flag('playwright');
  if (from) return createRequire(path.join(path.resolve(from), 'package.json'))('playwright');
  try { return await import('playwright'); } catch { console.error(`playwright is not installed here; pass --playwright DIR. ${USAGE}`); process.exit(2); }
}

function runFrames() {
  const { frames } = JSON.parse(fs.readFileSync(need(path.join(RUN, 'frames.json'), 'frames.json'), 'utf8'));
  const firstWash = frames.findIndex(f => ['paint', 'wash'].includes(f.stage));
  const before = firstWash < 0 ? frames : frames.slice(0, firstWash);
  const paper = before.find(f => f.stage === 'paper');
  const pen = before.findLast(f => f.stage === 'pen' || f.stage === 'prep');
  for (const [name, f] of Object.entries({ paper, pen })) if (!f) { console.error(`${RUN}: no "${name}" frame before the first wash`); process.exit(2); }
  return Object.fromEntries(Object.entries({ paper, pen }).map(([k, f]) => [k, need(path.join(RUN, f.src), `${k} frame`)]));
}

const raw = file => sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });

// The reserved cells, at the painter's own resolution. The frisket film is clear in the frames, so it is read either
// from the run's mark tape (marks.json, written with --marks 1: the first resist mark is the frisket as laid), or, with
// no tape, from the frames on either side of "frisket off": the cells the lift returns to paper are the ones the film
// covered (a reserved light no wash crossed does not show this way). The panel is drawn at its size on the map: inside
// the reserve, the paper frame's own pixels; outside, the target dimmed toward the paper's median colour; a one-pixel
// line in the card's accent marks the reserve's edge.
async function tapeReserve() {
  const file = path.join(RUN, 'marks.json');
  if (!fs.existsSync(file)) return null;
  const tape = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mark = tape.marks.find(m => m.k === 'r');
  if (!mark) { console.error(`${file} has no resist mark: the run reserved no lights`); process.exit(2); }
  if (mark.m.length !== tape.w * tape.h) throw new Error(`resist mask has ${mark.m.length} cells, the tape is ${tape.w}x${tape.h}`);
  return { mask: Uint8Array.from(mark.m, v => (v ? 255 : 0)), w: tape.w, h: tape.h, source: 'marks.json' };
}

async function liftReserve() {
  const { frames } = JSON.parse(fs.readFileSync(path.join(RUN, 'frames.json'), 'utf8'));
  const k = frames.findIndex(f => f.stage === 'lift' && f.step === 'frisket off');
  if (k < 1) { console.error(`${RUN}: no marks.json and no "frisket off" frame, so the reserve cannot be read`); process.exit(2); }
  const before = await raw(path.join(RUN, frames[k - 1].src)), after = await raw(path.join(RUN, frames[k].src));
  const { width: w, height: h } = before.info, mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const lum = b => (b[i * 3] + b[i * 3 + 1] + b[i * 3 + 2]) / 3;
    mask[i] = lum(after.data) - lum(before.data) > LIFT_GAIN ? 255 : 0;
  }
  return { mask, w, h, source: `${frames[k - 1].src} to ${frames[k].src} (frisket off)` };
}

async function reservePanel(frames, file, w, h) {
  const tape = (await tapeReserve()) ?? (await liftReserve());
  const mask = await sharp(Buffer.from(tape.mask), { raw: { width: tape.w, height: tape.h, channels: 1 } })
    .resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const paper = await sharp(frames.paper).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const target = await sharp(need(path.join(RUN, 'source.jpg'), 'run source')).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const n = w * h, on = i => mask[i] >= 128;
  const tone = [0, 1, 2].map(k => { const v = Array.from({ length: n }, (_, i) => paper[i * 3 + k]).sort((a, b) => a - b); return v[n >> 1]; });
  const edge = i => { const x = i % w, y = (i / w) | 0; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < w && Y < h && !on(Y * w + X); }); };
  const out = Buffer.alloc(n * 3);
  let reserved = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] = on(i)
        ? (edge(i) ? OUTLINE[k] : paper[i * 3 + k])
        : Math.round(tone[k] + (target[i * 3 + k] - tone[k]) * DIM);
    }
    if (on(i)) reserved++;
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
  return { reservedShare: reserved / n, source: tape.source };
}

const ARROW = '<div class="ar"><svg viewBox="0 0 34 40"><path d="M4 20H27M18 8L30 20L18 32" fill="none" stroke="#8a8178" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
const chips = list => `<div class="ch">${list.map(c => `<span>${c}</span>`).join('')}</div>`;
const head = (num, title) => `<div class="hd"><i>${num}</i><h4>${title}</h4></div>`;

function html(u, fonts, bold) {
  const savedStage = i => `<div class="fr" style="width:107px;height:153px"><img src="${u.saved}" style="height:153px;left:${-i * 107.1}px;top:0"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"EB Garamond";src:url("${fonts}/eb-garamond-normal.woff2") format("woff2");font-weight:400;font-style:normal}
${bold ? `@font-face{font-family:"EB Garamond";src:url("${fonts}/eb-garamond-normal-600.woff2") format("woff2");font-weight:600;font-style:normal}` : ''}
html,body{margin:0;padding:0;background:transparent;line-height:${LINE}}
#strip{width:${MAP_W}px;height:${MAP_H}px;display:flex;align-items:stretch;justify-content:space-between;font-family:"EB Garamond",Georgia,serif;color:#42372e}
.st{width:451px;flex:none;border-top:4px solid #99543a;border-left:1px solid rgba(66,55,46,.22);border-right:1px solid rgba(66,55,46,.22);border-bottom:1px solid rgba(66,55,46,.22);box-shadow:0 2px 8px rgba(66,55,46,.18);background:#e8e2d6;padding:14px 16px;box-sizing:border-box;overflow:hidden;border-radius:6px}
.ar{width:${ARROW_W}px;flex:none;display:flex;align-items:center;justify-content:center}
.ar svg{width:34px;height:40px;display:block}
.hd{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;height:38px}
.hd i{font:700 21px ui-monospace,monospace;color:#99543a;font-style:normal}
.hd h4{margin:0;font-size:30px;font-weight:700}
.ch{display:flex;gap:5px;margin-bottom:12px;height:28px;overflow:hidden;white-space:nowrap}
.ch span{background:#f5f1e8;border:1px solid rgba(66,55,46,.2);padding:2px 7px;font-size:16px;color:#7b7166;border-radius:2px}
.im{display:flex;gap:${GAP}px;height:${AREA_H}px}
.fr{overflow:hidden;position:relative;flex:none}
.fr img{position:absolute;display:block}
img{display:block}
.prep{display:flex;flex-direction:column;gap:${GAP}px;width:${COL_W}px;flex:none}
.prep img,.draw{box-shadow:0 0 0 1px rgba(66,55,46,.2)}
</style></head><body><div id="strip">
<div class="st">${head('01', 'Plan the painting')}${chips(['Regions', 'Palette', 'Contours', 'Order passages'])}
<div class="im"><img src="${u.regions}" style="height:376px;width:270px"><img src="${u.palette}" style="height:376px;width:148px;object-fit:fill"></div></div>
${ARROW}
<div class="st">${head('02', 'Prepare the sheet')}${chips(['Paper', 'Reserve lights', 'Drawing'])}
<div class="im"><div class="prep">
<img src="${u.paper}" style="width:${COL_W}px;height:${AREA_H - GAP - u.reserveH}px;object-fit:cover;object-position:50% 50%">
<img src="${u.reserve}" style="width:${COL_W}px;height:${u.reserveH}px;object-fit:fill">
</div><img class="draw" src="${u.pen}" style="width:${DRAW_W}px;height:${AREA_H}px;object-fit:contain;background:${u.paperTone}"></div></div>
${ARROW}
<div class="st">${head('03', 'Paint')}${chips(['Next passage', 'Wet or dry', 'Load brush', 'Follow paths', 'Save'])}
<div class="im" style="flex-direction:column;gap:10px"><div style="display:flex;gap:6px;height:205px"><img src="${u.wet}" style="height:205px;width:138px;object-fit:cover"><img src="${u.dry}" style="height:205px;width:138px;object-fit:cover"><img src="${u.pressure}" style="height:205px;width:138px;object-fit:cover"></div>
<div style="display:flex;gap:0;height:153px">${[3, 4, 5, 6].map(savedStage).join('')}</div></div></div>
${ARROW}
<div class="st">${head('04', 'Review the painting')}${chips(['Painting vs target', 'Stages vs technique', 'Next attempt'])}
<div class="im"><img src="${u.review}" style="width:417px;height:376px;object-fit:contain;background:#f5f1e8"></div></div>
</div></body></html>`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-map-'));
try {
  const frames = runFrames();
  const reserveFile = path.join(tmp, 'reserve.png');
  const { width: fw, height: fh } = await sharp(frames.paper).metadata();
  const reserveH = Math.round(COL_W * fh / fw);
  const reserve = await reservePanel(frames, reserveFile, COL_W, reserveH);
  if (reserveH > AREA_H - GAP - 60) throw new Error(`the reserve panel (${COL_W}x${reserveH}) leaves too little room for the paper crop`);
  const paperStats = await sharp(frames.paper).stats();
  const paperTone = `rgb(${paperStats.channels.slice(0, 3).map(c => Math.round(c.mean)).join(',')})`;
  const url = f => pathToFileURL(path.resolve(f)).href;
  const u = {
    regions: url(siteImage('seg-beach-regions.webp')), palette: url(siteImage('pipeline-palette.webp')),
    wet: url(siteImage('pipeline-wet-wash.webp')), dry: url(siteImage('pipeline-dry-brush.webp')),
    pressure: url(siteImage('pipeline-pressure-stroke.webp')), saved: url(siteImage('pipeline-saved-stages.webp')),
    review: url(siteImage('pipeline-review.webp')),
    paper: url(frames.paper), reserve: url(reserveFile), pen: url(frames.pen), reserveH, paperTone,
  };
  const page = path.join(tmp, 'map.html');
  const fontDir = path.resolve(flag('fonts') ?? path.join(ROOT, 'docs/lab/fonts'));
  need(path.join(fontDir, 'eb-garamond-normal.woff2'), 'font');
  const bold = fs.existsSync(path.join(fontDir, 'eb-garamond-normal-600.woff2'));
  if (!bold) console.warn(`${fontDir} has no eb-garamond-normal-600.woff2: the titles fall back to a synthesised bold`);
  fs.writeFileSync(page, html(u, url(fontDir), bold));

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const p = await browser.newPage({ viewport: { width: MAP_W, height: 700 }, deviceScaleFactor: 1 });
    await p.goto(url(page));
    await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#strip').screenshot({ path: OUT, omitBackground: true });
  } finally { await browser.close(); }
  const meta = await sharp(OUT).metadata();
  console.log(`${path.relative(ROOT, OUT)} ${meta.width}x${meta.height} ${meta.channels} channels, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  console.log(`card 02: paper ${path.basename(frames.paper)}, reserve from ${reserve.source} (${(100 * reserve.reservedShare).toFixed(1)}% of the sheet), pen ${path.basename(frames.pen)}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
