// Under-covered touch-ups (--touchcover c). A touch-up glaze is charged for its whole planning shape. When its sweeps
// would touch only a small share of that shape (one dab on a 226-cell shape touched 4% of it on Mittens), the whole
// correction lands in the few cells the dab reaches and dries as a dark blot. Such a glaze is left out; the shape
// keeps the value the ladder gave it.
export function leaveTouchUp({ touched, cover, minCover }) {
  return Boolean(touched) && minCover > 0 && Number.isFinite(cover) && cover < minCover;
}
