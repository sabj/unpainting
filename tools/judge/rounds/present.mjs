// What each judge sees: its own letters, its own left-to-right order, and its own list of pairs.
//
// Letters are drawn per judge from a pool that avoids the stage names (A, B, D, H, I), independent of position.
// Positions are counterbalanced: the base order is shuffled once, a family's first judge sees it rotated by the
// family's index, and the family's second judge sees that order reversed, so within a family each run swaps sides
// (the middle place of an odd count stays put). Pairs are every
// unordered pair of runs, each judge's pairs shuffled and each pair's sides randomised.
//
// DOM free and pure: randomness comes in as a function returning an integer in [0, n).
export const LETTER_POOL = 'CFGKLMNPRSTVWXZ';

function shuffle(xs, randInt) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const rotate = (xs, k) => xs.map((_, i) => xs[(i + k) % xs.length]);

/**
 * `runs` are run ids; `judges` are [{ family }] in order. Returns one presentation per judge:
 * { order: [runId] left to right, letter: { runId: letter }, pairs: [[runIdLeft, runIdRight]] }.
 */
export function presentations(runs, judges, randInt) {
  if (runs.length > LETTER_POOL.length) throw new Error(`at most ${LETTER_POOL.length} runs`);
  const base = shuffle(runs, randInt);
  const families = [...new Set(judges.map(j => j.family))], seen = {};
  return judges.map(j => {
    const member = (seen[j.family] = (seen[j.family] ?? -1) + 1);
    const turned = rotate(base, (families.indexOf(j.family) + Math.floor(member / 2)) % runs.length);
    const order = member % 2 ? [...turned].reverse() : turned;
    const letters = shuffle([...LETTER_POOL], randInt).slice(0, runs.length);
    const letter = Object.fromEntries(runs.map((r, i) => [r, letters[i]]));
    const pairs = [];
    for (let a = 0; a < runs.length; a++) for (let b = a + 1; b < runs.length; b++) {
      pairs.push(randInt(2) ? [runs[a], runs[b]] : [runs[b], runs[a]]);
    }
    return { family: j.family, order, letter, pairs: shuffle(pairs, randInt) };
  });
}
