// The things a local vision model named in a subject, with rough boxes: work/thing-labels/<subject>.json, written by
// the labelling step (a local model only; nothing is uploaded). Each thing is {name, kind, box: [x0, y0, x1, y1]} with
// the box as fractions of the picture's width and height; a box given in thousandths is brought to fractions.
// Beside it, <subject>.png (tools/seg/thing-masks.py) is each thing's own SAM mask, SAM prompted with the thing's box: a
// pixel holds 1 + the position in the file's list of the thing it belongs to, 0 where none is.
// Planning only. A subject with no file has no named things: the wash plan then takes each SAM region as a thing.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const THING_KINDS = Object.freeze(['wall', 'window', 'door', 'arch', 'gate', 'roof', 'sky', 'foliage', 'tree', 'ground', 'path', 'shadow', 'figure', 'animal', 'face', 'eye', 'hair', 'fur', 'clothing', 'water', 'other']);

/** The named things of a reply or a label file, cleaned: known kinds, boxes as fractions within the picture. */
export function cleanThings(list) {
  const out = [];
  for (const [index, t] of (list ?? []).entries()) {
    let b = Array.isArray(t?.box) && t.box.length === 4 ? t.box.map(Number) : null;
    if (!b || b.some(v => !Number.isFinite(v))) continue;
    if (Math.max(...b) > 1.5) b = b.map(v => v / 1000);
    b = b.map(v => Math.max(0, Math.min(1, v)));
    const [x0, x1] = [Math.min(b[0], b[2]), Math.max(b[0], b[2])], [y0, y1] = [Math.min(b[1], b[3]), Math.max(b[1], b[3])];
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    out.push({ index, name: String(t.name ?? t.thing ?? 'thing'), kind: THING_KINDS.includes(t.kind) ? t.kind : 'other', box: [x0, y0, x1, y1] });
  }
  return out;
}

/**
 * The named things for the subject image at `image`, from `dir` (default work/thing-labels), or none when none were
 * made; with their masks on a w x h grid (nearest, a label is a name) when the mask file is there.
 */
export async function loadThings(image, w, h, dir = 'work/thing-labels') {
  const base = path.basename(image, path.extname(image)), f = path.join(dir, `${base}.json`), m = path.join(dir, `${base}.png`);
  if (!fs.existsSync(f)) return { things: [], map: null, file: null };
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const map = fs.existsSync(m) ? new Uint8Array(await sharp(m).greyscale().resize(w, h, { fit: 'fill', kernel: 'nearest' }).raw().toBuffer()) : null;
  return { things: cleanThings(d.things), map, file: f, model: d.model ?? null };
}
