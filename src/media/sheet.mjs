// A sheet of paper with water and pigment on it and in it. The model's structure is based on Computer-Generated Watercolor,
// "Computer-Generated Watercolor" (SIGGRAPH 97): water with suspended pigment above the paper, pigment adsorbed
// onto and desorbed from the paper by density, staining power and granulation, water absorbed into the paper's
// pores and spread by capillary action, and each dried wash kept as its own glaze for Kubelka-Munk compositing.
//
// Design constraints:
// - Every transport is conservative: water and pigment move across faces with a shared outgoing budget per cell,
//   with diffusive conductance capped at 1/4 per face, including fibre permeability.
// - Every time-dependent process (evaporation, absorption, settling, lifting, capillary spread, pore drying) scales
//   with dt; flow and diffusion level the water every step, since they are fast next to drying.
// - Edge darkening comes from the physics, not a pigment shortcut: water evaporates faster near the pinned boundary
//   (Deegan et al., Nature 1997), the flow that replaces it carries pigment outward, and a boundary cell stays wet
//   while the water behind it still feeds it.
// - Granulation redistributes pigment as it settles (hollows adsorb faster, peaks release faster); drying moves
//   what is still suspended into the deposit unchanged.
// - Capillary spread uses a next-state buffer, so it has no directional bias; damp paper re-wets the surface where
//   its saturation passes a threshold, and water arriving on a damp wash lifts pigment its binder has not yet fixed.
// - A dried wash becomes a layer: later water can lift a little of it back (by staining power), and optics composite
//   the layers in order.
// DOM free.

export const DEFAULTS = {
  flow: 0.2, flowIters: 2, slope: 0,             // surface water levelling; each face's conductance is capped at 1/4
  diffuse: 0.02,                                  // pigment particles barely diffuse; water carries them (< 0.25)
  // Paint charged into a standing film mixes out into it (convection and the binder's pull, here as an effective
  // diffusion, cells^2 per flow iteration), with a mobility that grows with the film: full at a glossy film of
  // filmDepth, a fraction on a sheen, almost none on damp paper, none on dry (no wet face). With carryDepth alone a
  // glossy film (0.03 deep) let paint travel 0.5 mm (glaze-timing findings).
  filmDiffuse: 0.2, filmDepth: 0.03,
  evap: 0.0003, edgeEvap: 0.0025, edgeWidth: 2,    // drying: faster within edgeWidth cells of the pinned boundary
  absorb: 0.002, film: 0.03, paperDry: 0.0006,    // pores fill from the film without tearing it; damp pores dry slowly
  capRate: 0.05, capEps: 0.35, capDelta: 0.1, capSigma: 0.6, // capillary layer (fractions of capacity), Computer-Generated Watercolor, section 4.6
  settle: 0.25, lift: 0.25, looseLift: 6,         // adsorption and desorption scale; loose (unfixed) pigment lifts more
  scour: 0.6,                                     // a current picks up loose pigment that still water leaves: backruns, and the feathering of a wet edge
  liftDepth: 0.3,                                 // shallower water cannot lift settled pigment back into suspension
  rewetLift: 0.0001,                              // dried layers lifted by new water, divided by staining power; artists' colours resist it (glazing)
  wetEps: 0.004, spill: 0.6, spillHeight: 0.04, // sized paper: a wet-on-dry stroke keeps to where the brush went
  dampEase: 0.85,                                 // damp paper lets a wet front onto it more easily
  // encloseEase (o.encloseEase ?? 0) is left out here so recorded tape options are unchanged without --encloseease
  pinning: 1.5, pinFibre: 2,                      // on damp paper fronts are pinned at gaps between fibres (spread of gap sizes) and run along fibres
  marangoni: 0,                                   // paint's binder lowers surface tension: paint runs out over clean water (wet-in-wet blooms)
  fibreFlow: 0.6,                                 // how much the fibres steer surface water (permeability varies along and across them)
  carryDepth: 0.2,                                // water shallower than this leaves its pigment behind as it moves (the pigment lags the water)
  flowDepth: 0.06,                                // a film thinner than this barely flows (lubrication: flux grows with depth cubed)
  gran: 1,                                        // scales every pigment's granulation
  slide: 0.4, slideFill: 2, repose: 0.04,         // settled grains roll into the paper's hollows (by granulation), filling them, down slopes steeper than repose / granulation;
                                                  // too low and the wash dries before the grains arrive, so granulating pigments come out smooth
  hold: 2,                                        // the most pigment a unit of water keeps suspended; a thinner film strands the rest
  sizing: 0.9, wickFilter: 0.2,                   // sizing slows wicking into dry paper; fibres filter out a share of what pigment the water carries
  dt: 0.1,
};

// Threads (--threads). With more than one, the sheet's arrays live in SharedArrayBuffers and a large box is stepped in
// row bands by a pool of workers (sheet-par.mjs), with output bit-identical to the serial step. Set it before making
// the sheets: a sheet made earlier keeps plain arrays and steps serially.
let PAR = null;
export async function setThreads(n) {
  if (!(n > 1)) { if (PAR) PAR.stop(); PAR = null; return 1; }
  PAR = await import('./sheet-par.mjs');
  return PAR.start(n);
}
export const threadStats = () => (PAR ? PAR.stats() : null);
const F32 = n => (PAR ? PAR.shared(Float32Array, n) : new Float32Array(n));
const U8 = n => (PAR ? PAR.shared(Uint8Array, n) : new Uint8Array(n));
const I32 = n => (PAR ? PAR.shared(Int32Array, n) : new Int32Array(n));

// GPU backend (src/media/gpu/link.mjs). A sheet with `_gpu` set keeps its truth on the GPU between calls; the functions
// below that read or write the whole sheet bring the CPU copy up to date first (coherent) and, when they write it, say
// so (wrote). With `_gpu` unset none of this runs and the sheet is exactly the CPU reference.
export const coherent = sheet => { if (sheet._gpu) sheet._gpu.syncAll(sheet); };
const wrote = sheet => { if (sheet._gpu) sheet._gpu.cpuWroteAll(); };

export function createSheet(paper, pigments) {
  const { w, h, n } = paper;
  return {
    paper, pigments, w, h, n, K: pigments.length,
    W: F32(n), s: F32(n), M: U8(n),
    G: pigments.map(() => F32(n)),   // suspended pigment mass
    P: pigments.map(() => F32(n)),   // pigment carried into the pores with absorbed water
    D: pigments.map(() => F32(n)),   // deposited in the current wash (not yet fixed)
    layers: [],                                    // dried washes, oldest first: arrays of per-pigment masses
    ever: U8(n),                       // cells this wash has covered with water (a backrun can creep back into them)
    // Masking fluid. Where it is on, the paper is sealed: nothing soaks in, nothing settles, and a wash flows over
    // the top of it rather than round it, so a planned shape survives inside a flowing wash. The paint runs up to its
    // edge and stops. Rubbed off, the paper under it is untouched.
    resist: null, resistFrom: null,
    edge: F32(n), steps: 0,
  };
}

/** Water and pigment masses added at a cell. */
export function deposit(sheet, i, water, pig) {
  sheet.W[i] += water; sheet.M[i] = 1; sheet.ever[i] = 1; sheet.wetDirty = 1;
  if (pig) for (let k = 0; k < sheet.K; k++) if (pig[k]) sheet.G[k][i] += pig[k];
}

/** True where masking fluid seals the paper. */
const masked = (sheet, i) => sheet.resist !== null && sheet.resist[i] === 1;

/** Lay or lift masking fluid. `mask` is a 0/1 field the size of the sheet; lifting it leaves whatever the paper had
 *  before it went on, which is the point of using it. */
export function applyResist(sheet, mask, strength = null) {
  // a resist keeps paint off the cells it covers, so a replay without it paints straight through a reserved light
  if (TAPE && sheet._tape) TAPE.push(strength ? { k: 'r', m: Array.from(mask), s: Array.from(strength, v => Math.round(v * 100)) } : { k: 'r', m: Array.from(mask) });
  coherent(sheet);
  sheet.resist = mask;
  // `strength` (0 to 1 a cell, or null for 1 everywhere): how much of what is laid over the film comes off with it.
  // Fluid put on thin at a light's rim lets some paint through, so the light keeps a soft, broken edge (--softmask).
  sheet.resistStrength = strength;
  // The film goes on at a moment. Everything laid on those cells after it comes off with it, including washes that
  // dried on top in the meantime; everything already on the paper underneath stays. Remembering how many layers had
  // dried when it went on is what separates the two.
  sheet.resistFrom = sheet.layers.length;
  wrote(sheet);
}
// A painter's control of a wash edge: the bead is carried to a line and stops there. With a clip set, every brush on
// this sheet reaches only the cells in it (brush.mjs stroke), so a passage is laid out to its edge and no further,
// wet on dry with a crisp boundary (--crisp, src/paint/methods/crisp-edges.mjs). null clears it. Taped as runs of
// cell indices, [start, length, ...], so a replay stops the same brushes at the same edges.
export function setClip(sheet, mask) {
  if (TAPE && sheet._tape) {
    if (!mask) TAPE.push({ k: 'c' });
    else TAPE.push({ k: 'c', r: clipRuns(mask) });
  }
  sheet.clip = mask || null;
}
// A clip mask as runs of set cells, [start, length, ...]. A byte mask skips four clear (or four set) cells at a time.
export function clipRuns(mask) {
  const r = [], n = mask.length;
  const words = mask instanceof Uint8Array && mask.byteOffset % 4 === 0 ? new Uint32Array(mask.buffer, mask.byteOffset, n >> 2) : null;
  for (let i = 0; i < n; i++) {
    if (words && (i & 3) === 0) { while ((i >> 2) < words.length && words[i >> 2] === 0) i += 4; if (i >= n) break; }
    if (!mask[i]) continue;
    const s = i;
    while (i < n && mask[i]) {
      if (words && (i & 3) === 0 && (i >> 2) < words.length) { const v = words[i >> 2]; if ((v & 0xff) && (v & 0xff00) && (v & 0xff0000) && (v >>> 24)) { i += 4; continue; } }
      i++;
    }
    r.push(s, i - s);
  }
  return r;
}

