// What covers each region's surface: the label that lets an unplanned run choose surface marks (src/paint/techniques/
// surface-marks.mjs) by what a region is. A vision judge reads the same overlay of numbered SAM regions that the ink
// labels use (ink-labels.mjs labelRegions) and names a coat, dressed stone, or something that takes no marks. The labels
// are a planning-time read of the subject, cached by source, regions, prompt and judge, and recorded in the run card.
// A region the judge calls anything but a coat or dressed stone, or is unsure of, takes no marks. When the judge cannot
// run, the result says so and has no labels: nothing is laid, and no other judge stands in.
import sharp from 'sharp';
import { labelRegions } from './ink-labels.mjs';

export const SURFACE_LABELS = Object.freeze(['fur_short', 'fur_curly', 'hair_long', 'dressed_stone', 'other', 'unsure']);
/** The surface mark kind a label asks for; a label not listed asks for none. */
export const SURFACE_KIND = Object.freeze({ fur_short: 'short-coat', fur_curly: 'curly-coat', hair_long: 'long-hair', dressed_stone: 'masonry' });

const PROMPT = ids => `This image is a contact sheet. Each tile shows one region of a painting cut out on grey, with its region number printed under the tile. For each region number, say what covers the surface of the region in its tile, choosing one label from: ${SURFACE_LABELS.join(', ')}. fur_short is short, smooth animal fur. fur_curly is curly or wavy fur or hair, including a spaniel's ears and a curly head of hair. hair_long is long hair, a long coat or a mane. dressed_stone is cut stone or brick masonry, laid in courses. other is anything else: skin, sky, cloth, foliage, water, glass, metal, paper, ground, smooth paint or a shadow. unsure is for a region you cannot tell. Judge what is visible in the tile. When in doubt use other or unsure. Regions: ${ids.join(', ')}. Reply with JSON only: a complete mapping from every listed region number to one allowed label, with no omitted or additional region keys.`;

const TILE = 300, COLS = 5, PAD = 36;

/**
 * The contact sheet the judge reads: each region cut out of the painting on grey, in a tile, its number under it. A numbered
 * outline over the whole picture misplaces a number on a region that wraps another (a dog's coat around its tongue); a tile
 * cannot.
 */
async function cutoutSheetPng({ image, labels, w, h, ids }) {
  const rgb = await sharp(image).flatten({ background: '#fff' }).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const rows = Math.ceil(ids.length / COLS), W = COLS * TILE, H = rows * (TILE + PAD), composites = [], text = [];
  for (let q = 0; q < ids.length; q++) {
    const id = ids[q]; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (labels[y * w + x] === id) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const col = q % COLS, row = (q / COLS) | 0, left = col * TILE, top = row * (TILE + PAD);
    if (x1 >= 0) {
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, px = Buffer.alloc(bw * bh * 3, 128);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (labels[(y0 + y) * w + x0 + x] === id) { const i = ((y0 + y) * w + x0 + x) * 3, o = (y * bw + x) * 3; px[o] = rgb[i]; px[o + 1] = rgb[i + 1]; px[o + 2] = rgb[i + 2]; }
      const tile = await sharp(px, { raw: { width: bw, height: bh, channels: 3 } }).resize(TILE - 8, TILE - 8, { fit: 'contain', background: { r: 128, g: 128, b: 128 } }).png().toBuffer();
      composites.push({ input: tile, left: left + 4, top: top + 4 });
    }
    text.push(`<rect x="${left + 2}" y="${top + 2}" width="${TILE - 4}" height="${TILE - 4}" fill="none" stroke="#bbb" stroke-width="2"/><text x="${left + TILE / 2}" y="${top + TILE + PAD - 10}" font-family="Helvetica" font-size="26" font-weight="bold" text-anchor="middle" fill="#000">${id}</text>`);
  }
  composites.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${text.join('')}</svg>`), left: 0, top: 0 });
  return sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } }).composite(composites).png().toBuffer();
}

/**
 * @returns {{ status: 'ok'|'unavailable', judge, model, cached, labels: {id: label}, kinds: {id: kind}, reason? }}
 *   labels cover every region when ok; kinds hold only the regions that take marks; unavailable has neither and says why
 */
export async function labelSurfaces({ image, regions, labelMap, w, h, judge = 'codex', cacheDir, run, env = process.env }) {
  try {
    const lab = await labelRegions({ image, regions, labelMap, w, h, judge, cacheDir, env, ...(run ? { run } : {}), vocabulary: SURFACE_LABELS, promptFor: PROMPT, overlayFor: cutoutSheetPng });
    const kinds = {};
    for (const [id, label] of Object.entries(lab.labels)) if (SURFACE_KIND[label]) kinds[id] = SURFACE_KIND[label];
    return { status: 'ok', judge: lab.judge, model: lab.identity?.model ?? null, cached: !!lab.cached, labels: lab.labels, kinds };
  } catch (e) {
    return { status: 'unavailable', judge, model: null, cached: false, labels: {}, kinds: {}, reason: e.message };
  }
}
