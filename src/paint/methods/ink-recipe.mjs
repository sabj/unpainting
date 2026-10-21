// --inkrecipe v2: one switch for the ink settings that hold the pen to the target (docs/ink.md). It sets each flag
// only when the command line does not, so any of them can still be changed on its own.
export const INK_RECIPES = Object.freeze({
  v2: Object.freeze({ linesupport: '5', linesmooth: '1', linesmoothcorner: '50', inkwidthfloor: '1', inkdarkcap: '1', inkdamp: '0.3' }),
});

/** The flags --inkrecipe adds to argv: each of the recipe's flags that argv does not already set. */
export function inkRecipeArgs(name, argv) {
  if (!name || name === 'none') return [];
  const r = INK_RECIPES[name];
  if (!r) throw new Error(`--inkrecipe: ${Object.keys(INK_RECIPES).join(' or ')} or none, not ${name}`);
  return Object.entries(r).flatMap(([k, v]) => (argv.includes('--' + k) ? [] : ['--' + k, v]));
}
