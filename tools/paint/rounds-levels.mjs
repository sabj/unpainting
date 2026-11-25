// What levels 2 to 4 add to round 0 of fixed rounds (rounds-run.mjs), each level a fresh conversation handed no
// other level's result (levels.mjs):
//   L2  the studies' traced shapes: a picture of them numbered and a list (number, colour, area, box, named forms). A
//       passage names a shape by number and the harness lays its outline, so the geometry never has to be sent as
//       text (shapes.json is about a megabyte). Offered, never required, and possibly wrong.
//   L3  the same, and Auto's plan (its washes in numbers) and Auto's finished painting, as it dried at full size.
// Kept to replay the old runs only (L4-retry): the model's own earlier result, its finished painting to look at and
// its script as text (previousHanded).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

/** The most characters of a previous script sent as text: beyond it the script is not sent (said to the model), and it starts afresh. */
export const PREVIOUS_SCRIPT_MOST = 400000;

/**
 * A previous level's result for round 0: {painting (the full-size final's file), text, sha256}. Throws, plainly,
 * when `from` is not a finished run of this author and subject that handed in its own script and was painted.
 */
export function previousHanded(from, { subject, author }) {
  let run; try { run = JSON.parse(fs.readFileSync(path.join(from, 'run.json'), 'utf8')); } catch { throw new Error(`--previous ${from}: no finished run there (run.json)`); }
  if (run.subject?.id !== subject || run.author?.key !== author) throw new Error(`--previous ${from}: not a run of ${author} on ${subject}`);
  const scriptFile = path.join(from, 'author', 'folder', 'script.json'), painting = ['painting.png', 'painting.jpg'].map(f => path.join(from, 'plate', f)).find(f => fs.existsSync(f));
  if (!fs.existsSync(scriptFile)) throw new Error(`--previous ${from}: it kept no script of its own (author/folder/script.json); a retry starts from a try that handed in its own script`);
  if (!painting) throw new Error(`--previous ${from}: its full-size painting is not there (plate/painting.png); a retry is handed its own finished painting, or it is not started`);
  const script = JSON.stringify(JSON.parse(fs.readFileSync(scriptFile, 'utf8'))), level = run.author?.level ?? 'previous';
  let choice = {}; try { choice = JSON.parse(fs.readFileSync(path.join(from, 'author', 'folder', 'choice.json'), 'utf8')); } catch { /* a script alone */ }
  const beside = [choice.medium && `medium ${choice.medium}`, choice.ink && `${choice.ink} ink`, choice.lines && 'lines of your own'].filter(Boolean).join(', ');
  const text = `## Your own previous painting of this subject (level ${level})

You have painted this subject before. \`your-previous-painting.jpg\` is your own finished painting from that try, as it
dried at full size, on the millimetre grid. Nobody has marked it and no critique comes with it: judge it yourself
against the subject. This is a new try with a fresh look budget. The script you handed in then follows; you may start
from it, change it, or write a new one${beside ? ` (beside it you chose: ${beside})` : ''}. Whichever you do, your
first answer is a WHOLE script.

${script.length > PREVIOUS_SCRIPT_MOST ? `(Your previous script is ${script.length} characters, too long to send; write this one from the pictures.)` : `YOUR PREVIOUS SCRIPT:\n${script}`}`;
  return { painting, text, level, sha256: crypto.createHash('sha256').update(script).digest('hex') };
}

const hex = c => `#${(c ?? [200, 200, 200]).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** The least area (mm2) of a shape numbered on the traced-shapes picture: the shapes the list names. */
export const NUMBERED_FROM_MM2 = 40;
const mm = v => Math.round(v);
/** The numbered traced shapes, one compact row each: `n, #hex, area mm², box x0-x1,y0-y1` (whole mm), in number order. */
export function shapeRows(data, { numberFromMm2 = NUMBERED_FROM_MM2 } = {}) {
  return data.shapes.filter(s => (s.areaMm2 ?? 0) >= numberFromMm2 && s.boxMm).map(s => `${s.n}, ${hex(s.colour)}, ${mm(s.areaMm2)} mm², box ${mm(s.boxMm[0])}-${mm(s.boxMm[2])},${mm(s.boxMm[1])}-${mm(s.boxMm[3])}`);
}
/** Every traced shape as CSV (a session's resources/shapes.csv): n,hex,area_mm2,x0,x1,y0,y1,paper,inside. */
export function shapesCsv(data) {
  return ['n,hex,area_mm2,x0,x1,y0,y1,paper,inside', ...data.shapes.map(s => [s.n, hex(s.colour), mm(s.areaMm2 ?? 0), ...(s.boxMm ? [s.boxMm[0], s.boxMm[2], s.boxMm[1], s.boxMm[3]].map(mm) : ['', '', '', '']), s.paper ? 1 : 0, s.inside ?? ''].join(','))].join('\n') + '\n';
}

/**
 * The traced shapes for round 0 of level 4: {picture (a PNG buffer: every shape in its colour, outlined, the larger
 * ones numbered), list (shapeRows: a row a numbered shape)}. `data`: the prepared shapes.json; `sheet` {widthMm, heightMm}.
 */
export async function shapesHandedRounds(data, sheet, { width = 1400, numberFromMm2 = NUMBERED_FROM_MM2 } = {}) {
  const k = width / sheet.widthMm, height = Math.round(sheet.heightMm * k), pts = P => P.map(([x, y]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`).join(' ');
  const shapes = [...data.shapes].sort((a, b) => (b.areaMm2 ?? 0) - (a.areaMm2 ?? 0));
  const polys = shapes.map(s => (s.polygons ?? []).map(P => `<polygon points="${pts(P)}" fill="${hex(s.colour)}" stroke="#333" stroke-width="0.6"/>`).join('')).join('');
  const labels = shapes.filter(s => (s.areaMm2 ?? 0) >= numberFromMm2 && s.boxMm).map(s => { const x = (s.boxMm[0] + s.boxMm[2]) / 2 * k, y = (s.boxMm[1] + s.boxMm[3]) / 2 * k; return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="2.5" paint-order="stroke">${s.n}</text>`; }).join('');
  const picture = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${polys}${labels}</svg>`)).png().toBuffer();
  const list = shapeRows(data, { numberFromMm2 });
  return { picture, list };
}

/** Auto's plan in numbers for level 3's data (plan-data.mjs washesText), or a throw when there is none. */
export function autoHandedRounds(washes) {
  if (!washes) throw new Error('level 3 hands over Auto\'s plan, and there is none for this run');
  return washes;
}
