// The wash plan written as a painting script (docs/painting-script.md): passages in the order a painter lays them, each
// with its region (a guide to the hand), its paint, brush, move and kind of mark, what is charged into it while wet and
// what it is laid into. A model that understands painting writes the script, the way a teacher writes out how to paint a
// picture; this module turns it into strokes for the painter (script-marks.mjs) and into the same plan the study wash
// plan makes (study-washes.mjs), so the paint step lays it with the same brush, waits and moves.
//
// One passage is one wash: ONE mix (the script's pigments in its proportions, at the strength whose swatch on white paper
// has the script's lightness), laid in whole strokes placed by the region and never clipped to it. Charges are dabs of
// their own mix dropped into it while wet. A passage `into` the one just before it (wet into wet, or beside damp) is laid
// in the same wet session; any other passage is laid on a dry sheet. Nothing here reads the subject to paint. The subject
// is read only for a check, afterwards: the plan's colour over each passage against the subject's mean colour there.
import { passage } from '../../crop/blockin.mjs';
import { labOf } from '../../eval/colour.mjs';
import { filmLab } from './puddles.mjs';
import { handOf, PRESSURE, sweeps, tapers, dabs, wedges, lines, scumbles, chargeDab } from './script-marks.mjs';

/** Swatch lightness (L* on white paper) for each dilution word. */
export const DILUTION_L = Object.freeze({ 'very pale': 88, pale: 79, medium: 66, strong: 52, rich: 40, dark: 30 });
/** Each move: the painter's move, the brush's water load, the phase (a glaze is a shadow phase: less trade with wet paint). */
const MOVES = Object.freeze({
  'wet on dry': { move: 'wet on dry', water: 0.62, phase: null },
  glaze: { move: 'wet on dry', water: 0.58, phase: 'shadow' },
  'wet into wet': { move: 'wet on wet', water: 0.88, phase: null },
  'beside damp': { move: 'beside damp', water: 0.62, phase: null },
  'dry brush': { move: 'dry on dry', water: 0.22, phase: null },
});
const MARKS = new Set(['sweep', 'tapered', 'dab', 'wedge', 'line', 'scumble']);
/** A charge's brush when the script names none (mm), and the least share of its own passage's strength it is dropped at. */
const CHARGE_BRUSH_MM = 6;
/** Phase of each stage, as the paint step reads it. */
const PHASE = [null, 'light', 'light', 'shadow', 'mid', 'shadow'];

/** sRGB [r, g, b] from '#rrggbb'. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim()); if (!m) return null;
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** The script checked: every field the executor reads, with what is wrong said plainly. Returns the passages. */
export function checkScript(script, { keys, sheetWidthMm }) {
  if (!script || script.format !== 'painting-script 1') throw Error('painting script: format must be "painting-script 1"');
  if (!(Math.abs((script.sheet?.widthMm ?? 0) - sheetWidthMm) <= 0.5)) throw Error(`painting script: written for a sheet ${script.sheet?.widthMm} mm wide, painted on ${sheetWidthMm} mm`);
  const ids = new Set(), brushes = script.brushes ?? {};
  for (const [name, b] of Object.entries(brushes)) if (!(b?.widthMm > 0)) throw Error(`painting script: brush ${name} has no width`);
  (script.passages ?? []).forEach((p, i) => {
    const at = `painting script, passage ${p?.id ?? i}`;
    if (!p?.id || ids.has(p.id)) throw Error(`${at}: needs a unique id`); ids.add(p.id);
    if (!MARKS.has(p.mark)) throw Error(`${at}: mark ${p.mark} is not one of ${[...MARKS].join(', ')}`);
    if (!MOVES[p.move]) throw Error(`${at}: move ${p.move} is not one of ${Object.keys(MOVES).join(', ')}`);
    if (!brushes[p.brush]) throw Error(`${at}: brush ${p.brush} is not in the kit`);
    const pig = Object.entries(p.paint?.pigments ?? {});
    if (!pig.length) throw Error(`${at}: no pigments`);
    for (const [k] of pig) if (!keys.includes(k)) throw Error(`${at}: pigment ${k} is not in the painter's box (${keys.join(', ')}); run with --paints naming the script's palette`);
    for (const c of p.charges ?? []) for (const [k] of Object.entries(c.pigments ?? {})) if (!keys.includes(k)) throw Error(`${at}: charge pigment ${k} is not in the box`);
    if (p.mark === 'line' ? !(p.paths?.length) : !(regionsOf(p).length)) throw Error(`${at}: a ${p.mark} needs ${p.mark === 'line' ? 'paths' : 'a region'}`);
  });
  if (!ids.size) throw Error('painting script: no passages');
  return script.passages;
}

