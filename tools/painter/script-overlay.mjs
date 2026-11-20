// A painting script shown as the painting it describes, before anything is painted: on a paper-coloured ground, each
// stroke drawn as a ribbon whose width follows its pressure along its path, in its passage's paint colour (the swatch, or
// the pigments at their dilution), each passage laid over the last as a transparent layer (multiplied), the lights left
// blank; a dot where each stroke starts and a small arrowhead where it ends. A legend names the stages and counts the
// passages of each kind. Also: the same picture after each stage (first washes, local colours, shadows, touches, darks),
// and after 5, 15, 30, 50, 75 and 100% of the passages, so the order the author chose can be seen.
//
// With --drawing, the pen drawing (dark lines on white, the subject's frame) is laid first, under the paint, as on the sheet.
//
//   node tools/painter/script-overlay.mjs SCRIPT.json SUBJECT.png OUT.png [--drawing PEN.png] [--stages STAGES.png] [--order ORDER.png] [--title TEXT]
import fs from 'node:fs';
import sharp from 'sharp';
import { passageStrokes, upgradeScript, hexRgb, DILUTION_L } from '../../src/paint/methods/script-washes.mjs';

const PAPER = [246, 242, 232];
const STAGE_NAME = ['', '1 first washes', '2 local colours, masses', '3 shadows, glazes', '4 touches, textures', '5 darks, accents'];
/** Masstones (sRGB) to tint a passage that gives no swatch; only for this picture, never for painting. */
const MASSTONE = { ultramarine: [40, 50, 140], phthaloblue: [20, 50, 110], cerulean: [40, 110, 170], phthalogreen: [10, 90, 80], hansa: [240, 200, 30], cadyellow: [240, 180, 20], ochre: [200, 150, 60], rawsienna: [190, 120, 50], sienna: [150, 70, 40], umber: [90, 60, 40], rose: [200, 40, 100], cadred: [210, 50, 40], sapgreen: [80, 110, 40], paynes: [50, 60, 75], sepia: [80, 65, 50] };
const lin = v => (v / 255) ** 2.2, enc = v => Math.round(255 * Math.max(0, Math.min(1, v)) ** (1 / 2.2));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const stageOf = p => Math.max(1, Math.min(5, Math.round(p.stage ?? 2)));

/** A passage's colour on white paper: its swatch, or its pigments mixed (geometric mean of reflectance) and lightened to its dilution. */
export function paintColour(paint) {
  const sw = hexRgb(paint?.swatch); if (sw) return sw;
  const parts = Object.entries(paint?.pigments ?? {}), tot = parts.reduce((a, [, v]) => a + v, 0) || 1;
  const mix = [0, 1, 2].map(c => Math.exp(parts.reduce((a, [k, v]) => a + (v / tot) * Math.log(Math.max(0.02, lin((MASSTONE[k] ?? [128, 128, 128])[c]))), 0)));
  const L = (DILUTION_L[paint?.dilution] ?? 66) / 100, Y = 0.2126 * mix[0] + 0.7152 * mix[1] + 0.0722 * mix[2], want = L ** 3;
  const f = Y >= want ? 1 : Math.max(0, Math.min(1, (1 - want) / Math.max(1e-6, 1 - Y)));
  return mix.map(v => enc(1 - f * (1 - v)));
}

/** One stroke's ribbon as an SVG path (px), its width at each point r (0.25 + 0.75 p). */
function ribbon(st, px) {
  const P = st.points, L = [], R = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, hw = st.radiusMm * (P[k][4] ?? 1) * (0.25 + 0.75 * Math.min(1, P[k][2] ?? 1));
    L.push([(P[k][0] - dy / d * hw) * px, (P[k][1] + dx / d * hw) * px]); R.push([(P[k][0] + dy / d * hw) * px, (P[k][1] - dx / d * hw) * px]);
  }
  const caps = [P[0], P.at(-1)].map(q => `<circle cx="${(q[0] * px).toFixed(1)}" cy="${(q[1] * px).toFixed(1)}" r="${(st.radiusMm * (q[4] ?? 1) * (0.25 + 0.75 * Math.min(1, q[2] ?? 1)) * px).toFixed(1)}"/>`).join('');
  return `<path d="M${[...L, ...R.reverse()].map(q => q.map(v => v.toFixed(1)).join(',')).join(' L')} Z"/>${caps}`;
}

