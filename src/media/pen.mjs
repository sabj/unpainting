// A dip pen with walnut ink, after Kim et al., "Hydrodynamics of Writing with Ink" (PRL 107, 2011): the paper pulls
// ink from the nib by capillary imbibition, so slow strokes are wide and dark and fast ones thin. The nib carries a
// drop after a dip, feeds through the slit, wicks along fibres, and skips on the paper's hills as it empties. DOM free.
import { soak, deposit, collectFlows } from './sheet.mjs';
import { markCpuStrokeCell } from './cpu-stroke-dirty.mjs';
import { penContactLookahead,lookaheadCount } from './cpu-contact-lookahead.mjs';
// TAPE and PENS (brush.mjs) are live bindings, read at the call, not at import.
import { TAPE, PENS, penId } from './brush.mjs';

// Ink reaching a cell. Dry pores drink it and their fibres take the dye (soak); damp pores take what room they have
// and the dye joins their water. Dye goes into pores, not standing water: at pen strength the Marangoni term in step
// would go unstable.
function inkInto(sheet, i, water, pig, damp) {
  if (damp < 0.05) return soak(sheet, i, water, pig);
  const into = Math.min(Math.max(0, sheet.paper.capacity[i] - sheet.s[i]), water);
  sheet.s[i] += into;
  for (let k = 0; k < sheet.K; k++) if (pig[k]) { const d = Math.min(1, damp); sheet.P[k][i] += pig[k] * d; sheet.D[k][i] += pig[k] * (1 - d); }
  if (water > into) deposit(sheet, i, water - into, null);
}

export function createPen(opts = {}) {
  const pen = makePen(opts);
  if (PENS) pen._tapeId = penId(opts);
  return pen;
}
function makePen({ nib = 0.8, flex = 1.5, reservoir = 250, wick = 0.15, feed = 1.2, drop = 2, starve = 0.45, depth = 0.4, travel = 1.5, sizing = 1.5, patchy = 0.3, reach = 12, strength = 1, pad = 0 } = {}) {
  return { pad, nib, flex, capacity: reservoir, ink: 0, wick, feed, dropSize: drop, drop: 0, starve, depth, travel, sizing, patchy, reach, strength, conc: null, clock: 0 };
}

/** Dip: fill the reservoir with ink at `conc` (pigment per unit of water, per pigment); `amount` is how full (0..1). */
export function dipPen(pen, conc, amount = 1) {
  if (TAPE && pen._tapeId !== undefined) TAPE.push({ k: 'D', pen: pen._tapeId, ink: Array.from(conc), a: amount });
  pen.ink = pen.capacity * amount; pen.drop = pen.dropSize * amount; pen.conc = conc.slice();
}

const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

function buffers(pen, sheet) {
  if (pen.sheet === sheet && pen.A) return;
  const n = sheet.n; pen.sheet = sheet;
  pen.A = new Float32Array(n); pen.given = new Float32Array(n); pen.seen = new Int32Array(n).fill(-1e9);
  // pinning threshold per pore: fibres standing proud of their neighbours hold a contact line back, hollows let it on
  const { height, valley } = sheet.paper; pen.pin = new Float32Array(n);
  for (let i = 0; i < n; i++) pen.pin[i] = 1 + pen.patchy * (Math.min(1, Math.max(0, (height[i] - valley[i]) * 2.5 + 0.5)) - 0.5);
}

