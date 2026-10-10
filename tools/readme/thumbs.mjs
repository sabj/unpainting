// Builds the README "Why not." thumbnails: thumb-blog.webp from the blog header and thumb-reading.webp, mock first pages of papers from docs/reading-list.md.
// node tools/readme/thumbs.mjs <blog header image> docs/img
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
// Titles, authors and abstracts from the arXiv API (arXiv metadata is CC0).
const ARXIV = JSON.parse(readFileSync(new URL('./reading-thumb-papers.json', import.meta.url)));
const [splash, out] = process.argv.slice(2);
await sharp(splash).resize(440, 300, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toFile(`${out}/thumb-blog.webp`);
const papers = [
  ['Curtis et al.', 'Computer-Generated Watercolor', '1997'],
  ['Hertzmann', 'Painterly rendering with curved brush strokes', '1998'],
  ['Kubelka and Munk', 'Optics of light-scattering materials', '1931'],
  ['Deegan et al.', 'Capillary flow and ring stains', '1997'],
  ['Chu and Tai', 'MoXi: ink dispersion in paper', '2005'],
  ['Strassmann', 'Hairy brushes', '1986'],
  ['Huang, Heng and Zhou', 'Learning to Paint', '2019'],
  ['Chen et al.', 'Inverse Painting', '2024'],
  ['Kim et al.', 'Hydrodynamics of writing with ink', '2011'],
];
const W = 440, H = 300, SCALE = 2;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const wrap = (t, n) => { const w = t.split(' '), L = []; let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > n) { L.push(l.trim()); l = x; } else l += ' ' + x; } L.push(l.trim()); return L.slice(0, 2); };
let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
// A mock first page: title, authors, abstract, two columns of text bars and a figure box.
function page(x, y, w, h, rot, [a, t, yr], fig, abs) {
  let s = `<g transform="translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})">`;
  s += `<rect x="2" y="3" width="${w}" height="${h}" fill="#000" opacity=".18" rx="1"/><rect width="${w}" height="${h}" fill="#fff" stroke="#d8d2c6" stroke-width=".6"/>`;
  wrap(t, 30).forEach((ln, k) => { s += `<text x="${w / 2}" y="${18 + k * 11}" text-anchor="middle" font-family="Times New Roman, Times, serif" font-size="10" font-weight="700" fill="#1d1c1a">${esc(ln)}</text>`; });
  s += `<text x="${w / 2}" y="44" text-anchor="middle" font-family="Times New Roman, Times, serif" font-size="7" font-style="italic" fill="#444">${esc(a)}, ${yr}</text>`;
  const bar = (bx, by, bw) => `<rect x="${bx}" y="${by}" width="${bw}" height="2" fill="#b9b3a8"/>`;
  s += `<text x="${w / 2}" y="55" text-anchor="middle" font-family="Times New Roman, Times, serif" font-size="6.5" font-weight="700" fill="#1d1c1a">Abstract</text>`;
  const words = abs.split(' '); let ln = '', ly = 62, nl = 0;
  for (const wd of words) { if (nl >= 9) break; if ((ln + ' ' + wd).trim().length > 34) { s += `<text x="16" y="${ly}" font-family="Times New Roman, Times, serif" font-size="5" fill="#333">${esc(ln.trim())}</text>`; ly += 5.6; nl++; ln = wd; } else ln += ' ' + wd; }
  s += `<text x="16" y="${ly}" font-family="Times New Roman, Times, serif" font-size="5" fill="#333">${esc(ln.trim())}</text>`;
  s += `<text x="9" y="${ly + 10}" font-family="Times New Roman, Times, serif" font-size="6" font-weight="700" fill="#1d1c1a">1  Introduction</text>`;
  const cw = (w - 26) / 2, top = ly + 15;
  for (let c = 0; c < 2; c++) {
    const cx = 9 + c * (cw + 8);
    let yy = top;
    if (c === fig.col) { s += `<rect x="${cx}" y="${yy}" width="${cw}" height="${fig.h}" fill="${fig.color}" opacity=".85"/>`; yy += fig.h + 5; }
    while (yy < h - 8) { s += bar(cx, yy, cw - (rnd() < .15 ? 12 : 0)); yy += 4.5; }
  }
  return s + '</g>';
}
const abstracts = [
  'We simulate watercolor with layers of water, pigment and paper, giving washes, edge darkening, backruns and glazes.',
  'We paint an image with long curved strokes, laying big brushes first and refining with smaller ones.',
  'An agent learns to paint with a few hundred strokes, using a neural renderer of the canvas.',
  'Drying drops leave rings because the edge is pinned and liquid flows outward to replace what evaporates.',
  'Ink spreads through damp paper along its fibres; we model the flow in real time on the GPU.',
  'We recover the order of a painting from the finished picture, step by step.',
];
const picks = ARXIV.map((p) => [p.authors, p.title, p.year]);
abstracts.splice(0, abstracts.length, ...ARXIV.map((p) => p.abstract));
const figs = ['#7fa3c4', '#c9a27a', '#9bb08a', '#b98c9c', '#8c8c8c', '#c7b27a'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">`;
const pw = 128, ph = 166;
picks.forEach((p, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 14 + col * 140 + (rnd() - .5) * 8, y = 6 + row * 124 + (rnd() - .5) * 6;
  svg += page(x, y, pw, ph, (rnd() - .5) * 7, p, { col: i % 2, h: 22 + rnd() * 14, color: figs[i] }, abstracts[i]);
});
svg += '</svg>';
await sharp(Buffer.from(svg)).resize(W * SCALE).webp({ quality: 90 }).toFile(`${out}/thumb-reading.webp`);
console.log('ok');