/** The direction marks of a passage's strokes: a dot at the start, a line along it, an arrowhead at its end. */
function arrows(strokes, px, col) {
  return strokes.map(st => {
    const P = st.points, a = P.at(-2) ?? P[0], b = P.at(-1), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 5;
    const tip = [b[0] * px, b[1] * px], l = [tip[0] - s * Math.cos(ang - 0.45), tip[1] - s * Math.sin(ang - 0.45)], r = [tip[0] - s * Math.cos(ang + 0.45), tip[1] - s * Math.sin(ang + 0.45)];
    return `<polyline points="${P.map(q => `${(q[0] * px).toFixed(1)},${(q[1] * px).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="0.8" opacity="0.6"/><circle cx="${(P[0][0] * px).toFixed(1)}" cy="${(P[0][1] * px).toFixed(1)}" r="1.8" fill="${col}"/><polygon points="${tip.join(',')} ${l.join(',')} ${r.join(',')}" fill="${col}"/>`;
  }).join('');
}

/** The picture after the first `upto` passages: a PNG buffer W x H. `marked` passages (a set of ids) get direction marks. */
async function picture(script, strokesOf, W, H, px, upto, marked, pen = null) {
  const layers = script.passages.slice(0, upto).map(p => {
    const all = strokesOf.get(p.id), c = hex(paintColour(p.paint));
    const charge = (p.charges ?? []).map(ch => `<g fill="${hex(paintColour(ch))}">${all.charges.get(ch).map(st => ribbon(st, px)).join('')}</g>`).join('');
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/><g fill="${c}">${all.main.map(st => ribbon(st, px)).join('')}</g>${charge}</svg>`);
  });
  let img = await sharp({ create: { width: W, height: H, channels: 3, background: { r: PAPER[0], g: PAPER[1], b: PAPER[2] } } }).png().toBuffer();
  if (pen) img = await sharp(img).composite([{ input: pen, blend: 'multiply' }]).png().toBuffer();
  for (let i = 0; i < layers.length; i += 8) img = await sharp(img).composite(layers.slice(i, i + 8).map(input => ({ input, blend: 'multiply' }))).png().toBuffer();
  const lights = (script.lights ?? []).map(l => `<polygon points="${(l.region ?? l).map(([x, y]) => `${(x * px).toFixed(1)},${(y * px).toFixed(1)}`).join(' ')}" fill="none" stroke="#9a9a9a" stroke-width="0.7" stroke-dasharray="2 3"/>`).join('');
  const marks = script.passages.slice(0, upto).filter(p => marked?.has(p.id)).map(p => arrows(strokesOf.get(p.id).main, px, p.kind === 'wash' ? '#8a8a8a' : '#333')).join('');
  return sharp(img).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lights}${marks}</svg>`) }]).png().toBuffer();
}

/** The legend: stages with their passage counts, kinds, papers, lights, strokes. */
function legend(script, strokesOf, W, title) {
  const by = [0, 0, 0, 0, 0, 0], kinds = {}, papers = {}; let n = 0;
  for (const p of script.passages) { by[stageOf(p)]++; kinds[p.kind] = (kinds[p.kind] ?? 0) + 1; papers[p.paper ?? 'dry'] = (papers[p.paper ?? 'dry'] ?? 0) + 1; n += strokesOf.get(p.id).main.length; }
  const fs = Math.max(13, Math.round(W / 95)), lh = Math.round(fs * 1.45), H = lh * 4 + 8;
  const t = (y, s, c = '#222') => `<text x="8" y="${y}" font-family="Helvetica" font-size="${fs}" fill="${c}">${esc(s)}</text>`;
  return { H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>${t(lh, `${title || `${script.author ?? '?'} · ${script.subject ?? ''}`} · ${script.passages.length} passages, ${n} strokes, ${(script.lights ?? []).length} lights kept as paper`)}${t(2 * lh, 'by stage: ' + [1, 2, 3, 4, 5].map(s => `${STAGE_NAME[s]} ${by[s]}`).join(' · '))}${t(3 * lh, 'by kind: ' + Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ') + ' · paper: ' + Object.entries(papers).map(([k, v]) => `${k} ${v}`).join(', '), '#444')}${t(4 * lh, 'Each stroke a ribbon as wide as its pressure, in its paint at its strength, multiplied over what is under it; dot = start, arrow = end; dotted grey = a light kept as paper.', '#666')}</svg>` };
}

