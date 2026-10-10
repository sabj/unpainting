// --ladderseg: the ladder's glazes are for the foreground segments; a glaze mostly on the ground is left to the washes,
// since many glazes over sky and ground bury the washes and the pen. The foreground mask comes from --segink
// (seg-ink.mjs); without it, or at 0, every glaze is laid.

// True when the glaze over mask has under `share` of its cells on the foreground fg and is to be left to the washes.
export function leftToTheWashes({ fg, mask, n, share }) {
  if (!fg || !(share > 0)) return false;
  let inFg = 0, c = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { c++; inFg += fg[i]; }
  return !!c && inFg / c < share;
}