// One touch of the nib at (x, y) with pressure p for time dt. `pad` (cells) widens the contact for a finer ink sheet:
// (N - 1) / 2 at N times the painting's resolution. `nw`, when given, sets the contact width in cells; pressure
// still sets the feed.
function touch(pen, sheet, x, y, p, dt, nw) {
  const { w, h, paper, s, M } = sheet, { capacity, height, tooth, fdx, fdy, grain } = paper;
  if (pen.ink <= 0 && pen.drop <= 0) return;
  const clock = ++pen.clock, stale = 60, fill = pen.ink / pen.capacity;
  // the paper pulls against the suction in the slit, which grows as the meniscus draws back
  const pull = pen.drop > 0 ? 1 : smooth((fill - 0.01) / pen.starve);
  const dropR = pen.drop > 0 ? Math.min(2, 0.6 * Math.sqrt(pen.drop)) : 0, rc = (nw == null ? (pen.nib + pen.flex * p) / 2 : nw / 2) + dropR + pen.pad;
  const dampOf = j => Math.min(1, (sheet.ever[j] ? s[j] / capacity[j] : 0) + (M[j] ? 1 : 0));
  const refresh = j => { if (pen.seen[j] < clock - stale) { pen.A[j] = 0; pen.given[j] = 0; } pen.seen[j] = clock; };
  const cells = []; // [cell, water wanted, path distance]

  // contact: with ink bridging the hollows every cell under the tines drinks; a starving nib touches only high fibres
  const R = Math.ceil(rc + 1), x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(w - 1, Math.ceil(x + R)), y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(h - 1, Math.ceil(y + R));
  if (sheet._cpuDemandWindow) {
    const ahead=sheet._cpuDemandPenAhead?.();
    const reach=Math.max(R,Math.ceil(rc+pen.reach));
    const ax=Math.max(0,Math.floor(x-reach)),bx=Math.min(w-1,Math.ceil(x+reach));
    const ay=Math.max(0,Math.floor(y-reach)),by=Math.min(h-1,Math.ceil(y+reach));
    if(bx>=ax && by>=ay) {
      const contact=[ax,ay,bx-ax+1,by-ay+1];
      if(!sheet._cpuDemandWindow.covers(contact))sheet._cpuDemandWindow.require(ahead??contact);
    }
  }
  const seeds = [];
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const i = yy * w + xx, dd = Math.hypot(xx + 0.5 - x, yy + 0.5 - y), cover = Math.min(1, rc + 0.5 - dd); if (cover <= 0) continue;
    if (pull < 1) { const ground = 0.5 * height[i] + 0.5 * tooth[i]; if (ground < 1 - pull * (1.1 + 0.4 * p)) continue; }
    refresh(i);
    // the ink bridges between high fibres; sized paper drinks over a moment, so a fast nib leaves deep hollows pale
    const damp = dampOf(i), room = Math.max(0, capacity[i] - s[i]), deep = 1 - (0.5 * paper.valley[i] + 0.5 * tooth[i]), tau = pen.sizing * (0.3 + 3 * deep * deep) / (1 + 6 * damp);
    let want = Math.min(damp > 0.05 ? capacity[i] : room, Math.max(0, capacity[i] * (pen.depth + (1 - pen.depth) * damp) * cover - pen.given[i])) * (1 - Math.exp(-dt * pull / tau));
    if (M[i]) want += cover * 0.08 * dt * pull;
    cells.push([i, want, 0]); seeds.push(i);
  }

  if (!seeds.length) return; // the nib is off the sheet: nothing is touching, so nothing wicks out of it either

  // imbibition: Dijkstra from the contact through inked pores by path distance; a part-filled pore conducts less
  const Rw = Math.ceil(rc + pen.reach), wx0 = Math.max(0, Math.floor(x - Rw)), wx1 = Math.min(w - 1, Math.ceil(x + Rw)), wy0 = Math.max(0, Math.floor(y - Rw)), wy1 = Math.min(h - 1, Math.ceil(y + Rw));
  const ww = Math.max(0, wx1 - wx0 + 1), wn = ww * Math.max(0, wy1 - wy0 + 1); // a window off the sheet is empty, not negative
  if (!pen.dist || pen.dist.length < wn) { pen.dist = new Float32Array(wn * 2); pen.done = new Uint8Array(wn * 2); pen.hk = new Float32Array(wn * 16); pen.hv = new Int32Array(wn * 16); }
  const { dist, done, hk, hv } = pen; dist.fill(Infinity, 0, wn); done.fill(0, 0, wn);
  const loc = j => ((j - (j % w)) / w - wy0) * ww + (j % w) - wx0;
  let hn = 0, pk = 0, pv = 0;
  const push = (k, v) => { let c = hn++; while (c > 0) { const pa = (c - 1) >> 1; if (hk[pa] <= k) break; hk[c] = hk[pa]; hv[c] = hv[pa]; c = pa; } hk[c] = k; hv[c] = v; };
  const pop = () => { pk = hk[0]; pv = hv[0]; const k = hk[--hn], v = hv[hn]; let c = 0; for (;;) { let m = 2 * c + 1; if (m >= hn) break; if (m + 1 < hn && hk[m + 1] < hk[m]) m++; if (hk[m] >= k) break; hk[c] = hk[m]; hv[c] = hv[m]; c = m; } if (hn > 0) { hk[c] = k; hv[c] = v; } };
  for (const i of seeds) { dist[loc(i)] = 0; push(0, i); }
  const D = pen.wick * pen.strength * pull, full = j => capacity[j] * (pen.depth + (1 - pen.depth) * dampOf(j));
  while (hn > 0 && D > 0) {
    pop(); const d = pk, j = pv, jx = j % w, jy = (j - jx) / w, lj = loc(j);
    if (done[lj] || d > dist[lj]) continue; done[lj] = 1;
    let sat = 1;
    if (d > 0) { // a pore beside the ink gathers drive while the source is near, and fills as the drive passes its pinning
      refresh(j);
      const damp = dampOf(j), fj = full(j);
      pen.A[j] += D * (1 + 3 * damp) * dt / (d + 0.5);
      const ratio = pen.A[j] / (d * pen.pin[j]), target = fj * smooth((ratio - 0.4) / 0.8);
      const want = Math.min(damp > 0.05 ? capacity[j] : Math.max(0, capacity[j] - s[j]), Math.max(0, target - pen.given[j])) + (M[j] && ratio > 0.4 ? 0.04 * dt * pull : 0);
      if (want > 0) cells.push([j, want, d]);
      sat = Math.min(1, (pen.given[j] + want) / (fj || 1));
      if (sat < 0.05) continue; // dry pores do not conduct
    }
    for (const [dx, dy, len] of NB) {
      const xx = jx + dx, yy = jy + dy; if (xx < wx0 || yy < wy0 || xx > wx1 || yy > wy1) continue;
      const k = yy * w + xx, lk = (yy - wy0) * ww + xx - wx0; if (done[lk]) continue;
      // along a fibre the path is short, across fibres long, most of all through damp fibres; damp pores conduct well
      const along = (Math.abs(fdx[j] * dx + fdy[j] * dy) / len) * grain[j], dk = dampOf(k), steer = 0.3 + 0.7 * dk;
      const cond = (1 - steer + steer * (0.55 + 1.6 * along)) * (1 + 2 * dk) * sat;
      const nd = d + len / cond; if (nd < dist[lk] && nd <= pen.reach) { dist[lk] = nd; push(nd, k); }
    }
  }

  // supply: the drop first, then what the slit can feed in this time
  let wantAll = 0; for (const c of cells) wantAll += c[1];
  if (wantAll <= 0) return;
  const slit = pen.feed * pen.strength * (0.3 + p) * dt * pull, supply = pen.drop + Math.min(pen.ink, slit), scale = Math.min(1, supply / wantAll);
  const used = wantAll * scale, fromDrop = Math.min(pen.drop, used); pen.drop -= fromDrop; pen.ink = Math.max(0, pen.ink - (used - fromDrop));
  // dye: fibres adsorb a share of the dye as the ink travels, more through dry sized fibres, so the margin is paler
  // and the fibres under the nib hold what the margin lost, up to their capacity
  const K = sheet.K, cTot = pen.conc.reduce((a, v) => a + v, 0) || 1;
  const held = j => { let t = 0; for (let k = 0; k < K; k++) t += sheet.D[k][j]; return t / cTot; };
  let lost = 0, room = 0;
  const share = cells.map(([j, want, d]) => { const water = want * scale; pen.given[j] += water; if (d === 0) return water; const keep = Math.exp(-d / (pen.travel * (1 + dampOf(j)))); lost += water * (1 - keep); return water * keep; });
  const hold = cells.map(([j, , d]) => { if (d > 0) return 0; const r = Math.max(0, 1.5 * capacity[j] - held(j)); room += r; return r; });
  const into = Math.min(lost, room), back = lost - into, margin = share.reduce((a, v, q) => a + (cells[q][2] > 0 ? v : 0), 0);
  cells.forEach(([j, want, d], q) => {
    markCpuStrokeCell(sheet, j);
    const water = want * scale, dye = share[q] + (room > 0 ? (into * hold[q]) / room : 0) + (d > 0 ? (margin > 0 ? (back * share[q]) / margin : 0) : 0);
    if (water > 0) inkInto(sheet, j, water, pen.conc.map(v => v * dye), dampOf(j));
    else if (dye > 0) for (let k = 0; k < K; k++) sheet.D[k][j] += pen.conc[k] * dye; // ink passing through filled pores leaves dye on their fibres
  });
}

