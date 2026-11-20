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
import { handOf, PRESSURES, sweeps, scattered, lines, written, handled, chargeDab } from './script-marks.mjs';

/** Swatch lightness (L* on white paper) for each dilution word. */
export const DILUTION_L = Object.freeze({ 'very pale': 88, pale: 79, medium: 66, strong: 52, rich: 40, dark: 30 });
/** Water in the brush for each load word (share of its capacity). */
const LOAD = Object.freeze({ flooded: 0.88, loaded: 0.68, damp: 0.42, dry: 0.22 });
const KINDS = new Set(['wash', 'strokes', 'touches', 'lines']);
const PAPERS = new Set(['dry', 'damp', 'wet']);
/** A charge's brush when the script names none (mm). */
const CHARGE_BRUSH_MM = 6;
/** Phase of each stage, as the paint step reads it. */
const PHASE = [null, 'light', 'light', 'shadow', 'mid', 'shadow'];
/** A wash's brush: about this share of the wash's width across its direction (a brush a third of the shape's width). */
const WASH_BRUSH_SHARE = 1 / 3;

/** sRGB [r, g, b] from '#rrggbb'. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim()); if (!m) return null;
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * A first-format script (painting-script 1: `mark`, `move`, `strokes` as a count) in the second format's terms
 * (painting-script 2: `kind`, `paper`, `handling`, `count`), so both are laid by one executor.
 */
export function upgradeScript(script) {
  if (script?.format !== 'painting-script 1') return script;
  const kind = { sweep: 'wash', tapered: 'strokes', dab: 'touches', wedge: 'touches', scumble: 'touches', line: 'lines' };
  const press = { tapered: [0.15, 1, 0.7, 0.1], dab: [0.1, 1, 0.1], wedge: [0.2, 0.6, 1, 0.85], scumble: [0.6, 0.8, 0.6], line: [0.3, 0.75, 0.6, 0.3], sweep: [0.8, 0.8] };
  return { ...script, format: 'painting-script 2', lights: [], passages: script.passages.map(p => {
    const scale = { light: 0.6, medium: 0.8, firm: 1 }[p.pressure] ?? 0.8;
    return { ...p, kind: kind[p.mark], count: p.strokes, strokes: undefined,
      paper: p.move === 'wet into wet' ? 'wet' : p.move === 'beside damp' ? 'damp' : 'dry',
      handling: { direction: p.direction ?? 0, lengthMm: p.lengthMm, pressure: press[p.mark].map(v => v * scale), hold: p.mark === 'scumble' ? 'side' : 'upright', load: p.move === 'dry brush' ? 'dry' : p.move === 'wet into wet' ? 'flooded' : 'loaded', path: 'straight', speed: 'medium' },
      character: { spread: p.mark === 'tapered' ? 'scattered' : 'clustered', size: 'varied' } };
  }) };
}

/** The script checked: every field the executor reads, with what is wrong said plainly. Returns the passages. */
export function checkScript(script, { keys, sheetWidthMm }) {
  if (!script || script.format !== 'painting-script 2') throw Error('painting script: format must be "painting-script 2" (or 1, upgraded)');
  if (!(Math.abs((script.sheet?.widthMm ?? 0) - sheetWidthMm) <= 0.5)) throw Error(`painting script: written for a sheet ${script.sheet?.widthMm} mm wide, painted on ${sheetWidthMm} mm`);
  const ids = new Set(), brushes = script.brushes ?? {};
  if (!Object.keys(brushes).length) throw Error('painting script: no brushes');
  for (const [name, b] of Object.entries(brushes)) if (!(b?.widthMm > 0)) throw Error(`painting script: brush ${name} has no width`);
  (script.passages ?? []).forEach((p, i) => {
    const at = `painting script, passage ${p?.id ?? i}`;
    if (!p?.id || ids.has(p.id)) throw Error(`${at}: needs a unique id`); ids.add(p.id);
    if (!KINDS.has(p.kind)) throw Error(`${at}: kind ${p.kind} is not one of ${[...KINDS].join(', ')}`);
    if (p.paper != null && !PAPERS.has(p.paper)) throw Error(`${at}: paper ${p.paper} is not dry, damp or wet`);
    if (p.brush != null && !brushes[p.brush]) throw Error(`${at}: brush ${p.brush} is not in the kit`);
    if (p.brush == null && p.kind !== 'wash') throw Error(`${at}: a ${p.kind} passage names its brush`);
    const pig = Object.entries(p.paint?.pigments ?? {});
    if (!pig.length) throw Error(`${at}: no pigments`);
    for (const [k] of pig) if (!keys.includes(k)) throw Error(`${at}: pigment ${k} is not in the painter's box (${keys.join(', ')}); run with --paints naming the script's palette`);
    for (const c of p.charges ?? []) for (const [k] of Object.entries(c.pigments ?? {})) if (!keys.includes(k)) throw Error(`${at}: charge pigment ${k} is not in the box`);
    const given = Array.isArray(p.strokes) && p.strokes.length;
    if (!given && (p.kind === 'lines' ? !(p.paths?.length) : !(regionsOf(p).length))) throw Error(`${at}: a ${p.kind} passage needs ${p.kind === 'lines' ? 'paths' : 'a region'} or its strokes`);
  });
  if (!ids.size) throw Error('painting script: no passages');
  return script.passages;
}

