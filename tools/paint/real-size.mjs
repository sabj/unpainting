// The original's real size as a FACT (owner, 23 Nov: "im not sure if we should try to replicate real size. it should
// be scalable"): a subject may carry the size of the original in cm, or a nominal size when the picture was generated
// and has none. At levels 2 to 4 the model's task says it in one plain line beside its own sheet's size. It never
// sizes the sheet: that is the one-area rule's (sheet-rule.mjs). A subject with no recorded size is told nothing.
// Where it is read from: the subject's record (realSize), else bench/real-sizes.json by the subject's id.
import fs from 'node:fs';

const LISTED = JSON.parse(fs.readFileSync(new URL('../../bench/real-sizes.json', import.meta.url), 'utf8')).sizes;
/** How far the size's proportions may be from the picture's before the record is taken for a mistake (width and height swapped, another work's size). */
const PROPORTION_SLACK = 0.08;
const cm = v => String(+Number(v).toFixed(1));

/**
 * A subject's real size, checked: {heightCm, widthCm, nominal, part} or null when none is recorded. `px` is the
 * picture's [width, height] in pixels: a real size of a whole picture must have the picture's proportions.
 */
export function realSizeOf(rec, { listed = LISTED } = {}) {
  const r = rec.realSize ?? listed[rec.id] ?? null;
  if (r == null) return null;
  const who = `subject ${rec.id}: real size`;
  if (!(r.heightCm > 0 && r.widthCm > 0)) throw new Error(`${who}: heightCm and widthCm, both above 0 (a generated picture: its nominal size with "nominal": true)`);
  const out = { heightCm: r.heightCm, widthCm: r.widthCm, nominal: r.nominal === true, part: r.part === true };
  const [pw, ph] = rec.source?.px ?? [];
  if (!out.nominal && !out.part && pw > 0 && ph > 0 && Math.abs((out.widthCm / out.heightCm) / (pw / ph) - 1) > PROPORTION_SLACK) throw new Error(`${who}: ${cm(out.heightCm)} x ${cm(out.widthCm)} cm (height x width) is not the shape of the picture (${pw} x ${ph} px, width x height). Are the two swapped, or is the picture a part of the original ("part": true)?`);
  return out;
}

/** The one line of the task: the original's size beside the sheet's, height x width in cm; '' when no size is recorded. */
export function realSizeLine(realSize, sheet) {
  if (!realSize) return '';
  if (!(sheet?.widthMm > 0 && sheet?.heightMm > 0)) throw new Error('real size: the sheet\'s width and height in mm are needed to say it beside the original\'s');
  const size = `${cm(realSize.heightCm)} x ${cm(realSize.widthCm)} cm`;
  const original = realSize.nominal ? `The original is a generated picture with no size of its own (nominally ${size})`
    : realSize.part ? `The original, of which this picture is a part, is ${size}` : `The original is ${size}`;
  return `${original}; your sheet is ${cm(sheet.heightMm / 10)} x ${cm(sheet.widthMm / 10)} cm (height x width).`;
}
