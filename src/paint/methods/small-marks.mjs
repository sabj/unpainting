// Small landmarks (--smallmarks 1). The value planner drops every passage under the minimum shape (144 cells, about
// 11 mm2 on a 152 mm sheet) and keeps only lights of that size, so the marks that carry a likeness are lost: a
// catchlight, a lit gap in dark hair, a sheen on a curl; a nostril, a mouth corner, a lid line, a pupil. A painter
// keeps those on purpose: a small light is reserved paper inside a dark, and a small dark is one crisp mark laid last
// on dry paint. Both are found by local contrast against their own ring, so a flat area never produces them.
// Planning only, before the guard seals the target; no per-cell steering while painting.
import { components } from '../../raster.js';

// Mean of `values` over the cells of `list`, and over the ring `ring` cells out from them (not in the piece).
function pieceAndRing(list, values, w, h, ring, member) {
  let a = 0;
  for (const i of list) a += values[i];
  const seen = new Set(list), q = [...list];
  let sum = 0, cnt = 0;
  for (let d = 0; d < ring; d++) {
    const next = [];
    for (const i of q) {
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || seen.has(j)) continue;
        seen.add(j); next.push(j);
        if (!member[j]) { sum += values[j]; cnt++; }
      }
    }
    q.length = 0; q.push(...next);
  }
  return { inside: a / list.length, ring: cnt ? sum / cnt : null };
}

/**
 * values: target value 0 (paper) .. 1 (deepest), smooth: the planner's edge-aware smoothed value, shadowMask: the
 * shadow support the glazes already cover, protect: lights already reserved. cellMm: sheet mm per cell.
 * Returns { lights, darks } masks and counts. lights: pieces at most `lightMaxMm2` mm2, paper-pale (value under
 * lightValue), whose 2-cell ring is at least `lightContrast` darker and itself at least `ringDark` deep. darks:
 * pieces of the smoothed field over `darkValue` that the shadow support left out, from `darkMinMm2` mm2 up to
 * `maxCells`, at least `darkContrast` deeper than their ring.
 */
export function smallLandmarks({ values, smooth, shadowMask, protect, w, h, cellMm, maxCells,
  lightValue = 0.12, lightMaxMm2 = 2, lightContrast = 0.25, ringDark = 0.35,
  darkValue = 0.38, darkMinMm2 = 0.5, darkContrast = 0.12, maxLights = 120 } = {}) {
  const n = w * h, cell2 = cellMm * cellMm;
  const lightMax = Math.max(2, Math.round(lightMaxMm2 / cell2)), darkMin = Math.max(4, Math.round(darkMinMm2 / cell2));
  const lights = new Uint8Array(n), darks = new Uint8Array(n);
  const pale = Uint8Array.from(values, (v, i) => (v < lightValue && !protect?.[i] ? 1 : 0));
  const pc = components(pale, w, h), pl = Array.from({ length: pc.count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (pc.labels[i]) pl[pc.labels[i]].push(i);
  const found = [];
  for (let id = 1; id <= pc.count; id++) {
    const list = pl[id];
    if (list.length < 1 || list.length > lightMax) continue;
    const m = pieceAndRing(list, values, w, h, 2, pale);
    if (m.ring == null || m.ring < ringDark || m.ring - m.inside < lightContrast) continue;
    found.push({ list, c: m.ring - m.inside });
  }
  found.sort((a, b) => b.c - a.c);
  for (const f of found.slice(0, maxLights)) for (const i of f.list) lights[i] = 1;
  const deep = Uint8Array.from(smooth, (v, i) => (v > darkValue && !shadowMask[i] && !protect?.[i] && !lights[i] ? 1 : 0));
  const dc = components(deep, w, h), dl = Array.from({ length: dc.count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (dc.labels[i]) dl[dc.labels[i]].push(i);
  let darkCount = 0;
  for (let id = 1; id <= dc.count; id++) {
    const list = dl[id];
    if (list.length < darkMin || list.length >= maxCells) continue;
    const m = pieceAndRing(list, values, w, h, 2, deep);
    if (m.ring == null || m.inside - m.ring < darkContrast) continue;
    for (const i of list) darks[i] = 1;
    darkCount++;
  }
  return { lights, darks, lightCount: Math.min(found.length, maxLights), darkCount, darkMin };
}