const regionsOf = p => (p.regions?.length ? p.regions : p.region?.length ? [p.region] : []).filter(P => P?.length >= 3);

/** The strokes of one passage (mm), from its mark, brush, direction, count and size; no picture read. */
export function passageStrokes(p, brushes, seed = 0) {
  const rng = handOf(`${seed}/${p.id}`), widthMm = brushes[p.brush].widthMm, polys = regionsOf(p), deg = Number(p.direction ?? 0) || 0;
  const pressure = PRESSURE[p.pressure] ?? PRESSURE.medium, n = Math.max(1, Math.round(p.strokes ?? 1)), lengthMm = Number(p.lengthMm) || 0;
  switch (p.mark) {
    case 'sweep': return sweeps(polys, { widthMm, deg, lanes: p.strokes ?? 0, pressure: Math.max(pressure, 0.6), rng });
    case 'tapered': return tapers(polys, { widthMm, deg, n, lengthMm: lengthMm || 4 * widthMm, pressure, rng });
    case 'dab': return dabs(polys, { widthMm, deg, n, lengthMm, pressure, rng });
    case 'wedge': return wedges(polys, { widthMm, deg, n, lengthMm, pressure, rng });
    case 'line': return lines(p.paths, { widthMm, pressure, rng });
    case 'scumble': return scumbles(polys, { widthMm, deg, n, lengthMm, pressure, rng });
  }
  return [];
}

/** The cells (w x h) a list of strokes touches: each point's footprint, r (0.25 + 0.75 p), joined along the stroke. */
export function footprint(strokes, w, h, cellMm) {
  const m = new Uint8Array(w * h);
  const disc = (x, y, r) => { const cx = x / cellMm, cy = y / cellMm, rc = Math.max(0.5, r / cellMm); for (let yy = Math.max(0, Math.floor(cy - rc)); yy <= Math.min(h - 1, Math.ceil(cy + rc)); yy++) for (let xx = Math.max(0, Math.floor(cx - rc)); xx <= Math.min(w - 1, Math.ceil(cx + rc)); xx++) if ((xx + .5 - cx) ** 2 + (yy + .5 - cy) ** 2 <= rc * rc) m[yy * w + xx] = 1; };
  for (const st of strokes) {
    const P = st.points;
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[Math.min(P.length - 1, k + 1)], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cellMm * 1.5)));
      for (let s = 0; s < steps; s++) { const t = s / steps, p = (a[2] ?? 1) + ((b[2] ?? 1) - (a[2] ?? 1)) * t; disc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, st.radiusMm * (0.25 + 0.75 * p)); }
    }
  }
  return m;
}

/**
 * The plan of a painting script, in the shape the paint step takes (study-washes.mjs planStudyWashes returns the same).
 * `script`: the parsed script; `pigments`: the painter's box (each with its `key`); `rgb`: the subject on the sheet's
 * grid, read only for the colour check written to the plan's summary.
 */
