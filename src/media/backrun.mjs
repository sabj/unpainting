// Back-runs (blooms, cauliflowers). Water run into a wash that has lost its sheen does not level into it: the damp paint
// holds its water in the tooth and the pores, below the film that levels (film-level.mjs levelFloor). The puddle
// invades the damp paint around it instead, cell by cell, lower paper first, and the advancing water pushes the paint
// it meets (still loose: suspended, or settled on a binder that has not set) on ahead of it. Where the push gives out
// the paint piles up: a pale bloom inside a dark, ragged line (Computer-Generated Watercolor, section 4.7: water
// spreading from a wet region into a damp one carries pigment to its front; Pollen and Small's back-run studies).
//
// One step, for the cells of a box:
//   - a receiver with exposed tooth (wet, 0 < W < head, no resist) takes from each neighbour standing deeper than o.puddle the
//     share q = exposed/4 min(1, invade dt / mm x (1.5 - surface), the last between 0.5 and 1.5) of that neighbour's water above
//     the cell's entry head. The exposed fraction (head - W)/head is the storage deficit of the tooth up to its
//     flooded, puddle depth. Shine-off is its mean held depth, not a binary wetting boundary: some fibre contacts
//     remain as a thin free film connects. The tooth can refill past shine-off and the front advance under pressure.
//     The same fraction gates paint pushed into the next cell, conserving what cannot move there.
//     As at the outer wet front (sheet.mjs), the fibre throat raises that head by
//     exp(2 pinning throat - pinFibre alignment): a contact line pins at fibre edges, and slides along their corners.
//     A puddle must supply enough head to cross the edge; the same fibres bound the easy paths for their length.
//     The donor keeps at least `head`: fibres cannot release the water held below its puddle floor. Without this
//     bound an easy throat could drain a puddle into the damp range and start another back-run in a uniform wash.
//     The front runs at about `invade` mm/s, faster into the paper's hollows than over its hills (the
//     surface the water levels over, paper.mjs: the valley and the cockle);
//   - the water brings the puddle's paint with it: what it holds suspended, and `push` of the loose paint the puddle
//     stands on (clean water dropped on damp paint loosens it), at the puddle's concentration;
//   - the damp cell's loose paint is pushed on by the share s = push Q / (Q + W) (Q its intake), split by where the water
//     came from: the part that came from the west goes on to the east neighbour, and so on, but only into a neighbour
//     that is itself damp; what has nowhere to go stays. Pushed paint arrives suspended.
// Everything is read from the state at the start of the pass and written after, so the order of the cells does not
// matter (the GPU does the same in three kernels, film-level-wgsl.mjs lv_br_a to lv_br_c). Water and pigment are conserved.

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1], OPP = [1, 0, 3, 2];
const scratch = new WeakMap();
function bufs(sheet) {
  let b = scratch.get(sheet);
  if (!b || b.n !== sheet.n) { b = { n: sheet.n, q: new Float64Array(4 * sheet.n), s: new Float64Array(sheet.n), dW: new Float64Array(sheet.n), on: new Uint8Array(sheet.n) }; scratch.set(sheet, b); }
  return b;
}

