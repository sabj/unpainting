// --paintguard dE: a check on a forced paint box (--paints, or washes.paints in a plan). The forced box and the
// painter's own pick are scored with the same objective (palettewide.mjs: sheet CIEDE2000 plus local-colour error).
// When the forced box is more than `threshold` worse, the guard either adds the own pick's missing paints, best first,
// until the gap closes (mode 'add'), or takes the own pick (mode 'replace'). An 'add' that cannot close the gap within
// `max` paints falls back to the own pick. Pure: no I/O, no target reads beyond the score it is given.

const keysOf = paints => paints.map(p => p.key);
const round = v => Math.round(v * 100) / 100;

/**
 * @param {{ forced: object[], own: object[], score: (paints: object[]) => number, threshold: number,
 *   mode?: 'add'|'replace', max?: number }} options
 * @returns {{ paints: object[], decision: object }} the paints to use and the record for the run card
 */
export function guardForcedBox({ forced, own, score, threshold, mode = 'add', max = 8 }) {
  if (!(threshold > 0)) throw new Error('paint guard: threshold must be a positive dE00');
  if (!['add', 'replace'].includes(mode)) throw new Error(`paint guard: mode must be add or replace, not ${mode}`);
  if (!forced.length || !own.length) throw new Error('paint guard: needs a forced box and an own pick');
  const forcedError = score(forced), ownError = score(own), gap = forcedError - ownError;
  const base = { threshold, mode, forced: keysOf(forced), own: keysOf(own), forcedError: round(forcedError), ownError: round(ownError), gap: round(gap) };
  if (gap <= threshold) return { paints: forced, decision: { ...base, action: 'kept', paints: keysOf(forced), added: [], finalError: round(forcedError) } };
  const replaced = reason => ({ paints: own, decision: { ...base, action: 'replaced', reason, paints: keysOf(own), added: [], finalError: round(ownError) } });
  if (mode === 'replace') return replaced('forced box over threshold');
  let kept = [...forced], error = forcedError;
  const added = [];
  while (error - ownError > threshold && kept.length < max) {
    const candidates = own.filter(p => !kept.some(q => q.key === p.key));
    if (!candidates.length) break;
    const best = candidates.map(p => ({ p, e: score([...kept, p]) })).reduce((a, b) => (b.e < a.e ? b : a));
    if (!(best.e < error)) break;
    kept = [...kept, best.p]; error = best.e; added.push(best.p.key);
  }
  if (error - ownError > threshold) return replaced(`adding ${added.length ? added.join(', ') : 'paints'} left a gap of ${round(error - ownError)} at ${kept.length} paints`);
  return { paints: kept, decision: { ...base, action: 'added', paints: keysOf(kept), added, finalError: round(error) } };
}

/** One log line for the decision. */
export function guardNote(d) {
  const head = `paint guard (${d.mode}, ${d.threshold} dE00): forced ${d.forced.join(',')} at ${d.forcedError}, own pick ${d.own.join(',')} at ${d.ownError}`;
  if (d.action === 'kept') return `${head}; kept the forced box`;
  if (d.action === 'added') return `${head}; added ${d.added.join(',')}, now ${d.finalError}`;
  return `${head}; replaced with the own pick (${d.reason})`;
}

/** The guard's settings from the painter's options, or null when --paintguard is 0 or absent. */
export function paintGuardOptions(opt, num) {
  const threshold = num('paintguard', 0);
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('--paintguard: expected a dE00 of 0 or more');
  if (!(threshold > 0)) return null;
  const mode = opt('paintguardmode', 'add'), max = num('paintguardmax', 8);
  if (!['add', 'replace'].includes(mode)) throw new Error('--paintguardmode: expected add or replace');
  if (!Number.isInteger(max) || max < 2) throw new Error('--paintguardmax: expected a whole number of 2 or more');
  return { threshold, mode, max };
}