// The rectangle a pen stroke can touch: the path's box plus the nib's contact, its drop and the ink's reach.
export function penRect(pen, sheet, path) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nw = 0;
  for (const q of path) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; if (q.nw != null && q.nw > nw) nw = q.nw; }
  const b = Math.ceil(Math.max((pen.nib + pen.flex) / 2, nw / 2) + 2 + pen.reach + 4), X0 = Math.max(0, Math.floor(x0 - b)), Y0 = Math.max(0, Math.floor(y0 - b)), X1 = Math.min(sheet.w - 1, Math.ceil(x1 + b)), Y1 = Math.min(sheet.h - 1, Math.ceil(y1 + b));
  const A = Math.min(X0, sheet.w - 1), B = Math.min(Y0, sheet.h - 1); // a path wholly off the sheet touches nothing: one cell keeps the rectangle valid
  return [A, B, Math.max(1, X1 - A + 1), Math.max(1, Y1 - B + 1)];
}

export function penStroke(pen, sheet, path, options = {}) {
  const link = sheet._gpu;
  if (!link || link.paused || !path.length) return penStrokeImpl(pen, sheet, path, options);
  link.beginStroke(sheet, penRect(pen, sheet, path), { tracked: !options.between || options.gpuBetween === true, instrument:'pen', periodic:options.gpuBetween===true&&typeof options.between==='function', flowEvery:options.flowEvery??0 });
  try { return penStrokeImpl(pen, sheet, path, options); } finally { link.endStroke(sheet); }
}

