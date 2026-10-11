// Sessions must not cross a glaze, ordered subject or shadow boundary.
export const washStep = l => l.shapes?.[0]?._valuePlan?.id?.split('/')[1] ?? String(l.value);
export function sameWash(a, b) {
  return !!(a && b && a.value === b.value && a._valuePhase === b._valuePhase &&
    a._valuePhase !== 'shadow' && washStep(a) === washStep(b) &&
    (a._subject?.rank ?? null) === (b._subject?.rank ?? null) &&
    (a._order?.region ?? null) === (b._order?.region ?? null));
}
