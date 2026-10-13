// Canonical names for a family's authored baseMove (value plan families; see docs/plan-format.md). Reads no flags.
// Plans and the benchmark brief write "wet in wet"; the painter's moves are "wet on wet", "wet on dry" and
// "dry on dry". Without this, an authored "wet in wet" light family was painted wet on dry.
const ALIASES = Object.freeze({
  'wet in wet': 'wet on wet', 'wet-in-wet': 'wet on wet', 'wet-on-wet': 'wet on wet',
  'glaze': 'wet on dry', 'glazed': 'wet on dry', 'glazing': 'wet on dry', 'dry brush': 'dry on dry',
});

// The painter's move for an authored one; unknown moves pass through unchanged.
export function normalizePassageMove(move) {
  const key = typeof move === 'string' ? move.trim().toLowerCase() : move;
  return ALIASES[key] ?? key;
}