export function liftResist(sheet) {
  if (TAPE && sheet._tape) TAPE.push({ k: 'R' });
  const r = sheet.resist; if (!r) return;
  coherent(sheet);
  const from = sheet.resistFrom ?? sheet.layers.length, st = sheet.resistStrength ?? null;
  for (let i = 0; i < sheet.n; i++) {
    if (!r[i]) continue;
    if (st && st[i] < 1) { const keep = 1 - st[i]; sheet.W[i] *= keep; for (let k = 0; k < sheet.K; k++) { sheet.G[k][i] *= keep; sheet.D[k][i] *= keep; sheet.P[k][i] *= keep; } for (let L = from; L < sheet.layers.length; L++) for (let k = 0; k < sheet.K; k++) sheet.layers[L][k][i] *= keep; continue; }
    sheet.W[i] = 0; sheet.M[i] = 0;
    for (let k = 0; k < sheet.K; k++) { sheet.G[k][i] = 0; sheet.D[k][i] = 0; sheet.P[k][i] = 0; }
    for (let L = from; L < sheet.layers.length; L++) for (let k = 0; k < sheet.K; k++) sheet.layers[L][k][i] = 0;
  }
  sheet.resist = null; sheet.resistFrom = null; sheet.resistStrength = null;
  layersChanged(sheet);
  wrote(sheet);
}

/** Blot the surface film through a binary mask. Pore water and settled pigment remain.
 * Dry cells and cells with only pore moisture release nothing.
 * Returns removed {water, pigment} for inventory accounting. */
export function blot(sheet, mask, { strength = 0.85, pigmentShare = 0.9 } = {}) {
  if (!mask || mask.length !== sheet.n) throw new RangeError(`blot needs a mask of the sheet's ${sheet.n} cells`);
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new RangeError('blot strength must be between 0 and 1');
  if (!Number.isFinite(pigmentShare) || pigmentShare < 0 || pigmentShare > 1) throw new RangeError('blot pigmentShare must be between 0 and 1');
  // a blot is a call, like a resist: a replay without it keeps the water and the pigment the tissue took away
  if (TAPE && sheet._tape) TAPE.push({ k: 'b', m: Array.from(mask), s: strength, p: pigmentShare });
  coherent(sheet);
  const { W, M, G, K, n } = sheet, film = DEFAULTS.film, pigment = new Array(K).fill(0);
  let water = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || !M[i] || W[i] < film) continue;   // no film under the tissue
    const dw = W[i] * strength; W[i] -= dw; water += dw;
    for (let k = 0; k < K; k++) { const Gk = G[k], q = Gk[i] * pigmentShare; Gk[i] -= q; pigment[k] += q; }
  }
  wrote(sheet);
  return { water, pigment };
}

/** A touch too dry to stand as water: the water goes into the pores (any excess stays as a film) and the pigment
 *  is laid on the fibres it touched. */
export function depositDry(sheet, i, water, pig) {
  if (masked(sheet, i)) { deposit(sheet, i, water, pig); return; }   // it stands on the film, it does not soak in
  const room = Math.max(0, sheet.paper.capacity[i] - sheet.s[i]), into = Math.min(room, water);
  sheet.s[i] += into; sheet.wetDirty = 1;
  if (water > into) deposit(sheet, i, water - into, null);
  if (pig) for (let k = 0; k < sheet.K; k++) if (pig[k]) sheet.D[k][i] += pig[k];
}

/** A touch of paint on the paper: empty pores drink what they can at once, filtering their share of the pigment onto
 *  the fibres; the rest stands on the surface as water carrying its pigment. A dry-brush film soaks in where it lands;
 *  a loaded brush leaves most of its water standing, and that flows as a wash. */
export function soak(sheet, i, water, pig) {
  if (water <= 0) return;
  if (masked(sheet, i)) { deposit(sheet, i, water, pig); return; }   // sealed: everything stays on the surface
  const room = Math.max(0, sheet.paper.capacity[i] - sheet.s[i]) * (sheet.M[i] ? 0.3 : 1), into = Math.min(room, water), f = into / water;
  sheet.s[i] += into; sheet.wetDirty = 1;
  // Water a brush was deliberately drawn over the paper to leave belongs to the wash even when the pores take
  // all of it and nothing stands. A damp brush drawn along a wet edge works exactly that way, and the wash has
  // to be able to run out onto it. Water that only wicked there through the pores does not count: if it did,
  // every drying wash would creep into its own halo. `wetting` is set while such a stroke is being made.
  if (sheet.wetting && into > 0) sheet.ever[i] = 1;
  if (pig) for (let k = 0; k < sheet.K; k++) if (pig[k]) sheet.D[k][i] += pig[k] * f;
  if (water > into) depositScaled(sheet, i, water - into, pig, 1 - f);
}
// deposit(sheet, i, water, pig && pig.map(v => v * g)) without making the array: soak runs once per touched cell
const depositScaled = (sheet, i, water, pig, g) => {
  sheet.W[i] += water; sheet.M[i] = 1; sheet.ever[i] = 1; sheet.wetDirty = 1;
  if (pig) for (let k = 0; k < sheet.K; k++) { const v = pig[k] * g; if (v) sheet.G[k][i] += v; }
};

// The part of the sheet still worth working: what is wet, plus pores still holding water. Paper this close to dry is
// finished, and leaving it out keeps every later step cheap.
const bounds = sheet => {
  const { w, h, M, s, paper } = sheet; let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) if (M[r + x] || s[r + x] > 0.02 * paper.capacity[r + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return x1 < 0 ? null : [Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(w - 1, x1 + 2), Math.min(h - 1, y1 + 2)];
};

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1]; // neighbour order: +x, -x, +y, -y
// a dry cell with paper this wash covers (water now, or wetted before) within R cells in each of the four directions:
// a small hole inside the wash rather than its outside (stepBox, holeSpan; the same test in sheet-kernel.mjs)
function heldHole(M, ever, w, h, x, y, R) {
  for (let d = 0; d < 4; d++) {
    let held = false;
    for (let k = 1; k <= R; k++) {
      const xx = x + DX[d] * k, yy = y + DY[d] * k; if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
      const j = yy * w + xx; if (M[j] || ever[j]) { held = true; break; }
    }
    if (!held) return false;
  }
  return true;
}
// working buffers for a sheet, full size and reused every step (allocating them per step dominated the run time)
function scratch(sheet) {
  if (sheet.scratch && sheet.scratch.n === sheet.n && sheet.scratch.K === sheet.K) return sheet.scratch;
  const { n, K, h } = sheet, f = () => F32(n), per = () => Array.from({ length: K }, f);
  sheet.scratch = { n, K, fx: f(), fy: f(), out: f(), C: f(), wsc: f(), dW: f(), went: f(), qx: per(), qy: per(), pout: per(), dG: per(), sNext: f(), PNext: per(), dDep: per(), dSlide: per(), dep: f(), ex: new Float32Array(4), mobility: new Float32Array(K), fl: new Float32Array(K), rhoOf: new Float64Array(K), omegaOf: new Float64Array(K), gammaOf: new Float64Array(K), dra: new Int32Array((n >> 1) + h + 8), drb: new Int32Array((n >> 1) + h + 8), drow: new Int32Array(h + 2), pxa: new Int32Array((n >> 1) + h + 8), pxb: new Int32Array((n >> 1) + h + 8), prow: new Int32Array(h + 2), tmA: new Int32Array(3 * (sheet.w >> 1) + 16), tmB: new Int32Array(3 * (sheet.w >> 1) + 16), dlo: I32(h), dhi: I32(h), plo: I32(h), phi: I32(h), rlo: I32(h), rhi: I32(h), wlo: I32(h), whi: I32(h), wl: I32(n), wrow: I32(h + 1), wf: U8(n), act: new Int32Array(K), act3: new Int32Array(K), ggOf: new Float64Array(K), liftOf: new Float64Array(K), scourOf: new Float64Array(K), repOf: new Float64Array(K), surf: [], surfOf: new Int32Array(2 * K), pact: new Int32Array(K), moved: new Uint8Array(K), newly: [], drying: [] };
  return sheet.scratch;
}
const hashCell = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
// The pinning throat of each cell, hashCell(j, 0) - 0.5, depends on the cell's index alone, so it is worked out once
// for the largest sheet seen and looked up.
let THROATS = new Float64Array(0);
function throatTable(n) {
  if (THROATS.length < n) { const t = new Float64Array(n); for (let j = 0; j < n; j++) t[j] = hashCell(j, 0) - 0.5; THROATS = t; }
  return THROATS;
}

