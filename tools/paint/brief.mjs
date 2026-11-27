// The brief every level's model receives (BRIEF.md): one text for L1 to L4 (the painting tips, a level input, one labelled block
// in it), identical but for one marked level block
// (what the level hands over, each picture labelled with its size and scale, and how the level answers) and the level's
// data at the end. The brief is versioned (BRIEF_VERSION) and its template's and the sent text's hashes go into the
// run record (record.author.brief). Pure but for reading BRIEF.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { seenAsk } from './seen.mjs';

export const BRIEF_VERSION = 'brief 5';
export const BRIEF_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'BRIEF.md');
/** The marks round the level block and the level data: everything outside them is the same text at every level. */
export const LEVEL_START = '<!-- LEVEL BLOCK -->', LEVEL_END = '<!-- END LEVEL BLOCK -->';
/** Brushes of the kit that lay no wash, and the paint not offered (as author.mjs). */
const NOT_WASH = new Set(['pen', 'dry']), NOT_OFFERED = new Set(['lampblack']);

const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const fill = (text, v) => Object.entries(v).reduce((t, [k, x]) => t.replaceAll(k, () => String(x)), text);

/** One picture's label line: `name`, LABEL: what. Its size in pixels and its scale (px per sheet mm), when known. */
export function pictureLine(p, i = null) {
  const size = p.px ? ` ${p.px[0]} x ${p.px[1]} px, ${p.pxPerMm} px per mm.` : '';
  return `${i != null ? `${i + 1}. ` : '- '}\`${p.name}\`, ${p.label}: ${p.what}${size}`;
}

/** What a picture handed to a model is, by its file name (rounds' .jpg or a session's .png): [LABEL, what]. */
export function pictureOf(name, { medium, studies }) {
  const stem = name.split('/').pop().replace(/\.(jpg|png)$/, ''), st = /^study-(\d)$/.exec(stem);
  if (st) return [`STUDY ${st[1]}`, `${studies[st[1] - 1]?.role ?? 'study'}: the subject simplified into flat shapes, lights left as paper (the studies run coarse to fine).`];
  const optMedium = /^ink\b|^pen\b/i.test(String(medium ?? '')) ? 'pen' : 'pencil';
  return ({
    source: ['SUBJECT', 'the picture to paint.'],
    drawing: ['DRAWING', `the optional prepared ${medium} drawing (OFF by default — the sheet starts blank unless you set \`"medium": "${optMedium}"\` or select prepared lines in \`"lines"\`).`],
    forms: ['NAMED FORMS', 'each named form of the subject as one flat colour.'],
    'traced-shapes': ['TRACED SHAPES', 'study 1\'s flat shapes traced into outlines, each in its colour, the larger ones numbered. A passage may name them by number (`shapes`, `reserve`, `along`). A traced edge may cut across a form or miss one.'],
    'auto-painting': ['AUTO\'S PAINTING', 'the finished painting of this subject by Auto, this project\'s automatic painter, as it dried at full size.'],
    'your-previous-painting': ['YOUR PREVIOUS PAINTING', 'your own finished painting of this subject from an earlier try, as it dried at full size.'],
  })[stem] ?? [stem.toUpperCase(), ''];
}

