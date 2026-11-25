// What a look in fixed rounds sends back beside the picture of the sheet: numbers of the sheet ITSELF (how much of it
// is painted, how light it is, its darks), never a number measured against the subject or a study (rounds.mjs).
import sharp from 'sharp';

/** {paintedShare, meanLightness, darks (the lightness the darkest twentieth lies under), paper (the sheet's lightest tone)}, lightness 0 black to 100 white. */
export async function sheetNumbers(image) {
  const { data } = await sharp(image).greyscale().resize(256, 256, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const v = [...data].sort((a, b) => a - b), n = v.length, paper = v[Math.floor(n * 0.98)], pct = x => Math.round(100 * x / 255);
  return { paintedShare: +(v.filter(x => x < paper - 10).length / n).toFixed(2), meanLightness: pct(v.reduce((a, x) => a + x, 0) / n), darks: pct(v[Math.floor(n * 0.05)]), paper: pct(paper) };
}

/** The same as one line for the model. */
export const sheetLine = s => `THE SHEET AS IT DRIED: ${Math.round(100 * s.paintedShare)}% of it carries paint or line; its mean lightness is ${s.meanLightness} (0 black to 100 white, bare paper here ${s.paper}); its darkest twentieth lies under ${s.darks}.`;