export function planScriptWashes({ script, k, w, h, pigments, paperRGB = null, sheetWidthMm = 280, rgb = null, density = null, inkValue = null, seed = 0 }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248], keys = pigments.map(p => p.key);
  if (pigments.length !== k || k < 1) throw Error('the script wash plan needs the pigments');
  const passages = checkScript(script, { keys, sheetWidthMm }), brushes = script.brushes;
  const white = [255, 255, 255];
  // a mix of the script's pigments, at the strength whose film on white paper reaches the swatch's lightness
  const mixOf = paint => {
    const base = new Array(k).fill(0); let t = 0;
    for (const [key, parts] of Object.entries(paint.pigments)) { base[keys.indexOf(key)] += Math.max(0, Number(parts) || 0); }
    t = base.reduce((a, v) => a + v, 0); if (!(t > 0)) throw Error('painting script: pigment parts must be positive');
    const unit = base.map(v => v / t), sw = hexRgb(paint.swatch), want = sw ? labOf(sw, 0, white)[0] : DILUTION_L[paint.dilution] ?? DILUTION_L.medium;
    const Lat = s => filmLab(unit.map(v => v * s), pigments, white)[0];
    let lo = 0.01, hi = 32; if (Lat(hi) > want) return unit.map(v => v * hi); if (Lat(lo) < want) return unit.map(v => v * lo);
    for (let it = 0; it < 14; it++) { const mid = Math.sqrt(lo * hi); if (Lat(mid) > want) lo = mid; else hi = mid; }
    return unit.map(v => v * Math.sqrt(lo * hi));
  };
  const laid = Array.from({ length: k }, () => new Float32Array(n)), labels = new Int32Array(n);
  const layers = [], instructions = [], mixes = [], polygons = [], checks = [];
  let session = null, strokeCount = 0, charges = 0, label = 0;
  const close = () => {
    if (!session) return;
    const list = session.list, area = list.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0);
    for (const s of list) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; });
    const t = mix.reduce((a, v) => a + v, 0) || 1, first = list[0]._valuePlan;
    layers.push({ value: session.stage, pigment: mix.indexOf(Math.max(...mix)), mixId: first.mixId, shapes: list, mix: mix.map(v => v / t), amount: list.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: session.stage <= 2 ? 'ground' : session.stage === 3 ? 'mid' : 'dark', region: 0, shoot: true }, _valuePhase: first.phase, _script: session.ids });
    session = null;
  };
  // one wash of the plan: its strokes, its mix, its move; the cells its strokes touch are its passage (for the ledger and
  // the wet and dry checks, never a clip)
  const wash = (p, stage, strokes, mix, how, { kind, what, charge = false }) => {
    const ids = footprint(strokes, w, h, cellMm), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
    for (let i = 0; i < n; i++) if (ids[i]) { area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    if (!area || !strokes.length) return null;
    const strength = mix.reduce((a, v) => a + v, 0), mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage });
    label++; for (let i = 0; i < n; i++) if (ids[i]) { labels[i] = label; for (let j = 0; j < k; j++) laid[j][i] += mix[j]; }
    const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...mix]; sh.graded = null; sh._follow = true; sh.firstWash = stage <= 2; sh._opening = 1; sh.dryAfter = true;
    const phase = how.phase ?? PHASE[stage], wet = how.move !== 'wet on dry' && how.move !== 'dry on dry';
    const areaMm2 = area * cellMm * cellMm;
    const intent = { id: `${phase}/s${stage}/m${mixId}/${p.id}${charge ? '-charge' : ''}`, phase, colour: null, valueBand: stage, stage, mixId, thing: what, kind, studyLayer: 1, areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: false,
      referenceCue: `painting script passage ${p.id}: ${p.what ?? ''}`, intendedResult: p.why ?? p.what ?? '', cool: false, shaped: true, subject: script.subject ?? null, move: how.move,
      paperBefore: wet ? 'wet: the passage just laid, or clean water' : 'fully dry', baseBefore: wet ? 'wet' : 'fully dry',
      brush: { kind: `${p.brush} (${brushes[p.brush].shape ?? 'round'})`, contact: p.mark === 'line' ? 'point' : 'side/belly', width: `${brushes[p.brush].widthMm} mm`, widthMm: brushes[p.brush].widthMm },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 0, estimateMethod: 'script', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: how.water, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: p.edges ?? 'mixed' }, outline: [], strokes, softEdges: [], depthMm: 0, uncoveredShare: 0, widestBrushMm: brushes[p.brush].widthMm,
      protectedLights: p.leave ? [p.leave] : [], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the passage', script: { passage: p.id, mark: p.mark, move: p.move, into: p.into ?? null } };
    sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind, colour: null, loops: (charge ? [] : regionsOf(p)).map(P => ({ points: P })) });
    strokeCount += strokes.length;
    return sh;
  };
  let prev = null;
  for (const p of passages) {
    const how = MOVES[p.move], stage = Math.max(1, Math.min(5, Math.round(p.stage ?? 2)));
    const joins = p.into != null && prev?.id === p.into && (p.move === 'wet into wet' || p.move === 'beside damp');
    if (p.into != null && !joins) console.log(`painting script: ${p.id} is to go into ${p.into}, which is not the passage just before it (${prev?.id ?? 'none'}); laid on its own`);
    // into the wet passage before: the paint goes into its shine (wet on wet without a clean-water bed of its own)
    const own = joins && p.move === 'wet into wet' ? { ...how, move: 'wet on wet' } : how;
    if (!joins) close();
    const strokes = passageStrokes(p, brushes, seed), mix = mixOf(p.paint);
    const sh = wash(p, stage, strokes, mix, own, { kind: p.mark, what: `${p.id}: ${p.what ?? ''}` });
    prev = p;
    if (!sh) continue;
    if (!session) session = { stage, list: [], ids: [] };
    session.list.push(sh); session.ids.push(p.id);
    // charges: each `at` a dab of the charge's own mix, dropped into this passage while it is wet
    const rng = handOf(`${seed}/${p.id}/charges`);
    for (const [ci, c] of (p.charges ?? []).entries()) {
      if (!c.at?.length) continue;
      const cw = brushes[c.brush]?.widthMm ?? CHARGE_BRUSH_MM;
      const cs = c.at.map(([x, y]) => chargeDab(x, y, { widthMm: cw, rng }));
      const ch = wash({ ...p, id: `${p.id}-c${ci + 1}` }, stage, cs, mixOf({ pigments: c.pigments, dilution: c.dilution ?? 'medium', swatch: c.swatch }), { move: 'wet on wet', water: 0.88, phase: PHASE[stage] }, { kind: 'charge', what: `${p.id}: charge ${ci + 1} dropped in while wet`, charge: true });
      if (ch) { session.list.push(ch); charges++; }
    }
    // the check (never fed back): the plan's film over the passage's cells against the subject's mean colour there
    if (rgb) {
      const lin = [0, 0, 0], u = new Array(k).fill(0); let c = 0;
      for (let i = 0; i < n; i++) if (sh.ids[i]) { c++; for (let q = 0; q < 3; q++) lin[q] += (rgb[i * 3 + q] / 255) ** 2.2; for (let j = 0; j < k; j++) u[j] += laid[j][i]; }
      if (c) { const mean = lin.map(v => Math.round(255 * (v / c) ** (1 / 2.2))), a = labOf(mean, 0, paperCol), b = filmLab(u.map(v => v / c), pigments, paperCol); checks.push({ id: p.id, subjectL: +a[0].toFixed(1), planL: +b[0].toFixed(1), dE: +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(1) }); }
    }
  }
  close();
  const covered = laid[0].map((_, i) => (laid.some(L => L[i] > 0) ? 1 : 0)).reduce((a, v) => a + v, 0);
  const summary = { source: 'painting script', author: script.author ?? null, passages: passages.length, sessions: layers.length, washes: instructions.filter(q => q.kind !== 'charge').length, charges, stages: new Set(layers.map(l => l.value)).size, plannedStrokes: strokeCount, paintedShare: covered / n,
    marks: passages.reduce((a, p) => ({ ...a, [p.mark]: (a[p.mark] ?? 0) + 1 }), {}), moves: passages.reduce((a, p) => ({ ...a, [p.move]: (a[p.move] ?? 0) + 1 }), {}), colourCheck: checks,
    colourCheckMedianDE: checks.length ? [...checks].sort((a, b) => a.dE - b.dE)[checks.length >> 1].dE : null };
  console.log(`script washes: ${passages.length} passages by ${script.author ?? 'an unnamed author'} in ${layers.length} wet sessions; ${strokeCount} strokes, ${charges} charges; marks ${JSON.stringify(summary.marks)}; moves ${JSON.stringify(summary.moves)}; painted ${(100 * summary.paintedShare).toFixed(0)}% of the sheet; colour against the subject's mean over each passage, median dE ${summary.colourCheckMedianDE}`);
  const regions = { source: 'painting script', labels, regions: Array.from({ length: label }, (_, i) => ({ id: i + 1, colour: null, paper: false, parent: null, share: 0 })) };
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes: [], summary, mixes, polygons,
    geometry: 'Washes from a painting script: passages written by an author in painting order, each one mix laid in whole strokes of a named brush and mark, placed by a loose region and never clipped to it; charges dropped in while wet; a passage laid into the one before it while wet, every other on a dry sheet.' };
}
