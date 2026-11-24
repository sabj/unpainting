// One run of fixed rounds for cli.mjs (`--work rounds`): the brief and pictures of the level go out, rounds.mjs holds
// the conversation, the run's own painter compiles each script and paints each look (the same calls an open session's
// looks use, through the render pool when UNPAINT_RENDER=pool), and what the model hands in is painted at full size
// as any session's choice is. Kept in the run folder: author/rounds.json and rounds.md (the transcript), each round's
// raw output (R<n>.out.txt), each look's sheet, and author/folder/ (choice.json, script.json: what the replay level's
// --previous reads). usage.json is written by cli.mjs from the session record made here.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { checkAuthored, preparePacket, gridImage } from './author.mjs';
import { readChoice, choiceKind } from './choice.mjs';
import { runPictures } from './sheet.mjs';
import { tinyTouchWarning } from './plan-data.mjs';
import { runRounds, transcriptText, shapeReuse, stateHash } from './rounds.mjs';
import { roundsAsker } from './rounds-call.mjs';
import { sheetNumbers, sheetLine } from './rounds-sheet.mjs';
import { LOOK_PRICE } from './look-cost.mjs';
import { standInReplies } from './rounds-standin.mjs';
import { namesShapes, resolveNumbered } from './study-shapes.mjs';
import { previousHanded, shapesHandedRounds, levelOneTemplate, autoHandedRounds } from './rounds-levels.mjs';

/** The long side, in pixels, of every picture sent in a round, and its JPEG quality: what the models read at full detail. */
const SENT_PX = 1568, SENT_QUALITY = 88;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const sent = async (image, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await sharp(image).resize({ width: SENT_PX, height: SENT_PX, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: SENT_QUALITY }).toFile(file); return file; };

/** The choice a rounds state stands for (its script, and the drawing beside it), as cli.mjs paints choices. */
export function choiceOf(state) {
  const given = state.drawing ?? {};
  // "lines" that change no prepared line and draw none (no rules, no own lines) is no choice of lines
  const d = { ...given, lines: given.lines && (given.lines.rules?.length || given.lines.own?.length) ? given.lines : null };
  const choice = readChoice({ kind: 'script', script: 'script.json', ...(d.lines ? { lines: 'my-lines.json' } : {}), ...(d.medium ? { medium: d.medium } : {}), ...(d.ink ? { ink: d.ink } : {}) });
  if (d.lines) choice.tools.linesEdit = d.lines;
  return choice;
}

/** The plan in numbers as a look's text gives it: the script's own counts and washes, nothing against the subject or a study. */
export function planText(compiled) {
  const s = compiled.summary ?? {};
  return `YOUR SCRIPT IN NUMBERS: ${s.passages != null ? `${s.passages} passages, ` : ''}${s.washes ?? '?'} washes, ${s.strokes ?? '?'} strokes, widest wash brush ${s.widestBrushMm ?? '?'} mm${s.washesByStage ? `, washes by stage ${s.washesByStage.join('/')}` : ''}${s.dryings != null ? `, ${s.dryings} dryings` : ''}.${tinyTouchWarning(s)}\n\nEACH PASSAGE, IN PAINTING ORDER (id | stage | widest brush | strokes | area | how it is laid | what the plan expects on the sheet there | the named forms its strokes cover | what):\n\n${(compiled.table ?? []).join('\n')}`;
}

/**
 * `r`: the run (cli.mjs). `x`: what cli.mjs lends: {root, briefFile, looksMost, level, say, guard(r), toolsCheck(r, tools), shapesFile(r), autoOf(r) (level 3: {painting, washes, from}),
 * compile(r, choice, script, plate), look(r, choice, script, plate, at, compiled, ask), paintChoice(r, fin), slot(cli)}.
 */
