// Pipeline: inking, stage 3c (the playback order of a fitted drawing). DOM free, no file IO.
// A person drawing lays the big forms of the whole picture first, lightly and quickly, then develops each form, and puts in
// the detail and the texture last. Here the fitted vector strokes (ink-vectors.py) are put in that order, in PASSES over
// the whole sheet: 1 CONSTRUCTION (the long lines, the lines that bound a form, the silhouette of a mass drawn without
// outlines, every form placed), 2 STRUCTURE (medium lines inside the forms), 3 DETAIL (short lines and marks), 4 SHADING (the
// light shading of the whole picture: soft grey tone, pale hatching, the main shadow masses everywhere), 5 TEXTURE (hatching,
// fur and leaf strokes, fills, specks), 6 ACCENTS (the small darkest touches, last). Inside a pass the hand works form by
// form, from the centre of interest outward, and finishes the form's strokes of that pass before it moves on; a coat of fur
// or a foliage mass is built outward from its head or middle, lock by lock. Only the playing order changes (`play`; seq, the order the ink is laid in, is
// kept), and a line may be drawn from its other end; every stroke keeps its outline, so the finished drawing is the same.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = P => { let L = 0; for (let k = 1; k < P.length; k++) L += dist(P[k - 1], P[k]); return L; };
const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const overlap = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const sample = (P, n = 12) => { const step = Math.max(1, Math.floor(P.length / n)), out = []; for (let k = 0; k < P.length; k += step) out.push(P[k]); if (out.at(-1) !== P.at(-1)) out.push(P.at(-1)); return out; };

const HOSTS = new Set(['figure', 'animal']), MASSES = new Set(['fur', 'hair', 'foliage']);
export const CONSTRUCTION = 1, STRUCTURE = 2, DETAIL = 3, SHADING = 4, TEXTURE = 5, ACCENT = 6;
export const PASS_NAMES = ['', 'construction', 'structure', 'detail', 'shading', 'texture', 'accents'];

// lengths in mm on a sheet of the reference size (280 by 187 mm); a bigger sheet scales them by its diagonal
const REF_DIAG = Math.hypot(280, 186.7);
const FORM_ORDER = {
  longMm: 22,        // a line this long is construction wherever it lies
  boundMm: 9,        // a line this long that runs along a form's edge (boundShare of it) is construction
  boundShare: 0.6, boundNearMm: 1.2,
  structureMm: 6,    // a line this long inside a form is structure; shorter ones are detail
  speckMm: 1,        // a mark shorter than this is a speck (texture)
  inMassShare: 0.5,  // a line with this share of it inside a black mass (a fill) is part of the mass
  patchMm: 1.5,      // a shape reaching this far to the side of its path is a patch (texture)
  groupRings: 2,     // a stroke of this many separate shapes on a bare span is a group of marks (texture)
  hatchMm: 15, hatchNearMm: 3.5, hatchTurn: 20, hatchCount: 2, // hatching: near-parallel short straight lines side by side
  runNearMm: 2.5, runCount: 5, // shading in long strokes: five or more parallel lines this close
  denseMm: 4, denseCount: 9, curlyTurn: 0.35, scribbleTurn: 0.45, // fur and leaf strokes: short or turning lines packed close
  placeMm: 3,        // the shortest line that can place a form that has no construction line
  edgeStrandMm: 2,   // a strand of a mass this long lying on its region's edge is its outer edge (construction)
  cellMm: 25,        // inside a form the hand works patch by patch (patches this wide), nearest patch next
  pull: 0.15,         // the pull towards the centre of interest when the hand chooses the next form
  turnMm: 5,         // a construction or structure line is drawn from its other end when that end is this much nearer
  nearMassMm: 1,     // a line lying this near a black mass (inMassShare of it) is part of the mass
  paleDark: 0.4,     // a long line paler than this (of the drawing's firm line) that bounds no form is shading, not construction
  shadeDark: 0.5,    // tone, hatching and patches no darker than this are the first light shading
  toneInShading: false, shadeMinMm2: 25, // (soft tone kept out of the light shading; were it in, only shapes this large, mm2)
  accentDark: 0.9, accentMm2: 3, // a fill or speck this dark and this small is an accent (outside a coat or a mass)
  silCellMm: 1, silCloseMm: 2, silNearMm: 1.5, massMinMm: 25, strandStepMm: 3, // a mass's silhouette: grid, closing, reach; its outer strands' spacing
  deepMm: 4,         // a long line lying this far inside a mass's silhouette is a strand of it (texture)
  keepLayin: false,  // (a plate's own laid lay-in kept as it is)
  layinCover: 0.5, layinCloseMm: 5, layinHoleMm: 12, layinDark: 0.2, layinWidthMm: 0.3, layinMm: [15, 45], layinMinMm: 6, layinGapMm: [2, 6], layinOffMm: 0.6, layinMax: 80, // the pencil lay-in
  coatPull: 0.8,     // a coat's walk: the pull outward from its head (the coat grows from the head, lock by lock)
  paleFirstMm: 6,    // in a coat, a darker mark waits for a paler one up to this much nearer the hand
  outPull: 0.1,        // inside a coat or a mass, the pull outward from its head or middle
  shadePull: 0.3,    // the light shading's sweep: the pull towards the centre of interest
  optMax: 1500,      // walks of up to this many lines are shortened (or-opt)
  optWindow: 40,     // a line is moved at most this many places along the walk (the walk's course, outward, is kept)
  farMm: 20,         // a jump longer than this costs the walk three times its excess
};

/**
 * The pen's passes: the strokes of one line on one path (its grey and black pieces, the ink beside it) are drawn together.
 * Returns units in the current order: { strokes (in seq order), path, L, ... }.
 */
