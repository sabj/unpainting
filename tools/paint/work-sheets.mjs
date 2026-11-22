// The pictures of a finished painting that a session is handed to look at (a later try: its own previous painting;
// level 4: the automatic painter's): the dried full-size sheet beside the subject, the replay sheet (the painter's
// frames in order, so the order of the work can be read), and the arrows sheet (every planned stroke as an arrow from
// where the brush lands to where it lifts, early strokes blue and late ones red, so the hand's direction and order can
// be read). All are made from the painting's own folder; nothing is scored and no number is drawn on them.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { beside } from './plan-data.mjs';

/** The names the pictures are handed under: plain words that say what each is. */
export const SHEET_FILES = Object.freeze({ beside: 'final-beside-subject.jpg', replay: 'replay-sheet-frames-in-order.jpg', arrows: 'arrows-sheet-strokes-in-order.jpg' });
const FRAME = /^f\d{4}\.(jpg|png)$/;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** At most `most` of `list`, evenly spread, the first and the last kept. */
export function spread(list, most) {
  if (list.length <= most) return list;
  return Array.from({ length: most }, (_, i) => list[Math.round(i * (list.length - 1) / (most - 1))]);
}

/** The dried sheet beside the subject, at the painting's own size (no taller than `most` px). A JPEG buffer. */
export async function besideSubject(painting, source, { most = 2400 } = {}) {
  const m = await sharp(painting).metadata();
  return sharp(await beside([painting, source], { height: Math.min(most, m.height), gap: 24 })).jpeg({ quality: 92 }).toBuffer();
}

/** The painter's frames laid out in order, left to right and top to bottom, each numbered. A JPEG buffer. */
export async function replaySheet(frames, { columns = 6, cell = 520, most = 48 } = {}) {
  if (frames.length < 2) throw new Error(`replay sheet: ${frames.length} frames; a painting's replay needs the frames of its work (paint it with frames kept)`);
  const use = spread(frames, most), cols = Math.min(columns, use.length), rows = Math.ceil(use.length / cols), m = await sharp(use[0]).metadata(), h = Math.round(cell * m.height / m.width), gap = 8, label = 26;
  const parts = [];
  for (const [i, f] of use.entries()) {
    const x = (i % cols) * (cell + gap), y = Math.floor(i / cols) * (h + label + gap);
    parts.push({ input: await sharp(f).resize(cell, h, { fit: 'fill' }).png().toBuffer(), left: x, top: y + label });
    parts.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${label}"><text x="2" y="19" font-family="Helvetica" font-size="18" fill="#222">${i + 1} of ${use.length}</text></svg>`), left: x, top: y });
  }
  return sharp({ create: { width: cols * (cell + gap) - gap, height: rows * (h + label + gap) - gap, channels: 3, background: '#ffffff' } }).composite(parts).jpeg({ quality: 88 }).toBuffer();
}

/** The colour of the stroke at share t of the work (0 the first, 1 the last): blue, through green, to red. */
export function orderColour(t) {
  const h = Math.round(240 * (1 - Math.max(0, Math.min(1, t))));
  return `hsl(${h}, 85%, 42%)`;
}

/**
 * The arrows of a plan as SVG paths: for each stroke of each wash, in painting order, a line along its path and an
 * arrowhead where the brush lifts. `plan`: value-plan.json (its passes hold strokes with points in sheet mm).
 * {svg (the body), strokes}.
 */
