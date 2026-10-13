// Shape-level reference looks during painting, and the frozen-replay switch (--notargetlooks, default 0).
// With --notargetlooks 1 every painting-time look returns null, so each caller falls back to the charge frozen at
// planning: no charge correction, kept-colour recharge, touch-up, final dark, sky lane or texture look. Planning
// looks before the first mark are not affected. The target guard still records and limits the looks that do run.

// guard.look(kind, id, mask, options) is the target guard's look; noLooks > 0 turns painting-time looks off.
export function paintingLooks(guard, noLooks) {
  return noLooks > 0 ? () => null : (...args) => guard.look(...args);
}