function passUnits(strokes) {
  const S = strokes.map(s => ({ ...s })).sort((a, b) => a.seq - b.seq), units = [];
  const keyOf = s => `${s.line ?? `s${s.seq}`}|${s.path.length}|${s.path[0]}|${s.path.at(-1)}`, at = new Map();
  for (const s of S) { const k = keyOf(s); let u = at.get(k); if (!u) { u = { strokes: [], first: s.seq }; at.set(k, u); units.push(u); } u.strokes.push(s); }
  for (const u of units) {
    const P = u.strokes[0].path; u.path = P; u.L = length(P); u.chord = P.length > 1 ? dist(P[0], P.at(-1)) : 0;
    u.tone = u.strokes.some(s => s.piece === 'tone'); u.fill = u.strokes.some(s => s.fill);
    u.dark = Math.max(...u.strokes.map(s => s.dark ?? 1)); u.mid = P[Math.floor(P.length / 2)];
    u.points = sample(P); u.straight = u.L > 0 ? u.chord / u.L : 1;
    // how much the line turns, per mm (a scribble turns a lot)
    let turn = 0; const Q = sample(P, 24); for (let k = 2; k < Q.length; k++) { const a = Math.atan2(Q[k - 1][1] - Q[k - 2][1], Q[k - 1][0] - Q[k - 2][0]), b = Math.atan2(Q[k][1] - Q[k - 1][1], Q[k][0] - Q[k - 1][0]); let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; turn += d; }
    u.turn = u.L > 0 ? turn / u.L : 0;
    // how far the stroke's shape reaches to the side of its path (half its width for a line)
    const R = sample(P, 48); u.reach = 0;
    for (const s of u.strokes) if (s.piece !== 'tone') for (const ring of s.outline ?? []) for (const q of sample(ring, 40)) { let b = Infinity; for (let k = 1; k < R.length; k++) b = Math.min(b, segDist(q, R[k - 1], R[k])); if (R.length === 1) b = dist(q, R[0]); u.reach = Math.max(u.reach, b); } u.angle = Math.atan2(P.at(-1)[1] - P[0][1], P.at(-1)[0] - P[0][0]);
  }
  return units;
}

// a grid of the units' middles, for neighbours
function grid(units, cell) {
  const g = new Map(), key = (i, j) => `${i},${j}`;
  for (const u of units) { const k = key(Math.floor(u.mid[0] / cell), Math.floor(u.mid[1] / cell)); if (!g.has(k)) g.set(k, []); g.get(k).push(u); }
  return (p, r, fn) => { const i0 = Math.floor((p[0] - r) / cell), i1 = Math.floor((p[0] + r) / cell), j0 = Math.floor((p[1] - r) / cell), j1 = Math.floor((p[1] + r) / cell); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const u of g.get(key(i, j)) ?? []) if (dist(u.mid, p) <= r) fn(u); };
}

/**
 * The things of a subject (thing labels: { name, kind, box in mm }) as forms, each with a rank: in a portrait (a figure or
 * an animal among them) the face, then its eyes, then its other features from the top down, the hair, the clothing, the
 * rest of the figure, people before animals; everything else after the figures. Not a portrait: every rank 0.
 */
function thingForms(things, sheet, centre) {
  const T = (things ?? []).filter(t => Array.isArray(t.box) && area(t.box) > 0 && t.kind !== 'sky' && (area(t.box) < 0.6 * sheet || HOSTS.has(t.kind)))
    .map((t, k) => ({ ...t, key: `t${k}`, area: area(t.box), mid: [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2], rank: 0 }));
  // (a host is a sizeable figure or animal: pedestrians in a street are not a portrait)
  const hosts = T.filter(t => HOSTS.has(t.kind) && t.area >= 0.05 * sheet && !T.some(u => u !== t && u.kind === t.kind && u.area > t.area && overlap(t.box, u.box) >= 0.8 * t.area))
    .sort((a, b) => (a.kind === 'figure' ? 0 : 1) - (b.kind === 'figure' ? 0 : 1) || dist(a.mid, centre) - dist(b.mid, centre));
  if (!hosts.length) return { forms: T, portrait: false };
  for (const t of T) {
    let best = hosts.includes(t) ? t : null, share = 0.5;
    // (the host holding most of it; of two that hold it alike, the smaller: a dog's eye lies inside the man holding the dog too)
    if (!best) for (const h of hosts) { const s = overlap(t.box, h.box) / t.area; if (s > share + 1e-9 || (best && Math.abs(s - share) <= 1e-9 && h.area < best.area)) { best = h; share = s; } }
    if (!best) { t.rank = 100; continue; }
    const h = hosts.indexOf(best), face = T.filter(u => u.kind === 'face' && overlap(u.box, best.box) > 0.5 * u.area).sort((a, b) => b.area - a.area)[0];
    const inFace = face && t !== face && inBox(t.mid, face.box) && t.area < 0.5 * face.area;
    const feat = t === face ? 0 : t.kind === 'eye' && inFace ? 1 : inFace ? 2 : t.kind === 'hair' ? 3 : t.kind === 'clothing' ? 4 : t === best || t.kind === 'fur' ? 6 : 5;
    t.rank = 10 * h + feat + (feat === 2 ? t.mid[1] / 1e4 : 0); t.host = best; t.head = (face ?? best).mid;
  }
  return { forms: T, portrait: true };
}

/**
 * Each unit's role, from its own shape and its neighbours (no subject's names): CONSTRUCTION, STRUCTURE, DETAIL or TEXTURE,
 * with `why`. `regionAt(x, y)` (optional): the object region (an id, 0 for none) at a point of the sheet in mm, from the
 * subject's segmentation; a line that runs along a region's edge bounds a form.
 */