/** The back-run pass over box [x0, y0, x1, y1] for one step of o.dt. Returns the water the puddles gave (mm of depth). */
export function backRun(sheet, o, box, mm) {
  // The stored water and GPU boundary are float32, including equality at the
  // floor. Keep the levelling and back-run classifications complementary.
  const floor = Math.fround(o.levelFloor ?? 0), invade = o.invade ?? 0, push = o.push ?? 0, dt = o.dt ?? 0, head = Math.fround(Math.max(floor, o.puddle ?? floor));
  if (!(floor > 0) || !(invade > 0) || !(dt > 0) || !((o.level ?? 0) > 0)) return 0;   // the floor is the levelling's
  const { w, W, M, G, D, K, resist, paper } = sheet, [x0, y0, x1, y1] = box, surface = paper.surface || paper.valley || paper.height;
  const { throat, fdx, fdy, grain } = paper, pinning = o.pinning ?? 0, pinFibre = o.pinFibre ?? 0;
  if (!throat || throat.length !== sheet.n) throw new Error('back-run: the paper has no throat (make it with makePaper or scanPaper)');
  const b = bufs(sheet), { q, s, dW, on } = b, c = invade * dt / mm;
  const exposed = i => {
    if (!M[i] || !(W[i] > 0) || W[i] >= head || (resist && resist[i])) return 0;
    return (head - W[i]) / head;
  };
  const pool = i => M[i] && W[i] > head;
  // 1. the intake of each damp cell, face by face (q[4 i + e]: from its neighbour in direction e), from the start state
  let any = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; on[i] = 0;
    const available = exposed(i); if (!(available > 0)) continue;
    const share = available * 0.25 * Math.min(1, c * Math.min(1.5, Math.max(0.5, 1.5 - surface[i])));
    let Q = 0;
    for (let e = 0; e < 4; e++) {
      const xx = x + DX[e], yy = y + DY[e]; let v = 0;
      if (xx >= x0 && yy >= y0 && xx <= x1 && yy <= y1) {
        const k = yy * w + xx;
        if (pool(k)) {
          const aligned = Math.abs(e < 2 ? fdx[i] : fdy[i]) * grain[i];
          const entry = head * Math.exp(Math.max(0, 2 * pinning * throat[i] - pinFibre * aligned));
          v = share * Math.max(0, W[k] - entry);
        }
      }
      q[4 * i + e] = v; Q += v;
    }
    if (Q > 0) { on[i] = 1; any = true; s[i] = push * Q / (Q + W[i]); }
  }
  if (!any) return 0;
  // 2. water: each damp cell takes its intake, each puddle gives what its damp neighbours took
  let given = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; let d = 0;
    if (on[i]) for (let e = 0; e < 4; e++) d += q[4 * i + e];
    else if (pool(i)) for (let e = 0; e < 4; e++) { const xx = x + DX[e], yy = y + DY[e]; if (xx < x0 || yy < y0 || xx > x1 || yy > y1) continue; const j = yy * w + xx; if (on[j]) { const v = q[4 * j + OPP[e]]; d -= v; given += v; } }
    dW[i] = d;
  }
  // A fine pigment sheet replays this phase, including loose deposit pushed ahead of the advancing water.
  sheet._flux?.backrun?.({ box, q, s, dW, on, push, floor });
  // 3. paint: the puddle's water carries its suspended paint into the damp cells at its own concentration; what each
  // invaded cell pushes on lands in the neighbour opposite the water's source, if that is damp
  const gIn = b.gIn ?? (b.gIn = new Float64Array(sheet.n)), go = b.go ?? (b.go = new Float64Array(sheet.n));
  for (let k = 0; k < K; k++) {
    const Gk = G[k], Dk = D[k];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x; go[i] = 0; gIn[i] = 0;
      if (!on[i]) continue;
      let Q = 0, moved = 0; for (let e = 0; e < 4; e++) Q += q[4 * i + e];
      for (let e = 0; e < 4; e++) {
        const v = q[4 * i + e]; if (!(v > 0)) continue;
        const xx = x - DX[e], yy = y - DY[e];   // on, away from the source
        if (xx < x0 || yy < y0 || xx > x1 || yy > y1) continue;
        moved += (v / Q) * exposed(yy * w + xx);
      }
      go[i] = s[i] * moved;   // the share of this cell's loose paint that leaves it
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x; if (!(exposed(i) > 0)) continue;
      let inc = 0;
      for (let e = 0; e < 4; e++) {
        const xx = x + DX[e], yy = y + DY[e]; if (xx < x0 || yy < y0 || xx > x1 || yy > y1) continue;
        const j = yy * w + xx;
        // the puddle's paint, suspended and loosened, carried in with its water
        if (q[4 * i + e] > 0 && W[j] > 0) inc += q[4 * i + e] * (Gk[j] + push * Dk[j]) / W[j];
        // from an invaded neighbour whose water came from the cell beyond it (so it pushes towards i)
        if (!on[j]) continue;
        const v = q[4 * j + e]; if (!(v > 0)) continue;
        let Q = 0; for (let f = 0; f < 4; f++) Q += q[4 * j + f];
        inc += exposed(i) * s[j] * (v / Q) * (Gk[j] + Dk[j]);
      }
      gIn[i] = inc;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (dW[i] < 0) { const f = dW[i] / W[i]; Gk[i] = Math.max(0, Gk[i] * (1 + f)); Dk[i] = Math.max(0, Dk[i] * (1 + push * f)); continue; }   // a puddle: its water left with its paint
      const out = go[i], inc = gIn[i]; if (!out && !inc) continue;
      Gk[i] = Math.max(0, Gk[i] * (1 - out) + inc); Dk[i] = Math.max(0, Dk[i] * (1 - out));
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; if (dW[i]) W[i] = Math.max(0, W[i] + dW[i]); }
  return given;
}
