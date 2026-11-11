// Runs an area pass's charge (pass.charge, area-washes.mjs) right after its strokes, while the wash is wet: a load of
// the second colour dropped into it in lanes one brush width apart (soften-lift.mjs liftPaths), with the pass's brush.
// A lane is charged only while its bed is still wet (the wet-bed moist share, wet-bed-wait.mjs WET_BED); a bed that has
// passed that stage is not charged, and the lane is counted (painting-rules.md 11).
import { liftPaths } from '../../src/paint/techniques/soften-lift.mjs';
import { WET_BED } from './wet-bed-wait.mjs';
import { polygonCells } from './soften-lift-run.mjs';

/**
 * pass: the area pass; plan: the rastered plan (for the polygon); mask: the pass's cells on the sheet (W x H); r: brush
 * radius in sheet cells; mix: pigment amounts of the charge; newBrush(r), dip, stroke(b, path, options): the painter's;
 * observe(cells): the paper over those cells; as(pass)/restore(): the identity the strokes are recorded under.
 */
export function chargeWetPass({ pass, plan, mask, W, H, r, mix, newBrush, dip, stroke, observe, as, restore, strength }) {
  const c = pass.charge, region = c.polygon ? polygonCells(c.polygon, plan, W, H) : Uint8Array.from(mask);
  for (let i = 0; i < region.length; i++) region[i] = region[i] && mask[i] ? 1 : 0;
  const done = { reason: c.reason, lanes: 0, laid: 0, skippedDry: 0 };
  const charging = { ...pass, move: 'charge', load: { ...pass.load, water: c.water }, wetness: { required: 'wet', neighborCells: 0 } };
  for (const path of liftPaths(region, W, H, { r })) {
    done.lanes++;
    const y = Math.floor(path[0].y), x0 = Math.floor(Math.min(path[0].x, path[1].x)), x1 = Math.floor(Math.max(path[0].x, path[1].x)), cells = [];
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++) for (let x = x0; x <= x1; x++) if (region[yy * W + x]) cells.push(yy * W + x);
    if (!cells.length) continue;
    if (!(observe(cells).moistShare >= WET_BED.moistShare)) { done.skippedDry++; continue; }
    as(charging);
    try { const b = newBrush(r); dip(b, { water: 1, conc: mix.map(v => v * strength) }); stroke(b, path, {}); done.laid++; }
    finally { restore(); }
  }
  return done;
}