/** The rounds levels' way of answering (L1 to L3 and the replay level). `forms`: the level names forms (a region look may name one). */
function roundsAnswer({ forms }) {
  return `### How you answer: fixed rounds

There is no shell, no tool and no file: you see the attached pictures and you write.

1. First answer: the whole script, one JSON object. \`medium\`, \`ink\` and \`lines\` may stand beside it in the same
   object.
2. Each look sends back your own sheet as it dried, on the millimetre grid, and your script in numbers. Nothing else
   comes back: no picture of the subject beside it, no measurement against the subject or a study.
3. After each look, one JSON object:
   - \`{"edits": [...], "look": LOOK}\`: change the script and look again. LOOK is \`"whole"\`, \`{"until": n}\` (stopped
     after stage n), \`{"region": [x0, y0, x1, y1]}\` (the passages that touch that box, in mm)${forms ? ' or `{"region": "FORM NAME"}`' : ''}.
   - \`{"edits": [...], "done": true}\` or \`{"done": true}\`: the script as it then stands is painted at full size
     and filmed; that is your painting.
   - A whole script (an object with \`"passages"\`) in place of \`"edits"\`.
4. A reply that cannot be read or compiled is returned once, free, with the reason. A second in a row ends the
   changes (with no script yet, it ends the try). Each message says the look units left and names the script by a
   short hash.

Edits, applied in order to the present script:

- \`{"op": "set", "id": "p03", "path": "paint.dilution", "value": "pale"}\`: one field of a passage, by dotted path;
  \`null\` removes it. \`"ids": ["p03", "p04"]\` (or \`"*"\`) sets it in several passages.
- \`{"op": "set", "path": "palette", "value": [...]}\`: a field of the script itself (no \`id\`).
- \`{"op": "add", "passage": {...}, "after": "p03"}\`: a new passage, \`after\` or \`before\` one; at the end when neither.
- \`{"op": "remove", "id": "p07"}\`, \`{"op": "replace", "id": "p05", "passage": {...}}\`,
  \`{"op": "move", "id": "p09", "before": "p04"}\` (or \`"after"\`).
- \`{"op": "drawing", "medium": "pen", "ink": "waterproof", "lines": {...}}\`: the drawing beside the script.`;
}

/** The open session's way of answering (L4). `v` {steps, reverts, wallMinutes, showCost, seen (pictures it writes a line on)}. */
function sessionAnswer(v) {
  return `### How you answer: an open session

You have this folder and a shell. \`README.md\` lists the commands, the files and their formats.

- Your script is \`script.json\`; \`choice.json\` names it: \`{"kind": "script", "script": "script.json"}\`, and may add
  \`"medium"\`, \`"ink"\` and \`"lines": "my-lines.json"\`. What \`choice.json\` holds when you stop is painted at full
  size and filmed; that is your painting. A choice that does not compile is not painted (the last one that did is).
- \`./unpaint plan\` checks that the choice compiles. \`./unpaint look\` paints a look (\`--until N\`, \`--region\`);
  \`./unpaint cost\` prices one and paints nothing; \`./unpaint status\` shows what is used. A look shows the dried
  sheet beside the subject and the middle study, the sheet at 10, 25, 50, 75 and 100% of the strokes, and each named
  form measured against the study and against your script.
- Steps: ${v.steps} tool calls. Returns to a choice you had already left: ${v.reverts}; after that a return is refused.
- Pictures are put away when you plan or look; \`./unpaint show inputs/source.png\` brings the subject back for
  ${v.showCost} of a look unit, a study for nothing. A program that reads a picture is refused, and that disqualifies the
  try. Data files may be read by code.${v.seen?.length ? `\n- ${seenAsk(v.seen)}` : ''}`;
}

/**
 * The level block: what the level hands over and how it answers. `level` its name; `pictures` [{name, label, what,
 * px, pxPerMm}] in the order sent (rounds) or as files (session); `data` [names of the lists in Level data]; `notes`
 * lines said of the inputs; `session` (L4) the values of sessionAnswer, else rounds.
 */
export function levelBlock({ level, pictures, files = [], data = [], notes = [], session = null, forms = false }) {
  const pics = session ? pictures.map(p => pictureLine(p)) : pictures.map((p, i) => pictureLine(p, i));
  return `${LEVEL_START}
## What you are given (level ${level})

${session ? 'In this folder; each picture covers the whole sheet on the millimetre grid:' : 'Pictures, attached once in this order; they stay in the conversation. Each covers the whole sheet on the millimetre grid.'}

${[...pics, ...files.map(f => `- \`${f.name}\`: ${f.what}`)].join('\n')}
${notes.length ? `\n${notes.join('\n')}\n` : ''}${data.length ? `\nLevel data, at the end of this brief: ${data.join('; ')}.\n` : ''}
${session ? sessionAnswer(session) : roundsAnswer({ forms })}
${LEVEL_END}`;
}

/** The level's data at the end of the brief, after the appendix, as its own marked block: [{title, text}]. */
export function levelData(parts, heading = 'Level data') {
  if (!parts.length) return '';
  return `\n${LEVEL_START}\n## ${heading}\n\n${parts.map(p => `### ${p.title}\n\n${p.text.trim()}`).join('\n\n')}\n${LEVEL_END}\n`;
}

