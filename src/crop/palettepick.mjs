// The paper and palette a plate is painted with, kept out of tools/paint-plate.mjs so the choice can be measured
// on a set of sources without painting any of them. DOM free.
import { paletteOf } from './palette.mjs';
import { channelDensity, unmix } from './pigments.mjs';
import { boxPalette } from './boxpick.mjs';
import { renderLayers } from '../media/km.mjs';
import { labPlanes, deltaE2000 } from '../eval/colour.mjs';
import { gaussian } from '../keyframes/density.mjs';

export const WHITE_PAPER = Object.freeze([247, 244, 236]);

/**
 * The paper is the lightest tenth of the sheet, read inside a margin (share of each side) so a scan's mount is skipped.
 *
 * mode 'auto': a cool lightest tenth (blue above red by more than 6) is sky, not paper, so the sheet switches to white
 * paper. Warm toned papers are kept. 'source' keeps the lightest tenth whatever it is; 'white' always uses white.
 * @returns { paperRGB, lightest, white } where `white` says the sheet was switched to white paper
 */
export function paperOf(px, w, h, { margin = 0.03, mode = 'auto' } = {}) {
  const n = w * h, lum = i => 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
  const mx = Math.round(margin * w), my = Math.round(margin * h);
  const light = [...Array(n).keys()].filter(i => { const x = i % w, y = (i / w) | 0; return x >= mx && y >= my && x < w - mx && y < h - my; }).sort((a, b) => lum(b) - lum(a)).slice(0, Math.max(1, n / 10 | 0));
  const lightest = [0, 1, 2].map(c => light.reduce((s, i) => s + px[i * 3 + c], 0) / light.length);
  const coloured = lightest[2] > lightest[0] + 6;
  const white = mode === 'white' || (mode === 'auto' && coloured);
  return { paperRGB: white ? [...WHITE_PAPER] : lightest, lightest, white };
}

/**
 * The palette pick's error measure: render a palette's unmixed amounts straight onto flat paper, blur both it and the source
 * to a passage's size, and take the mean CIEDE2000 over every third pixel. `tint` is the mean chroma the render gives
 * the source's grey passages (toned, L* under 85, and under 6 of chroma).
 */
function paletteJudge(px, w, h, paperRGB) {
  const n = w * h;
  const flatPaper = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flatPaper[i * 3 + c] = paperRGB[c];
  const blurRGB = buf => { const o = new Uint8ClampedArray(n * 3); for (let c = 0; c < 3; c++) { const B = gaussian(Float32Array.from({ length: n }, (_, i) => buf[i * 3 + c]), w, h, 2); for (let i = 0; i < n; i++) o[i * 3 + c] = B[i]; } return o; };
  const LS = labPlanes(blurRGB(px), n, paperRGB);
  // the source's grey passages: toned (L* 15 below the paper or more) and under 6 of chroma
  const greyCells = []; for (let i = 0; i < n; i += 3) if (LS.L[i] < 85 && Math.hypot(LS.a[i], LS.b[i]) < 6) greyCells.push(i);
  const D = channelDensity(px, n, paperRGB), seen = new Map();
  const judge = pal => {
    if (seen.has(pal)) return seen.get(pal);
    const P = pal.pigments, Am = unmix(D, n, P.map(q => q.K.map(v => v / 0.55)));
    const layer = P.map((_, j) => Float32Array.from({ length: n }, (_, i) => Am[i * P.length + j]));
    const L2 = labPlanes(blurRGB(renderLayers([layer], P, flatPaper, n, 1)), n, paperRGB);
    let e = 0, k = 0; for (let i = 0; i < n; i += 3) { e += deltaE2000([LS.L[i], LS.a[i], LS.b[i]], [L2.L[i], L2.a[i], L2.b[i]]); k++; }
    let tint = 0; for (const i of greyCells) tint += Math.hypot(L2.a[i], L2.b[i]);
    const out = { e: e / k, tint: greyCells.length ? tint / greyCells.length : 0 };
    seen.set(pal, out);
    return out;
  };
  return { judge, greyShare: greyCells.length / Math.ceil(n / 3) };
}

/** The palette pick's options from a tool's command line, so every tool that picks reads the same flags the same way. */
export const paletteOptions = (opt, num) => ({
  pigs: num('pigs', 4), gain: num('gain', 0.02), neutral: num('neutral', 0.18),
  palettepick: opt('palettepick', '1') !== '0', greypick: opt('greypick', '1') !== '0', widepick: opt('widepick', '1') !== '0',
  palettemargin: num('palettemargin', 2.0), greymargin: num('greymargin', 3),
  // --pigs is the set the painter works from, so it is the floor as well as the ceiling: --pigs 12 puts twelve paints
  // on the palette. Paints are added greedily by what they remove, so more paint cannot raise the error.
  // --boxmin sets the floor on its own.
  boxpick: opt('boxpick', '1') !== '0', boxmargin: num('boxmargin', 0),
  box: { gain: num('boxgain', 0.25), max: num('boxmax', 0) || num('pigs', 4), min: Math.max(2, num('boxmin', 0) || num('pigs', 4)) },
  rescue: num('rescue', 0), monoScatter: opt('monoscatter', 'ink'),
});

