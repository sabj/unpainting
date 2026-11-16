// Which pans go into the puddle for one local colour. A painter mixes a colour from the two or three tubes nearest it
// on the wheel, and reaches across the wheel only to grey or darken it when the near tubes cannot. A puddle built on a
// paint from the far side holds its colour only while every paint goes on exactly as planned: put a little more of one
// on the paper and the hue swings (sap green in a warm stone gives an olive cast; Payne's grey in orange fur a grey
// band). So, for each local colour:
//   1. The wheel is the pigments' own mixing space: channel density over the paper, where mixed paints add. A pan is on
//      the colour's side when its tint (its density with the grey part taken out) points within a quarter turn of the
//      colour's tint, so adding it moves the puddle towards the colour's hue rather than away from it. A pan with no
//      tint (a flat black) moves no hue and counts as near.
//   2. Puddles of one, two and three pans are fitted to the colour by the palette-mix solver (palette-mix.mjs, the
//      simulator's own Kubelka-Munk layer). Only near pans are tried first. Far pans are tried, at most one per puddle,
//      only when no near puddle comes within one just-noticeable difference of the colour: the colour is greyer or
//      darker than its own side of the wheel can make. While the puddle still misses by more than that, it may take a
//      second far pan (both far primaries, for a dark muted colour on a palette of primaries), still at most three pans.
//   3. Among the puddles that reach the colour as well as the best of them (within one just-noticeable difference),
//      the one whose paints sit nearest where they pull cleanly is taken: a near paint nearest the colour's hue, a
//      greying paint nearest its exact complement, which greys without turning the hue (ochre greyed with a green-shade
//      blue goes green). A puddle's hue can swing no further than that offset when one paint goes on heavier or
//      lighter than planned. Ties go to the puddle whose hue
//      and chroma move least for such an error (measured), then to the fewest paints, then to the least paint.
// No constant here is fitted to a subject: the quarter turn is where a pan stops adding to the colour's hue, the
// just-noticeable difference is CIEDE2000's unit, and the measured drift is a derivative. Planning only: it takes a colour the plan
// already holds and never reads the sheet or the target.
import { mixCandidates, mixtureColour, labOfColour, JND } from "./palette-mix.mjs";
import { deltaE2000 } from "../../eval/colour.mjs";

const R2 = Math.SQRT2, R6 = Math.sqrt(6);
/** The tint of a density triple: its component off the grey axis, as plane coordinates. */
export const tint = d => [(d[0] - d[1]) / R2, (d[0] + d[1] - 2 * d[2]) / R6];
/** Channel density of an 8-bit colour over the paper (darker than the paper is positive). */
const densityOver = (rgb, paper) => rgb.map((v, c) => -Math.log(Math.max(1e-3, v) / Math.max(1e-3, paper[c])));

/**
 * Each pan's angle on the wheel from the colour's tint, in degrees (0 = the colour's own hue, 180 = its complement), or
 * null for a pan with no tint. A colour with no tint (a true grey) has no side: every angle is null.
 */
export function wheelAngles(colourRGB, pigments, paper) {
  const t = tint(densityOver(colourRGB, paper)), tm = Math.hypot(...t);
  return pigments.map(p => {
    const q = tint(p.K), qm = Math.hypot(...q), size = Math.hypot(...p.K);
    if (!(tm > 1e-9) || !(qm > 1e-9 * size)) return null;
    return Math.acos(Math.max(-1, Math.min(1, (t[0] * q[0] + t[1] * q[1]) / (tm * qm)))) * 180 / Math.PI;
  });
}

// How far the puddle's hue and chroma move per unit of relative error in its most sensitive paint, CIEDE2000 at equal
// lightness. One paint alone moves only in value, and in chroma as it thickens.
const STEP = 1e-3;
function drift(mix, indices, pigments, under, lab) {
  let worst = 0;
  for (const j of indices) {
    const m = Float64Array.from(mix); m[j] *= 1 + STEP;
    const l2 = labOfColour(mixtureColour(m, pigments, under));
    worst = Math.max(worst, deltaE2000([lab[0], lab[1], lab[2]], [lab[0], l2[1], l2[2]]) / STEP);
  }
  return worst;
}

/**
 * The pans for one local colour, and the puddle they make.
 */
