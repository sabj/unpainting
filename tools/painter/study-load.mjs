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
