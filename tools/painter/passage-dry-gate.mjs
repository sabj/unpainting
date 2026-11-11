// The dry-paper gate before a wet-on-dry stroke of a value-plan passage (tools/plate/sheet.mjs stroke wrapper).
// A wet-on-dry passage keeps its edges by landing on dry paper; its own same-passage wet overlap is allowed.
//
// As a painter does it: before the first lane, look over everywhere the passage can reach (its clip and the gate ring
// round it); if another wash there is still wet or damp, wait for the sheet to dry, once. Then lay the lanes one into
// the next while they are wet, and never stop in the middle of the passage to dry the sheet, which would dry its own
// lanes before the next one joins them. A passage without a clip (its reach unknown) and a texture passage (dry-brush
// marks want dry paper under every mark) keep the check before every stroke.
//
// Inputs are the stroke's predicted contact cells and the ring of cells round them, the cells this wash has touched
// (`own`), and `measure(cells)` / `dry()` for the sheet. It returns the paper the stroke will meet (null when not
// observed) and whether the sheet was dried for it.

/** The ring the gate looks round a stroke's contact, in cells (the stroke wrapper's candidateContact neighborRadius). */
export const GATE_RING = 3;

/** Every cell a passage can reach: its clip and the gate ring round it. Null without a clip. */
export function passageReach(clip, w, h, ring = GATE_RING) {
  if (!clip) return null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < clip.length; i++) if (clip[i]) { const y = (i / w) | 0, x = i - y * w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return [];
  const bx0 = Math.max(0, x0 - ring), by0 = Math.max(0, y0 - ring), bx1 = Math.min(w - 1, x1 + ring), by1 = Math.min(h - 1, y1 + ring), cells = [];
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    let near = false;
    for (let dy = -ring; dy <= ring && !near; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -ring; dx <= ring; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && clip[yy * w + xx]) { near = true; break; } } }
    if (near) cells.push(y * w + x);
  }
  return cells;
}

/** The dry-paper gate for one wet-on-dry paint stroke. */
export function wetOnDryGate({ cells, neighbors, own, texture, observeCells, passage = null, measure, dry }) {
  if (passage?.reach && !texture) {
    if (!passage.start) return { paper: null, dried: false, own: true };
    let paper = measure(passage.reach, 'gate');
    if (paper.dry) return { paper, dried: false, own: false };
    dry();
    paper = measure(passage.reach, 'gate');
    return { paper, dried: true, own: false };
  }
  const ownCandidate = own.touches;
  let ownDry = false;
  if (ownCandidate && !texture) {
    const gate = [];
    for (let k = 0; k < cells.length; k++) { const i = cells[k]; if (!own.has(i)) gate.push(i); }
    for (let k = 0; k < neighbors.length; k++) { const i = neighbors[k]; if (!own.has(i)) gate.push(i); }
    ownDry = gate.length === 0 || measure(gate, 'gate').dry;
  }
  if (ownDry && !texture) return { paper: null, dried: false, own: true };
  let paper = measure(observeCells, 'observe');
  if (paper.dry) return { paper, dried: false, own: false };
  dry();
  paper = measure(observeCells, 'observe');
  return { paper, dried: true, own: false };
}