export function arrowsSvg(plan, { widthMm, heightMm, width }) {
  const k = width / widthMm, all = (plan.passes ?? []).flatMap(q => (q.strokes ?? []).filter(st => Array.isArray(st.points) && st.points.length >= 2)), out = [];
  all.forEach((st, i) => {
    const P = st.points, c = orderColour(all.length > 1 ? i / (all.length - 1) : 0), a = P[P.length - 2], b = P[P.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hx = b[0] * k, hy = b[1] * k, r = 7;
    const d = spread(P, 12).map(p => `${(p[0] * k).toFixed(1)},${(p[1] * k).toFixed(1)}`).join(' ');
    const wing = t => `${(hx - r * Math.cos(ang + t)).toFixed(1)},${(hy - r * Math.sin(ang + t)).toFixed(1)}`;
    out.push(`<polyline points="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-opacity="0.85"/><polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${wing(0.45)} ${wing(-0.45)}" fill="${c}"/>`);
  });
  return { svg: out.join(''), strokes: all.length, height: Math.round(heightMm * k) };
}

/** The arrows sheet: the dried painting made pale, every stroke drawn over it as an arrow coloured by its place in the order. A JPEG buffer. */
export async function arrowsSheet({ plan, painting, widthMm, heightMm, width = 2000 }) {
  const a = arrowsSvg(plan, { widthMm, heightMm, width });
  if (!a.strokes) throw new Error('arrows sheet: the plan holds no stroke with a path');
  const base = await sharp(painting).resize(width, a.height, { fit: 'fill' }).modulate({ saturation: 0.35 }).linear(0.45, 140).png().toBuffer(), bar = 46;
  const legend = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bar}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="30" font-family="Helvetica" font-size="22" fill="#222">${esc(`${a.strokes} strokes in the order they were laid: each arrow runs from where the brush lands to where it lifts; first strokes blue, last strokes red`)}</text></svg>`;
  return sharp({ create: { width, height: a.height + bar, channels: 3, background: '#ffffff' } }).composite([{ input: base, left: 0, top: bar }, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${a.height}">${a.svg}</svg>`), left: 0, top: bar }, { input: Buffer.from(legend), left: 0, top: 0 }]).jpeg({ quality: 90 }).toBuffer();
}

/**
 * The three sheets of a finished painting written into `to`. `run`: the folder of a finished `npm run paint ... paint`
 * (run.json and plate/). Returns [{from, name, what, picture: true}], the files a session is handed. Throws, naming
 * what is missing, when the folder is not a finished full painting: nothing is handed in its place.
 */
export async function writeWorkSheets(run, to, { whose }) {
  let record; try { record = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8')); } catch { throw new Error(`${run}: no run.json; the sheets are made from a finished painting's own folder`); }
  if (record.mode !== 'paint' || record.failure) throw new Error(`${run}: ${record.failure ? `the painting failed (${record.failure})` : 'a plan only, not a painting'}; the sheets are made from a finished painting`);
  const plate = path.join(run, 'plate'), painting = ['painting.png', 'painting.jpg'].map(f => path.join(plate, f)).find(f => fs.existsSync(f));
  if (!painting) throw new Error(`${run}: no dried painting in plate/`);
  const planFile = path.join(plate, 'value-plan.json'); if (!fs.existsSync(planFile)) throw new Error(`${run}: no value-plan.json in plate/`);
  const source = record.subject?.sourceAbs; if (!source || !fs.existsSync(source)) throw new Error(`${run}: the subject's picture (${source ?? 'not recorded'}) is not on this machine`);
  const frames = fs.readdirSync(plate).filter(f => FRAME.test(f)).sort().map(f => path.join(plate, f));
  fs.mkdirSync(to, { recursive: true });
  const put = async (name, buf) => { fs.writeFileSync(path.join(to, name), buf); return path.join(to, name); };
  const m = await sharp(painting).metadata(), heightMm = record.sheet.heightMm ?? record.sheet.widthMm * m.height / m.width;
  return [
    { from: await put(SHEET_FILES.beside, await besideSubject(painting, source)), name: SHEET_FILES.beside, picture: true, what: `${whose} painting as it dried, at full size, on the left; the subject on the right` },
    { from: await put(SHEET_FILES.replay, await replaySheet(frames)), name: SHEET_FILES.replay, picture: true, what: `the replay of ${whose} painting: the sheet as the work went on, frames in order, numbered` },
    { from: await put(SHEET_FILES.arrows, await arrowsSheet({ plan: JSON.parse(fs.readFileSync(planFile, 'utf8')), painting, widthMm: record.sheet.widthMm, heightMm })), name: SHEET_FILES.arrows, picture: true, what: `every stroke of ${whose} painting as an arrow from where the brush lands to where it lifts, over the pale painting; first strokes blue, last strokes red` },
  ];
}