// Permeability of each face between cells, towards +x and +y: water on damp paper runs along the fibres and is held up
// across them, as in MoXi (Chu and Tai 2005). An advancing front fingers into the paper instead of spreading as a disc.
const PERM = new WeakMap();
export function permeability(paper) {
  if (PERM.has(paper)) return PERM.get(paper);
  const { w, h, fdx, fdy, grain } = paper, px = new Float32Array(w * h), py = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    px[i] = x < w - 1 ? 0.5 * (Math.abs(fdx[i]) * grain[i] + Math.abs(fdx[i + 1]) * grain[i + 1]) : 0;
    py[i] = y < h - 1 ? 0.5 * (Math.abs(fdy[i]) * grain[i] + Math.abs(fdy[i + w]) * grain[i + w]) : 0;
  }
  const out = { px, py }; PERM.set(paper, out); return out;
}

/** Step separated wet passages independently to avoid scanning the dry space between them.
 * Water moves one cell per step, so boxes two cells apart cannot interact.
 * Group 8-connected wet tiles, grow their bounds by the margin, then merge overlaps to avoid duplicate steps. */
const TILE = 32;
// the tile map and its walk are reused: allocating them each step cost more than the boxes saved on a small sheet
function tiles(sheet) {
  const tw = Math.ceil(sheet.w / TILE), th = Math.ceil(sheet.h / TILE);
  if (!sheet.tiles || sheet.tiles.tw !== tw || sheet.tiles.th !== th) sheet.tiles = { tw, th, on: U8(tw * th), seen: new Uint8Array(tw * th), stack: new Int32Array(tw * th) };
  return sheet.tiles;
}
function wetBoxes(sheet, margin = 2) {
  const { w, h, M, s, paper } = sheet, T = tiles(sheet), { tw, th, on, seen, stack } = T;
  on.fill(0); seen.fill(0);
  // Where to look. Water only enters the sheet through deposit and soak (a brush, a dip), and inside a step it moves
  // one cell, so unless something has put water down since the last step the wet area is inside the last step's boxes.
  // Scanning those instead of the whole sheet is what keeps a small passage on a big sheet cheap.
  const scan = sheet.wetDirty || !T.boxes ? [[0, 0, w - 1, h - 1]] : T.boxes;
  // A tile is wet once any cell in it is, so a row stops looking inside a tile at its first wet cell, and skips a tile
  // an earlier row already found.
  const capacity = paper.capacity;
  // the whole sheet, after a brush has put water down, is scanned by the threads in rows of tiles
  if (!(PAR && scan.length === 1 && scan[0][2] === w - 1 && scan[0][3] === h - 1 && scan[0][0] === 0 && scan[0][1] === 0 && PAR.tileScan(sheet, T, TILE))) for (const [bx0, by0, bx1, by1] of scan) {
    for (let y = by0; y <= by1; y++) {
      const r = y * w, tr = ((y / TILE) | 0) * tw;
      for (let x = bx0; x <= bx1;) {
        const tx = (x / TILE) | 0, xe = Math.min(bx1, tx * TILE + TILE - 1);
        if (!on[tr + tx]) for (let xx = x; xx <= xe; xx++) if (M[r + xx] || s[r + xx] > 0.02 * capacity[r + xx]) { on[tr + tx] = 1; break; }
        x = xe + 1;
      }
    }
  }
  sheet.wetDirty = 0;
  const boxes = [];
  for (let t = 0; t < on.length; t++) {
    if (!on[t] || seen[t]) continue;
    let top = 0; stack[top++] = t; seen[t] = 1; let a = tw, b = th, c = -1, d = -1;
    while (top) {
      const q = stack[--top], qx = q % tw, qy = (q / tw) | 0;
      if (qx < a) a = qx; if (qx > c) c = qx; if (qy < b) b = qy; if (qy > d) d = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = qx + dx, yy = qy + dy; if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue;
        const u = yy * tw + xx; if (on[u] && !seen[u]) { seen[u] = 1; stack[top++] = u; }
      }
    }
    // tiles round the box out to 32 cells; tighten it to the wet cells inside, so a narrow passage is not stepped as a
    // tile-wide band
    const tx0 = a * TILE, ty0 = b * TILE, tx1 = Math.min(w - 1, (c + 1) * TILE - 1), ty1 = Math.min(h - 1, (d + 1) * TILE - 1);
    // Each row is read from the left to its first wet cell and from the right down to the widest found so far: the box
    // is the same as reading every cell, without reading the middle of every row.
    let ax = w, ay = h, bx = -1, by = -1;
    for (let y = ty0; y <= ty1; y++) {
      const r = y * w; let first = -1;
      for (let x = tx0; x <= tx1; x++) if (M[r + x] || s[r + x] > 0.02 * capacity[r + x]) { first = x; break; }
      if (first < 0) continue;
      if (first < ax) ax = first; if (y < ay) ay = y; if (y > by) by = y; if (first > bx) bx = first;
      for (let x = tx1; x > bx; x--) if (M[r + x] || s[r + x] > 0.02 * capacity[r + x]) { bx = x; break; }
    }
    if (bx < 0) continue;
    boxes.push([Math.max(0, ax - margin), Math.max(0, ay - margin), Math.min(w - 1, bx + margin), Math.min(h - 1, by + margin)]);
  }
  // merge boxes that overlap once grown by the margin, so a cell is never stepped twice
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3]) {
      boxes[i] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
      boxes.splice(j, 1); i--; break;
    }
  }
  T.boxes = boxes;
  return boxes;
}

/** One step. Returns false when nothing is wet or damp. */
// The mark tape records the water schedule too. A tape of strokes alone replays as a black blob: pigment keeps
// accumulating because nothing ever flows or dries it, and the schedule of step and dry between the marks is what
// makes a watercolour rather than a puddle.
let TAPE = null;
export const tapeSheet = t => { TAPE = t; };
// A flow that happens halfway through a stroke is not a flow after it. While a stroke is being recorded its own
// flows are collected here, as step indices within that stroke, instead of landing in the tape as separate entries
// that a replay would run afterwards.
let STROKEFLOWS = null, STROKESTEP = null;
export const collectFlows = (a, at) => { STROKEFLOWS = a; STROKESTEP = at; };

export function step(sheet, o = DEFAULTS) {
  // a flow inside a stroke is recorded at its position in that stroke; a flow between strokes is its own entry
  if (TAPE && sheet._tape) { if (STROKEFLOWS) STROKEFLOWS.push(STROKESTEP()); else TAPE.push({ k: 'f' }); }
  if (o !== DEFAULTS) o = { ...DEFAULTS, ...o };
  if (!Number.isFinite(o.dt) || o.dt < 0) throw new RangeError('dt must be finite and nonnegative');
  if (sheet._gpu && !sheet._gpu.paused) return sheet._gpu.step(sheet, o);
  const boxes = wetBoxes(sheet); if (!boxes.length) return false;
  if (o.dt === 0) return true;
  if (PAR) { const H = { scratch: scratch(sheet), perm: permeability(sheet.paper), throats: throatTable(sheet.n) }; for (const box of boxes) if (!PAR.stepBox(sheet, o, box, H)) stepBox(sheet, o, box); }
  else for (const box of boxes) stepBox(sheet, o, box);
  sheet.steps++;
  return true;
}

