// The plan says which lines each part of the picture gets: a value plan family's `drawingRole`, the same words an area
// plan uses (tools/painter/semantic-areas.mjs):
//   none        no line here: the wash states it (sky, foliage, fur, shadow)
//   scaffold    a construction line in the opening drawing only
//   structural  the opening drawing and the closing restatement
//   focal       the closing restatement only: a focal accent over the dry washes
// A line is decided whole, by the role of the family under most of its length; where families overlap, the smallest
// box is the most specific. A family that states no role, or a line outside every family, changes nothing, so a plan
// that is silent draws as before. The plan decides; no measure of the picture is read here.

const DRAWING_ROLES = Object.freeze(['none', 'scaffold', 'structural', 'focal']);
const KEEPS = Object.freeze({ opening: ['scaffold', 'structural'], closing: ['structural', 'focal'] });

/** The families that state a role, validated. Throws on an unknown role. */
export function roleFamilies(families = []) {
  const out = [];
  for (const f of families ?? []) {
    if (f?.drawingRole == null) continue;
    if (!DRAWING_ROLES.includes(f.drawingRole)) throw new Error(`families[${f.id}].drawingRole: one of ${DRAWING_ROLES.join(', ')}, not ${JSON.stringify(f.drawingRole)}`);
    const b = f.bounds;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || !(b[2] > b[0] && b[3] > b[1])) throw new Error(`families[${f.id}].drawingRole needs the family's bounds [x0, y0, x1, y1]`);
    out.push({ id: f.id, role: f.drawingRole, b, area: (b[2] - b[0]) * (b[3] - b[1]) });
  }
  return out;
}

/** The role of the most specific family over a normalized point, or null. */
function roleAt(fams, x, y) {
  let best = null;
  for (const f of fams) if (x >= f.b[0] && x < f.b[2] && y >= f.b[1] && y < f.b[3] && (!best || f.area < best.area)) best = f;
  return best?.role ?? null;
}

/** The role under most of a line's points ({x, y} on a w by h grid), or null when most of it lies under no role. */
export function lineRole(fams, g, w, h) {
  const count = new Map();
  for (const q of g.points) { const r = roleAt(fams, (q.x + 0.5) / w, (q.y + 0.5) / h) ?? ''; count.set(r, (count.get(r) ?? 0) + 1); }
  let role = '', most = -1;
  for (const [r, c] of count) if (c > most) { most = c; role = r; }
  return role || null;
}

/**
 * Keep the lines the plan's roles give this stage ('opening' or 'closing'). Returns { lines, dropped: {role: count} }.
 * With no family stating a role, every line is kept.
 */
export function linesByRole(lines, families, { w, h, stage }) {
  if (!KEEPS[stage]) throw new Error(`drawing role: stage opening or closing, not ${stage}`);
  const fams = roleFamilies(families);
  if (!fams.length) return { lines, dropped: {} };
  const dropped = {}, kept = [];
  for (const g of lines) {
    const r = lineRole(fams, g, w, h);
    if (r == null || KEEPS[stage].includes(r)) kept.push(g);
    else dropped[r] = (dropped[r] ?? 0) + 1;
  }
  return { lines: kept, dropped };
}