function classify(units, { widthMm, heightMm, regionAt = null, opts = {} } = {}) {
  const o = { ...FORM_ORDER, ...opts }, k = Math.hypot(widthMm, heightMm) / REF_DIAG, mm = v => v * k;
  const lines = units.filter(u => !u.tone && !u.fill), near = grid(lines, mm(4));
  const onEdge = p => { if (!regionAt) return false; const r = mm(o.boundNearMm), c = regionAt(p[0], p[1]); for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) if (regionAt(p[0] + dx, p[1] + dy) !== c) return true; return false; };
  // the black masses (fills), as a grid of cells: a line drawn inside a mass is part of the mass's texture
  const fc = mm(0.5), filled = new Set(), cellKey = (x, y) => Math.floor(x / fc) * 100003 + Math.floor(y / fc);
  for (const u of units) if (u.fill) for (const s of u.strokes) {
    const R = s.outline ?? [], X = R.flat().map(p => p[0]), Y = R.flat().map(p => p[1]); if (!X.length) continue;
    for (let y = (Math.floor(Math.min(...Y) / fc) + 0.5) * fc; y <= Math.max(...Y); y += fc) for (let x = (Math.floor(Math.min(...X) / fc) + 0.5) * fc; x <= Math.max(...X); x += fc) {
      let inside = false; for (const r of R) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
      if (inside) filled.add(cellKey(x, y));
    }
  }
  // (a line lying along or between the black shapes of a mass, a strand of a coat, is part of it too: the mass grown by nearMassMm)
  const grow = Math.max(1, Math.round(mm(o.nearMassMm) / fc)), nearFill = (x, y) => { const i = Math.floor(x / fc), j = Math.floor(y / fc); for (let di = -grow; di <= grow; di++) for (let dj = -grow; dj <= grow; dj++) if (filled.has((i + di) * 100003 + j + dj)) return true; return false; };
  // darkness is read against the drawing's own firm line (a pencil drawing's firmest lines are a mid grey)
  const firm = (() => { const D = units.filter(u => !u.tone && !u.fill).map(u => [u.dark, u.L]).sort((a, b) => a[0] - b[0]), T = D.reduce((a, d) => a + d[1], 0); let c = 0; for (const [d, L] of D) { c += L; if (c >= 0.9 * T) return Math.max(0.05, d); } return 1; })();
  for (const u of units) u.rel = Math.min(1, u.dark / firm);
  for (const u of units) {
    if (u.tone) { u.role = TEXTURE; u.why = 'tone'; continue; }
    if (!u.fill && filled.size && u.points.filter(p => nearFill(p[0], p[1])).length >= o.inMassShare * u.points.length) { u.role = TEXTURE; u.why = 'in a black mass'; continue; }
    if (u.fill) { u.role = TEXTURE; u.why = 'fill'; continue; }
    if (u.L < mm(o.speckMm)) { u.role = TEXTURE; u.why = 'speck'; continue; }
    // a stroke of several separate shapes on a bare two-point path is a group of marks (a patch of hatching fitted as one
    // piece; the path is only its span). A broken line laid in runs has several shapes too, but along its own path.
    if (u.path.length <= 2 && u.strokes.some(s => (s.outline?.length ?? 0) >= o.groupRings)) { u.role = TEXTURE; u.why = 'group of marks'; continue; }
    // a shape that reaches far to the side of its path is a patch (a hatched area, a blot), not a line
    if (u.reach > mm(o.patchMm)) { u.role = TEXTURE; u.why = 'patch'; continue; }
    // hatching: a short straight line with near-parallel lines of a like length close beside it
    let par = 0, dense = 0;
    near(u.mid, mm(o.denseMm), v => { if (v === u) return; dense++; });
    if (u.L < mm(o.hatchMm) && u.straight > 0.8) near(u.mid, mm(o.hatchNearMm), v => {
      if (v === u || v.straight < 0.8 || v.L > mm(o.hatchMm) || v.L < 0.33 * u.L || v.L > 3 * u.L) return;
      let d = Math.abs(v.angle - u.angle) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; if (d < (o.hatchTurn * Math.PI) / 180) par++;
    });
    u.edge = regionAt ? u.points.filter(onEdge).length / u.points.length : 0;
    if (par >= o.hatchCount) { u.role = TEXTURE; u.why = 'hatching'; continue; }
    // a longer line in a close-packed run of parallel lines (dark glass, a shaded wall drawn in long strokes) is shading
    if (u.L >= mm(o.hatchMm) && u.straight > 0.85) {
      const c = Math.cos(u.angle), s = Math.sin(u.angle); let run = 0;
      near(u.mid, Math.min(mm(30), 0.6 * u.L), v => {
        if (v === u || v.straight < 0.85 || v.L < 0.4 * u.L || v.L > 2.5 * u.L) return;
        let d = Math.abs(v.angle - u.angle) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; if (d > (12 * Math.PI) / 180) return;
        const dx = v.mid[0] - u.mid[0], dy = v.mid[1] - u.mid[1]; if (Math.abs(-s * dx + c * dy) <= mm(o.runNearMm)) run++;
      });
      if (run >= o.runCount) { u.role = TEXTURE; u.why = 'shading run'; continue; }
    }
    // fur and leaf strokes: short or scribbled lines packed close together
    const packed = dense >= o.denseCount;
    if ((packed && u.L < mm(o.structureMm) && u.turn > o.curlyTurn) || (u.L < mm(o.longMm * 3) && u.turn > o.scribbleTurn && u.edge < o.boundShare)) { u.role = TEXTURE; u.why = 'fur or leaf'; continue; }
    // a long pale line that bounds no form (a sky hatching stroke, a faint guide) is shading, laid later
    if (u.L >= mm(o.longMm) && u.rel < o.paleDark && u.edge < o.boundShare) { u.role = TEXTURE; u.why = 'pale long line'; continue; }
    if (u.L >= mm(o.longMm)) { u.role = CONSTRUCTION; u.why = 'long'; continue; }
    if (u.L >= mm(o.boundMm) && u.edge >= o.boundShare) { u.role = CONSTRUCTION; u.why = 'bounds a form'; continue; }
    if (u.L >= mm(o.structureMm)) { u.role = STRUCTURE; u.why = 'medium'; continue; }
    u.role = DETAIL; u.why = 'short';
  }
  return units;
}

/**
 * The form each unit belongs to: the smallest named thing that holds most of it (things: { kind, box in mm }), else the
 * object region at its middle (regionAt), else a patch of the sheet. Sets u.form (a key) and returns the forms
 * ({ key, rank, units, centre }).
 */
function assignForms(units, { things, regionAt, centre, sheet, cellMm }) {
  const { forms: T, portrait } = thingForms(things, sheet, centre), byKey = new Map();
  for (const u of units) {
    let best = null;
    for (const t of T) { let n = 0; for (const p of u.points) if (inBox(p, t.box)) n++; if (n >= 0.5 * u.points.length && (!best || t.area < best.area)) best = t; }
    const r = !best && regionAt ? regionAt(u.mid[0], u.mid[1]) : 0;
    u.form = best ? best.key : r ? `r${r}` : `c${Math.floor(u.mid[0] / (2 * cellMm))},${Math.floor(u.mid[1] / (2 * cellMm))}`;
    if (!byKey.has(u.form)) byKey.set(u.form, { key: u.form, hostKey: best?.host?.key ?? null, kind: best?.kind ?? null, rank: best ? best.rank : portrait ? 100 : 0, head: best?.head ?? null, coat: !!best && (MASSES.has(best.kind) || (portrait && HOSTS.has(best.kind)) || (portrait && best.host?.kind === 'animal' && !(best.rank % 10 >= 1 && best.rank % 10 < 3))), units: [] });
    byKey.get(u.form).units.push(u);
  }
  for (const f of byKey.values()) { let x = 0, y = 0, w = 0; for (const u of f.units) { const m = Math.max(0.5, u.L); x += m * u.mid[0]; y += m * u.mid[1]; w += m; } f.centre = [x / w, y / w]; }
  return { forms: [...byKey.values()], portrait };
}

/**
 * The fitted drawing's strokes in passes over the whole sheet (see the top of this file). `doc`: a vectors document
 * ({ sheetMm, heightMm, strokes }). `things`: the subject's named things (boxes in mm), optional; `regionAt`: the object
 * region at a point (mm), optional; `centre`: the centre of interest (mm), else the first figure's face, else the middle
 * of the construction. Returns { strokes (new objects in playing order, each with `play` (shared by the pieces of one pass
 * of the pen) and `pass` 1..6; seq kept), units, centre, portrait }.
 */
