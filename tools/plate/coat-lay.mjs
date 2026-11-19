// A coat's texture, laid with the engine's dry brush (tools/plate/coat-plan.mjs planned the strokes). The brush has bristles
// and little water; dragged along the hair it leaves paint only on the hills of the paper's tooth, so one stroke is many
// fine streaks. A light stroke carries white gouache tinted to the strand's colour, loaded as thick paste (LOAD times the
// hiding film); a dark stroke carries the coat's own paint in the mix that makes up the strand's colour over the ground
// under it, and goes only where the painting is lighter than the strand. A light stroke goes only where the washes covered
// its light. Nothing is read from the target here: colours and strands were planned before the first wash.
import fs from 'node:fs';
import path from 'node:path';
import { gouacheTint, mixFor, GOUACHE_FILM } from '../../src/media/gouache.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';

export const LOAD = 12;          // gouache paste on the brush, in hiding films: a dry brush leaves about a tenth of it on the tooth's hills
export const DEPOSIT = 0.06;     // the share of a dry brush's load that stays on the paper (measured on the engine's brush, water 0.5)
const WATER = 0.5, MARGIN_OD = 0.15, MIN_NEED = 0.1;
const BRUSH = { bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6 };

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const odOf = (c, paper) => [0, 1, 2].map(k => -Math.log(Math.max(0.02, Math.min(1, c[k] / Math.max(1, paper[k])))));

/** The brush's load for a light stroke: gouache paste and the tint paints, as concentrations on a sheet of `k` pigments. */
export function lightLoad(stroke, paperRGB, pigments, gouacheAt, k) {
  const conc = new Array(k).fill(0), tint = gouacheTint(stroke.rgb ?? [255, 255, 255], paperRGB, pigments);
  conc[gouacheAt] = GOUACHE_FILM * LOAD;
  for (const m of tint.mix) conc[m.pigment] = m.amount * LOAD;
  return { conc, tint };
}

/** The brush's load for a dark stroke: the paints that add what the strand needs over the ground, as concentrations. */
export function darkLoad(strandOd, groundOd, pigments, k) {
  const need = strandOd.map((v, c) => Math.max(0, v - groundOd[c]));
  if (need[0] + need[1] + need[2] < MIN_NEED) return null;
  const solved = mixFor(need, pigments), conc = new Array(k).fill(0);
  for (const m of solved.mix) conc[m.pigment] = m.amount / DEPOSIT;
  return { conc, need, mix: solved.mix };
}

export async function layCoats(ctx) {
  const { COAT_PLAN: plan, PIGS, GOUACHE_AT, SHEET_PIGS, SC, W2, H2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED, paperRGB, createBrush, dip, stroke, dry, O, UPRIGHT } = ctx;
  const sheet = ctx.sheet, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / W2, K = SHEET_PIGS.length, palette = PIGS.map(p => ({ K: Array.from(p.K) }));
  const before = render(), painted = sheetDensity(before);
  const cell = p => Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)));
  const laid = { light: 0, dark: 0, skippedWashKeptLight: 0, skippedNoNeed: 0, lengthMm: 0, byKind: {} };
  let n = 0;
  for (const s of plan.strokes) {
    const along = median(s.points.map(p => painted[cell(p)]));
    let load, dark = s.polarity === 'dark';
    if (dark) {
      const g = [0, 1, 2].map(c => median(s.points.map(p => before[(Math.min(H2 - 1, Math.round(p.y * SC)) * W2 + Math.min(W2 - 1, Math.round(p.x * SC))) * 3 + c])));
      load = s.rgb ? darkLoad(odOf(s.rgb, paperRGB), odOf(g, paperRGB), palette, K) : null;
      if (!load) { laid.skippedNoNeed++; continue; }
    } else {
      if (along - s.od < MARGIN_OD) { laid.skippedWashKeptLight++; continue; }
      load = lightLoad(s, paperRGB, palette, GOUACHE_AT, K);
    }
    const brush = createBrush({ radius: s.points[0].r * SC, ...BRUSH, seed: 700 + SEED + n++ });
    dip(brush, { water: WATER, conc: load.conc });
    stroke(brush, sheet, s.points.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: p.r * SC, p: p.p })), { upright: UPRIGHT });
    laid[dark ? 'dark' : 'light']++; laid.lengthMm += s.lengthMm; laid.byKind[s.kind] = (laid.byKind[s.kind] ?? 0) + 1;
  }
  if (laid.light + laid.dark) dry(sheet, 20000, O, { levelMax: 200 });
  // what the strokes did, measured on the sheet's own render before and after
  const after = render(), Ls = (b, i) => { const Y = (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  const up = [], down = []; let changed = 0;
  for (let i = 0; i < N2; i++) { const d = Ls(after, i) - Ls(before, i); if (Math.abs(d) > 2) { changed++; (d > 0 ? up : down).push(d); } }
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.floor(f * (s.length - 1))].toFixed(1) : null; };
  laid.lengthMm = +laid.lengthMm.toFixed(1); laid.changedShareOfSheet = +(changed / N2).toFixed(5);
  laid.lighterPixels = up.length; laid.lighterMedianLstar = q(up, 0.5); laid.lighterP90Lstar = q(up, 0.9); laid.darkerPixels = down.length; laid.darkerMedianLstar = q(down, 0.5); laid.darkerP10Lstar = q(down, 0.1);
  laid.brush = { ...BRUSH, water: WATER, loadFilms: LOAD, depositShare: DEPOSIT, mmPerCell: +mmPerCell.toFixed(4) };
  ctx.COAT_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'coat-texture.json'), JSON.stringify(ctx.COAT_RECORD, null, 1));
  console.log(`coat texture: ${laid.light} light and ${laid.dark} dark dry-brush strokes, ${laid.lengthMm} mm, ${(100 * laid.changedShareOfSheet).toFixed(2)}% of the sheet changed by more than 2 L* (lighter median ${laid.lighterMedianLstar}, darker median ${laid.darkerMedianLstar}); skipped ${laid.skippedWashKeptLight} where the wash kept the light and ${laid.skippedNoNeed} where the ground was dark enough`);
  ctx.STAGE = { stage: 'coat-texture' }; ctx.NATIVE_CAPTURE?.('coat-texture');
  if (laid.light + laid.dark && !FILM_BY_PAINT) await shoot();
  return laid;
}