/**
 * Draw along points {x, y, p, v} (p pressure 0..1, v speed in pixels per unit of time; a point with dwell > 0 holds the
 * pen there for that time). Returns the ink left. `between(step)` lets the sheet flow as the pen moves.
 */
function penStrokeImpl(pen, sheet, path, { between, spacing = 0.5,flowEvery=0, refill = null, refillBelow = 0 } = {}) {
  if (!pen.conc) return 0;
  // only the painting's own sheet, and only a pen the recorder gave an id to
  let rec = TAPE && pen._tapeId !== undefined && sheet._tape ? [] : null;
  // points as integers: x and y in tenths of a cell; pressure, speed and dwell in hundredths
  const encode = q => [
      Math.round(q.x * 10), Math.round(q.y * 10),
      q.p == null ? -1 : Math.round(q.p * 100),
      q.v == null ? -1 : Math.round(q.v * 100),
      q.dwell ? Math.round(q.dwell * 100) : 0,
      // contact width, only when the path sets one
      ...(q.nw == null ? [] : [Math.round(q.nw * 100)]),
    ];
  const record = points => {
    const mark = {k:'P',pen:pen._tapeId,sp:spacing,points:points.map(p=>({...p})),fl:rec,d:points.map(encode),
    // a pen drawn on a finer sheet than the painting's (--inkres), in that sheet's cells; absent otherwise
      ...(sheet._tapeRes ? { r: sheet._tapeRes } : {})};
    TAPE.push(mark);return mark;
  };
  let mark = rec ? record(path) : null, recordStart = 0, recordHead = null, flowStart = 0;
  buffers(pen, sheet);
  if(sheet._cpuDemandWindow && lookaheadCount(flowEvery))sheet._cpuDemandPenAhead=penContactLookahead(pen,path,spacing,lookaheadCount(flowEvery),sheet.w,sheet.h);
  let steps = 0;
  if (rec) collectFlows(rec, () => steps-flowStart);
  const tick = () => { steps++; if (between) between(steps); };
  // the nib running dry ends the stroke; the tape has to be released on that path too, so it breaks rather than returns
  walk: for (let k = 0; k < path.length; k++) {
    const a = path[k];
    if (a.dwell) { for (let t = 0; t < a.dwell; t++) { touch(pen, sheet, a.x, a.y, a.p ?? 0.5, Math.min(1, a.dwell - t)); tick(); } continue; }
    const b = path[k + 1];
    if (!b || b.dwell) { if (path.length === 1) { touch(pen, sheet, a.x, a.y, a.p ?? 0.5, spacing / Math.max(0.05, a.v ?? 1), a.nw); tick(); } continue; }
    const L = Math.hypot(b.x - a.x, b.y - a.y), m = Math.max(1, Math.ceil(L / spacing)), va = a.v ?? 1, vb = b.v ?? va;
    const na = a.nw, nb = b.nw ?? na;
    for (let q = 0; q < m; q++) {
      // A planned drawing may reload at the current position, including inside
      // a long simplified segment. Standalone physical strokes still run dry.
      if (refill && pen.ink < pen.capacity * refillBelow) {
        const t=q/m, point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
          p:(a.p??.5)+((b.p??.5)-(a.p??.5))*t,v:va+(vb-va)*t,
          ...(na==null?{}:{nw:na+(nb-na)*t})};
        // End the recorded path at the dip, then record D followed by the rest
        // of P. Existing replay tools need no new event format. Simulation and
        // its flow cadence continue uninterrupted at exactly the same sample.
        if(rec){const done=[...(recordHead?[recordHead]:[]),...path.slice(recordStart,k+1),point];mark.d=done.map(encode);mark.points=done.map(p=>({...p}));}
        refill(pen);
        if(rec){rec=[];flowStart=steps;recordStart=k+1;recordHead=point;mark=record([point,...path.slice(k+1)]);collectFlows(rec,()=>steps-flowStart);}
      }
      if (pen.ink <= 0 && pen.drop <= 0) break walk;
      const u = q / m, v = Math.max(0.05, va + (vb - va) * u);
      touch(pen, sheet, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, (a.p ?? 0.5) + ((b.p ?? 0.5) - (a.p ?? 0.5)) * u, L / m / v, na == null ? undefined : na + (nb - na) * u);
      tick();
    }
  }
  if (rec) collectFlows(null, null);
  return pen.ink;
}
