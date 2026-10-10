// Shadow technique choice (wet blend or dry layer) from measured edge widths, and paper-state gates that hold a
// stroke until its paper is dry or moist enough. No physics overrides.
import { gaussian } from '../../keyframes/density.mjs';
import { DEFAULTS } from '../../media/sheet.mjs';

export const PAPER_STATE = Object.freeze({ dryWater: 0.004, drySaturation: 0.02,
  moistWater: 0.015, moistSaturation: 0.6, glossyWater: 0.15, moistShare: 0.7 });
const quantile = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null;

// Shadow boundaries only: both ends of the profile must remain inside the canopy.
// A 20 to 80% transition width, sampled along the local luminance gradient. Expressed in
// millimetres so downsampling a reference does not turn a soft shadow into a hard one.
export function shadowEdges(L, mask, w, h, mmCell, threshold = null, thresholdField = null) {
  // Suppress sub-millimetre paper grain before measuring the shadow, not the tooth.
  const B = gaussian(L, w, h, Math.max(0.7, 0.6 / mmCell)), reach = Math.max(4, Math.ceil(3 / mmCell));
  const widths = [], gradients = [];
  const at = (x, y) => {
    const X = Math.round(x), Y = Math.round(y);
    return X < 0 || X >= w || Y < 0 || Y >= h ? -1 : Y * w + X;
  };
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    const gx = (B[i + 1] - B[i - 1]) / 2, gy = (B[i + w] - B[i - w]) / 2;
    const g = Math.hypot(gx, gy); if (g < 3 * mmCell) continue;
    const ux = gx / g, uy = gy / g;
    const a = at(x - ux, y - uy), b = at(x + ux, y + uy);
    const contour = thresholdField ?? B;
    if (threshold !== null && !(contour[a] <= threshold && contour[b] > threshold)) continue;
    const profile = [];
    for (let t = -reach; t <= reach; t += 0.5) {
      const j = at(x + ux * t, y + uy * t);
      if (j < 0 || !mask[j]) { profile.length = 0; break; }
      profile.push(B[j]);
    }
    if (!profile.length) continue;
    // Bound one transition by its adjacent plateaus. A fixed-window contrast
    // confuses a sharp edge on a lighting ramp (or two hard edges) with a blend.
    const slope = profile.map((_, j) => j > 1 && j < profile.length - 2 ?
      (profile[j + 2] - profile[j - 2]) / 2 : 0);
    const mid = Math.floor(profile.length / 2);
    let peak = mid;
    const peakReach = Math.max(2, Math.round(0.75 / mmCell));
    for (let j = mid - peakReach; j <= mid + peakReach; j++) if (slope[j] > slope[peak]) peak = j;
    if (slope[peak] < 5 * mmCell) continue;
    let left = peak, right = peak;
    while (left > 2 && slope[left - 1] >= slope[peak] * 0.2) left--;
    while (right < profile.length - 3 && slope[right + 1] >= slope[peak] * 0.2) right++;
    // The measured contour must belong to this edge, not its neighbour.
    if (mid < left - 1 || mid > right + 1) continue;
    const lo = profile[Math.max(0, left - 1)], hi = profile[Math.min(profile.length - 1, right + 1)];
    if (hi - lo < 12) continue;
    const local = profile.slice(Math.max(0, left - 1), Math.min(profile.length, right + 2));
    let backward = 0; for (let j = 1; j < local.length; j++) backward += Math.max(0, local[j - 1] - local[j]);
    if (backward > (hi - lo) * 0.2) continue;
    const crossing = level => {
      for (let j = 1; j < local.length; j++) if (local[j] >= level && local[j - 1] < level)
        return (j - 1 + (level - local[j - 1]) / (local[j] - local[j - 1])) * 0.5;
      return null;
    };
    const t20 = crossing(lo + 0.2 * (hi - lo)), t80 = crossing(lo + 0.8 * (hi - lo));
    if (t20 === null || t80 === null || t80 <= t20) continue;
    widths.push((t80 - t20) * mmCell); gradients.push(slope[peak] / mmCell);
  }
  widths.sort((a, b) => a - b); gradients.sort((a, b) => a - b);
  return { samples: widths.length, widthMm: quantile(widths, 0.5), gradientPerMm: quantile(gradients, 0.5) };
}

export function chooseShadowTechnique(measurement, fallback = null) {
  const evidence = measurement.samples >= 4 ? measurement : fallback?.samples >= 4 ? fallback : null;
  // Edge width in mm that separates blended shadows (wider) from layered ones.
  const soft = evidence && evidence.widthMm >= 1.3;
  return { technique: soft ? 'wet blend' : 'dry layer', paperState: soft ? 'moist, not glossy' : 'fully dry',
    edge: soft ? 'soft' : 'hard', measurement, evidence: !evidence ? 'insufficient edges: conservative dry layer' :
      evidence === measurement ? 'layer shadow edges' : 'region shadow edges',
    ...(evidence !== measurement && evidence ? { fallbackMeasurement: evidence } : {}) };
}

