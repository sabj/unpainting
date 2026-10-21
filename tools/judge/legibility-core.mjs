// Inking pipeline, legibility test: the pure parts of tools/judge/ink-legibility.mjs (crop boxes, vision replies, verdicts).

/** A fractional box [x0, y0, x1, y1] as a pixel extract { left, top, width, height } inside w x h. */
export function cropBox([x0, y0, x1, y1], w, h) {
  const left = Math.max(0, Math.min(w - 1, Math.round(x0 * w))), top = Math.max(0, Math.min(h - 1, Math.round(y0 * h)));
  return { left, top, width: Math.max(1, Math.min(w - left, Math.round((x1 - x0) * w))), height: Math.max(1, Math.min(h - top, Math.round((y1 - y0) * h))) };
}

/** The size a crop is shown at: its long side taken to `min`..`max` pixels, so a small crop is not left tiny and a large one is not cut. */
export function showSize(width, height, { min = 900, max = 1400 } = {}) {
  const long = Math.max(width, height), s = long < min ? min / long : long > max ? max / long : 1;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/** The first JSON object in a model reply, or null. */
export function parseReply(text) {
  const s = String(text ?? ''), a = s.indexOf('{');
  for (let b = s.lastIndexOf('}'); a >= 0 && b > a; b = s.lastIndexOf('}', b - 1)) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch { /* try a shorter span */ }
  }
  return null;
}

/**
 * One crop's verdict from the blind naming reply { object } and the checklist reply { parts: { "1": bool, ... } }.
 * Recognised: the name matches the crop's `says` pattern and at least `need` parts are ticked.
 */
export function verdict(spec, naming, checklist) {
  const object = typeof naming?.object === 'string' ? naming.object : '';
  const ticks = spec.parts.map((_, i) => checklist?.parts?.[String(i + 1)] === true);
  const named = object !== '' && new RegExp(spec.says, 'i').test(object), seen = ticks.filter(Boolean).length;
  return { object, named, seen, of: spec.parts.length, ticks, recognised: named && seen >= spec.need };
}

/** The recognised count and total over a verdict map { "<subject>/<crop>": verdict }. */
export function tally(verdicts) {
  const all = Object.values(verdicts);
  return { recognised: all.filter(v => v.recognised).length, total: all.length };
}