const regionsOf = p => (p.regions?.length ? p.regions : p.region?.length ? [p.region] : []).filter(P => P?.length >= 3);
const lightsOf = script => (script.lights ?? []).map(l => l.region ?? l).filter(P => P?.length >= 3);

/** The brush that lays a wash: the script's, or the kit's nearest to a third of the wash's width across its direction. */
function washBrush(p, brushes) {
  if (p.brush) return brushes[p.brush].widthMm;
  const deg = Number(p.handling?.direction ?? 0) || 0, a = deg * Math.PI / 180, vx = -Math.sin(a), vy = Math.cos(a);
  let lo = Infinity, hi = -Infinity; for (const P of regionsOf(p)) for (const [x, y] of P) { const v = x * vx + y * vy; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const want = Math.max(2, (hi - lo) * WASH_BRUSH_SHARE), kit = Object.values(brushes).map(b => b.widthMm).sort((x, y) => x - y);
  return kit.filter(v => v <= want).at(-1) ?? kit[0];
}

/** The strokes of one passage (mm), from its kind, brush and handling; no picture read. */
export function passageStrokes(p, brushes, seed = 0, lights = []) {
  const rng = handOf(`${seed}/${p.id}`), h = p.handling ?? {}, ch = p.character ?? {}, polys = regionsOf(p);
  const deg = Number(h.direction ?? 0) || 0, pressure = Array.isArray(h.pressure) ? h.pressure.map(Number) : PRESSURES[h.pressure] ?? PRESSURES.medium;
  const widthMm = p.kind === 'wash' ? washBrush(p, brushes) : brushes[p.brush].widthMm;
  const style = { pressure, path: h.path, hold: h.hold, speed: h.speed, start: h.start };
  // strokes the author wrote one by one: point by point with a pressure at each, or from a start along a direction
  if (Array.isArray(p.strokes) && p.strokes.length) return p.strokes.map(s => {
    const w = s.brush && brushes[s.brush] ? brushes[s.brush].widthMm : widthMm;
    if (Array.isArray(s.points) && s.points.length >= 2) return written(s.points, { widthMm: w, rng });
    const [x, y] = s.at ?? s.from ?? [0, 0];
    return handled(x, y, { ...style, deg: Number(s.direction ?? deg), len: Number(s.lengthMm ?? h.lengthMm ?? 3 * w), r: w / 2, pressure: Array.isArray(s.pressure) ? s.pressure.map(Number) : pressure, path: s.path ?? h.path, from: !!s.from, rng });
  });
  const n = Math.max(1, Math.round(p.count ?? 1)), lengthMm = Number(h.lengthMm) || (p.kind === 'touches' ? 2.6 * widthMm : 4 * widthMm);
  switch (p.kind) {
    case 'wash': return sweeps(polys, { widthMm, deg, pressure: Math.max(0.6, Math.max(...pressure)), lights, rng });
    case 'strokes': return scattered(polys, { ...style, n, widthMm, deg, lengthMm, size: ch.size, spread: ch.spread ?? 'scattered', denser: ch.denser, lights, rng });
    case 'touches': return scattered(polys, { ...style, n, widthMm, deg, lengthMm, size: ch.size ?? 'varied', spread: ch.spread ?? 'clustered', denser: ch.denser, touches: true, lights, rng });
    case 'lines': return lines(p.paths, { widthMm, pressure, hold: h.hold, rng });
  }
  return [];
}

/** The painter's move, water and phase for a passage: from its paper, load, stage and what it goes into. */
function moveOf(p, joins) {
  const load = p.handling?.load, water = LOAD[load];
  if (load === 'dry') return { move: 'dry on dry', water: LOAD.dry, phase: null };
  if (p.paper === 'wet') return { move: 'wet on wet', water: water ?? 0.88, phase: null, ownBed: !joins };
  if (p.paper === 'damp' && joins) return { move: 'beside damp', water: water ?? 0.62, phase: null };
  return (p.stage ?? 2) === 3 ? { move: 'wet on dry', water: water ?? 0.58, phase: 'shadow' } : { move: 'wet on dry', water: water ?? 0.62, phase: null };
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
export function planScriptWashes({ script: given, k, w, h, pigments, paperRGB = null, sheetWidthMm = 280, rgb = null, density = null, inkValue = null, seed = 0 }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248], keys = pigments.map(p => p.key);
  let script = given;
  if (pigments.length !== k || k < 1) throw Error('the script wash plan needs the pigments');
  script = upgradeScript(script);
  const passages = checkScript(script, { keys, sheetWidthMm }), brushes = script.brushes, lights = lightsOf(script);
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
      brush: { kind: p.brush ?? 'sized to the wash', contact: p.handling?.hold === 'side' ? 'side/belly' : 'point', width: `${strokes[0]?.radiusMm * 2} mm`, widthMm: strokes[0]?.radiusMm * 2 },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 0, estimateMethod: 'script', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: how.water, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: p.edges ?? 'mixed' }, outline: [], strokes, softEdges: [], depthMm: 0, uncoveredShare: 0, widestBrushMm: Math.max(...strokes.map(st => 2 * st.radiusMm)),
      protectedLights: p.leave ? [p.leave] : [], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the passage', script: { passage: p.id, kind: p.kind, paper: p.paper ?? 'dry', into: p.into ?? null, handling: p.handling ?? null } };
    sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind, colour: null, loops: (charge ? [] : regionsOf(p)).map(P => ({ points: P })) });
    strokeCount += strokes.length;
    return sh;
  };
  let prev = null; const washed = [];
  for (const p of passages) {
    const stage = Math.max(1, Math.min(5, Math.round(p.stage ?? 2)));
    const joins = p.into != null && prev?.id === p.into && (p.paper === 'wet' || p.paper === 'damp');
    if (p.into != null && !joins) console.log(`painting script: ${p.id} is to go into ${p.into}, which is not the passage just before it (${prev?.id ?? 'none'}) or is laid on dry paper; laid on its own`);
    const own = moveOf(p, joins);
    if (!joins) close();
    const strokes = passageStrokes(p, brushes, seed, lights), mix = mixOf(p.paint);
    const sh = wash(p, stage, strokes, mix, own, { kind: p.kind, what: `${p.id}: ${p.what ?? ''}` });
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
    washed.push([p.id, sh]);
  }
  close();
  // the check (never fed back): the plan's finished film over each passage's cells against the subject's mean colour there
  if (rgb) for (const [id, sh] of washed) {
    const lin = [0, 0, 0], u = new Array(k).fill(0); let c = 0;
    for (let i = 0; i < n; i++) if (sh.ids?.[i]) { c++; for (let q = 0; q < 3; q++) lin[q] += (rgb[i * 3 + q] / 255) ** 2.2; for (let j = 0; j < k; j++) u[j] += laid[j][i]; }
    if (c) { const mean = lin.map(v => Math.round(255 * (v / c) ** (1 / 2.2))), a = labOf(mean, 0, paperCol), b = filmLab(u.map(v => v / c), pigments, paperCol); checks.push({ id, subjectL: +a[0].toFixed(1), planL: +b[0].toFixed(1), dE: +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(1) }); }
  }
  const covered = laid[0].map((_, i) => (laid.some(L => L[i] > 0) ? 1 : 0)).reduce((a, v) => a + v, 0);
  const summary = { source: 'painting script', author: script.author ?? null, passages: passages.length, sessions: layers.length, washes: instructions.filter(q => q.kind !== 'charge').length, charges, stages: new Set(layers.map(l => l.value)).size, plannedStrokes: strokeCount, paintedShare: covered / n,
    kinds: passages.reduce((a, p) => ({ ...a, [p.kind]: (a[p.kind] ?? 0) + 1 }), {}), papers: passages.reduce((a, p) => ({ ...a, [p.paper ?? 'dry']: (a[p.paper ?? 'dry'] ?? 0) + 1 }), {}), lights: lights.length, colourCheck: checks,
    colourCheckMedianDE: checks.length ? [...checks].sort((a, b) => a.dE - b.dE)[checks.length >> 1].dE : null };
  console.log(`script washes: ${passages.length} passages by ${script.author ?? 'an unnamed author'} in ${layers.length} wet sessions; ${strokeCount} strokes, ${charges} charges; kinds ${JSON.stringify(summary.kinds)}; paper ${JSON.stringify(summary.papers)}; ${lights.length} lights kept; painted ${(100 * summary.paintedShare).toFixed(0)}% of the sheet; colour against the subject's mean over each passage, median dE ${summary.colourCheckMedianDE}`);
  const regions = { source: 'painting script', labels, regions: Array.from({ length: label }, (_, i) => ({ id: i + 1, colour: null, paper: false, parent: null, share: 0 })) };
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes: [], summary, mixes, polygons,
    geometry: 'Washes from a painting script: passages written by an author in painting order, each one mix laid in whole strokes of a named brush and mark, placed by a loose region and never clipped to it; charges dropped in while wet; a passage laid into the one before it while wet, every other on a dry sheet.' };
}