export async function roundsRun(r, x) {
  const { spec, record, authorFull: author } = r, dir = path.join(record.out, 'author'), W = spec.sheet.widthMm, sheet = { widthMm: W, heightMm: spec.sheet.heightMm };
  fs.mkdirSync(dir, { recursive: true });
  // the one guard, resource management only: the water-step ceiling of the subject (ten times Auto's)
  x.guard(r);
  const pics = await runPictures(record);
  // level 1: the subject, the toolkit and the tips; nothing prepared is sent, named or laid on the sheet
  const bare = Boolean(x.terms?.noInputs); let briefFile = x.briefFile;
  if (bare) { briefFile = path.join(dir, 'level-1-brief-template.md'); fs.writeFileSync(briefFile, levelOneTemplate(fs.readFileSync(x.briefFile, 'utf8'))); }
  const packet = await preparePacket({ dir, root: x.root, run: { ...record, masks: record.masks.receipt && !bare ? { ...record.masks } : null }, drawingPng: pics.drawing, briefFile, formsPicture: false, only: bare ? ['source.png'] : null });
  // at level 1 the prepared drawing is never laid: only lines of the model's own, whatever medium its answer names for them
  const laid = state => (bare ? { ...state, drawing: { ...(state.drawing ?? {}), medium: 'none' } } : state);
  // every picture goes out once, in round 0, and stays in the conversation: recorded as given, never priced
  const images = [], names = [];
  for (const f of packet.files) { const name = `${path.basename(f, '.png')}.jpg`; images.push(await sent(path.join(dir, f), path.join(dir, 'sent', name))); names.push([f, name]); }
  let brief = packet.brief.replace(/each form is one flat colour in the forms picture, and the\s+`FORMS` list at the end gives/, 'the `FORMS` list at the end gives');
  for (const [from, to] of names) brief = brief.replaceAll(from, to);
  // levels 2 and 3 may name the traced shapes by number: the brief's line against it gives way to the level's own section
  if (x.terms?.shapes) brief = brief.replace(/Do not use `shapes`, `reserve` or `along`: this\s+[^\n]*\n?/, 'At this level `shapes`, `reserve` and `along` may name the traced shapes by number (see the section on them below).\n');
  const roundsBrief = fs.readFileSync(path.join(HERE, 'ROUNDS-BRIEF.md'), 'utf8').replaceAll('LOOKS_MOST', String(x.looksMost)).replaceAll('LOOKS_WHOLE', String(Math.floor(x.looksMost / LOOK_PRICE.half + 1e-9)));
  // what the level adds (levels.mjs), each handed once in round 0. No level is handed another level's result; the
  // replay level L4-retry alone is handed the model's own earlier painting to look at and its script as text.
  const extra = []; let numbered = null;
  if (x.terms?.previous) {
    const prev = previousHanded(x.previous, { subject: spec.id, author: author.key });
    images.push(await sent(await gridImage(prev.painting, W), path.join(dir, 'sent', 'your-previous-painting.jpg'))); names.push(['', 'your-previous-painting.jpg']);
    // which level the previous result is from is the run's named choice ("L4-retry after L2"): replaying old runs only
    extra.push(prev.text); record.author.previousTry = { from: x.previous, level: prev.level, painting: prev.painting, scriptSha256: prev.sha256 };
    record.author.ladder = `${x.level} after ${prev.level}`; x.say(r, `this is ${record.author.ladder} (a replay of the old ladder): a fresh conversation handed its own ${prev.level} painting and script`);
  }
  if (x.terms?.shapes) {
    numbered = JSON.parse(fs.readFileSync(x.shapesFile(r), 'utf8'));
    const handed = await shapesHandedRounds(numbered, sheet);
    images.push(await sent(await gridImage(handed.picture, W), path.join(dir, 'sent', 'traced-shapes.jpg'))); names.push(['', 'traced-shapes.jpg']);
    extra.push(handed.text); record.author.shapesHanded = { shapes: numbered.shapes.length, colour: true, geometry: 'by number: a passage names a shape and the harness lays its outline' };
  }
  // level 3: Auto's plan in numbers and Auto's finished painting as it dried at full size, prepared for this code
  if (x.terms?.autoPlan || x.terms?.auto) {
    const auto = await x.autoOf(r);
    if (!auto?.painting || !auto?.washes) throw new Error(`level ${x.level} hands over Auto's plan and finished painting, and ${!auto?.painting ? 'the painting' : 'the plan'} is not there`);
    images.push(await sent(await gridImage(auto.painting, W), path.join(dir, 'sent', 'auto-painting.jpg'))); names.push(['', 'auto-painting.jpg']);
    extra.push(autoHandedRounds(auto.washes)); record.author.autoHanded = { plan: true, painting: true, from: auto.from ?? null, paintingSha256: auto.paintingSha256 ?? null, planSha256: auto.planSha256 ?? null };
  }
  const text = `${brief}\n\n${roundsBrief}${extra.map(e => `\n\n${e}`).join('')}\n\nThe pictures attached, in this order: ${names.map(([, n], i) => `${i + 1}. \`${n}\``).join(', ')}. Look at each before answering. Write your plan and script now. Answer with the JSON object only.`;
  fs.writeFileSync(path.join(dir, 'rounds-prompt.txt'), text);
  const forms = bare ? [] : packet.forms ?? [];
  const ask = roundsAsker(author.cli === 'dry' ? { ...author, replies: standInReplies(sheet, { shapes: Boolean(numbered) }) } : author, { dir, slot: x.slot(author.cli) });
  const t0 = Date.now(); let res;
  x.say(r, `${author.name} starts fixed rounds (${author.cli}; level ${x.level}; no shell, no tools; look budget ${x.looksMost} units; ${images.length} pictures sent once)`);
  try {
    res = await runRounds({
      first: { text, images }, ask, sheet, forms, budget: x.looksMost, wallMinutes: x.wallMinutes ?? null, say: line => x.say(r, line),
      check: async state => { const script = checkAuthored(numbered && namesShapes(state.script) ? resolveNumbered(state.script, numbered) : state.script, { sheetWidthMm: W }).script, choice = choiceOf(laid(state)); if (choice.tools) await x.toolsCheck(r, choice.tools); return script; },
      compile: (state, checked, n) => x.compile(r, choiceOf(laid(state)), checked, path.join(dir, 'plans', String(n))),
      look: async (state, checked, compiled, want, n) => {
        const got = await x.look(r, choiceOf(laid(state)), checked, path.join(dir, 'look-paints', String(n)), { plan: n, look: n }, compiled, want);
        if (!got.ok) return got;
        // the sheet only: the model's own painting as it dried, on the millimetre grid
        const file = await sent(await gridImage(got.painted.painting, W), path.join(dir, 'looks', String(n), 'sheet.jpg')), numbers = await sheetNumbers(got.painted.painting);
        const words = `${sheetLine(numbers)}${got.stoppedText ? `\n${got.stoppedText}` : ''}\n\n${planText(compiled)}`;
        fs.writeFileSync(path.join(dir, 'looks', String(n), 'numbers.txt'), words + '\n');
        return { ok: true, images: [file], text: words, painted: { ...got.painted, sheetNumbers: numbers } };
      },
    });
  } finally { ask.close?.(); }
  fs.writeFileSync(path.join(dir, 'rounds.json'), JSON.stringify({ schema: 'unpaint-paint/rounds@1', author: author.key, model: author.id ?? null, cli: author.cli, level: x.level, subject: spec.id, ended: res.ended, failure: res.failure, lookUnits: res.lookUnits, tokens: res.tokens, costUSD: res.costUSD, modelSeconds: res.seconds, wallSeconds: Math.round((Date.now() - t0) / 1000), picturesGiven: names.map(([, n]) => n), rounds: res.rounds, looks: res.looks }, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'rounds.md'), transcriptText(res, { title: `${author.name}, ${spec.id}, level ${x.level}: fixed rounds` }));
  const choice = res.state ? choiceOf(laid(res.state)) : null, submitted = choice ? { kind: 'script', what: choiceKind(choice), script: 'script.json', settings: {}, ...(choice.tools ? { tools: { lines: choice.tools.lines, medium: choice.tools.medium, ink: choice.tools.ink } } : {}), hash: stateHash(res.state) } : null;
  if (res.state) {
    // what it handed in, as a session's folder holds it: a later level's --previous reads it from here
    const folder = path.join(dir, 'folder'); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'script.json'), JSON.stringify(res.state.script, null, 1) + '\n');
    if (choice.tools?.linesEdit) fs.writeFileSync(path.join(folder, 'my-lines.json'), JSON.stringify(choice.tools.linesEdit, null, 1) + '\n');
    fs.writeFileSync(path.join(folder, 'choice.json'), JSON.stringify({ kind: 'script', script: 'script.json', ...(choice.tools?.linesEdit ? { lines: 'my-lines.json' } : {}), ...(res.state.drawing?.medium ? { medium: res.state.drawing.medium } : {}), ...(res.state.drawing?.ink ? { ink: res.state.drawing.ink } : {}) }, null, 1) + '\n');
  }
  const t = res.tokens, reported = t.fresh != null || t.cached != null || t.output != null, total = res.rounds.reduce((a, q) => a + (q.tokensTotal ?? 0), 0);
  Object.assign(record.author, { seconds: res.seconds, tokensIn: reported ? (t.fresh ?? 0) + (t.cached ?? 0) : null, tokensOut: reported ? t.output ?? 0 : null, tokens: reported ? (t.fresh ?? 0) + (t.cached ?? 0) + (t.output ?? 0) : total || null, costUSD: res.costUSD,
    tokenSplit: reported ? { reported: true, freshIn: t.fresh ?? 0, cachedIn: t.cached ?? 0, out: t.output ?? 0, from: 'each round\'s own report, added up (rounds.json has them a round)' } : undefined });
  record.author.session = { work: 'rounds', ended: res.ended, level: x.level, ladder: record.author.ladder ?? null, previousLevel: record.author.previousTry?.level ?? null, tryNumber: r.record.author.tryNumber ?? 1, budget: record.author.budget ?? null, budgetReached: res.ended === 'wall clock' ? { what: `${x.wallMinutes} minutes on the clock`, safetyStop: true } : null, looksMost: x.looksMost,
    ownMinutes: +(res.seconds / 60).toFixed(1), wallMinutes: +((Date.now() - t0) / 60000).toFixed(1), waitMinutes: null,
    lookUnits: res.lookUnits, steps: { taken: res.rounds.length, budget: null, what: 'rounds (model replies)' }, looks: res.looks.filter(l => !l.failed), looksNotPainted: res.looks.filter(l => l.failed).length,
    plans: res.rounds.filter(q => q.kind && q.kind !== 'done' && q.kind !== 'look').map(q => ({ ok: !q.refused, round: q.round })), turns: res.rounds.length, rounds: res.rounds.map(q => ({ round: q.round, kind: q.kind ?? null, hash: q.hash, seconds: q.seconds, tokens: q.tokens, lookUnits: q.lookUnits, refused: q.refused ?? null, change: q.change ?? null, continuedBy: q.continuedBy ?? null })),
    rewrites: res.rounds.filter(q => q.kind === 'rewrite').length, editRounds: res.rounds.filter(q => q.kind === 'edits').length,
    pictures: { handed: names.map(([, n]) => n), given: 'once, in the first message; they stay in the conversation and are not priced' },
    shapeReuse: res.state ? shapeReuse(res.state.script) : null, submitted, toolCallsTotal: 0, toolCalls: {}, routes: { closed: 'no shell and no tools: the command is called in its print mode for one reply a round (rounds-call.mjs)' } };
  if (res.failure) throw new Error(res.failure);
  x.say(r, `rounds ended (${res.ended}): ${res.rounds.length} replies, ${res.looks.filter(l => !l.failed).length} looks for ${res.lookUnits.spent} of ${res.lookUnits.budget} units, ${Math.round(res.seconds / 60)} min of replies; tokens fresh ${t.fresh ?? '?'}, cached ${t.cached ?? '?'}, output ${t.output ?? '?'}; handed in: ${submitted.what} (${submitted.hash})`);
  await x.paintChoice(r, { choice, script: res.checked, edit: null, submitted });
}
