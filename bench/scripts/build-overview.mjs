#!/usr/bin/env node
// Write docs/img/benchmark-overview.webp from results/results.json: a white card with two titled rows of tiles.
//   Row 1, "Each model's best painting, any round": the four targets in a 2 x 2 tile, then each model's best painting.
//   Row 2, "Best Ships painting per model, V1 to V3": the Ships target, then each model's best Ships painting.
// Every tile has the same size, with the model name and round, subject, % of the target's own score and raw score
// under it. The card is drawn at 2x so its text stays sharp when GitHub scales it to the README's width.
//   node bench/scripts/build-overview.mjs [--results bench/results/results.json] [--out docs/img/benchmark-overview.webp]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BENCH, RESULTS, REPO, PUBLIC_CROPS, readJson } from './lib.mjs';
import { bestPaintings, bestShips, labelLines, SHIPS_CROP } from './overview-picks.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const resultsFile = path.resolve(opt('results', path.join(RESULTS, 'results.json')));
const outFile = path.resolve(opt('out', path.join(REPO, 'docs', 'img', 'benchmark-overview.webp')));

// Logical pixels; the image is SCALE times larger. A tile is 120 px wide with a 104 px picture and two label lines.
export const SCALE = 2;
export const LAYOUT = {
  pad: 20, titleH: 28, rowGap: 14, cardRadius: 12,
  tileW: 120, picH: 104, gap: 10, radius: 4, tileH: 148, line1: 121, line2: 138,
  titleSize: 15, fontSize: 12, fontSize2: 11,
  card: '#ffffff', border: '#d0d7de', title: '#1f2328', label: '#59636e',
};
const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = v => Math.round(v * SCALE);

/** The row titles and tiles, in logical pixels. Each tile is { left, top, label: [line1, line2], pictures }. */
export function overviewLayout(R) {
  const { pad, titleH, rowGap, tileW, picH, gap, tileH } = LAYOUT;
  const crops = R.crops.filter(c => PUBLIC_CROPS.includes(c.key) && c.distributed);
  const ships = R.crops.find(c => c.key === SHIPS_CROP);
  const rows = [
    { title: "Each model's best painting, any round", target: { label: ['Targets', `${crops.length} subjects`], files: crops.map(c => c.file) }, picks: bestPaintings(R) },
    { title: 'Best Ships painting per model, V1 to V3', target: { label: ['Target', ships.name], files: [ships.file] }, picks: bestShips(R) },
  ];
  const tilesPerRow = Math.max(...rows.map(r => r.picks.length + 1));
  const width = 2 * pad + tilesPerRow * tileW + (tilesPerRow - 1) * gap;
  let y = pad;
  const laid = rows.map(r => {
    const titleY = y + LAYOUT.titleSize;
    const top = y + titleH;
    y = top + tileH + rowGap;
    const tiles = [r.target, ...r.picks.map(p => ({ label: labelLines(p), files: [p.image] }))]
      .map((t, i) => ({ ...t, left: pad + i * (tileW + gap), top }));
    return { title: r.title, titleY, tiles, picks: r.picks };
  });
  return { width, height: y - rowGap + pad - 4, rows: laid, picH };
}

function cardSvg({ width, height, rows }) {
  const L = LAYOUT;
  const text = (x, y, s, size, fill, extra = '') => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}"${extra}>${esc(s)}</text>`;
  const parts = [`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${L.cardRadius}" fill="${L.card}" stroke="${L.border}"/>`];
  for (const r of rows) {
    parts.push(text(L.pad, r.titleY, r.title, L.titleSize, L.title, ' font-weight="600"'));
    for (const t of r.tiles) {
      const cx = t.left + L.tileW / 2, mid = ' text-anchor="middle"';
      parts.push(text(cx, t.top + L.line1, t.label[0], L.fontSize, L.label, mid), text(cx, t.top + L.line2, t.label[1], L.fontSize2, L.label, mid));
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`);
}

const roundedMask = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${px(LAYOUT.radius)}" fill="#fff"/></svg>`);

async function picture(file, w, h) {
  const pic = await sharp(path.join(BENCH, file)).removeAlpha().resize(w, h, { fit: 'cover' }).png().toBuffer();
  return sharp(roundedMask(w, h)).composite([{ input: pic, blend: 'in' }]).png().toBuffer();
}

/** One tile's pictures: a single picture, or targets in a grid with a 2 px gutter. */
async function tilePictures(t) {
  const W = px(LAYOUT.tileW), H = px(LAYOUT.picH), left = px(t.left), top = px(t.top);
  if (t.files.length === 1) return [{ input: await picture(t.files[0], W, H), left, top }];
  const cols = Math.ceil(Math.sqrt(t.files.length)), rows = Math.ceil(t.files.length / cols);
  const g = px(2), w = Math.floor((W - g * (cols - 1)) / cols), h = Math.floor((H - g * (rows - 1)) / rows);
  return Promise.all(t.files.map(async (f, i) => ({ input: await picture(f, w, h), left: left + (i % cols) * (w + g), top: top + Math.floor(i / cols) * (h + g) })));
}

export async function buildOverview(R) {
  const layout = overviewLayout(R);
  const base = await sharp(cardSvg(layout), { density: 72 * SCALE }).png().toBuffer();
  const layers = (await Promise.all(layout.rows.flatMap(r => r.tiles.map(tilePictures)))).flat();
  const buf = await sharp(base).composite(layers).webp({ quality: 84, alphaQuality: 100, smartSubsample: true }).toBuffer();
  return { buf, layout };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { buf, layout } = await buildOverview(readJson(resultsFile));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  for (const r of layout.rows) {
    console.log(r.title);
    for (const p of r.picks) console.log(`  ${labelLines(p).join(' | ')}  ${p.image}`);
  }
  console.log(`wrote ${path.relative(REPO, outFile)} (${px(layout.width)} x ${px(layout.height)} px, shown at ${layout.width} px, ${Math.round(buf.length / 1024)} KB)`);
}
