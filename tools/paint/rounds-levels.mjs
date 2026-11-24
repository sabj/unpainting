// What the later levels add to round 0 of fixed rounds (rounds-run.mjs). Each level is a fresh conversation:
//   L3  everything L2 gets, and the model's own L2 result: its finished painting to look at, and its script as text,
//       to reuse or ignore. Its own work, never its reasoning or its looks. No critique and no score.
//       (L4 may also be run straight from an L2 result, with no L3 between: the run's record then says "L4 after L2",
//       and the brief names the level the previous painting is from. A named choice of the run, never a silent one.)
//   L4  the same from L3, and the studies' traced shapes: a picture of them numbered and a list (number, colour, area,
//       box, named forms). A passage names a shape by number and the harness lays its outline, so the geometry never
//       has to be sent as text (shapes.json is about a megabyte). Offered, never required, and possibly wrong.
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

/**
 * The traced shapes for round 0 of level 4: {picture (a PNG buffer: every shape in its colour, outlined, the larger
 * ones numbered), text (the list and how a script names a shape)}. `data`: the prepared shapes.json; `sheet` {widthMm, heightMm}.
 */
export async function shapesHandedRounds(data, sheet, { width = 1400, numberFromMm2 = 40 } = {}) {
  const k = width / sheet.widthMm, height = Math.round(sheet.heightMm * k), pts = P => P.map(([x, y]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`).join(' ');
  const shapes = [...data.shapes].sort((a, b) => (b.areaMm2 ?? 0) - (a.areaMm2 ?? 0));
  const polys = shapes.map(s => (s.polygons ?? []).map(P => `<polygon points="${pts(P)}" fill="${hex(s.colour)}" stroke="#333" stroke-width="0.6"/>`).join('')).join('');
  const labels = shapes.filter(s => (s.areaMm2 ?? 0) >= numberFromMm2 && s.boxMm).map(s => { const x = (s.boxMm[0] + s.boxMm[2]) / 2 * k, y = (s.boxMm[1] + s.boxMm[3]) / 2 * k; return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-family="Helvetica" font-size="13" font-weight="bold" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="2.5" paint-order="stroke">${s.n}</text>`; }).join('');
  const picture = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${polys}${labels}</svg>`)).png().toBuffer();
  const list = data.shapes.map(s => `${s.n} | rgb ${(s.colour ?? []).join('/')} | ${s.areaMm2} mm2${s.paper ? ' | read as paper' : ''}${s.inside != null ? ` | inside ${s.inside}` : ''} | box ${s.boxMm ? `x ${Math.round(s.boxMm[0])}-${Math.round(s.boxMm[2])}, y ${Math.round(s.boxMm[1])}-${Math.round(s.boxMm[3])}` : '?'}${s.forms?.length ? ` | in ${s.forms.map(f => f.name ?? f).slice(0, 3).join(', ')}` : ''}`);
  const text = `## The studies' traced shapes, offered as regions (this level only)

\`traced-shapes.jpg\` shows the block-in study's flat shapes traced into outlines, each in its colour, the larger ones
numbered. They are offered, not required, and they may be wrong: a traced edge can cut across a form or miss one. Use
them, change them, or ignore them and write your own regions. At this level a passage of your script MAY name shapes
by number in place of writing a polygon: \`"shapes": [12, 13]\` (its region is those shapes), \`"reserve": [40]\`
(paper it is laid round), and in a stroke \`"along": 12\` (the stroke runs down that shape's long axis). The paint,
the brush, the order and the handling are yours as always. The shapes (number | colour | area | box in mm | the named forms it lies in):

${list.join('\n')}`;
  return { picture, text };
}

const L1_GIVEN = `## What you are given

The sheet is \`SHEET_W\` by \`SHEET_H\` mm. All positions you write are sheet millimetres, x to the right, y down. The
picture carries the same millimetre grid (red numbers across, x; blue numbers down, y).

INPUT_LIST

That is all: the subject, a blank sheet, the paint box, the brushes, a pen and a pencil, and the advice in this
brief. There is no prepared drawing, no study and no list of forms at this level; nothing is on the sheet before you
start. If you want a drawing, draw it yourself: put \`"lines"\` beside your script in your first answer, or change it
later with the \`drawing\` edit (\`{"format": "lines-edit 1", "own": [{"points": [[x, y], ...], "medium": "pen" or
"pencil", "widthMm": 0.4, "dark": 0.8, "when": "before" or "after"}]}\`). You place everything by eye from the grid.

`;
/** What the level 1 brief says in place of the lines that speak of the prepared inputs: [the line as it stands, the line for level 1]. */
const L1_LINES = [
  ['- [ ] Record the drawing given (ink or pencil) and what it carries', '- [ ] Decide the drawing: none, or lines of your own (pen or pencil), and what they carry'],
  ['"form": "<its name from the FORMS list, or \'background\', \'sky\'>"', '"form": "<a name you give it, or \'background\', \'sky\'>"'],
];

/**
 * The author's brief as level 1 gets it in fixed rounds: the toolkit (the script, the paints, the brushes) and the
 * tips (the advice on the brush, the skills), with nothing of the prepared inputs: the sections on what is given,
 * on painting a named form from the studies and the list of forms are taken out, and the few lines that name the
 * studies say the subject. Throws when the brief no longer has a part this expects: nothing is left in by accident.
 */
export function levelOneTemplate(template) {
  const cut = (text, from, to, put = '') => { const a = text.indexOf(from), b = text.indexOf(to, a + from.length); if (a < 0 || b < 0) throw new Error(`the level 1 brief is made from the author's brief, which no longer has its section "${from.trim()}" before "${to.trim()}"`); return text.slice(0, a) + put + text.slice(b); };
  let t = cut(template, '## What you are given', '## The brushes', L1_GIVEN);
  t = cut(t, '## One way to paint a named form', '## Shaping a form with the brush');
  t = cut(t, '## FORMS', '## The project\'s skills');
  for (const [from, to] of L1_LINES) { if (!t.includes(from)) throw new Error(`the level 1 brief is made from the author's brief, which no longer has the line "${from}"`); t = t.replace(from, to); }
  return t.replace(/\bin the studies\b/g, 'in the subject').replace(/at the studies' value/g, 'at the subject\'s value').replace(/- \[ \] Read the studies, coarse to fine:/, '- [ ] Read the subject:').replace(/of each named form/g, 'of each form you name');
}
