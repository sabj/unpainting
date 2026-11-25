// Planned against laid, passage by passage, for a painting script: each passage's planned colour (the plan's own film
// over its cells as laid so far: the script's paint at its strength, on this paper; what the preview draws) beside the
// colour the plate shows over the same cells once the sheet is next dry. The preview is the script's intent, judged by
// the author and the critic; if the painter lays something else the loop is blind, so the difference is written for
// every passage (script-colour.json, script-colour.jsonl) and summarised in the log.
// Never fed back: it reads the plate only, never the subject.
import fs from 'node:fs';
import path from 'node:path';
import { labOf } from '../../src/eval/colour.mjs';

/** Hue angle difference in degrees between two Lab colours (0 when either is nearly grey). */
export function hueDiff(a, b, least = 6) {
  if (Math.hypot(a[1], a[2]) < least || Math.hypot(b[1], b[2]) < least) return 0;
  const d = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1])) * 180 / Math.PI;
  return Math.min(d, 360 - d);
}

/** The mean sRGB of `rgb` (W2 x H2 x 3) over the plan-grid cells `cells` (w wide), each scaled up `SC` times; as Lab against white. */
export function meanLab(rgb, cells, { w, SC, W2, skip = null }) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const i of cells) { const x = i % w, y = (i / w) | 0; for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) { if (skip?.[(y * SC + dy) * W2 + x * SC + dx]) continue; const q = ((y * SC + dy) * W2 + x * SC + dx) * 3; r += (rgb[q] / 255) ** 2.2; g += (rgb[q + 1] / 255) ** 2.2; b += (rgb[q + 2] / 255) ** 2.2; n++; } }
  if (!n) return null;
  const c = [r, g, b].map(v => Math.round(255 * (v / n) ** (1 / 2.2)));
  return labOf(c, 0, [255, 255, 255]);
}

/** The same over only the darker half of those cells (where the strokes laid their paint, not the paper between them). */
export function coreLab(rgb, cells, { w, SC, W2, skip = null }) {
  const px = [];
  for (const i of cells) { const x = i % w, y = (i / w) | 0; for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) { if (skip?.[(y * SC + dy) * W2 + x * SC + dx]) continue; const q = ((y * SC + dy) * W2 + x * SC + dx) * 3; px.push([rgb[q], rgb[q + 1], rgb[q + 2]]); } }
  if (!px.length) return null;
  px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const half = px.slice(0, Math.max(1, px.length >> 1)), m = [0, 1, 2].map(c => Math.round(255 * (half.reduce((a, p) => a + (p[c] / 255) ** 2.2, 0) / half.length) ** (1 / 2.2)));
  return labOf(m, 0, [255, 255, 255]);
}

/** A check for one run: queue a layer's script passages when laid, measure them on the next dry sheet. */
export function createScriptColourCheck({ out, w, SC, W2 }) {
  let pending = [];
  const rows = [], file = path.join(out, 'script-colour.jsonl');
  return {
    queue(layer) {
      for (const sh of layer.shapes) {
        const s = sh._valuePlan?.script; if (!s?.planned || !sh.mask) continue;
        const cells = []; const m = sh.mask; for (let i = 0; i < m.length; i++) if (m[i]) cells.push(i);
        pending.push({ id: s.passage, kind: sh._valuePlan.kind, planned: s.planned, cells });
      }
    },
    // `inked`: the sheet cells the pen's ink lies on (a 0/1 field on the sheet's grid): left out of the measure, since the
    // plan's colour is the paint's alone and a drawing under a wash would read as the wash laid dark
    measure(rgb, when, inked = null) {
      for (const p of pending) {
        const laid = meanLab(rgb, p.cells, { w, SC, W2, skip: inked }); if (!laid) continue;
        const core = coreLab(rgb, p.cells, { w, SC, W2, skip: inked }); if (!core) continue;
        const row = { id: p.id, kind: p.kind, when, planned: p.planned.map(v => +v.toFixed(1)), laid: laid.map(v => +v.toFixed(1)), dL: +(laid[0] - p.planned[0]).toFixed(1), dHue: +hueDiff(laid, p.planned).toFixed(0), dE: +Math.hypot(laid[0] - p.planned[0], laid[1] - p.planned[1], laid[2] - p.planned[2]).toFixed(1), core: core.map(v => +v.toFixed(1)), coreDL: +(core[0] - p.planned[0]).toFixed(1) };
        rows.push(row); fs.appendFileSync(file, JSON.stringify(row) + '\n');
      }
      pending = [];
    },
    get pending() { return pending.length; },
    finish() {
      const off = rows.filter(r => Math.abs(r.dL) > 5 || r.dHue > 10);
      fs.writeFileSync(path.join(out, 'script-colour.json'), JSON.stringify({ rule: 'laid within 5 L* and 10 degrees of hue of planned', passages: rows.length, outside: off.length, rows }, null, 1));
      if (rows.length) console.log(`script colour: ${rows.length} passages measured on the dry sheet; ${off.length} outside 5 L* / 10 deg of plan; median |dL| ${[...rows].map(r => Math.abs(r.dL)).sort((a, b) => a - b)[rows.length >> 1]}; worst ${off.sort((a, b) => Math.abs(b.dL) - Math.abs(a.dL)).slice(0, 5).map(r => `${r.id} dL ${r.dL} dHue ${r.dHue}`).join(', ')}`);
    },
  };
}
