// The target's style, measured off the art before the practice planner plans, so the mix of wash, dry brush and pen
// follows the piece. Each measure sets the practice-loose.mjs dials below unless a dial is given on the command line:
//   ink      thin darks (density above its opening at 2 cells) as a share of all tone, doubled on a near-monochrome
//            piece
//   dry      broken texture between 1 and 4 cells as a share of all tone, less what the ink explains
//   wet      what is left: soft, smooth fields
//   paper    the share of the art at paper white (under 0.04 density)
//   edges    the edge character: fine-scale gradient energy over coarse, near 1 for crisp edges, lower for soft
import { STYLE_CUTS } from '../tuned/style-cuts.mjs';

const gradEnergy = (D, w, h) => { let e = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; e += Math.hypot(D[i + 1] - D[i - 1], D[i + w] - D[i - w]); } return e; };

export async function measureStyle({ SRC, w, h, n, px = null, gaussian, minFilter, maxFilter, log }) {
  let tot = 0, paper = 0;
  for (let i = 0; i < n; i++) { tot += SRC[i]; if (SRC[i] < 0.04) paper++; }
  // thin darks: density above its opening at radius 2, structures under about 4 cells wide (pen lines, hatching)
  const opened = maxFilter(minFilter(SRC, w, h, 2), w, h, 2);
  let thin = 0; for (let i = 0; i < n; i++) thin += Math.max(0, SRC[i] - opened[i]);
  // broken texture between 1 and 4 cells: dry brush on the tooth, fur, foliage
  const B1 = gaussian(SRC, w, h, 1), B4 = gaussian(SRC, w, h, 4);
  let mid = 0; for (let i = 0; i < n; i++) mid += Math.abs(B1[i] - B4[i]);
  // colour: an ink piece is near monochrome
  let ch = 0, c = 0;
  if (px) for (let i = 0; i < n; i++) if (SRC[i] > 0.1) { const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2]; ch += Math.max(r, g, b) - Math.min(r, g, b); c++; }
  const chroma = c ? ch / c : 30;
  const thinS = thin / Math.max(1e-6, tot), midS = mid / Math.max(1e-6, tot);
  // Cut points are in tuned/style-cuts.mjs. Brown ink reads as colour, so chroma does not separate ink from
  // watercolour; only a near-monochrome piece has its ink share doubled.
  const ink = Math.min(1, Math.max(0, (thinS - STYLE_CUTS.inkFrom) / STYLE_CUTS.inkSpan) * (chroma < STYLE_CUTS.monoChroma ? STYLE_CUTS.monoInkGain : 1));
  const dry = Math.max(0, Math.min(1, (midS - STYLE_CUTS.dryFrom) / STYLE_CUTS.drySpan - STYLE_CUTS.dryInkShare * ink));
  const wet = Math.max(0.1, 1 - ink - dry);
  const edges = gradEnergy(SRC, w, h) / Math.max(1e-6, 2 * gradEnergy(gaussian(SRC, w, h, 2), w, h));
  const style = { ink: +ink.toFixed(3), dry: +dry.toFixed(3), wet: +wet.toFixed(3), paper: +(paper / n).toFixed(3), edges: +edges.toFixed(3), thin: +thinS.toFixed(3), texture: +midS.toFixed(3), chroma: +chroma.toFixed(1) };
  log(`practice style: ink ${style.ink}, dry brush ${style.dry}, wet ${style.wet}, paper ${style.paper}, edges ${style.edges} (thin darks ${style.thin}, texture ${style.texture}, chroma ${style.chroma})`);
  return style;
}

// The dials the style sets. A dial given on the command line wins.
export function styleDials(style, opt) {
  const d = {
    loosebroad: Math.max(0.3, Math.min(0.85, 0.3 + 0.6 * style.wet)),
    loosedetail: Math.max(0.1, Math.min(0.35, 0.08 + 0.3 * style.wet)),
    loosedrycover: Math.max(0.15, Math.min(0.85, 0.15 + 0.8 * style.dry)),
    loosegroundry: Math.max(0.3, Math.min(1, 0.3 + 0.8 * style.dry)),
    loosedark: Math.max(0.5, Math.min(0.9, 0.9 - 0.4 * style.ink)),
    // the darks' share of the sheet: more where the piece is carried by its darks rather than its pen
    loosedarks: Math.max(0.03, Math.min(0.08, 0.08 - 0.05 * style.ink)),
    loosedrystrength: Math.max(1.5, Math.min(3, 1.5 + 2 * style.dry)),
    // an ink-led piece keeps its whole closing pen; a wash-led one keeps it to the focal darks
    loosepen: style.ink >= 0.6 ? 1 : 0,
  };
  for (const k of Object.keys(d)) if (opt(k, '') !== '') d[k] = Number(opt(k, ''));
  return d;
}
