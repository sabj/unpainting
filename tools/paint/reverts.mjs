// The one hard rule of a session (the owner's): no hill-climbing by going back to an earlier choice without limit.
// A session may try, look and change its mind as a painter does; what it may not do is keep a change only when a look
// came out better and throw it away otherwise, again and again. So every return to a choice it had already left is
// counted, the count is reported (usage.json), and past the benchmark's allowed number a return is refused.
// A return: a plan or a look of a choice that is exactly (by its fingerprint) one the session planned before and has
// since moved on from. Planning the same choice twice in a row is no return. Pure: nothing is read or written.

/** Returns to an earlier choice a session may make when the command line names no number. */
export const DEFAULT_REVERTS = 20;

/**
 * A session's returns, counted. `most`: the allowed number. `start`: the fingerprint the session starts from (the code
 * planner's plan, nothing changed), so that going back to it counts. see(key) -> {revert, refused, count}: a refused
 * return is not counted and the session stays where it was.
 */
export function revertCounter(most = DEFAULT_REVERTS, start = null) {
  const seen = new Set(start ? [start] : []), log = []; let last = start, count = 0, refused = 0;
  return {
    see(key, at = null) {
      if (key === last) return { revert: false, refused: false, count };
      if (seen.has(key)) {
        if (count >= most) { refused++; log.push({ at, to: key, refused: true }); return { revert: true, refused: true, count }; }
        count++; log.push({ at, to: key, refused: false });
        last = key; return { revert: true, refused: false, count };
      }
      seen.add(key); last = key; return { revert: false, refused: false, count };
    },
    /** Whether handing over `key` now would be a return past the allowed number (nothing is counted). */
    barred: key => key !== last && seen.has(key) && count >= most,
    record: () => ({ count, allowed: most, refused, log }),
  };
}