function stepBox(sheet, o, box) {
  const [x0, y0, x1, y1] = box, { w, h, W, s, M, G, D, P, K, paper, pigments, edge, resist, ever } = sheet, { capacity, fdx, fdy, grain } = paper, height = paper.valley || paper.height, dt = o.dt ?? 1;
  // fine pigment (dyes, small particles) travels with water into and through the fibres; coarse, granulating pigment stays on top
  const sc = scratch(sheet), { mobility } = sc;
  for (let k = 0; k < K; k++) mobility[k] = pigments[k].wick ?? Math.max(0.05, Math.min(0.9, 1 - pigments[k].gamma));

  // distance to the pinned boundary, in cells, capped at edgeWidth + 1. The wash is pinned where it met dry paper; a gap
  // that opens inside it as it dries is a receding line, not a pinned one, and does not dry faster (no rim around it)
  // and, in the same pass, where the water lies in each row. Most of a passage's box is dry, and everything the
  // water does is within a cell or two of a wet cell, so each row's own span, widened by two and by its neighbouring
  // rows, is enough for every pass that clears, scans or applies within the flow. The pores and the wet front reach further, to any cell that still holds water: they get
  // a second, wider span taken the same way. Beyond both, a cell is dry paper with nothing within two cells of it, and
  // every pass would leave it exactly as it is.
  // The same pass lists the wet cells in raster order (wl, with wrow[y] the first of row y). Wetness does not change
  // until the wet fronts at the end of the step, and fewer than half the cells in a row span are wet, so every pass
  // that works only on wet cells walks the list. wf holds, per listed cell, which of its faces meet another wet cell
  // inside the box: 1 +x, 2 +y, 4 -x, 8 -y.
  const edgeWidth = o.edgeWidth, cap = edgeWidth + 1, { rlo, rhi, wlo, whi, dlo, dhi, plo, phi, wl, wrow, wf, dra, drb, drow, pxa, pxb, prow, tmA, tmB } = sc;
  let nw = 0, nd = 0;
  for (let y = y0; y <= y1; y++) {
    const r = y * w; let a = -1, b = -1, c = -1, d = -1, rs = -1, re = -1;
    wrow[y] = nw; drow[y] = nd;
    for (let x = x0; x <= x1; x++) {
      const i = r + x, m = M[i];
      if (m) { if (a < 0) a = x; b = x; wl[nw++] = i; }
      if (m || s[i] > 0) { if (c < 0) c = x; d = x; if (rs < 0) rs = x; else if (x - re > 4) { dra[nd] = rs; drb[nd++] = re; rs = x; } re = x; }
    }
    if (rs >= 0) { dra[nd] = rs; drb[nd++] = re; }
    rlo[y] = a; rhi[y] = b; dlo[y] = c; dhi[y] = d;
  }
  wrow[y1 + 1] = nw; drow[y1 + 1] = nd;
  // The cells the pore passes work on, as runs per row: each row's damp runs and its neighbours' rows', widened by
  // two and merged.
  let np = 0;
  for (let y = y0; y <= y1; y++) {
    prow[y] = np;
    let cnt = 0;
    for (let q = -1; q <= 1; q++) {
      const yy = y + q; if (yy < y0 || yy > y1) continue;
      for (let r = drow[yy], e = drow[yy + 1]; r < e; r++) {
        const A = dra[r] - 2 < x0 ? x0 : dra[r] - 2, B = drb[r] + 2 > x1 ? x1 : drb[r] + 2;
        let j = cnt++; while (j > 0 && tmA[j - 1] > A) { tmA[j] = tmA[j - 1]; tmB[j] = tmB[j - 1]; j--; }
        tmA[j] = A; tmB[j] = B;
      }
    }
    for (let j = 0; j < cnt; j++) {
      if (np > prow[y] && tmA[j] <= pxb[np - 1] + 1) { if (tmB[j] > pxb[np - 1]) pxb[np - 1] = tmB[j]; }
      else { pxa[np] = tmA[j]; pxb[np++] = tmB[j]; }
    }
  }
  prow[y1 + 1] = np;
  for (let y = y0; y <= y1; y++) {
    let a = w, b = -1, c = w, d = -1;
    for (let q = -1; q <= 1; q++) {
      const yy = y + q; if (yy < y0 || yy > y1) continue;
      if (rhi[yy] >= 0) { if (rlo[yy] < a) a = rlo[yy]; if (rhi[yy] > b) b = rhi[yy]; }
      if (dhi[yy] >= 0) { if (dlo[yy] < c) c = dlo[yy]; if (dhi[yy] > d) d = dhi[yy]; }
    }
    if (b < 0) { wlo[y] = 0; whi[y] = -1; } else { wlo[y] = Math.max(x0, a - 2); whi[y] = Math.min(x1, b + 2); }
    if (d < 0) { plo[y] = 0; phi[y] = -1; } else { plo[y] = Math.max(x0, c - 2); phi[y] = Math.min(x1, d + 2); }
  }
  // the distance starts at the cap on water and on paper this wash has covered, 0 elsewhere; it is read only at wet cells
  // and their neighbours, all inside the rows' wet spans, so only those are set
  // holeSpan (set by paint-plate's --holerim only when used): a dry hole the wash holds on all four sides within that
  // many cells is not a drying edge. The faster drying at a wash's edge is the vapour escaping past a convex edge into
  // the dry paper beyond; over a hole a millimetre or two across inside the wash the air is as damp as over the film, so
  // its rim dries at the film's rate. Without this every tooth pit the brush skipped (cold press) dries as a white dot
  // in a dark ring. The hole still shows as paper.
  const holeSpan = o.holeSpan ?? 0;
  for (let y = y0; y <= y1; y++) { const r = y * w; for (let i = r + wlo[y], e = r + whi[y]; i <= e; i++) edge[i] = M[i] || ever[i] || (holeSpan > 0 && heldHole(M, ever, w, h, i - r, y, holeSpan)) ? cap : 0; }
  for (let y = y0; y <= y1; y++) {
    const r = y * w;
    for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) {
      const i = wl[q], x = i - r;
      wf[q] = (x < x1 && M[i + 1] ? 1 : 0) | (y < y1 && M[i + w] ? 2 : 0) | (x > x0 && M[i - 1] ? 4 : 0) | (y > y0 && M[i - w] ? 8 : 0);
    }
  }
  for (let y = y0; y <= y1; y++) { const r = y * w; for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) { const i = wl[q], x = i - r; const a = x > 0 ? edge[i - 1] : 0, c = y > 0 ? edge[i - w] : 0; edge[i] = Math.min(edge[i], a + 1, c + 1); } }
  for (let y = y1; y >= y0; y--) { const r = y * w; for (let q = wrow[y + 1] - 1, e = wrow[y]; q >= e; q--) { const i = wl[q], x = i - r; const a = x < w - 1 ? edge[i + 1] : 0, c = y < h - 1 ? edge[i + w] : 0; edge[i] = Math.min(edge[i], a + 1, c + 1); } }

  // The pigments suspended anywhere in this box's water. A sheet carries every pigment of the palette, the ink and the
  // accents, and the water of one passage holds two or three of them. A pigment with none takes no part in drying or
  // flow (every term it would add is zero), so both walk only the ones listed here.
  const act = sc.act; let nA = 0;
  for (let k = 0; k < K; k++) { const Gk = G[k]; for (let q = 0; q < nw; q++) if (Gk[wl[q]] !== 0) { act[nA++] = k; break; } }

  // 1. drying, faster at the pinned boundary; absorption into the pores without tearing the film
  const evap = o.evap, edgeEvap = o.edgeEvap, absorb = o.absorb, oFilm = o.film;
  for (let q = 0; q < nw; q++) {
    const i = wl[q];
    const near = edge[i] <= edgeWidth ? 1 - (edge[i] - 1) / edgeWidth : 0;
    W[i] = Math.max(0, W[i] - dt * (evap + edgeEvap * near));
    const a = Math.min(dt * absorb, Math.max(0, capacity[i] - s[i]), Math.max(0, W[i] - oFilm));
    if (a > 0) { const aw = a / W[i]; for (let n = 0; n < nA; n++) { const k = act[n], Gk = G[k], g = Gk[i] * aw * mobility[k]; Gk[i] -= g; P[k][i] += g; } }
    s[i] += a; W[i] -= a;
  }

  // 2. water levels out and carries pigment; pigment also diffuses; all outflows share each cell's budget. A thin film
  //    barely flows (its conductance falls with the square of its depth), so a wash that has thinned dries where it is
  //    instead of pulling pigment into rims around every island that dries first.
  // Face conductance is the fibres' permeability (1 - ff + ff (0.25 + 1.75 perm)) times the flow rate times the upwind
  // depth's conductance (min(1, (max depth / flowDepth)^2)), so a deep wash still feeds its thin pinned edge. It is
  // written out at each face because closures are slower here.
  const perm = permeability(paper), px = perm.px, py = perm.py, ff = o.fibreFlow ?? 0.6, flowDepth = o.flowDepth ?? 0.12, flow = o.flow, slope = o.slope;
  // Paint dropped into clean water spreads over it: its binder lowers the surface tension, and the water surface is pulled
  // towards the higher tension of the clean water around it (Marangoni flow), carrying the pigment out; the front
  // breaks into fingers as it runs over the uneven paper. Pigment concentration stands in for the binder that comes
  // with it.
  const mar = o.marangoni ?? 0;
  const { fx, fy, out, C, wsc, dW, went, qx: QX, qy: QY, pout: POUT, dG: DG } = sc;
  const diffuse = Math.min(0.25, Math.max(0, o.diffuse)), cd = o.carryDepth ?? 0.08, iters = o.flowIters, fdf = Math.max(0, o.filmDiffuse ?? 0), fdd = o.filmDepth ?? 0.03;
  // No buffer is cleared by the row. The accumulators (out, dW, pout, dG) are set back to zero by the pass that spends
  // them, at the wet cells, which are the only cells they are ever written at; fx and fy are read only at faces written
  // this iteration; went is overwritten by the first iteration.
  // How much water crossed each cell this step, summed over the flow iterations. Still water and moving water
  // do different things to a deposit that has not set, and the difference is what a backrun is made of.
  if (!(iters > 0)) for (let q = 0; q < nw; q++) went[wl[q]] = 0;
  for (let it = 0; it < iters; it++) {
    if (mar) for (let q = 0; q < nw; q++) { const i = wl[q]; if (W[i] < 1e-4) { C[i] = 0; continue; } let c = 0; for (let k = 0; k < K; k++) c += G[k][i]; C[i] = Math.min(2, c / W[i]); }
    // Permeability can exceed one. Bounding flow alone does not bound the explicit stencil.
    for (let q = 0; q < nw; q++) {
      const fl = wf[q]; if (!(fl & 3)) continue;
      const i = wl[q], hi = W[i] + slope * height[i];
      if (fl & 1) {
        const j = i + 1, p = 1 - ff + ff * (0.25 + 1.75 * px[i]), m = Math.max(W[i], W[j]) / flowDepth, rate = Math.min(0.25, Math.max(0, p * flow * (m >= 1 ? 1 : m * m)));
        const f = rate * (hi - W[j] - slope * height[j]) + (mar ? p * mar * (C[i] - C[j]) * Math.min(W[i], W[j]) : 0);
        fx[i] = f; out[i] += Math.max(0, f); out[j] += Math.max(0, -f);
      }
      if (fl & 2) {
        const j = i + w, p = 1 - ff + ff * (0.25 + 1.75 * py[i]), m = Math.max(W[i], W[j]) / flowDepth, rate = Math.min(0.25, Math.max(0, p * flow * (m >= 1 ? 1 : m * m)));
        const f = rate * (hi - W[j] - slope * height[j]) + (mar ? p * mar * (C[i] - C[j]) * Math.min(W[i], W[j]) : 0);
        fy[i] = f; out[i] += Math.max(0, f); out[j] += Math.max(0, -f);
      }
    }
    for (let q = 0; q < nw; q++) { const i = wl[q]; wsc[i] = out[i] > W[i] * 0.95 ? (W[i] * 0.95) / out[i] : 1; out[i] = 0; }
    // a thin film still creeps, but the pigment in it has settled against the fibres and stays (MoXi's hindrance: pigment
    // does not follow slow water), so a wash that parts as it dries does not pull its pigment into rims around each gap
    // each face moves water upwind and its pigment with it, plus a little diffusion; fluxes are kept per face so every
    // cell's outflow can share its budget before anything moves
    // Both faces of every wet cell, inlined, with the flux written straight into the per-pigment buffers (hoisted out
    // of the inner loop for speed).
    // A cell's water is last read by its own two faces (the faces from the cells above and to its left came earlier),
    // so its change is applied as soon as they are done, rounding to the buffer's precision at each step as the buffer
    // did; how much water crossed it is summed in the same visit.
    for (let q = 0; q < nw; q++) {
      const i = wl[q], fl = wf[q];
      let dw = dW[i];
      for (let dir = 0; dir < 2; dir++) {
        if (!(fl & (dir + 1))) continue;
        const j = dir === 0 ? i + 1 : i + w;
        const f = dir === 0 ? fx[i] : fy[i], Q = dir === 0 ? QX : QY;
        const sgn = f > 0 ? 1 : f < 0 ? -1 : 0, amt = f === 0 ? 0 : (f > 0 ? f : -f) * wsc[f > 0 ? i : j];
        dw = Math.fround(dw - sgn * amt); dW[j] += sgn * amt;
        const wi = W[i], wj = W[j], mw = wi < wj ? wi : wj;
        const mi = wi / cd, mj = wj / cd, carryI = mi >= 1 ? 1 : mi * mi, carryJ = mj >= 1 ? 1 : mj * mj, carryM = carryI < carryJ ? carryI : carryJ;
        for (let n = 0; n < nA; n++) {
          const k = act[n], Gk = G[k], ci = wi > 1e-6 ? Gk[i] / wi : 0, cj = wj > 1e-6 ? Gk[j] / wj : 0;
          const v = sgn * amt * (f > 0 ? ci * carryI : cj * carryJ) + (diffuse * carryM + (fdf ? Math.min(0.2, fdf * Math.min(1, mw / fdd)) : 0)) * (ci - cj) * mw; // signed, i -> j
          Q[k][i] = v; if (v > 0) POUT[k][i] += v; else POUT[k][j] -= v;
        }
      }
      dW[i] = 0; if (dw) W[i] = Math.max(0, W[i] + dw);
      const v = 0.5 * ((fl & 1 ? Math.abs(fx[i]) : 0) + (fl & 2 ? Math.abs(fy[i]) : 0) + (fl & 4 ? Math.abs(fx[i - 1]) : 0) + (fl & 8 ? Math.abs(fy[i - w]) : 0));
      went[i] = it === 0 ? v : went[i] + v;
    }
    for (let n = 0; n < nA; n++) {
      const k = act[n], Gk = G[k], po = POUT[k], qx = QX[k], qy = QY[k], dG = DG[k];
      // The donor's share of its own budget is worked out at the face that spends it, since only the wet faces ever
      // read it. A cell's budget and its
      // pigment are read last by its own faces, so the budget is cleared and the change applied there.
      for (let q = 0; q < nw; q++) {
        const i = wl[q], fl = wf[q];
        let d = dG[i];
        if (fl & 1) { const qq = qx[i], m = qq > 0 ? i : i + 1, v = qq * (po[m] > Gk[m] * 0.95 ? (Gk[m] * 0.95) / po[m] : 1); d = Math.fround(d - v); dG[i + 1] += v; }
        if (fl & 2) { const qq = qy[i], m = qq > 0 ? i : i + w, v = qq * (po[m] > Gk[m] * 0.95 ? (Gk[m] * 0.95) / po[m] : 1); d = Math.fround(d - v); dG[i + w] += v; }
        po[i] = 0; dG[i] = 0;
        if (d) Gk[i] = Math.max(0, Gk[i] + d);
      }
    }
  }

  if (o.phases12Only) return; // GPU port benchmark: stop after drying, absorption and flow

  // 3. pigment between water and paper (Computer-Generated Watercolor, section 4.5): hollows adsorb faster, peaks release faster (granulation);
  //    settling grows as the film thins; loose pigment lifts while its binder is wet; dried layers lift a little
  // the pigments' own constants, read out of the objects once instead of once per cell per pigment
  const { rhoOf, omegaOf, gammaOf } = sc;
  for (let k = 0; k < K; k++) { rhoOf[k] = pigments[k].rho; omegaOf[k] = pigments[k].omega; gammaOf[k] = pigments[k].gamma; }
  const gran = o.gran ?? 1, liftDepth = o.liftDepth ?? 0.15, scour = o.scour ?? 0, holdCap = o.hold ?? Infinity;
  const settle = o.settle, lift = o.lift, looseLift = o.looseLift, rewetLift = o.rewetLift;
  // how much deposit fills a hollow: 0 keeps a fixed bias towards hollows
  const granFill = o.granFill ?? 0;
  const settled = sc.dep;
  if (granFill > 0) for (let q = 0; q < nw; q++) { const i = wl[q]; let d = 0; for (let k = 0; k < K; k++) d += D[k][i]; settled[i] = d; }
  const topLayer = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
  // The pigments this can touch: suspended (listed above), deposited, or in the layer below where the water is deep
  // enough to lift it. For any other pigment every term below is zero, and so is its share of the stranded film and of
  // the slide after, so all three walk only these.
  const act3 = sc.act3; let n3 = 0;
  for (let k = 0, a = 0; k < K; k++) {
    let on = a < nA && act[a] === k;
    if (on) a++;
    if (!on) { const Dk = D[k]; for (let q = 0; q < nw; q++) if (Dk[wl[q]] !== 0) { on = true; break; } }
    if (!on && topLayer !== null) { const top = topLayer[k]; for (let q = 0; q < nw; q++) { const i = wl[q]; if (top[i] !== 0 && W[i] > oFilm) { on = true; break; } } }
    if (on) act3[n3++] = k;
  }
  // each pigment's own factors, in the order the expressions below multiply them: gamma * gran, (rho / omega) * lift *
  // looseLift, scour / omega, repose / (gamma * gran)
  const { ggOf, liftOf, scourOf, repOf } = sc;
  for (let n = 0; n < n3; n++) { const k = act3[n]; ggOf[k] = gammaOf[k] * gran; liftOf[k] = (rhoOf[k] / omegaOf[k]) * lift * looseLift; scourOf[k] = scour / omegaOf[k]; }
  for (let q = 0; q < nw; q++) {
    const i = wl[q];
    // Sealed paper has no fibres for pigment to reach: the wash passes over the masking film and takes its pigment
    // with it. Letting it settle here would fix a stain that the film is about to be rubbed off from.
    if (resist !== null && resist[i]) continue;
    const Wi = W[i], hh = height[i], thin = Math.min(3, 0.12 / Math.max(0.04, Wi)), ld = Wi / liftDepth, wetting = ld >= 1 ? 1 : ld * ld; // settled pigment lifts only into water deep enough to hold it
    const rewet = topLayer !== null && Wi > oFilm, turnover = Wi > 1e-6 ? Math.min(1, went[i] / Wi) : 0;
    for (let n = 0; n < n3; n++) {
      const k = act3[n], Gk = G[k], Dk = D[k];
      // nothing suspended, nothing deposited and nothing in the layer below to lift: every term is zero
      if (Gk[i] === 0 && Dk[i] === 0 && !(rewet && topLayer[k][i] !== 0)) continue;
      const rho = rhoOf[k], omega = omegaOf[k];
      // A hollow that has taken pigment stops being a hollow. A bias fixed by the paper's relief alone would settle
      // every wash into the same cells and the pattern would compound. The slide two blocks below already rolls grains
      // over the filled surface (dep). This does the same for the settling: granFill cells of deposit cancel one cell
      // of relief, so one wash granulates and the next six find the tooth already full.
      const filled = granFill > 0 ? Math.min(1, hh + settled[i] * granFill) : hh;
      const gg = ggOf[k], down = Gk[i] * Math.max(0, 1 - filled * gg) * rho * settle * thin * dt;
      // Still water lifts a deposit slowly, over time. A current scours it: the water crossing the cell this
      // step takes loose grains with it and drops them again where it slows. Clean water run into a wash that
      // has begun to set spreads outwards, scours as it goes, and piles what it carries at the front where
      // the push dies out: the dark scalloped line of a backrun, with pale paper behind it. What is taken
      // goes by how much of the cell's water was replaced, not by how long the water sat there, and a
      // staining pigment holds on (omega) while a loose one goes.
      const shape = Math.max(0, 1 + (hh - 1) * gg);
      const up = Dk[i] * shape * (liftOf[k] * wetting * dt + scourOf[k] * turnover * wetting);
      const dn = Math.min(Gk[i], Math.max(0, down)), u = Math.min(Dk[i], Math.max(0, up));
      Dk[i] += dn - u; Gk[i] += u - dn;
      if (rewet) { const top = topLayer[k], r = Math.min(top[i], (top[i] * rewetLift * dt) / omega); top[i] -= r; Gk[i] += r; }
    }
    // a film cannot keep suspended more particles than it has room for: as it thins, what it cannot hold is stranded on
    // the paper where it is. Without this, a nearly dry cell's pigment rode out on the last trace of its water and piled
    // into single cells, a pepper of dark dots.
    let gs = 0; for (let n = 0; n < n3; n++) gs += G[act3[n]][i];
    const hold = holdCap * Wi;
    if (gs > hold) { const f = 1 - hold / gs; for (let n = 0; n < n3; n++) { const k = act3[n], q2 = G[k][i] * f; G[k][i] -= q2; D[k][i] += q2; } }
  }
  // Settled particles do not stay where they land. Heavy grains on wet paper roll off the crests of the fibres, and a
  // thinning film, pulled down between the fibres by its meniscus, pushes them into the hollows: granulating pigment
  // leaves the hills bare and collects in the hollows. Loose pigment moves to lower neighbours, most while the film is
  // thin but still wet, down any slope steeper than its grains can rest on: fine grains cling to the fibres, coarse
  // ones (high granulation) roll down gentle slopes. The grains fill the hollow they collect in (the surface they roll
  // over is the paper plus the pigment already on it), so a hollow fills until it is no steeper than they rest on. A
  // next-state buffer keeps it unbiased. Flocculating pigment (floc) settles as clumps too big for the hollows between
  // fibres: the clumps bridge them and collect in the broader hollows of the paper's tooth, a softer, larger mottle.
  const slide = o.slide ?? 0, fill = o.slideFill ?? 1, repose = o.repose ?? 0, slideCap = o.slideCap ?? 0, { height: fibreH, tooth } = paper;
  if (slide > 0) {
    const { dSlide: dD, ex, fl, dep, moved: mv } = sc;
    for (let k = 0; k < K; k++) { fl[k] = pigments[k].floc ?? 0; mv[k] = 0; }
    // fixedBed also retains the support supplied by bound, older glazes. Fixing pigment
    // changes its mobility, not the height of the filled hollow. Off preserves historical output.
    // the deposit each grain rolls over, at the wet cells, which are the only cells a grain leaves or reaches; the
    // buffer it moves into is cleared where it is spent
    for (let q = 0; q < nw; q++) { const i = wl[q]; let d = 0; for (let n = 0; n < n3; n++) d += D[act3[n]][i]; if (o.fixedBed > 0) for (const layer of sheet.layers) for (let k = 0; k < K; k++) d += layer[k][i]; dep[i] = fill * d; }
    // The surface a grain (or a clump) of pigment k rolls over, f1 * fibre + floc * tooth + deposit, is the same for
    // every pigment with the same floc: it is worked out once per floc at the wet cells, which are the only cells a
    // grain leaves or reaches, instead of five times per pigment per cell.
    const { surf, surfOf } = sc; let nSurf = 0;
    for (let n = 0; n < n3; n++) {
      const k = act3[n]; repOf[k] = repose / ggOf[k]; if (ggOf[k] <= 0) continue; // the pigments the walk below skips
      let m = 0; while (m < nSurf && fl[act3[surfOf[m]]] !== fl[k]) m++;
      if (m === nSurf) {
        if (surf.length <= m) surf.push(new Float64Array(sheet.n));
        const S = surf[m], fk = fl[k], f1 = 1 - fk;
        for (let q = 0; q < nw; q++) { const i = wl[q]; S[i] = f1 * fibreH[i] + fk * tooth[i] + dep[i]; }
        surfOf[nSurf++] = n;
      }
      surfOf[K + n] = m;
    }
    // the four neighbours in DX, DY order (+x, -x, +y, -y), with the face flag that says each is wet and in the box
    const nOff0 = 1, nOff1 = -1, nOff2 = w, nOff3 = -w;
    for (let q = 0; q < nw; q++) {
      const i = wl[q], Wi = W[i]; if (Wi <= 0) continue;
      const fg = wf[q];
      const film = Math.min(3, 0.12 / Math.max(0.04, Wi)) * (Wi > oFilm ? 1 : Wi / oFilm);
      for (let n = 0; n < n3; n++) {
        const k = act3[n], gg = ggOf[k]; const Dk = D[k]; if (gg <= 0 || Dk[i] <= 0) continue;
        const S = surf[surfOf[K + n]], rep = repOf[k];
        let sum = 0; const here = S[i];
        ex[0] = fg & 1 ? Math.max(0, here - S[i + nOff0] - rep) : 0; sum += ex[0];
        ex[1] = fg & 4 ? Math.max(0, here - S[i + nOff1] - rep) : 0; sum += ex[1];
        ex[2] = fg & 2 ? Math.max(0, here - S[i + nOff2] - rep) : 0; sum += ex[2];
        ex[3] = fg & 8 ? Math.max(0, here - S[i + nOff3] - rep) : 0; sum += ex[3];
        if (sum <= 0) continue;
        let moved = Dk[i] * Math.min(0.2, slide * gg * film * sum * dt); const dd = dD[k];
        // slideCap c: grains stop rolling when the slope is gone, so no move may reverse
        // the slope it rolled down. The surface falls by fill x moved here and rises by fill x moved x ex/sum at each
        // lower neighbour, closing that difference by fill x moved x (1 + ex/sum); the move is held to c of it. Without
        // the cap a cell could overfill its neighbour, the grains rolled back the next step, and neighbouring cells
        // traded them for ever: a regular checkerboard in heavily granulated washes. 0: no cap.
        if (slideCap > 0 && fill > 0) { let lim = Infinity; for (let e = 0; e < 4; e++) if (ex[e] > 0) lim = Math.min(lim, slideCap * ex[e] / (fill * (1 + ex[e] / sum))); if (moved > lim) moved = lim; }
        mv[k] = 1; dd[i] -= moved;
        if (ex[0] > 0) dd[i + nOff0] += moved * ex[0] / sum;
        if (ex[1] > 0) dd[i + nOff1] += moved * ex[1] / sum;
        if (ex[2] > 0) dd[i + nOff2] += moved * ex[2] / sum;
        if (ex[3] > 0) dd[i + nOff3] += moved * ex[3] / sum;
      }
    }
    for (let k = 0; k < K; k++) { if (!mv[k]) continue; const Dk = D[k], dd = dD[k]; for (let q = 0; q < nw; q++) { const i = wl[q], d = dd[i]; if (d) Dk[i] = Math.max(0, Dk[i] + d); dd[i] = 0; } }
  }

  // 4. capillary spread through the pores with a next-state buffer (Computer-Generated Watercolor, section 4.6). Water runs along the fibres more easily
  //    than across them (as in MoXi, Chu and Tai 2005), and along a well-aligned fibre it wicks a little way into dry
  //    paper, slowed by the sizing: no wet edge stays ruler straight. The water carries the pigment in its pores, and the
  //    fibres filter some of it out on the way.
  const { sNext, PNext, dDep } = sc;
  // The pigments with something in the pores of the worked area. Only they can move with the water, be filtered or be
  // left on the fibres as a pore dries; for the others each of those is zero, so their buffers are neither copied nor
  // walked. The pore water itself is always worked.
  const pact = sc.pact; let nP = 0;
  for (let k = 0; k < K; k++) {
    const Pk = P[k]; let any = false;
    for (let y = y0; y <= y1 && !any; y++) for (let r = prow[y], re = prow[y + 1]; r < re && !any; r++) for (let i = y * w + pxa[r], e = y * w + pxb[r]; i <= e; i++) if (Pk[i] !== 0) { any = true; break; }
    if (any) pact[nP++] = k;
  }
  // one pigment at a time, so a row's arrays are found once instead of once a cell, and the copy is a memmove
  for (let y = y0; y <= y1; y++) for (let r = prow[y], re = prow[y + 1]; r < re; r++) { const a = y * w + pxa[r], b = y * w + pxb[r] + 1; sNext.set(s.subarray(a, b), a); }
  for (let n = 0; n < nP; n++) { const k = pact[n], Pk = P[k], PN = PNext[k], dd = dDep[k]; for (let y = y0; y <= y1; y++) for (let r = prow[y], re = prow[y + 1]; r < re; r++) { const a = y * w + pxa[r], b = y * w + pxb[r] + 1; PN.set(Pk.subarray(a, b), a); dd.fill(0, a, b); } }
  // rate is at most 1.5: 2/3 keeps each face <= 1/4, so four donors cannot overfill a pore
  // and four outflows cannot empty one below zero. Large dt saturates this rate; it is not extra elapsed flow time.
  const capStep = Math.min(2 / 3, Math.max(0, o.capRate * dt * 10)), sizing = o.sizing ?? 0.85, filter = o.wickFilter ?? 0.2;
  const capEps = o.capEps, capDelta = o.capDelta;
  // A neighbour along x or y reads the fibre's alignment |fdx dx + fdy dy| as |fdx| or |fdy| exactly (the other term is
  // a signed zero), so it is read once per donor; the neighbours go in DX, DY order (+x, -x, +y, -y).
  for (let y = y0; y <= y1; y++) for (let r = prow[y], re = prow[y + 1]; r < re; r++) for (let x = pxa[r], xe = pxb[r]; x <= xe; x++) {
    const i = y * w + x, si = s[i]; if (si <= capEps * capacity[i]) continue;
    const gi = grain[i], alongX = Math.abs(fdx[i]) * gi, alongY = Math.abs(fdy[i]) * gi;
    for (let d = 0; d < 4; d++) {
      let j;
      if (d === 0) { if (x >= x1) continue; j = i + 1; } else if (d === 1) { if (x <= x0) continue; j = i - 1; } else if (d === 2) { if (y >= y1) continue; j = i + w; } else { if (y <= y0) continue; j = i - w; }
      const sj = s[j]; if (si <= sj) continue;
      const along = d < 2 ? alongX : alongY, rate = 0.5 + along;
      const open = sj > capDelta * capacity[j] ? 1 : (1 - sizing) * (0.4 + 0.6 * along); // crossing fibres wick too, aligned ones faster
      const ds = (Math.max(0, Math.min(si - sj, capacity[j] - sj)) / 4) * capStep * rate * open; if (ds <= 0) continue;
      const f = Math.min(1, ds / si);
      sNext[i] -= ds; sNext[j] += ds;
      const catchF = sj > capDelta * capacity[j] ? 0 : filter; // fibres catch pigment only where water enters dry paper, not between damp pores
      for (let n = 0; n < nP; n++) { const k = pact[n], q = P[k][i] * f; if (!q) continue; PNext[k][i] -= q; PNext[k][j] += q * (1 - catchF); dDep[k][j] += q * catchF; }
    }
  }

  // 5. wet fronts, re-wetting from saturated pores, drying back to paper
  const { newly, drying } = sc; newly.length = 0; drying.length = 0;
  // What the pores now hold, one pigment at a time. Nothing in the scan below reads a neighbour's pigment, so this
  // does not have to be interleaved with it.
  for (let n = 0; n < nP; n++) { const k = pact[n], Pk = P[k], PN = PNext[k], Dk = D[k], dd = dDep[k]; for (let y = y0; y <= y1; y++) for (let r = prow[y], re = prow[y + 1]; r < re; r++) for (let i = y * w + pxa[r], e = y * w + pxb[r]; i <= e; i++) { Pk[i] = Math.max(0, PN[i]); Dk[i] += dd[i]; } }
  const wetEps = o.wetEps, paperDry = o.paperDry, capSigma = o.capSigma, spill = o.spill, spillHeight = o.spillHeight, dampEase = o.dampEase, pinning = o.pinning ?? 0, pinFibre = o.pinFibre ?? 0, enclose = o.encloseEase ?? 0, holeFill = o.holeFill ?? 0;
  const throats = throatTable(sheet.n);
  for (let y = y0; y <= y1; y++) for (let r = prow[y], re = prow[y + 1]; r < re; r++) for (let x = pxa[r], xe = pxb[r]; x <= xe; x++) {
    const i = y * w + x;
    s[i] = Math.max(0, sNext[i]);
    if (W[i] <= wetEps && s[i] > 0) { // damp paper dries; the pigment in its pores stays on the fibres
      let d = Math.min(s[i], dt * paperDry); if (s[i] - d <= 0.02 * capacity[i]) d = s[i]; // the last trace goes at once, so the cell leaves the worked area
      const f = d / s[i]; s[i] -= d;
      for (let n = 0; n < nP; n++) { const k = pact[n], q = P[k][i] * f; P[k][i] -= q; D[k][i] += q; }
    }
    if (!M[i]) {
      // A dry cell inside the box and outside its row's wet span has no wet neighbour (the span reaches two cells past
      // the water in this row and the rows either side), so neither test below can pass there.
      if (x > x0 && x < x1 && y > y0 && y < y1 && (x < wlo[y] || x > whi[y])) continue;
      // saturated pores wet the surface only where standing water next to them can feed it (a backrun creeping from a
      // puddle), not everywhere a drying wash leaves damp paper (that flicker drew a foam of rims)
      // and, in the same walk round the four neighbours, whether surface tension closes the cell as a pinhole: a dry
      // cell held on four sides by water is covered
      let feeding = false, wn = 0, ws = 0, hn = 0;
      for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!M[j]) continue; wn++; ws += W[j]; hn += height[j]; if (W[j] > oFilm) feeding = true; }
      if (feeding && ever[i] && s[i] > capSigma * capacity[i]) { newly.push(i); continue; } // pores the wash has soaked, not paper that has only wicked
      if (wn >= 4 && ws / wn > oFilm) newly.push(i);
      // holeFill (set by paint-plate's --holefill only when used): a dry hollow the standing wash surrounds (water within
      // holeFill cells on all four sides) fills from the rim inwards where it is lower than the wet paper beside it. The
      // brush's liquid bridges the deepest pits of the tooth, but once the wash stands round a pit the water runs down
      // into it; a granulating paint then settles at its bottom. Left dry, the pit's sloping sides take the settling and
      // it dries as a white dot in a dark ring. Paper level with the wash (a
      // white kept on purpose) stays dry, and a thin film (dry brush) does not fill anything.
      else if (holeFill > 0 && wn > 0 && ws / wn > oFilm && height[i] < hn / wn && heldHole(M, M, w, h, x, y, holeFill)) newly.push(i);
      continue;
    }
    if (W[i] > wetEps) {
      for (let d = 0; d < 4; d++) {
        const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (M[j]) continue;
        // damp from this wash's water eases the front onto it; damp from wicking does not
        const damp = ever[j] ? Math.min(1, s[j] / (capSigma * capacity[j])) : 0;
        // on damp paper the front is pinned at each gap between fibres until the water can push through it: some gaps
        // are wide, and a fibre lying along the direction of advance is an open channel. The front takes the easy ways
        // first, so it fingers out along fibres instead of spreading as a blurred disc (invasion through the fibre
        // network; MoXi pins its fronts on a fibre texture the same way). Dry sized paper keeps its plain threshold.
        const aligned = Math.abs(fdx[j] * (xx - x) + fdy[j] * (yy - y)) * grain[j], throat = throats[j];
        let need = (spill + spillHeight * height[j]) * (1 - dampEase * damp) * Math.exp(damp * (pinning * 2 * throat - pinFibre * aligned));
        // encloseEase: a dry cell already held by water on more sides fills more easily, need x (1 - e (sides - 1) / 3).
        // An open front (one wet side) keeps its threshold, so a wash edge on sized paper stays where the brush put it;
        // a pit inside the wash (three or four wet sides) fills, as surface tension fills it, instead of drying with a
        // rim round it. The pinhole rule above covers one-cell holes only; cold-press pits are two to four cells across.
        // 0: off.
        if (enclose > 0) { let ws2 = 0; for (let d2 = 0; d2 < 4; d2++) { const x2 = xx + DX[d2], y2 = yy + DY[d2]; if (x2 >= 0 && y2 >= 0 && x2 < w && y2 < h && M[y2 * w + x2]) ws2++; } need *= Math.max(0, 1 - enclose * (ws2 - 1) / 3); }
        if (W[i] > need) newly.push(j);
      }
    } else if (s[i] < capSigma * capacity[i]) {
      let thinAround = true;
      for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (M[j] && W[j] > 3 * wetEps) { thinAround = false; break; } }
      // Even a sub-threshold film is water: let evaporation remove it before clearing the cell.
      if (thinAround && W[i] === 0) { for (let k = 0; k < K; k++) { D[k][i] += G[k][i]; G[k][i] = 0; } drying.push(i); }
    }
  }
  for (const j of drying) M[j] = 0;
  for (const j of newly) { M[j] = 1; ever[j] = 1; }
}

