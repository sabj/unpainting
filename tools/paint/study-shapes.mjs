// Level 4's data: the studies' flat shapes and the plan's wash geometry, as a file the model may select from and
// name by number in its own script. Each shape is one wash of the code planner's plan as it read the studies: its
// number (the wash's number, as in auto/washes.txt), the study it came from, its outline as polygons in sheet
// millimetres, its colour, its area and the named forms it lies in. A script may then say `"shapes": [12, 13]`
// (its region is those shapes), `"reserve": [40]` (paper it is laid round) or, in a stroke, `"along": 12` (the
// stroke runs along that shape's long axis); the numbers are turned into millimetres here, before the script is
// checked, so the painter is handed plain regions and points as always. Pure: nothing is read or written here.

const round1 = v => +Number(v).toFixed(1);

/** The shapes of a plan as data. `plan`: value-plan.json. {format, sheet, shapes: [{n, study, stage, kind, what, colour, areaMm2, boxMm, forms, polygons}]}. */
export function shapesData(plan, sheet) {
  const shapes = (plan.passes ?? []).map((q, i) => {
    const polygons = (q.outline ?? []).map(l => (l.points ?? l).map(p => [round1(p[0]), round1(p[1])])).filter(P => P.length >= 3), all = polygons.flat();
    return { n: i + 1, study: q.studyLayer != null ? q.studyLayer + 1 : null, stage: q.stage ?? null, kind: q.kind ?? null, what: String(q.thing ?? '').slice(0, 90), colour: q.colour ? q.colour.map(Math.round) : null, areaMm2: Math.round(Number(q.areaMm2) || 0),
      boxMm: all.length ? [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))] : null,
      forms: (q.forms ?? []).filter(f => f.share >= 0.05).map(f => ({ name: f.name, share: +Number(f.share).toFixed(2) })), polygons };
  });
  return { format: 'study-shapes 1', note: 'Each shape is one wash of the code planner\'s plan as it read the studies; "n" is its number (as in auto/washes.txt). Polygons are sheet millimetres. In your own script a passage may name shapes by number: "shapes": [n, ...] for its region, "reserve": [n, ...] for paper it is laid round; a stroke may say "along": n.', sheet, shapes };
}

/** The long axis of a set of polygons as a line of two points through their middle, from end to end of the shape. */
export function longAxis(polygons) {
  const P = polygons.flat(), n = P.length; if (n < 2) return null;
  const cx = P.reduce((a, p) => a + p[0], 0) / n, cy = P.reduce((a, p) => a + p[1], 0) / n;
  let xx = 0, xy = 0, yy = 0; for (const [x, y] of P) { xx += (x - cx) ** 2; xy += (x - cx) * (y - cy); yy += (y - cy) ** 2; }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(a), uy = Math.sin(a);
  let lo = Infinity, hi = -Infinity; for (const [x, y] of P) { const t = (x - cx) * ux + (y - cy) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return [[round1(cx + lo * ux), round1(cy + lo * uy)], [round1(cx + hi * ux), round1(cy + hi * uy)]];
}

/** Whether a script names study shapes by number anywhere. */
export function namesShapes(script) {
  return (script?.passages ?? []).some(p => p.shapes || p.reserve || (Array.isArray(p.strokes) && p.strokes.some(s => s?.along != null))) || (script?.lights ?? []).some(l => l?.shapes);
}

/**
 * A script whose passages name shapes by number, with the numbers turned into millimetres: `shapes` into `regions`,
 * `reserve` into `reserveRegions`, a stroke's `along` into its `points`, a light's `shapes` into its regions. Throws,
 * naming the passage, for a number the data does not hold. The script given is not altered.
 */
export function resolveNumbered(script, data) {
  const by = new Map(data.shapes.map(s => [s.n, s]));
  const polys = (list, who) => (Array.isArray(list) ? list : [list]).flatMap(n => { const s = by.get(Number(n)); if (!s) throw new Error(`painting script, ${who}: there is no shape ${n} in resources/shapes.json (1 to ${data.shapes.length})`); if (!s.polygons.length) throw new Error(`painting script, ${who}: shape ${n} has no outline to use`); return s.polygons; });
  const passages = (script.passages ?? []).map(p => {
    const who = `passage ${p.id ?? '?'}`, { shapes, reserve, ...rest } = p, out = { ...rest };
    if (shapes) out.regions = [...(p.regions ?? (p.region?.length ? [p.region] : [])), ...polys(shapes, who)], delete out.region;
    if (reserve) out.reserveRegions = [...(p.reserveRegions ?? []), ...polys(reserve, who)];
    if (Array.isArray(p.strokes)) out.strokes = p.strokes.map(s => { if (s?.along == null) return s; const { along, ...st } = s, axis = longAxis(polys(along, who)); return { ...st, points: axis.map(q => [q[0], q[1], 0.6]) }; });
    return out;
  });
  const lights = (script.lights ?? []).flatMap(l => (l?.shapes ? polys(l.shapes, 'a light').map(region => ({ ...l, shapes: undefined, region })) : [l]));
  return { ...script, passages, ...(script.lights ? { lights } : {}) };
}
