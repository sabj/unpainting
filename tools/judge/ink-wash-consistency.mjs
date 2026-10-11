#!/usr/bin/env node
// Pre-paint self-consistency of an ink-and-wash plan. Divide the proposed wash out of the original (Part 1's split,
// see src/eval/consistency.mjs) and compare what is left with the proposed line drawing rendered at pen width.
//
//   node tools/judge/ink-wash-consistency.mjs --original T.png --wash PLAN/planned-wash.png \
//     --lines LINES-lines.json --out DIR [--width 1080] [--card card.json]
//
// --render PEN.png optionally judges executed linework against the same frozen wash; evaluation only.
// --wash is the painter's planned sheet without ink: `paint-plate.mjs --valuepreviewonly 1` writes planned-wash.png.
// Writes original/wash/residual/lines/disagree PNGs and metrics.json to --out. Planning only; nothing is painted.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { lumaOf, residual, compare, reconstruction, CLASS_COLOURS, DEFAULTS } from '../../src/eval/consistency.mjs';
import { contactMm, PEN_MM } from '../../src/crop/ink-free.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const need = k => { const v = opt(k); if (!v) throw Error(`--${k} is required`); return v; };

// Core transmittance of a dry black-ink line at concentration 12 (measured on the study's dry pen checkpoints:
// line cores reach luma 8-14 on paper 245).
const INK_T = 0.05;

async function lumaImage(file, W, H, kernel) {
  const { data, info } = await sharp(file).flatten({ background: '#ffffff' }).removeAlpha()
    .resize(W, H, { fit: 'fill', kernel }).raw().toBuffer({ resolveWithObject: true });
  return { L: lumaOf(data, W * H, info.channels), rgb: data };
}

/** The drawing file's paths as pen-width strokes on white, returned as transmittance. */
async function renderLines(doc, W, H, sheetMm) {
  const sx = W / doc.image.w, sy = H / doc.image.h, mmPerCell = sheetMm / W;
  const grey = Math.round(255 * INK_T);
  const segs = [];
  for (const g of doc.lines) {
    const pts = g.points, ws = g.widths ?? pts.map(() => 1.5);
    for (let k = 1; k < pts.length; k++) {
      const wpx = contactMm((ws[k - 1] + ws[k]) / 2) / mmPerCell;
      segs.push(`<line x1="${(pts[k - 1][0] * sx).toFixed(2)}" y1="${(pts[k - 1][1] * sy).toFixed(2)}" x2="${(pts[k][0] * sx).toFixed(2)}" y2="${(pts[k][1] * sy).toFixed(2)}" stroke-width="${wpx.toFixed(3)}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/><g stroke="rgb(${grey},${grey},${grey})" stroke-linecap="round" fill="none">${segs.join('')}</g></svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = lumaOf(data, W * H);
  return Float32Array.from(L, v => v / 255);
}

const greyPng = (T, W, H, file) => sharp(Buffer.from(Uint8Array.from(T, t => Math.round(255 * t))), { raw: { width: W, height: H, channels: 1 } }).png().toFile(file);

async function classPng(cls, W, H, file) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < cls.length; i++) { const c = CLASS_COLOURS[cls[i]]; buf[3 * i] = c[0]; buf[3 * i + 1] = c[1]; buf[3 * i + 2] = c[2]; }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
}

async function main() {
  const original = need('original'), washFile = need('wash'), linesFile = need('lines'), out = need('out');
  fs.mkdirSync(out, { recursive: true });
  const doc = JSON.parse(fs.readFileSync(linesFile, 'utf8'));
  if (!doc?.image?.w || !Array.isArray(doc.lines)) throw Error(`${linesFile} is not a drawing file (needs image.w and lines)`);
  const W = Number(opt('width', 1080)), H = Math.round(W * doc.image.h / doc.image.w);
  const sheetMm = Number(opt('sheetmm', DEFAULT_SHEET_MM));
  const settings = { ...DEFAULTS, width: W, sheetMm, inkCoreT: INK_T, penMm: PEN_MM };
  for (const k of Object.keys(DEFAULTS)) if (opt(k.toLowerCase())) settings[k] = Number(opt(k.toLowerCase()));

  const O = await lumaImage(original, W, H, 'lanczos3');
  const Wsh = await lumaImage(washFile, W, H, 'cubic');
  const renderFile = opt('render');
  const P = renderFile ? Float32Array.from((await lumaImage(renderFile, W, H, 'lanczos3')).L, v => v / 255) : await renderLines(doc, W, H, sheetMm);
  const { T, ratio } = residual(O.L, Wsh.L, settings);
  const cmp = compare(T, P, ratio, W, H, settings);
  const rec = reconstruction(O.L, Wsh.L, P);

  await sharp(O.rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(out, 'original.png'));
  await sharp(Wsh.rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(out, 'wash.png'));
  await greyPng(T, W, H, path.join(out, 'residual.png'));
  await greyPng(P, W, H, path.join(out, 'lines.png'));
  await classPng(cmp.cls, W, H, path.join(out, 'disagree.png'));

  const card = opt('card') ? JSON.parse(fs.readFileSync(opt('card'), 'utf8')) : {};
  const { cls, ...numbers } = cmp;
  const metrics = {
    stage: renderFile ? 'offline executed linework comparison against a frozen wash preview' : 'pre-paint planning comparison; nothing painted',
    method: 'Part 1 split: ink T = min(1, luma(original)/luma(wash)), >0.96 -> 1, floor 0.02',
    inputs: { original, wash: washFile, lines: linesFile, ...(renderFile ? { render: renderFile } : {}), paths: doc.lines.length },
    settings, card, ...numbers, ...rec,
  };
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  const pc = v => (100 * v).toFixed(1);
  console.log(`P ${pc(cmp.precision)} R ${pc(cmp.recall)} F1 ${pc(cmp.f1)} | pen-scale R ${pc(cmp.recallPenScale)} F1 ${pc(cmp.f1PenScale)} | residual: covered ${pc(cmp.residual.covered)} structure ${pc(cmp.residual.missedStructure)} texture ${pc(cmp.residual.missedTexture)} grain ${pc(cmp.residual.fineGrain)} washLight ${pc(cmp.residual.washTooLight)} | lines: matched ${pc(cmp.lines.matched)} mass ${pc(cmp.lines.lineOnMass)} clutter ${pc(cmp.lines.clutter)} washDark ${pc(cmp.lines.washTooDark)} | err ${pc(rec.washOnlyError)} -> ${pc(rec.washAndInkError)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
