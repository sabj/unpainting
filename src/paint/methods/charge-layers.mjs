// Charged middle layers (--charge 1). The value planner builds a form's middle values as up to four nested layers
// (L0 over the whole form, L1..L3 over its darker parts), and the painter dries the sheet before each one, so every
// step dries as a hard rim: the "topographic map" edges. A painter lays the lighter wash and drops the darker values
// into it while it is still wet, so they spread and grade into it. Here the middle layers of one region and subject
// are pulled together behind that region's first layer and laid in one wet session; the sheet dries once after the
// last of them. Order and sessions only: the passages, their shapes and charges are unchanged.

const stepOf = l => l?.shapes?.[0]?._valuePlan?.id?.split('/')[1] ?? null;

/** The wet session a layer can join: middle layers (b<band>L<k>) of one subject and region, else null. */
export function chargeGroup(l) {
  if (!l || l._valuePhase !== 'mid' || !/^b\dL\d+$/.test(stepOf(l) ?? '')) return null;
  return `${l._subject?.rank ?? '-'}|${l._order?.region ?? '-'}`;
}

export const sameCharge = (a, b) => {
  const g = chargeGroup(a);
  return g !== null && g === chargeGroup(b);
};

/** Layers reordered so each charge group is laid together at the place of its first layer, lighter layers first. */
export function chargeOrder(layers) {
  const groups = new Map();
  layers.forEach((l, i) => { const g = chargeGroup(l); if (g !== null) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); } });
  const out = [], placed = new Set();
  layers.forEach((l, i) => {
    if (placed.has(i)) return;
    const g = chargeGroup(l);
    if (g === null) { out.push(l); placed.add(i); return; }
    const members = groups.get(g).slice().sort((a, b) => Number(stepOf(layers[a]).split('L')[1]) - Number(stepOf(layers[b]).split('L')[1]) || a - b);
    for (const j of members) { out.push(layers[j]); placed.add(j); }
  });
  return out;
}