/** Let the sheet dry completely, then fix the wash as a layer. The water levels first; then time runs faster. */
/**
 * `onStep(t)` is called after each step t; `steps`, when given, names the only t the caller wants (with the sheet on the GPU
 * the dry then runs on between them rather than stopping at every step; the CPU dry calls onStep at every step either way).
 */
export function dry(sheet, max = 40000, o = DEFAULTS, { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2, onStep = null, steps = null, analyticTail = false } = {}) {
  if (TAPE && sheet._tape) TAPE.push({ k: 'y', m: max, l: level, lm: levelMax, lt: levelTol, dt });
  if (o !== DEFAULTS) o = { ...DEFAULTS, ...o };
  const link = sheet._gpu;
  // A watched dry stays on the GPU too: it stops at the steps the watcher wants, and whatever the watcher reads (a frame's
  // render) comes down then.
  if (link && !link.paused) return link.dry(sheet, max, o, { level, levelMax, levelTol, dt, analyticTail: analyticTail && !onStep }, onStep ? { onStep, steps } : null);
  return dryCpu(sheet, max, o, { level, levelMax, levelTol, dt, onStep, analyticTail });
}
// Fast-only quiet-film approximation. Never clear a transport-capable cell.
export function quietDryTail(sheet, o = DEFAULTS) {
  for (let i = 0; i < sheet.n; i++) if (!(sheet.W[i] <= o.wetEps)) return false;
  for (let i = 0; i < sheet.n; i++) {
    sheet.W[i] = 0; sheet.s[i] = 0; sheet.M[i] = 0;
    for (let k = 0; k < sheet.K; k++) {
      sheet.D[k][i] += sheet.G[k][i] + sheet.P[k][i];
      sheet.G[k][i] = 0; sheet.P[k][i] = 0;
    }
  }
  sheet.wetDirty = 1;
  return true;
}
function dryCpu(sheet, max, o, { level, levelMax, levelTol, dt, onStep, analyticTail }) {
  // water levels in moments and dries in minutes: keep real time while the surface is still moving, then run faster
  let t = 0, fast = false;
  // the two settings a step runs with, made once rather than once a step (step reads them and never changes them)
  const oLevel = { ...o, dt: o.dt }, oFast = { ...o, dt };
  for (; t < max; t++) {
    if (!fast && t >= level && (t >= levelMax || (t % 25 === 0 && surfaceLevel(sheet) < levelTol))) fast = true;
    if (analyticTail && !onStep && quietDryTail(sheet, o)) break;
    if (analyticTail && !onStep && fast && sheet.W.every(w => w <= 3 * o.wetEps)) oFast.dt = Math.max(dt, 140);
    if (!step(sheet, fast ? oFast : oLevel)) break;
    // a caller watching the sheet dry (frames of a wash spreading and settling)
    if (onStep) onStep(t);
  }
  if (bounds(sheet)) throw new Error(`Sheet is still wet after dry() limit of ${max} steps`);
  fix(sheet);
  return t;
}

