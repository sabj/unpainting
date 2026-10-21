// --paintguard dE: a check on a forced paint box (--paints, or washes.paints in a plan). The forced box and the
// painter's own pick are scored with the same objective (palettewide.mjs: sheet CIEDE2000 plus local-colour error).
// When the forced box is more than `threshold` worse, the guard changes it:
//   add      the own pick's missing paints are added to the forced box, best first, until the gap closes. A larger
//            box does not always fit better (the unmix spreads paint over pans that do not help), so when adding cannot
//            close the gap within `max` paints, the guard merges instead.
//   merge    the own pick, with the forced paints added back best first while the fit stays within `threshold` of the
//            own pick. A plan's dark (sepia, Payne's grey) usually survives this way.
//   replace  the own pick alone.
// Pure: no I/O, no target reads beyond the score it is given.

const MODES = ['add', 'merge', 'replace'];
const keysOf = paints => paints.map(p => p.key);
const round = v => Math.round(v * 100) / 100;

/**
 * @param {{ forced: object[], own: object[], score: (paints: object[]) => number, threshold: number,
 *   mode?: 'add'|'merge'|'replace', max?: number }} options
 * @returns {{ paints: object[], decision: object }} the paints to use and the record for the run card
 */
export function guardForcedBox({ forced, own, score, threshold, mode = 'add', max = 8 }) {
  if (!(threshold > 0)) throw new Error('paint guard: threshold must be a positive dE00');
  if (!MODES.includes(mode)) throw new Error(`paint guard: mode must be ${MODES.join(', ')}, not ${mode}`);
  if (!forced.length || !own.length) throw new Error('paint guard: needs a forced box and an own pick');
  const forcedError = score(forced), ownError = score(own), gap = forcedError - ownError;
  const base = { threshold, mode, forced: keysOf(forced), own: keysOf(own), forcedError: round(forcedError), ownError: round(ownError), gap: round(gap) };
  if (gap <= threshold) return { paints: forced, decision: { ...base, action: 'kept', paints: keysOf(forced), added: [], finalError: round(forcedError) } };
  if (mode === 'replace') return { paints: own, decision: { ...base, action: 'replaced', reason: 'forced box over threshold', paints: keysOf(own), added: [], finalError: round(ownError) } };
  if (mode === 'add') {
    const grown = grow(forced, own, score, forcedError, { max, stop: e => e - ownError <= threshold, accept: (e, now) => e < now });
    if (grown.error - ownError <= threshold) return { paints: grown.paints, decision: { ...base, action: 'added', paints: keysOf(grown.paints), added: grown.added, finalError: round(grown.error) } };
    const merged = merge(own, forced, score, ownError, threshold, max);
    return { paints: merged.paints, decision: { ...base, action: 'merged', reason: `adding ${grown.added.join(', ') || 'paints'} left a gap of ${round(grown.error - ownError)} at ${grown.paints.length} paints`, paints: keysOf(merged.paints), added: merged.added, finalError: round(merged.error) } };
  }
  const merged = merge(own, forced, score, ownError, threshold, max);
  return { paints: merged.paints, decision: { ...base, action: 'merged', reason: 'forced box over threshold', paints: keysOf(merged.paints), added: merged.added, finalError: round(merged.error) } };
}

// Add paints from `pool` to `start`, best first, while `accept` takes the best one and `stop` is not yet met.
function grow(start, pool, score, startError, { max, stop = () => false, accept = () => true }) {
  let kept = [...start], error = startError;
  const added = [];
  while (!stop(error) && kept.length < max) {
    const candidates = pool.filter(p => !kept.some(q => q.key === p.key));
    if (!candidates.length) break;
    const best = candidates.map(p => ({ p, e: score([...kept, p]) })).reduce((a, b) => (b.e < a.e ? b : a));
    if (!accept(best.e, error)) break;
    kept = [...kept, best.p]; error = best.e; added.push(best.p.key);
  }
  return { paints: kept, error, added };
}

// The own pick, with forced paints added back while the fit stays within `threshold` of the own pick.
const merge = (own, forced, score, ownError, threshold, max) => grow(own, forced, score, ownError, { max, accept: e => e - ownError <= threshold });

/** One log line for the decision. */
export function guardNote(d) {
  const head = `paint guard (${d.mode}, ${d.threshold} dE00): forced ${d.forced.join(',')} at ${d.forcedError}, own pick ${d.own.join(',')} at ${d.ownError}`;
  if (d.action === 'kept') return `${head}; kept the forced box`;
  if (d.action === 'added') return `${head}; added ${d.added.join(',')}, now ${d.finalError}`;
  if (d.action === 'merged') return `${head}; took the own pick${d.added.length ? ` with ${d.added.join(',')} kept` : ''}, now ${d.finalError} (${d.reason})`;
  return `${head}; replaced with the own pick (${d.reason})`;
}

/** The guard's settings from the painter's options, or null when --paintguard is 0 or absent. */
export function paintGuardOptions(opt, num) {
  const threshold = num('paintguard', 0);
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('--paintguard: expected a dE00 of 0 or more');
  if (!(threshold > 0)) return null;
  const mode = opt('paintguardmode', 'add'), max = num('paintguardmax', 8);
  if (!MODES.includes(mode)) throw new Error(`--paintguardmode: expected ${MODES.join(', ')}`);
  if (!Number.isInteger(max) || max < 2) throw new Error('--paintguardmax: expected a whole number of 2 or more');
  return { threshold, mode, max };
}