/**
 * The brief as sent: {text, version, templateSha256, sha256}. `sheet` {widthMm, heightMm}; `brushes` brushes.json's;
 * `paints` the box [{key, name}]; `paintsMost`; `looksMost`; `wallMinutes` (the clock, stated at every level); `given` levelBlock();
 * `data` levelData().
 */
export function briefFor({ sheet, brushes, paints, paintsMost, looksMost, lookWhole = 0.3, wallMinutes, given, data = '', template = fs.readFileSync(BRIEF_FILE, 'utf8') }) {
  if (!(wallMinutes > 0)) throw new Error('brief: every level states its clock; no wallMinutes given');
  const text = fill(template, {
    BRIEF_VERSION, LEVEL_GIVEN: given, LEVEL_DATA: data, SHEET_W: sheet.widthMm, SHEET_H: sheet.heightMm, PAINTS_MOST: paintsMost,
    KIT_LIST: Object.entries(brushes).filter(([k]) => !NOT_WASH.has(k)).map(([k, b]) => `${k}: ${b.width_mm}`).join(', '),
    PAINT_LIST: paints.filter(p => !NOT_OFFERED.has(p.key)).map(p => `- \`${p.key}\`: ${p.name}`).join('\n'),
    LOOKS_MOST: looksMost, LOOKS_WHOLE: Math.floor(looksMost / lookWhole + 1e-9),
    WALL_MINUTES: wallMinutes,
  });
  const left = text.match(/\b[A-Z]{2,}_[A-Z_]{2,}\b/g)?.filter(w => !['FORM_NAME'].includes(w));
  if (left?.length) throw new Error(`brief: ${[...new Set(left)].join(', ')} left unfilled`);
  return { text, version: BRIEF_VERSION, templateSha256: sha(template), sha256: sha(text) };
}

/** The brief with its level block and level data taken out: the same text at every level (a test and a record check). */
export const withoutLevel = text => text.replace(new RegExp(`${LEVEL_START}[\\s\\S]*?${LEVEL_END}`, 'g'), '').replace(/\n{3,}/g, '\n\n').trim();

/** The record of the brief a run sent: what record.author.brief holds. */
export const briefRecord = b => ({ version: b.version, templateSha256: b.templateSha256, sha256: b.sha256, words: b.text.split(/\s+/).filter(Boolean).length });

/**
 * The brief of an open session (L4), as TASK.md: the same brief, its level block naming the session's files. `packet`
 * preparePacket()'s (its pictures in `dir`); `handed` the level's handed folders (level4.mjs); `data` [{name, what}]
 * the data files beside the inputs; `v` {steps, reverts, showCost}. The rest as briefFor.
 */
export async function sessionBrief({ level, packet, handed, data = [], medium, studies, sheet, v, preparedDrawing = true, ...rest }) {
  const sized = async file => { const m = await sharp(file).metadata(); return { px: [m.width, m.height], pxPerMm: +(1400 * m.width / 1480 / sheet.widthMm).toFixed(1) }; };
  const pictures = [];
  for (const f of packet.files) { const [label, what] = pictureOf(f, { medium, studies }); pictures.push({ name: f, label, what, ...(await sized(path.join(packet.dir, f))) }); }
  const files = [...data], seen = [];
  for (const h of handed) for (const f of h.files) {
    const name = `${h.folder}/${f.name}`;
    if (f.picture) { const [label, what] = pictureOf(name, { medium, studies }); pictures.push({ name, label, what, ...(await sized(f.from)) }); seen.push(name); } else files.push({ name, what: f.what });
  }
  const notes = [];
  if (preparedDrawing === 'opt-in') notes.push('The prepared drawing is optional and OFF by default (blank paper). Set `"medium"` to `"pencil"` or `"pen"` in `choice.json` (or select prepared lines in `"lines"`) only if you choose to lay it.');
  if (handed.some(h => h.folder === 'auto-result')) notes.push('Auto\'s plan and Auto\'s painting are given to read. What you hand in is your own script: Auto\'s plan is not a script and cannot be handed in.');
  return briefFor({ ...rest, sheet, given: levelBlock({ level, pictures, files, notes, session: { ...v, seen } }) });
}