/** A sheet of tiles, three across, each captioned. */
async function tiles(list, tw, th, extra) {
  const lab = 26, rows = Math.ceil(list.length / 3), W = 3 * tw, H = rows * (th + lab) + (extra?.H ?? 0), comp = [];
  for (const [i, { img, cap }] of list.entries()) {
    comp.push({ input: await sharp(img).resize(tw, th).png().toBuffer(), top: Math.floor(i / 3) * (th + lab) + lab, left: (i % 3) * tw });
    comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${lab}"><rect width="${tw}" height="${lab}" fill="white"/><text x="6" y="19" font-family="Helvetica" font-size="16" fill="#222">${esc(cap)}</text></svg>`), top: Math.floor(i / 3) * (th + lab), left: (i % 3) * tw });
  }
  if (extra) comp.push({ input: Buffer.from(extra.svg), top: rows * (th + lab), left: 0 });
  return sharp({ create: { width: W, height: H, channels: 3, background: 'white' } }).composite(comp).png();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const orderFile = flag('--order'), stagesFile = flag('--stages'), title = flag('--title') ?? '', penFile = flag('--drawing');
  const [scriptFile, subject, outFile] = args;
  const script = upgradeScript(JSON.parse(fs.readFileSync(scriptFile, 'utf8')));
  const lights = (script.lights ?? []).map(l => l.region ?? l);
  const W = 1400, px = W / script.sheet.widthMm, H = Math.round(script.sheet.heightMm * px);
  const chargeStrokes = c => (c.at ?? []).map(([x, y]) => ({ kind: 'sweep', radiusMm: (script.brushes[c.brush]?.widthMm ?? 6) / 2, points: [[x - 1, y, 0.5], [x, y + 0.5, 1], [x + 1, y, 0.4]] }));
  const strokesOf = new Map(script.passages.map(p => [p.id, { main: passageStrokes(p, script.brushes, 0, lights), charges: new Map((p.charges ?? []).map(c => [c, chargeStrokes(c)])) }]));
  const pen = penFile ? await sharp(penFile).removeAlpha().resize(W, H, { fit: 'fill' }).png().toBuffer() : null;
  const all = new Set(script.passages.filter(p => p.kind !== 'wash').map(p => p.id));
  const N = script.passages.length, full = await picture(script, strokesOf, W, H, px, N, all, pen), leg = legend(script, strokesOf, W, title);
  const sub = await sharp(subject).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const top = await sharp({ create: { width: 2 * W + 20, height: H, channels: 3, background: 'white' } }).composite([{ input: full, left: 0, top: 0 }, { input: sub, left: W + 20, top: 0 }]).png().toBuffer();
  const leg2 = legend(script, strokesOf, 2 * W + 20, title);
  await sharp(top).extend({ bottom: leg2.H, background: 'white' }).composite([{ input: Buffer.from(leg2.svg), top: H, left: 0 }]).png().toFile(outFile);
  console.log(outFile);
  const tw = Math.round(W / 2), th = Math.round(H / 2);
  if (stagesFile) {
    const list = [];
    for (let s = 1; s <= 5; s++) {
      const upto = script.passages.reduce((a, p, i) => (stageOf(p) <= s ? i + 1 : a), 0), these = new Set(script.passages.filter(p => stageOf(p) === s).map(p => p.id));
      list.push({ img: await picture(script, strokesOf, W, H, px, upto, these, pen), cap: `after stage ${STAGE_NAME[s]} (${these.size} passages; arrows: this stage)` });
    }
    list.push({ img: full, cap: `everything: ${N} passages` });
    await (await tiles(list, tw, th, legend(script, strokesOf, 3 * tw, title))).toFile(stagesFile); console.log(stagesFile);
  }
  if (orderFile) {
    const list = [];
    for (const f of [0.05, 0.15, 0.3, 0.5, 0.75, 1]) { const upto = Math.max(1, Math.round(f * N)), p = script.passages[upto - 1]; list.push({ img: await picture(script, strokesOf, W, H, px, upto, new Set([p.id]), pen), cap: `${Math.round(100 * f)}%: ${upto} of ${N}, last ${p.id} ${(p.what ?? '').slice(0, 50)}` }); }
    await (await tiles(list, tw, th, legend(script, strokesOf, 3 * tw, title))).toFile(orderFile); console.log(orderFile);
  }
}