export function choosePans(colourRGB, pigments, under, { maxPans = 3 } = {}) {
  if (!Array.isArray(pigments) || !pigments.length) throw new RangeError("pan choice needs at least one pan");
  if (!(maxPans >= 1 && maxPans <= 3)) throw new RangeError("a puddle holds one to three pans");
  const angles = wheelAngles(colourRGB, pigments, under);
  const targetLab = labOfColour(Array.from(colourRGB));
  const C = Math.hypot(targetLab[1], targetLab[2]);
  const d0 = densityOver(colourRGB, under), t = tint(d0), tm = Math.hypot(...t);
  const warmRedOrange = tm > 1e-9 && t[0] < -0.01 * tm && C >= 8;
  const chromatic = angles.some(a => a !== null) && C >= 12;
  const purities = pigments.map(p => { const q = tint(p.K), s = Math.hypot(...p.K); return s > 1e-9 ? Math.hypot(...q) / s : 0; });
  const near = [], far = [];
  angles.forEach((a, j) => {
    const p = pigments[j];
    const greenPan = p.K[0] > p.K[1] + 0.02 && p.K[2] > p.K[1];
    if (C < 6 && greenPan && pigments.length > 3) return;
    if (warmRedOrange && greenPan) return;
    if (a === null) (chromatic ? far : near).push(j);
    else if (a < 90) near.push(j);
    else far.push(j);
  });
  const rank = found => {
    let least = Infinity; for (const c of found) if (c.dE < least) least = c.dE;
    let pick = null;
    for (const c of found) {
      if (c.dE > least + JND) continue;
      const used = c.indices.filter(j => c.mix[j] > 0);
      const span = Math.max(0, ...used.map(j => {
        const blackPen = chromatic && purities[j] < 0.20 ? (0.25 - purities[j]) * 180 : 0;
        if (angles[j] === null) return blackPen;
        if (near.includes(j)) return angles[j] + blackPen;
        const scatterPen = (pigments[j].rho ?? 0) >= 0.085 ? 35 : 0;
        return (180 - angles[j]) + blackPen + scatterPen;
      }));
      const d = used.length ? drift(c.mix, used, pigments, under, c.lab) : 0;
      const better = !pick || span < pick.span || (span === pick.span && (d < pick.d - 1e-9 || (Math.abs(d - pick.d) <= 1e-9 && (used.length < pick.used.length || (used.length === pick.used.length && c.mass < pick.c.mass)))));
      if (better) pick = { c, d, span, used };
    }
    return pick;
  };
  let side = "near", pick = near.length ? rank(mixCandidates(colourRGB, pigments, under, { maxPigments: maxPans, allowed: near })) : null;
  const nearThresh = JND;
  if (!pick || pick.c.dE > nearThresh) {
    const across = pick && pick.c.dE <= nearThresh ? [pick.c] : [];
    const farTrans = far.filter(f => (pigments[f].rho ?? 0) < 0.085);
    const farOpaque = far.filter(f => (pigments[f].rho ?? 0) >= 0.085);
    for (const f of farTrans) across.push(...mixCandidates(colourRGB, pigments, under, { maxPigments: maxPans, allowed: [f, ...near], must: f }));
    let wider = across.length ? rank(across) : null;
    if ((!wider || wider.c.dE > 1.5 * JND) && farOpaque.length) {
      for (const f of farOpaque) across.push(...mixCandidates(colourRGB, pigments, under, { maxPigments: maxPans, allowed: [f, ...near], must: f }));
      const widerAll = rank(across);
      if (widerAll && (!wider || widerAll.c.dE + 1.2 * JND < wider.c.dE)) wider = widerAll;
    }
    if (wider && (!pick || wider.c.dE < pick.c.dE)) { pick = wider; side = wider.used.some(j => far.includes(j)) ? "across" : "near"; }
    if (pick && pick.c.dE > JND && maxPans >= 2 && !(warmRedOrange && C >= 18)) {
      const two = [];
      for (let a = 0; a < far.length; a++) for (let b = a + 1; b < far.length; b++)
        two.push(...mixCandidates(colourRGB, pigments, under, { maxPigments: maxPans, allowed: [far[a], far[b], ...near], must: far[a] }).filter(c => c.mix[far[b]] > 0));
      const twice = rank([...across, ...two]);
      if (twice && twice.c.dE < pick.c.dE) { pick = twice; side = twice.used.some(j => far.includes(j)) ? "across" : "near"; }
    }
  }
  const c = pick.c, order = pick.used.slice().sort((p, q) => c.mix[q] - c.mix[p]);
  return {
    indices: order, shares: order.map(j => c.mix[j] / c.mass), mix: c.mix, mass: c.mass, lab: c.lab, target: targetLab,
    dE: c.dE, drift: pick.d, span: pick.span, reached: c.dE <= JND, side, far, angles,
  };
}