/** The largest difference in depth across any face between two wet cells. */
function surfaceLevel(sheet) {
  const { w, h, W, M } = sheet; let most = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!M[i]) continue;
    if (x < w - 1 && M[i + 1]) most = Math.max(most, Math.abs(W[i] - W[i + 1]));
    if (y < h - 1 && M[i + w]) most = Math.max(most, Math.abs(W[i] - W[i + w]));
  }
  return most;
}

/** Fix whatever is deposited as a dried layer (its binder has set). */
export function fix(sheet) {
  if (sheet._gpu && !sheet._gpu.paused) { coherent(sheet); try { return fixCpu(sheet); } finally { wrote(sheet); } }
  return fixCpu(sheet);
}
function fixCpu(sheet) {
  for (let k = 0; k < sheet.K; k++) { const Pk = sheet.P[k], Dk = sheet.D[k]; for (let i = 0; i < sheet.n; i++) if (Pk[i]) { Dk[i] += Pk[i]; Pk[i] = 0; } }
  let any = false;
  for (const Dk of sheet.D) { for (let i = 0; i < sheet.n; i++) if (Dk[i] > 0) { any = true; break; } if (any) break; }
  if (!any) return;
  // A pass lays a few of the sheet's pigments, and a dried layer is kept for the whole run: every pigment the pass did
  // not lay shares one zero array instead of holding its own, which keeps a long run's memory bounded. Only zeros are
  // ever written into a dried layer (a lifted
  // resist, the rewet of the top layer, the prep fade all scale or subtract what is there), so sharing changes nothing.
  const zero = sheet._zeroLayer || (sheet._zeroLayer = F32(sheet.n));
  sheet.layers.push(sheet.D.map(Dk => { if (!Dk.some(v => v !== 0)) return zero; const L = F32(Dk.length); L.set(Dk); return L; }));
  sheet.ever.fill(0);
  for (const Dk of sheet.D) Dk.fill(0);
}