// Conservative envelope of the brush path, including the lifted tip. Sample all its
// cells, not just its centre; exclude intentional resist and cells the brush cannot touch.
export function strokeCells(sheet, points, radius) {
  const cells = new Set();
  const dot = p => {
    if ((p.p ?? 1) <= 0) return; // lifted connector between touches in one compound stroke
    const r = Math.max(1.5, (p.r ?? radius) * (0.25 + 0.75 * (p.p ?? 1)) * 1.07 + 0.75);
    for (let y = Math.max(0, Math.floor(p.y - r)); y <= Math.min(sheet.h - 1, Math.ceil(p.y + r)); y++)
      for (let x = Math.max(0, Math.floor(p.x - r)); x <= Math.min(sheet.w - 1, Math.ceil(p.x + r)); x++) {
        const i = y * sheet.w + x;
        if ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 <= r * r &&
            (!sheet.clip || sheet.clip[i]) && !sheet.resist?.[i]) cells.add(i);
      }
  };
  for (let j = 0; j < points.length; j++) {
    const a = points[j], b = points[Math.min(j + 1, points.length - 1)];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let k = 0; k < n; k++) { const t = k / n; dot({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * t, r: (a.r ?? radius) + ((b.r ?? radius) - (a.r ?? radius)) * t }); }
  }
  return [...cells];
}

