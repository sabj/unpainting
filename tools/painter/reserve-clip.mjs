// Bare-paper reserves a stroke may not paint. A stroke whose primary contact reaches a reserved cell is not stopped:
// those cells are clipped out of it for that stroke only, so the white stays, and the caller counts the clip
// (src/media/checks.mjs). --strict 1 stops instead.

/** The sheet cells of a stroke's primary contact that `reserved(i)` marks as bare paper. */
export function reservedContact(contact, reserved) {
  return contact.cells.filter(i => contact.primaryMask[i] && reserved(i));
}

/** Run fn with `cells` taken out of the target's clip (a clip of 1 = may paint), then restore the clip it had. */
export function withReserveClip(target, cells, setClip, fn) {
  if (!cells.length) return fn();
  const previous = target.clip ?? null;
  const mask = previous ? Uint8Array.from(previous) : new Uint8Array(target.n).fill(1);
  for (const i of cells) mask[i] = 0;
  setClip(target, mask);
  try { return fn(); } finally { setClip(target, previous); }
}