/**
 * The palette a plate is painted with. The lean palette unless a candidate reproduces the source's colour better by a
 * clear margin. Returns { palette, name, note, e } where `e` is the kept palette's error (null when no comparison was
 * needed) and `note` is the "palette pick" line, or null when there was nothing to pick between.
 */
export function pickPalette(px, w, h, paperRGB, {
  pigs = 4, gain = 0.02, neutral = 0.18, palettepick = true, greypick = true, widepick = true,
  palettemargin = 2.0, greymargin = 3, boxpick = false, boxmargin = 1.0, box = {},
  // --rescue: pans for colours the mass-weighted fit cannot see (src/crop/pigments.mjs)
  rescue = 0,
  // --monoscatter: whether a one-pigment picture is ink or paint (src/crop/palette.mjs)
  monoScatter = 'ink',
} = {}) {
  const n = w * h;
  const lean = paletteOf(px, n, paperRGB, { paints: pigs, gainPerPigment: gain, neutralBelow: neutral, rescue, monoScatter });
  if (!palettepick) return { palette: lean, name: 'lean', note: null, e: null };
  // --gain and --neutral: how much a further pigment has to explain to be kept, and how grey a pigment may be before it
  // is dropped as mud.
  // --palettepick: recover a lean and a rich palette, render each one's unmixed amounts onto the paper, and keep the
  // lean one unless the rich one reproduces the source's colour better by a clear margin. No single gain threshold
  // serves both a grey-blue sheet read as one brown and a brown drawing given pigments it does not have.
  const rich = paletteOf(px, n, paperRGB, { paints: 6, gainPerPigment: 0.005, neutralBelow: 0.08, rescue, monoScatter });
  // --greypick: a third palette that keeps grey pigments, taken when the source's grey passages come back in colour.
  // Grey is otherwise dropped as mud, and no mix of two oranges makes grey.
  const grey = greypick ? paletteOf(px, n, paperRGB, { paints: pigs, gainPerPigment: 0.005, neutralBelow: 0, rescue, monoScatter }) : null;
  // --widepick: two candidates that take four pigments whatever the gain says, one dropping greys and one keeping them,
  // held to the same margin. The gain is measured in density, where a photograph's bright colours weigh little.
  const wide = widepick ? [
    paletteOf(px, n, paperRGB, { paints: 4, gainPerPigment: 0, neutralBelow: 0.08, rescue, monoScatter }),
    paletteOf(px, n, paperRGB, { paints: 4, gainPerPigment: 0, neutralBelow: 0, rescue, monoScatter }),
  ] : [];
  if (rich.pigments.length === lean.pigments.length && !(grey && grey.pigments.length > lean.pigments.length) && !wide.length && !boxpick) {
    return { palette: lean, name: 'lean', note: null, e: null };
  }
  const { judge, greyShare } = paletteJudge(px, w, h, paperRGB);
  const jl = judge(lean), jr = rich.pigments.length !== lean.pigments.length ? judge(rich) : null;
  let pick = jr && jr.e < jl.e - palettemargin ? rich : lean;
  let note = `palette pick: ${lean.pigments.length} pigments at ${jl.e.toFixed(2)} dE00${jr ? `, ${rich.pigments.length} at ${jr.e.toFixed(2)}` : ''}`;
  for (const [k, cand] of wide.entries()) {
    const jc = judge(cand), jp = judge(pick);
    note += `; wide ${k ? 'with greys' : ''} ${cand.pigments.length} at ${jc.e.toFixed(2)}`;
    if (jc.e < jp.e - palettemargin) pick = cand;
  }
  // --boxpick: a palette of real watercolours chosen from a box (box.mjs, boxpick.mjs), held to its own margin
  // (--boxmargin, in dE00) against the recovered pick. A recovered palette is an average of the picture, so it is dull
  // and cannot reach a saturated cell at any pigment count.
  const boxed = boxpick ? boxPalette(px, w, h, paperRGB, box) : null;
  if (boxed) {
    const jb = judge(boxed), jp = judge(pick);
    note += `; box ${boxed.pigments.length} (${boxed.pigments.map(p => p.name).join(', ')}) at ${jb.e.toFixed(2)}`;
    // A fitted palette is an average of the picture and has to beat real paint. --boxmargin 0 takes the box whenever it
    // plans the colour better at all.
    if (jb.e < jp.e - boxmargin) pick = boxed;
  }
  if (grey && grey.pigments.length > lean.pigments.length) {
    // only on a sheet with grey passages to speak of (2% of the sampled cells), when the chosen palette tints them
    // clearly and the grey palette takes that tint away without losing colour elsewhere
    const jg = judge(grey), jp = judge(pick);
    note += `; greys ${(100 * greyShare).toFixed(0)}% of cells tinted ${jp.tint.toFixed(1)}, with greys kept ${grey.pigments.length} at ${jg.e.toFixed(2)} tinted ${jg.tint.toFixed(1)}`;
    if (greyShare > 0.02 && jp.tint - jg.tint > greymargin && jg.e <= jp.e) pick = grey;
  }
  const name = pick === lean ? 'lean' : pick === rich ? 'rich' : pick === grey ? 'greys kept' : pick === boxed ? 'box' : pick === wide[0] ? 'wide' : 'wide with greys';
  return { palette: pick, name, note: `${note}; kept ${pick.pigments.length} (${name})`, e: judge(pick).e };
}
