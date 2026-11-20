// A block-in study registered to the sheet for the study wash plan (src/paint/methods/study-washes.mjs). The study is
// an image of the whole subject, made from it by an image model; it is registered by its frame: scaled to the sheet's
// cells. A study whose shape differs from the sheet's by more than MOST_ASPECT is not the same picture and fails loudly.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MOST_ASPECT = 0.02;

/** The study at w x h, sRGB: {rgb, file, registered}. */
export async function loadStudy(file, w, h) {
  if (!fs.existsSync(file)) throw Error(`--washplan: no study at ${file}`);
  const meta = await sharp(file).metadata(), aspect = (meta.width / meta.height) / (w / h);
  if (Math.abs(aspect - 1) > MOST_ASPECT) throw Error(`--washplan: the study ${path.basename(file)} is ${meta.width} x ${meta.height}, not the sheet's shape (${w} x ${h}); it is not a study of this picture`);
  const { data } = await sharp(file).removeAlpha().toColourspace('srgb').resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), file: path.basename(file), registered: `${meta.width} x ${meta.height} scaled to ${w} x ${h}` };
}

/**
 * The --washplan stack: "FILE[:MIN[:glaze]],..." coarse to fine (MIN: the least shape in mm2 a layer lays; glaze: the layer
 * is a few connected dark-and-cool glazes, not every shape the study adds), or with
 * "flat:" before it the same laid as plain flat fills (for comparison). Each study is registered to the sheet here and
 * to the first study in the plan. {studies: [{rgb, file, registered, minMm2}], flat}
 */
export async function loadStudies(spec, root, w, h) {
  const flat = spec.startsWith('flat:'), list = (flat ? spec.slice(5) : spec).split(',').filter(Boolean);
  if (!list.length) throw Error('--washplan: no study named');
  const studies = [];
  for (const item of list) {
    // "@name=value" after a study tunes how it is read (clusters, join, round, keep, hue): see study-washes.mjs READ
    const [head, ...tune] = item.split('@'), read = {};
    for (const t of tune) { const [k, v] = t.split('='); if (!['clusters', 'join', 'round', 'keep', 'hue'].includes(k) || !(Number(v) >= 0)) throw Error(`--washplan: unknown study setting @${t}`); read[k] = Number(v); }
    const m = /^(.*?)(?::(\d+(?:\.\d+)?))?(?::(glaze))?$/.exec(head), st = await loadStudy(path.resolve(root, m[1]), w, h);
    studies.push({ ...st, minMm2: m[2] != null ? Number(m[2]) : null, mode: m[3] ?? 'add', read });
  }
  return { studies, flat };
}
