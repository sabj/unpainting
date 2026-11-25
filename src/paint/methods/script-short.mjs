// Short forms of a painting script (docs/painting-script.md), written out before a passage is laid
// (script-washes.mjs passageStrokes):
//   pressure words  "swell" | "taper" | "fade" | "press" (beside light, medium, firm): a pressure list from start to
//                   end, in `handling.pressure` (read by name, as the three always were) or in one stroke's `pressure`. A stroke given by points takes the list
//                   at the points that carry no pressure of their own, by its length along the stroke.
//   In a wash a new word (swell, taper, fade, press) is its list along each lane (script-marks.mjs sweeps); light,
//   medium and firm keep their old reading there (the highest of the list, the lanes even).
// `handling.direction: "form"` is read by the wash fill itself (script-washes.mjs washDirection, wash-form.mjs).
// A stroke's own `path` (curved, s-curve, ...) already bends a stroke placed by `from` or `at`. Pure.

/** The pressure lists by name, start to end (0 barely touching, 1 pressed to the heel). */
export const PRESSURE_WORDS = Object.freeze({
  light: [0.2, 0.45, 0.4, 0.15], medium: [0.25, 0.7, 0.6, 0.15], firm: [0.35, 0.95, 0.85, 0.2],
  swell: [0.15, 0.6, 1, 0.6, 0.15], taper: [1, 0.8, 0.5, 0.15], fade: [0.6, 0.5, 0.35, 0.15], press: [0.15, 0.5, 0.85, 1],
});

/** The value of a pressure list at t (0 to 1 along the stroke), by straight lines between its entries. */
export function pressureAt(list, t) {
  if (list.length === 1) return list[0];
  const u = Math.max(0, Math.min(1, t)) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(u));
  return list[i] + (list[i + 1] - list[i]) * (u - i);
}

const NEW_WORDS = new Set(['swell', 'taper', 'fade', 'press']);
const listOf = v => (Array.isArray(v) ? v.map(Number) : typeof v === 'string' && PRESSURE_WORDS[v] ? [...PRESSURE_WORDS[v]] : v);

/** One stroke with its short forms written out. */
function stroke(s) {
  if (!s || typeof s !== 'object') return s;
  const pressure = listOf(s.pressure);
  if (Array.isArray(s.points) && Array.isArray(pressure)) {
    const L = [0]; for (let i = 1; i < s.points.length; i++) L.push(L[i - 1] + Math.hypot(s.points[i][0] - s.points[i - 1][0], s.points[i][1] - s.points[i - 1][1]));
    const total = L.at(-1) || 1;
    return { ...s, pressure, points: s.points.map((q, i) => (Number.isFinite(q[2]) ? q : [q[0], q[1], +pressureAt(pressure, L[i] / total).toFixed(3), ...q.slice(3)])) };
  }
  return pressure === s.pressure ? s : { ...s, pressure };
}

/**
 * A passage with its short forms written out: each stroke's pressure word as its list, and in a wash a new pressure
 * word in `handling.pressure` as its list along the lanes (kept in `handling.pressureGiven`; elsewhere a word is read by
 * name, script-marks.mjs PRESSURES). A passage without short forms is returned as it is.
 */
export function expandPassage(p) {
  if (!p || typeof p !== 'object') return p;
  let out = p;
  const h = p.handling;
  if (p.kind === 'wash' && typeof h?.pressure === 'string' && NEW_WORDS.has(h.pressure)) out = { ...out, handling: { ...h, pressure: listOf(h.pressure), pressureGiven: h.pressure } };
  if (Array.isArray(p.strokes) && p.strokes.some(s => s && (typeof s.pressure === 'string' || (Array.isArray(s.pressure) && Array.isArray(s.points))))) out = { ...out, strokes: p.strokes.map(stroke) };
  return out;
}