/** All pigment layers, oldest first, including the current wet or unfixed wash on top. */
export function layersOf(sheet) {
  coherent(sheet);
  const top = sheet.G.map((Gk, k) => { const out = new Float32Array(sheet.n), Dk = sheet.D[k], Pk = sheet.P[k]; for (let i = 0; i < sheet.n; i++) out[i] = Gk[i] + Dk[i] + Pk[i]; return out; });
  return [...sheet.layers, top];
}

/** Total pigment per pigment across layers. */
const ENV = typeof process !== 'undefined' ? process.env : {};
export function thickness(sheet) {
  if (PAR) { const t = PAR.thickness(sheet); if (t) return t; }
  if (ENV.LAYER_CACHE === '0') return thicknessPlain(sheet);
  const out = thicknessCached(sheet);
  if (ENV.LAYER_CACHE_CHECK) { const ref = thicknessPlain(sheet), tol = sheet._gpu ? 1e-5 : 0; /* the GPU's sums are rounded twice */ for (let k = 0; k < ref.length; k++) for (let i = 0; i < ref[k].length; i++) if (tol ? Math.abs(ref[k][i] - out[k][i]) > tol * Math.max(1, Math.abs(ref[k][i])) : !Object.is(ref[k][i], out[k][i])) throw new Error(`thickness cache differs at pigment ${k} cell ${i}`); }
  return out;
}
function thicknessPlain(sheet) {
  const L = layersOf(sheet);
  const n = sheet.n;
  return sheet.G.map((_, k) => { const out = new Float32Array(n); for (const layer of L) { const a = layer[k]; for (let i = 0; i < n; i++) out[i] += a[i]; } return out; });
}
/** Something wrote into a dried layer other than by pushing a new one: the cached sums of the layers are stale. */
export const layersChanged = (sheet, changed = sheet.layers) => {
  sheet._layerVer = (sheet._layerVer || 0) + 1;
  for (const layer of changed) layer._cacheVersion = (layer._cacheVersion ?? 0) + 1;
  if (sheet._fixedBed && sheet._gpu && !sheet._gpu.paused) sheet._gpu.fixedLayersChanged(sheet, changed);
};
// The dried layers under the newest one never change (a rewet reaches only the newest; the things that do write below it
// call layersChanged), so their sum is kept and each layer is added once, in order, into it. Each cell then sees the same
// additions in the same order as the plain sum, so the result is identical bit for bit.
/**
 * G + D + P per pigment, rounded to a float as it is stored: what is wet, in the pores or deposited and not yet fixed, which
 * thickness and a frame's top layer are made of. With the sheet on the GPU it is summed there and only the sums come down
 * (valid until the next call); otherwise it is worked out from the CPU copy.
 */