export function measurePaper(sheet, cells) {
  if (!cells.length) return { cells: 0, waterMax: 0, saturationMax: 0, waterP95: 0, moistShare: 0, dry: true };
  let x0 = sheet.w, x1 = 0, y0 = sheet.h, y1 = 0;
  for (const i of cells) { const x = i % sheet.w, y = Math.floor(i / sheet.w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  // Flushes queued GPU strokes and reads fresh water/saturation planes over the footprint.
  if (sheet._gpu && !sheet._gpu.paused) (sheet._gpu.ensurePaperFresh??sheet._gpu.ensureFresh).call(sheet._gpu,sheet, [x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
  let waterMax = 0, saturationMax = 0, moist = 0; const waters = [];
  for (const i of cells) {
    const water = sheet.W[i], saturation = sheet.s[i] / Math.max(1e-8, sheet.paper.capacity[i]);
    if (!Number.isFinite(water) || !Number.isFinite(saturation)) throw new Error('Non-finite paper state');
    waters.push(water); waterMax = Math.max(waterMax, water); saturationMax = Math.max(saturationMax, saturation);
    if (water >= PAPER_STATE.moistWater || saturation >= PAPER_STATE.moistSaturation) moist++;
  }
  waters.sort((a, b) => a - b);
  return { cells: cells.length, bounds: [x0, y0, x1, y1], waterMax, saturationMax, waterP95: quantile(waters, 0.95), moistShare: moist / cells.length,
    dry: waterMax <= PAPER_STATE.dryWater && saturationMax <= PAPER_STATE.drySaturation };
}

export function paperReady(state, technique) {
  return state.cells > 0 && (technique === 'dry layer' ? state.dry :
    state.moistShare >= PAPER_STATE.moistShare && state.waterMax <= PAPER_STATE.glossyWater);
}

export function enforcePaper({ sheet, cells, technique, step, dry, O, log, label, record, refit }) {
  let state = measurePaper(sheet, cells), waits = 0;
  const fastTime = { ...(O ?? DEFAULTS), dt: 2 }; // same physical processes and default dry() time step, never fix()
  if (!cells.length) return false;
  const wholeCells = technique === 'dry layer' ? Array.from({ length: sheet.n }, (_, i) => i) : null;
  let whole = wholeCells ? measurePaper(sheet, wholeCells) : null;
  if (whole && !whole.dry) {
    dry(sheet, 30000, O, { levelMax: 140, dt: 14 }); waits++;
    // Whole sheet must be dry, including pore water, not merely the planned footprint.
    whole = measurePaper(sheet, wholeCells);
    if (!whole.dry) {
      const failure = { label, technique, ...measurePaper(sheet, cells), wholeSheetDry: false, wholeSheet: whole, waits, passed: false };
      record?.(failure); log?.(`technique stroke ${JSON.stringify(failure)}`);
      throw new Error(`wetdry ${label}: full-sheet drying failed`);
    }
    state = measurePaper(sheet, cells);
  }
  // Waiting changes the paper. Re-fit from the original planned path once the
  // gloss has settled, never rely on a placement measured before that wait.
  for (let repair = 0; repair < 3 && technique === 'wet blend'; repair++) {
    while (!paperReady(state, technique) && state.waterMax > PAPER_STATE.glossyWater && waits < 20000) {
      for (let j = 0; j < 10; j++) step(sheet, waits >= 140 && state.waterMax > PAPER_STATE.glossyWater + 0.02 ? fastTime : O ?? DEFAULTS);
      waits += 10; state = measurePaper(sheet, cells);
    }
    if (paperReady(state, technique) || repair === 2 || !refit) break;
    const candidate = refit();
    if (!candidate?.length) break;
    cells = candidate; state = measurePaper(sheet, cells);
  }
  const passed = paperReady(state, technique);
  const entry = { label, technique, ...state, wholeSheetDry: whole?.dry ?? null, waits, passed };
  record?.(entry);
  log?.(`technique stroke ${JSON.stringify(entry)}`);
  if (!passed) throw new Error(`wetdry ${label}: ${technique} precondition failed (${JSON.stringify(state)})`);
  return true;
}

// A small brush-placement correction at a broken canopy edge. Move toward the
// still-moist part of the same clump and narrow the tip, never add water or change
// the state threshold. If no nearby footprint is moist, the gate still fails closed.
export function fitMoistStroke(sheet, points, radius) {
  const original = strokeCells(sheet, points, radius), state = measurePaper(sheet, original);
  if (state.moistShare >= PAPER_STATE.moistShare || !original.length)
    return { points, cells: original, adjustment: null };
  let ax = 0, ay = 0, wx = 0, wy = 0, wn = 0;
  for (const i of original) {
    const x = i % sheet.w + 0.5, y = Math.floor(i / sheet.w) + 0.5; ax += x; ay += y;
    if (sheet.W[i] >= PAPER_STATE.moistWater || sheet.s[i] / Math.max(1e-8, sheet.paper.capacity[i]) >= PAPER_STATE.moistSaturation) { wx += x; wy += y; wn++; }
  }
  if (!wn) return { points, cells: original, adjustment: null };
  let dx = wx / wn - ax / original.length, dy = wy / wn - ay / original.length;
  const length = Math.hypot(dx, dy), limit = radius;
  if (length > limit) { dx *= limit / length; dy *= limit / length; }
  const shifts = [[dx * 0.5, dy * 0.5], [dx, dy]];
  // The moist portion of a broken wash need not lie along its centroid direction.
  for (const reach of [0.5, 1]) for (let angle = 0; angle < 8; angle++)
    shifts.push([Math.cos(angle * Math.PI / 4) * radius * reach, Math.sin(angle * Math.PI / 4) * radius * reach]);
  for (const scale of [1, 0.85, 0.7, 0.5]) for (const [sx, sy] of shifts) {
    const candidate = points.map(p => ({ ...p, x: p.x + sx, y: p.y + sy, r: (p.r ?? radius) * scale }));
    const cells = strokeCells(sheet, candidate, radius), measured = measurePaper(sheet, cells);
    if (measured.moistShare >= PAPER_STATE.moistShare) return { points: candidate, cells,
      adjustment: { dx: sx, dy: sy, radiusScale: scale, originalMoistShare: state.moistShare } };
  }
  return { points, cells: original, adjustment: null };
}


// One clump is one deliberate brush stroke. Lift between its short belly touches
// with zero pressure; don't dry or wait between parts of the same shape.
export function compoundClump(touches) {
  const points = [];
  for (const touch of touches) {
    if (!touch.length) continue;
    if (points.length) points.push({ ...points.at(-1), p: 0 }, { ...touch[0], p: 0 });
    points.push(...touch);
  }
  return points;
}

// Read the physical reservoir and every bristle, including GPU changes from the
// preceding touch. Requested dip concentration is not the remaining brush load.
export function measureBrush(brush) {
  if (brush._pend) brush._pend.link.settleBrush(brush);
  let water = brush.resW ?? 0;
  const pigment = Array.from({ length: brush.K ?? 0 }, (_, k) => brush.resP?.[k] ?? 0);
  for (const hair of brush.hairs ?? []) {
    water += hair.water;
    pigment.forEach((_, k) => { pigment[k] += hair.pig?.[k] ?? 0; });
  }
  if (!Number.isFinite(water) || water < 0 || pigment.some(p => !Number.isFinite(p) || p < 0))
    throw new Error('Invalid measured brush load');
  return { waterMass: water, pigmentMass: pigment, pigmentConcentration: pigment.map(p => water > 0 ? p / water : 0) };
}

export function describeLayer(layer, index) {
  const blended = layer.technique === 'wet blend';
  return { ...layer,
    move: blended ? 'dry on wet' : 'wet on dry',
    referenceCue: layer.evidence,
    intendedResult: blended ? 'connected soft shadow within the wet canopy' : 'separate bounded shadow preserving the lighter layer',
    startingState: layer.paperState,
    brush: { ...layer.brush, shape: 'round', size: [12, 8, 4, 4][index],
      management: blended ? 'fresh concentrated load, blotted water level, measure remaining load before each stroke' : 'fresh premixed load; measure remaining load before each stroke' },
    pigment: 'up to three palette pigments fitted to reference colour and calibrated on the same paper',
    protectedLights: 'masked paper flecks and lighter shoulders outside this reference shadow threshold',
    failureSigns: blended ? ['hard shadow boundary', 'flooded lights', 'puddled rim'] : ['bleeding silhouette', 'lost light shoulders', 'disturbed underlayer'],
    operations: blended ? ['preserve predecessor moisture', 'measure paper and brush', 'dry on wet'] : ['dry', 'measure paper and brush', 'wet on dry'],
  };
}
