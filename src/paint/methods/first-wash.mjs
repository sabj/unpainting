// Pipeline: painting, stage 3 (washes).
// --firstwash 1: the opening wash laid as a painter lays it: paler, split at the subject (--fwmask <png>, white subject,
// any size), sweeps cut where a segment leaves the passage, and wide passages softened at the edge while wet.
// Without a mask the first wash is only paler. DOM free apart from the one image read.
import { passage } from '../../crop/blockin.mjs';

/** The subject mask at the sheet's size, as a byte mask; null without --fwmask. */
export async function loadSubject({ file, w, h, sharp, log }) {
  if (!file) return null;
  const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const m = Uint8Array.from(data, v => (v >= 128 ? 1 : 0));
  let a = 0; for (const v of m) a += v;
  log(`first wash: subject from ${file}, ${(100 * a / m.length).toFixed(1)}% of the sheet`);
  return m;
}

/** A copy of a passage over another mask, keeping its plan (mix, amount, pigment) and nothing of its cells. */
// The mask is the copy's own label field (label 1), so a copy dropped with dropMask is rebuilt like any passage.
function carve(sh, m, area) {
  const W = sh.w, box = { x0: W, y0: Infinity, x1: -1, y1: -1 };
  for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }
  const c = passage(m, 1, box, sh.amount, area, W);
  for (const k of Object.keys(sh)) if (!['ids', 'id', 'box', '_mask', 'mask', 'area', '_brushMask', 'w'].includes(k)) c[k] = sh[k];
  return c;
}

/**
 * Each pan's value 1 split at the subject, ground first: the ground part at --fwopen of its plan, the subject part at
 * --fwtint (0 leaves it to the subject's later values). Graded passages stay whole: their charge follows their own field.
 * `film` is paint-plate's FILM_MASS map, kept whole by area. Returns how much was split, for the log.
 */
export function splitFirstWash(layers, { subject, n, open, tint, film }) {
  let ground = 0, subj = 0, split = 0;
  for (const layer of layers) {
    if (layer.value !== 1) continue;
    const out = [];
    for (const sh of layer.shapes) {
      if (sh.graded) { out.push(sh); continue; }
      const m = sh.mask;
      if (!subject) { sh._opening = open; sh._fwSoften = true; out.push(sh); continue; }
      const g = new Uint8Array(n), s = new Uint8Array(n); let ag = 0, as = 0;
      for (let i = 0; i < n; i++) if (m[i]) { if (subject[i]) { s[i] = 1; as++; } else { g[i] = 1; ag++; } }
      const mass = film?.get(sh) ?? 0, parts = [];
      if (ag) parts.push([carve(sh, g, ag), open, ag]);
      if (as && tint > 0) parts.push([carve(sh, s, as), tint, as]);
      for (const [c, share, a] of parts) { c._opening = share; c._fwSoften = true; film?.set(c, mass * a / Math.max(1, ag + as)); out.push(c); }
      ground += ag; subj += as; split++;
    }
    layer.shapes = out;
  }
  return { ground, subj, split };
}

/**
 * The wet edge of a first-wash passage taken out into clear water. `light` vetoes an arc whose outside is a reserved
 * light, `subject` one whose outside is the subject when the passage is ground (and the other way round).
 * `share` is the share of the outline (--fwsoften), `radius` the damp band's width (from --fwsoftr, a share of the
 * short side). Each call settles the whole sheet, so only passages of --fwsoftmin of the sheet or more are softened.
 */
export function softenFirstWash({ sheet, mask2, W2, H2, SC, light, subject, inSubject, w, softArcs, soften, O, share, radius, seed }) {
  const at = (F, x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x / SC))), yi = Math.min(Math.floor(F.length / w) - 1, Math.max(0, Math.round(y / SC))); return F[yi * w + xi]; };
  const want = (x, y, nx, ny) => {
    const ox = x + nx * radius, oy = y + ny * radius;
    if (light && at(light, ox, oy)) return -1;
    if (subject && at(subject, ox, oy) !== (inSubject ? 1 : 0)) return -1;
    // which runs of the outline go soft is the hand's choice, not the tone's: a slow wobble along the edge
    return 1 + 0.5 * Math.sin(x * 0.043 + y * 0.029 + seed) * Math.cos(y * 0.051 - x * 0.017);
  };
  const arcs = softArcs(mask2, W2, H2, want, { share, minRun: Math.round(8 * SC), minLoop: Math.round(24 * SC), smooth: Math.round(5 * SC) });
  return soften(sheet, arcs, O, { radius, water: 1, seed, settle: 120 });
}