export function wetSums(sheet) {
  const link = sheet._gpu;
  if (link) { const s = link.wetSums(sheet); if (s) return s; }
  coherent(sheet);
  return sheet.G.map((Gk, k) => { const out = new Float32Array(sheet.n), Dk = sheet.D[k], Pk = sheet.P[k]; for (let i = 0; i < sheet.n; i++) out[i] = Gk[i] + Dk[i] + Pk[i]; return out; });
}
/** The newest dried layer's CPU copy made current (a rewet on the GPU may have lifted some of it). */
export const syncTopLayer = sheet => { if (sheet._gpu) sheet._gpu.syncTop(sheet); };
/** The CPU copy made current over a rectangle [x, y, w, h] of cells, for code that reads the sheet's arrays directly. */
export const needCells = (sheet, x, y, bw, bh) => { if (sheet._gpu && !sheet._gpu.paused && !ENV.NEEDCELLS_OFF) sheet._gpu.ensureFresh(sheet, [x, y, bw, bh]); };
function thicknessCached(sheet) {
  syncTopLayer(sheet);
  const sums = wetSums(sheet);
  const n = sheet.n, layers = sheet.layers, m = layers.length - 1, K = sheet.K;
  let c = sheet._thickLower;
  if (c && (c.ver !== (sheet._layerVer || 0) || c.m > Math.max(0, m) || !c.refs.every((r, q) => layers[q] === r))) c = null;
  if (!c) c = sheet._thickLower = { ver: sheet._layerVer || 0, m: 0, refs: [], sum: sheet.G.map(() => new Float32Array(n)) };
  for (; c.m < m; c.m++) { const layer = layers[c.m]; c.refs.push(layer); for (let k = 0; k < K; k++) { const a = layer[k], o = c.sum[k]; for (let i = 0; i < n; i++) o[i] += a[i]; } }
  return sheet.G.map((_, k) => {
    const out = c.sum[k].slice(), s = sums[k];
    if (m >= 0) { const a = layers[m][k]; for (let i = 0; i < n; i++) out[i] += a[i]; }
    for (let i = 0; i < n; i++) out[i] += s[i];
    return out;
  });
}

/** Total water and pigment, for conservation checks. */
export function totals(sheet) {
  coherent(sheet);
  let water = 0; for (let i = 0; i < sheet.n; i++) water += sheet.W[i] + sheet.s[i];
  const all = [sheet.G, sheet.D, sheet.P, ...sheet.layers];
  const pig = sheet.G.map((_, k) => { let t = 0; for (const layer of all) for (let i = 0; i < sheet.n; i++) t += layer[k][i]; return t; });
  return { water, pig };
}