export function formOrder(doc, { things = null, regionAt = null, centre = null, opts = {} } = {}) {
  const o = { ...FORM_ORDER, ...opts }, W = doc.sheetMm, H = doc.heightMm, k = Math.hypot(W, H) / REF_DIAG, mm = v => v * k;
  // (a lay-in made by an earlier ordering is made again)
  const units = classify(passUnits(doc.strokes.filter(s => s.piece !== 'layin')), { widthMm: W, heightMm: H, regionAt, opts });
  // (keepLayin: a plate already laid with its lay-in keeps those very strokes, played first; none is made again)
  if (o.keepLayin) for (const u of passUnits(doc.strokes.filter(s => s.piece === 'layin'))) units.push(Object.assign(u, { role: CONSTRUCTION, why: 'pencil lay-in', layin: true, rel: u.dark, edge: 0 }));
  // the centre of interest: given; else the face of the first figure (a portrait); else the middle of the long lines
  if (!centre) {
    const { forms: T, portrait } = thingForms(things, W * H, [W / 2, H / 2]), face = portrait ? T.filter(t => t.rank % 10 === 0 && t.rank < 100).sort((a, b) => a.rank - b.rank)[0] : null;
    if (face) centre = face.mid;
    else { let x = 0, y = 0, w = 0; for (const u of units) if (u.role <= STRUCTURE) { x += u.L * u.mid[0]; y += u.L * u.mid[1]; w += u.L; } centre = w ? [x / w, y / w] : [W / 2, H / 2]; }
  }
  const { forms, portrait } = assignForms(units, { things, regionAt, centre, sheet: W * H, cellMm: mm(o.cellMm) });
  // a mass drawn as many strokes (fur, hair, foliage: the things' kinds) is drawn as texture, lock by lock with its strands,
  // but for its edge (its construction lines along a region's edge); a face's features inside a coat of fur stay what they are
  const masses = (things ?? []).filter(t => MASSES.has(t.kind) && Array.isArray(t.box)), inMass = u => masses.some(t => u.points.filter(p => inBox(p, t.box)).length >= 0.5 * u.points.length);
  // (only a mass's own forms, its animal's body and the forms no thing names: a tongue or a collar inside a coat stays a form)
  for (const f of forms) if (MASSES.has(f.kind) || HOSTS.has(f.kind) || f.kind == null) for (const u of f.units.filter(u => MASSES.has(f.kind) || inMass(u))) {
    if (u.role === TEXTURE || (u.role === CONSTRUCTION && u.edge >= o.boundShare)) continue;
    u.role = TEXTURE; u.why = u.L >= mm(o.longMm) ? 'main lock of a mass' : 'stroke of a mass';
  }
  // a strand of a coat or a mass (a figure's or an animal's, its face's too) lying on the edge of its object region is the
  // mass's outer edge: construction
  for (const f of forms) if (f.coat || MASSES.has(f.kind) || (portrait && f.rank < 100)) for (const u of f.units) if (u.role === TEXTURE && /fur|mass/.test(u.why) && u.edge >= o.boundShare && u.L >= mm(o.edgeStrandMm)) { u.role = CONSTRUCTION; u.why = 'outer edge of a mass'; }
  // every form is placed in the first pass: a form with lines but no construction line gets its longest line(s)
  for (const f of forms) {
    const L = f.units.filter(u => !u.tone && !u.fill && u.role !== TEXTURE && u.L >= mm(o.placeMm)).sort((a, b) => b.L - a.L);
    if (!L.length || f.units.some(u => u.role === CONSTRUCTION)) continue;
    for (const u of L.slice(0, f.units.length > 20 ? 2 : 1)) { u.role = CONSTRUCTION; u.why = 'places its form'; }
  }
  // in a portrait the eyes, nose and mouth are placed with the head: a feature's longest lines are construction
  // (an eye's or a nose's own short curly lines are its detail, drawn before any fur, not texture)
  const feature = f => portrait && f.rank < 100 && f.rank % 10 >= 1 && f.rank % 10 < 3;
  for (const f of forms) if (feature(f)) for (const u of f.units) if (u.role === TEXTURE && !u.tone && !u.fill && u.L >= mm(o.speckMm)) { u.role = DETAIL; u.why = 'feature detail'; }
  for (const f of forms) if (feature(f)) for (const u of f.units.filter(u => u.role === STRUCTURE || u.role === DETAIL).sort((a, b) => b.L - a.L).slice(0, 2)) { u.role = CONSTRUCTION; u.why = 'places a feature'; }

  // A MASS DRAWN WITHOUT OUTLINES (a dog's black coat, a tree's foliage): its silhouette is placed in the first pass by the
  // strands and marks that lie along its edge, so the form is there before its texture (silhouette)
  // (a figure's or an animal's own strokes: those of its own things, so a dog held against a shirt is outlined against it)
  // (a figure's or an animal's own strokes: those of its own things, so a dog held against a shirt is outlined against it)
  // An ink drawing's mass that no construction line of its own places (under layinCover of its edge) gets a PENCIL LAY-IN.
  const layins = [];
  { const TF = thingForms(things, W * H, centre).forms, byKey = new Map(TF.map(t => [t.key, t]));
    const own = t => units.filter(u => { if (u.tone && !HOSTS.has(t.kind) && !MASSES.has(t.kind)) return false; const f = byKey.get(u.form); return f ? f === t || (HOSTS.has(t.kind) && f.host === t) : u.points.filter(p => inBox(p, t.box)).length >= 0.5 * u.points.length; });
    const masses = TF.filter(t => HOSTS.has(t.kind) || MASSES.has(t.kind)).map(t => ({ key: t.key, box: t.box, list: own(t), t }));
    // (and any other form that is a large dark mass: most of its strokes fills, tone or strokes inside black)
    // (not a part of a figure or a mass already counted: a dog's face is inside the dog)
    const hostBoxes = masses.map(m => m.box);
    for (const f of forms) if (!masses.some(m => m.key === f.key) && f.units.length >= 40 && f.units.filter(u => u.fill || u.tone || /black mass/.test(u.why)).length >= 0.5 * f.units.length) {
      const X = f.units.flatMap(u => u.points.map(p => p[0])), Y = f.units.flatMap(u => u.points.map(p => p[1])), box = [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)];
      if (byKey.get(f.key)?.host || hostBoxes.some(b => overlap(b, box) >= 0.5 * area(box))) continue;
      masses.push({ key: f.key, box, list: f.units });
    }
    masses.sort((a, b) => area(b.box) - area(a.box));
    const firmDark = Math.max(...units.filter(u => !u.tone && !u.fill).map(u => u.dark), 0.3);
    const laid = [];
    for (const m of masses) {
      const inked = m.list.filter(u => !u.tone || u.dark >= 0.15), chains = massEdge(inked, m.box, o, mm); if (!chains) continue;
      const placed = outerStrands(m.list, chains, o, mm);
      // (a long line deep inside the mass, a strand of its coat, is its texture, not its construction)
      const deep = u => u.points.filter(p => !chains.some(C => C.some(q => dist(p, q) < mm(o.deepMm)))).length >= 0.7 * u.points.length;
      // (only in a mass drawn without outlines, and only its coat: the animal's body, its fur, its face; not its features)
      const coatForm = u => { const t = byKey.get(u.form); return !t || t === m.t || MASSES.has(t.kind) || t.kind === 'face' || HOSTS.has(t.kind); };
      if (placed < o.layinCover) for (const u of m.list) if (u.role === CONSTRUCTION && !u.layin && /long|bounds/.test(u.why) && coatForm(u) && deep(u)) { u.role = TEXTURE; u.why = 'strand inside a mass'; }
      if (doc.medium === 'pencil' || o.keepLayin || placed >= o.layinCover) continue;
      // (one lay-in for a mass: a coat inside the animal it covers is laid in with it)
      if (laid.some(b => overlap(b, m.box) >= 0.8 * area(m.box))) continue;
      laid.push(m.box);
      // (the lay-in follows the mass itself: the edge of its fills and tone, closed over and simplified)
      const dark = m.list.filter(u => u.fill || u.tone || /black mass/.test(u.why)), loose = dark.length >= 20 ? massEdge(dark, m.box, o, mm, o.layinCloseMm, 10, true, true) : null; if (!loose) continue;
      let f = forms.find(x => x.key === m.key);
      if (!f) { f = { key: m.key, kind: m.t?.kind ?? null, rank: m.t?.rank ?? 0, head: m.t?.head ?? null, coat: false, units: [], centre: [(m.box[0] + m.box[2]) / 2, (m.box[1] + m.box[3]) / 2] }; forms.push(f); }
      for (const st of layInStrokes(loose, o, mm, o.layinDark * firmDark, layins.length + 1 + m.key.length * 7)) {
        const u = { strokes: [st], path: st.path, L: length(st.path), mid: st.path[st.path.length >> 1], points: sample(st.path), tone: false, fill: false, dark: st.dark, role: CONSTRUCTION, why: 'pencil lay-in', form: f.key, layin: true };
        f.units.push(u); units.push(u); layins.push(st);
      }
    }
    layins.forEach((st, i) => { st.seq = -layins.length + i - 1; });
  }
  // the texture split: the light shading of the whole picture first, then the texture, then the small darkest accents
  const coatOf = new Map(forms.map(f => [f.key, f.coat]));
  for (const u of units) {
    if (u.role !== TEXTURE) continue;
    const shape = u.strokes.reduce((a, s) => a + Math.abs(ringArea(s.outline?.[0] ?? [])), 0);
    // (a coat's own grey is not shaded over the whole coat at once: it is laid lock by lock with the coat, pale first)
    // (the light shading is drawn: pale hatching. Soft grey tone, diluted ink laid with a brush, is never shaded over the whole
    // sheet in patches: it is brushed in after the lines of its own place, and in a coat lock by lock with its marks)
    if (u.rel <= o.shadeDark && !coatOf.get(u.form) && ((u.tone && o.toneInShading && shape >= mm(1) * mm(1) * o.shadeMinMm2) || /hatch|shading|patch|group|pale/.test(u.why))) { u.role = SHADING; u.why += ', light'; }
    else if (u.rel >= o.accentDark && (u.fill || u.why === 'speck') && shape <= mm(1) * mm(1) * o.accentMm2 && !coatOf.get(u.form)) { u.role = ACCENT; u.why += ', accent'; }
  }

  const out = []; let pen = centre, played = 0;
  const reverse = u => { for (const s of u.strokes) { s.path = [...s.path].reverse(); if (Array.isArray(s.widths) && s.widths.length) s.widths = [...s.widths].reverse(); if (Array.isArray(s.press)) s.press = [...s.press].reverse(); } u.path = u.strokes[0].path; };
  const lay = (u, pass) => {
    const P = u.path, turnable = pass <= STRUCTURE && dist(P[0], P.at(-1)) > mm(1);
    if (turnable && dist(pen, P.at(-1)) + mm(o.turnMm) < dist(pen, P[0])) reverse(u);
    const play = played++; for (const s of u.strokes) out.push({ s, pass, play }); pen = u.path.at(-1);
  };
  const reach = (u, pass) => (pass <= STRUCTURE ? Math.min(dist(pen, u.path[0]), dist(pen, u.path.at(-1)) + mm(o.turnMm)) : dist(pen, u.path[0]));
  // inside a form, nearest line next, patch by patch
  // inside a form: nearest line next, then the walk shortened by moving single lines to where they cost the least travel
  // (or-opt; each line keeps the way the walk drew it), so few long jumps are left between the last stragglers
  // (bias: an extra cost of a line, a pull outward; first: the line to begin with, kept first)
  const nearest = (list, pass, bias = null, first = null) => {
    const left = new Set(list), walk = []; let p = pen;
    if (first) { left.delete(first); walk.push({ u: first, s: first.path[0], e: first.path.at(-1) }); p = first.path.at(-1); }
    while (left.size) { let b = null, bc = Infinity, flip = false; for (const u of left) { const a = dist(p, u.path[0]), z = pass <= STRUCTURE ? dist(p, u.path.at(-1)) + mm(o.turnMm) : Infinity; const c = Math.min(a, z) + (bias ? bias(u) : 0); if (c < bc) { bc = c; b = u; flip = z < a; } } left.delete(b); walk.push({ u: b, s: flip ? b.path.at(-1) : b.path[0], e: flip ? b.path[0] : b.path.at(-1) }); p = walk.at(-1).e; }
    if (walk.length > 3 && walk.length <= o.optMax) {
      // (a long jump costs more than its length: the hand lifts and travels)
      const far = mm(o.farMm), hd = (p, q) => { const d = dist(p, q); return d + 2 * Math.max(0, d - far); }, hop = (a, b) => (a ? hd(a.e, b.s) : hd(pen, b.s));
      for (let round = 0; round < 2; round++) for (let i = first ? 1 : 0; i < walk.length; i++) {
        const x = walk[i], prev = walk[i - 1], next = walk[i + 1], gain = hop(prev, x) + (next ? hop(x, next) : 0) - (next ? hop(prev, next) : 0);
        if (gain < mm(o.turnMm)) continue;
        walk.splice(i, 1); let bj = -1, bc = gain;
        for (let j = Math.max(first ? 1 : 0, i - o.optWindow); j <= Math.min(walk.length, i + o.optWindow); j++) { const a = walk[j - 1], c = walk[j], cost = hop(a, x) + (c ? hd(x.e, c.s) - hop(a, c) : 0); if (cost < bc - 1e-9) { bc = cost; bj = j; } }
        walk.splice(bj < 0 ? i : bj, 0, x);
      }
    }
    for (const { u } of walk) lay(u, pass);
  };
  // a coat (fur, hair, a foliage mass, an animal's body and face, not its eyes and nose) is built outward from its head, lock by lock: begun at the head,
  // then nearest next with a slight pull outward
  const outward = (list, pass, head) => { if (!list.length) return; let f = list[0]; for (const u of list) if (dist(head, u.mid) < dist(head, f.mid)) f = u; nearest(list, pass, u => o.outPull * dist(head, u.mid), f); };
  const work = (list, pass, f) => {
    // (a coat: one walk outward from its head over its grey and its marks together, the paler first where they lie together)
    if (pass >= SHADING && f.coat && f.head) { let first = list[0]; for (const u of list) if (dist(f.head, u.mid) < dist(f.head, first.mid)) first = u; nearest(list, pass, u => o.coatPull * dist(f.head, u.mid) + mm(o.paleFirstMm) * (u.rel ?? 0), first); return; }
    // (the construction of a form is one walk round it, nearest line next: its lines run on from one another)
    if (pass === CONSTRUCTION) { nearest(list, pass); return; }
    const cells = new Map(), cm = mm(o.cellMm);
    for (const u of list) { const key = `${Math.floor(u.mid[0] / cm)},${Math.floor(u.mid[1] / cm)}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(u); }
    const left = [...cells.values()];
    while (left.length) {
      let b = 0, bc = Infinity; for (let q = 0; q < left.length; q++) { const c = Math.min(...left[q].map(u => reach(u, pass))); if (c < bc) { bc = c; b = q; } }
      const cell = left.splice(b, 1)[0];
      // texture: its lines first, then the black masses (the paler first), then the soft grey tone over the patch (grey
      // patches laid before the masses read as blotches)
      if (pass >= SHADING) { nearest(cell.filter(u => !u.tone && !u.fill), pass); nearest(cell.filter(u => u.fill && u.dark < 0.9), pass); nearest(cell.filter(u => u.fill && u.dark >= 0.9), pass); nearest(cell.filter(u => u.tone), pass); }
      else nearest(cell, pass);
    }
  };
  // the placing of a portrait, figure by figure (people first): the head's outline, then the eyes, then the other features
  // from the top down, then the rest of the figure (hair, clothing, limbs, coat) by nearness; the rest of the picture last
  const placing = rank => { if (rank >= 100) return 1e9; const h = Math.floor(rank / 10), feat = rank % 10; return 1e7 * h + (feat < 1 ? 0 : feat < 3 ? 1e6 + 1e5 * feat : 3e6); };
  for (const pass of [CONSTRUCTION, STRUCTURE, DETAIL, SHADING, TEXTURE, ACCENT]) {
    // the light shading is one sweep over the whole picture, not form by form: nearest next, with a pull to the centre
    // (a coat's shading is built lock by lock from its head outward, the figures first; the rest of the picture's light
    // shading is one sweep over it, nearest next with a pull to the centre)
    if (pass === SHADING) {
      const coats = forms.filter(f => f.coat && f.head && f.units.some(u => u.role === pass)).sort((a, b) => a.rank - b.rank);
      for (const f of coats) outward(f.units.filter(u => u.role === pass), pass, f.head);
      const inCoat = new Set(coats.map(f => f.key));
      nearest(units.filter(u => u.role === pass && !inCoat.has(u.form)), pass, u => o.shadePull * dist(centre, u.mid)); continue;
    }
    let left = forms.map(f => ({ f, list: f.units.filter(u => u.role === pass) })).filter(x => x.list.length);
    // (in the shading and texture, an animal's or a mass's whole coat is one walk from its head: its body, fur and face together)
    if (pass >= SHADING) {
      const joined = new Map(), rest = [];
      for (const x of left) { const k = x.f.coat && x.f.head ? x.f.hostKey ?? x.f.key : null; if (k == null) { rest.push(x); continue; } const j = joined.get(k); if (!j) joined.set(k, { f: { ...x.f, rank: x.f.rank }, list: [...x.list] }); else { j.list.push(...x.list); if (x.f.rank < j.f.rank) j.f = { ...j.f, rank: x.f.rank, head: x.f.head }; } }
      left = [...rest, ...joined.values()];
    }
    while (left.length) {
      // the next form: in the first pass a portrait's placing first (placing), then the nearest to the pen with a pull to the centre; later passes the figures before the rest of the picture; in the
      // texture, figure by figure (people before animals; a coat begun at its head); otherwise by nearness
      let b = 0, bc = Infinity;
      for (let q = 0; q < left.length; q++) { const x = left[q], c = (pass === CONSTRUCTION ? placing(x.f.rank) : x.f.rank >= 100 ? 1e7 : pass < TEXTURE ? 0 : 1e6 * Math.floor(x.f.rank / 10)) + Math.min(...x.list.map(u => reach(u, pass))) + o.pull * dist(centre, x.f.centre); if (c < bc) { bc = c; b = q; } }
      const x = left.splice(b, 1)[0]; work(x.list, pass, x.f);
    }
  }
  // the lay order (seq) is kept: where three strokes overlap the laid ink depends a little on the order they are laid in, so
  // the finished drawing stays the fit's own; the replay plays them in `play` order. The strokes of one pass of the pen (a
  // line's grey and black pieces on one path) share their `play` and are played in seq order, so a hand laid on them
  // afterwards (pen-physics.mjs: a line's pulls and its first tries, numbered in seq within the line) keeps its own order
  const strokes = out.map(({ s, pass, play }) => ({ ...s, play, pass }));
  return { strokes, units, centre, portrait };
}

const ringArea = r => { let a = 0; for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/**
 * The silhouette of a mass inside `box` (mm): its strokes' paths and shapes on a grid of silCellMm, closed over silCloseMm,
 * the largest piece. Returns its edge as chains of points (mm) round it, or null for a mass too small to have one.
 */
function massEdge(units, box, o, mm, closeMm = o.silCloseMm, smooth = 3, solid = false, holes = false) {
  const pad = 4 + Math.ceil(mm(closeMm) / mm(o.silCellMm)) + (solid ? 10 : 0), cs = mm(o.silCellMm), x0 = box[0] - pad * cs, y0 = box[1] - pad * cs, nx = Math.ceil((box[2] - box[0]) / cs) + 2 * pad, ny = Math.ceil((box[3] - box[1]) / cs) + 2 * pad;
  if (!(nx > 0 && ny > 0) || nx * ny > 4e6 || units.length < 20) return null;
  const at = (x, y) => { const i = Math.floor((x - x0) / cs), j = Math.floor((y - y0) / cs); return i >= 0 && j >= 0 && i < nx && j < ny ? j * nx + i : -1; };
  let m = new Uint8Array(nx * ny);
  for (const u of units) for (const s of u.strokes) for (const P of [s.path, ...(s.fill || s.piece === 'tone' ? s.outline ?? [] : [])]) for (let k = 0; k < P.length; k++) { const c = at(P[k][0], P[k][1]); if (c >= 0) m[c] = 1; }
  // (solid: the shapes themselves filled, a fill's or a tone's whole area, not only its edge)
  if (solid) for (const u of units) for (const s of u.strokes) { const R = s.outline ?? [], X = R.flat().map(p => p[0]), Y = R.flat().map(p => p[1]); if (!X.length) continue; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let k = 0; k < X.length; k++) { if (X[k] < x0) x0 = X[k]; if (X[k] > x1) x1 = X[k]; if (Y[k] < y0) y0 = Y[k]; if (Y[k] > y1) y1 = Y[k]; } for (let y = (Math.floor(y0 / cs) + 0.5) * cs; y <= y1; y += cs) for (let x = (Math.floor(x0 / cs) + 0.5) * cs; x <= x1; x += cs) { let inside = false; for (const r of R) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside; if (inside) { const c = at(x, y); if (c >= 0) m[c] = 1; } } }
  const r = Math.max(1, Math.round(mm(closeMm) / cs));
  const morph = (src, grow) => { const d = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let any = !grow; for (let dj = -r; dj <= r && any !== grow; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj, v = a >= 0 && b >= 0 && a < nx && b < ny ? src[b * nx + a] : 0; if (grow ? v : !v) { any = grow; break; } } d[j * nx + i] = any ? 1 : 0; } return d; };
  m = morph(morph(m, true), false);
  const lab = new Int32Array(nx * ny); let best = 0, bestN = 0, id = 0;
  for (let c0 = 0; c0 < m.length; c0++) if (m[c0] && !lab[c0]) { id++; let n = 0; const st = [c0]; lab[c0] = id; while (st.length) { const c = st.pop(); n++; const i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < nx && b < ny && m[b * nx + a] && !lab[b * nx + a]) { lab[b * nx + a] = id; st.push(b * nx + a); } } if (n > bestN) { bestN = n; best = id; } }
  if (!best || bestN * cs * cs < mm(o.massMinMm) ** 2) return null;
  // the outside (reached from the grid's border without crossing the piece): only the outer edge is the silhouette, not the
  // edges of holes inside the mass
  const out = new Uint8Array(nx * ny), st = [];
  for (let i = 0; i < nx; i++) for (const j of [0, ny - 1]) if (lab[j * nx + i] !== best && !out[j * nx + i]) { out[j * nx + i] = 1; st.push(j * nx + i); }
  for (let j = 0; j < ny; j++) for (const i of [0, nx - 1]) if (lab[j * nx + i] !== best && !out[j * nx + i]) { out[j * nx + i] = 1; st.push(j * nx + i); }
  while (st.length) { const c = st.pop(), i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < nx && b < ny && !out[b * nx + a] && lab[b * nx + a] !== best) { out[b * nx + a] = 1; st.push(b * nx + a); } }
  // (holes: the large light shapes inside the mass, a muzzle in a dark coat, are its main inner divisions; their edges too)
  const big = new Uint8Array(nx * ny);
  if (holes) { const seen = new Uint8Array(nx * ny); for (let c0 = 0; c0 < m.length; c0++) if (!out[c0] && lab[c0] !== best && !seen[c0]) { const comp = [c0], q = [c0]; seen[c0] = 1; while (q.length) { const c = q.pop(), i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const d = b * nx + a; if (a >= 0 && b >= 0 && a < nx && b < ny && !out[d] && lab[d] !== best && !seen[d]) { seen[d] = 1; q.push(d); comp.push(d); } } } if (comp.length * cs * cs >= mm(o.layinHoleMm) ** 2) for (const c of comp) big[c] = 1; } }
  const B = new Set();
  for (let c = 0; c < m.length; c++) if (lab[c] === best) { const i = c % nx, j = (c / nx) | 0; if ([[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].some(([a, b]) => a < 0 || b < 0 || a >= nx || b >= ny || out[b * nx + a] || big[b * nx + a])) B.add(c); }
  // the edge cells walked into chains (a neighbour at a time), smoothed
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]], step = c => { const i = c % nx, j = (c / nx) | 0; for (const [di, dj] of N8) { const a = i + di, b = j + dj, d = b * nx + a; if (a >= 0 && a < nx && b >= 0 && b < ny && B.has(d)) return d; } return -1; };
  const chains = [];
  while (B.size) {
    const s0 = B.values().next().value; B.delete(s0); const fwd = [s0]; for (let c = step(s0); c >= 0; c = step(c)) { B.delete(c); fwd.push(c); }
    const back = []; for (let c = step(s0); c >= 0; c = step(c)) { B.delete(c); back.push(c); }
    const ch = [...back.reverse(), ...fwd]; if (ch.length * cs < mm(o.layinMinMm)) continue;
    let P = ch.map(c => [x0 + (c % nx + 0.5) * cs, y0 + (((c / nx) | 0) + 0.5) * cs]);
    for (let q = 0; q < smooth; q++) P = P.map((p, k) => { const a = P[Math.max(0, k - 2)], b = P[Math.min(P.length - 1, k + 2)]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; });
    chains.push(P);
  }
  return chains;
}

/** Points along a chain every `step` mm. */
function along(P, step) { const out = [P[0]]; let acc = 0; for (let k = 1; k < P.length; k++) { acc += dist(P[k - 1], P[k]); if (acc >= step) { out.push(P[k]); acc = 0; } } return out; }

/**
 * A MASS'S OUTER EDGE: when its edge is fur (strands, not an outline), its outermost strands along the silhouette are its
 * construction, a sparse few: at every strandStepMm of the edge, the strand passing nearest (within silNearMm). Returns the
 * share of the edge that long construction lines of its own already place (lines of boundMm and more within silNearMm).
 */
function outerStrands(units, chains, o, mm) {
  const cell = mm(2), g = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const u of units) if (!u.tone && !u.fill) for (const p of sample(u.path, 24)) { const k = key(p[0], p[1]); if (!g.has(k)) g.set(k, []); g.get(k).push([p, u]); }
  const near = (q, r, ok) => { let b = null, bd = r; const i = Math.floor(q[0] / cell), j = Math.floor(q[1] / cell), n = Math.ceil(r / cell); for (let a = i - n; a <= i + n; a++) for (let c = j - n; c <= j + n; c++) for (const [p, u] of g.get(`${a},${c}`) ?? []) { const d = dist(p, q); if (d <= bd && ok(u)) { bd = d; b = u; } } return b; };
  let n = 0, placed = 0;
  for (const P of chains) for (const q of along(P, mm(o.strandStepMm))) {
    n++;
    if (near(q, mm(o.silNearMm), u => u.role === CONSTRUCTION && u.L >= mm(o.boundMm) && u.why !== 'outer strand')) { placed++; continue; }
    if (near(q, mm(o.silNearMm), u => u.role === CONSTRUCTION)) continue;
    const u = near(q, mm(o.silNearMm), u => u.L >= mm(1.5) && u.role !== CONSTRUCTION); if (u) { u.role = CONSTRUCTION; u.why = 'outer strand'; }
  }
  return n ? placed / n : 1;
}

/**
 * THE PENCIL LAY-IN of an ink drawing's form that no construction line of its own places: a few light graphite strokes
 * round its silhouette, as a person lays in a subject made of masses before inking it: open (gaps between them), drawn
 * loosely a little outside or inside the edge, light on and lifted off (`press`). They are drawn first and stay on the
 * sheet faint, mostly covered by the ink. Strokes as the fit's ({ medium: 'graphite', piece: 'layin', ... }), seq set later.
 */
function layInStrokes(chains, o, mm, dark, seed) {
  let x = (seed * 2654435761 + 12345) >>> 0; const rand = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const out = [], hw = mm(o.layinWidthMm) / 2, r3 = v => Math.round(v * 1000) / 1000;
  for (const C of chains) {
    const P = along(C, mm(0.5)); let k = 0;
    while (k < P.length - 2) {
      const want = mm(o.layinMm[0] + (o.layinMm[1] - o.layinMm[0]) * rand()); let L = 0, e = k + 1; while (e < P.length && L < want) { L += dist(P[e - 1], P[e]); e++; }
      if (L >= mm(o.layinMinMm)) {
        // a little outside or inside the edge, drifting along the stroke
        const off0 = mm(o.layinOffMm) * (2 * rand() - 1), off1 = mm(o.layinOffMm) * (2 * rand() - 1), Q = P.slice(k, e);
        const path = Q.map((p, i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)], l = dist(a, b) || 1, t = i / Math.max(1, Q.length - 1), off = off0 + (off1 - off0) * t; return [r3(p[0] - (b[1] - a[1]) / l * off), r3(p[1] + (b[0] - a[0]) / l * off)]; });
        const N = path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], l = dist(a, b) || 1; return [-(b[1] - a[1]) / l * hw, (b[0] - a[0]) / l * hw]; });
        const outline = [[...path.map((p, i) => [r3(p[0] + N[i][0]), r3(p[1] + N[i][1])]), ...path.map((p, i) => [r3(p[0] - N[i][0]), r3(p[1] - N[i][1])]).reverse()]];
        const press = path.map((_, i) => { const t = i / Math.max(1, path.length - 1); return Math.round(100 * (0.6 + 0.4 * Math.min(1, t / 0.15, (1 - t) / 0.2))) / 100; });
        out.push({ medium: 'graphite', piece: 'layin', part: 'layin', drawn: 'path', line: null, dark: Math.round(dark * 1000) / 1000, path, widths: path.map(() => r3(2 * hw)), outline, press });
      }
      k = e + Math.max(1, Math.round(mm(o.layinGapMm[0] + (o.layinGapMm[1] - o.layinGapMm[0]) * rand()) / mm(0.5)));
    }
  }
  return out.slice(0, o.layinMax);
}

/**
 * The playing order of a fit (`ordered`: its strokes with `play` and `pass`, formOrder) carried onto a document made from
 * that fit by a hand (pen-physics.mjs: each line's pieces cut into pulls, a lighter first try added before some, each keeping
 * its line's `line` and numbered in seq inside the line's place). Each stroke takes the play and pass of the ordered stroke
 * of its own line whose path passes nearest its middle (of any line, for a stroke with none of its line in the fit), so a
 * line's pulls and tries share one play and keep the hand's own order within it. Returns the document with play and pass.
 */
export function carryOrder(doc, ordered) {
  const pts = s => sample(s.path, 8), byLine = new Map(), cell = 5, grid = new Map(), key = (i, j) => `${i},${j}`;
  for (const s of ordered) {
    const k = s.line == null ? null : Math.floor(s.line), e = { s, P: pts(s) };
    if (k != null) { if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(e); }
    for (const p of e.P) { const g = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(e); }
  }
  const mainOf = list => { let b = null, bl = -1; for (const e of list) { if (e.s.piece === 'tone' || e.s.fill) continue; const L = length(e.s.path); if (L > bl) { bl = L; b = e.s; } } return b ?? list[0].s; };
  const nearest = (list, q) => { let b = null, bd = Infinity; for (const e of list) for (const p of e.P) { const d = dist(p, q); if (d < bd) { bd = d; b = e.s; } } return b; };
  const around = q => { for (let r = 0; r < 40; r++) { const out = []; const i0 = Math.floor(q[0] / cell), j0 = Math.floor(q[1] / cell); for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) out.push(...(grid.get(key(i, j)) ?? [])); if (out.length) return out; } return [...byLine.values()].flat(); };
  // (shading the hand makes at lay time, pencil-shade.mjs `shade`, has no line in the fit: it is played after the lines, by
  // its own passes, and is left without a play here)
  const strokes = doc.strokes.map(s => {
    if (s.shade != null) return s;
    const q = s.path[Math.floor(s.path.length / 2)], own = s.line == null ? null : byLine.get(Math.floor(s.line));
    // a pull or a first try is cut from the whole line: it takes the place of the line's main stroke (its longest line piece),
    // so all of a line's pulls are played together
    const o = (s.pull != null || s.try) && own ? mainOf(own) : nearest(own ?? around(q), q);
    return o ? { ...s, play: o.play, pass: o.pass } : s;
  });
  return { ...doc, strokes };
}
