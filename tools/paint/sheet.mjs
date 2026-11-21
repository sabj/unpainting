// The labelled sheet of a run: rows of pictures at one height, each with a title above and a line or two under it,
// under a header of plain lines. One run makes one row (source, opening drawing, studies, named forms, wash plan,
// painting) and, when painted, its stage strip. Several runs make a grid: subjects down, authors across.
import fs from 'node:fs';
import sharp from 'sharp';

const FONT = 'Helvetica, Arial, sans-serif', GAP = 14, TITLE = 30, LINE = 21, HEAD = 26, MARGIN = 18;
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Text cut to what fits `px` wide at a font size (Helvetica runs about half its size a letter). */
export function fit(text, px, size) {
  const most = Math.max(4, Math.floor(px / (size * 0.5)));
  return text.length <= most ? text : text.slice(0, most - 1).trimEnd() + '…';
}

/** A drawing's strokes (STEM-vectors.json: paths in sheet mm) as an SVG `width` px wide: ink black, pencil grey,
 * strokes marked `drop` left out as the painter leaves them. Returns {svg, ink, pencil, dropped}. */
export function drawingSvg(vectors, width) {
  const k = width / vectors.sheetMm, height = Math.round(vectors.heightMm * k), whole = vectors.medium === 'ink' ? 'ink' : 'graphite';
  let ink = 0, pencil = 0, dropped = 0; const paths = [];
  for (const s of vectors.strokes) {
    if (s.drop) { dropped++; continue; }
    const isInk = (s.medium ?? whole) === 'ink'; if (isInk) ink++; else pencil++;
    const pts = s.path; if (!pts || pts.length < 2) continue;
    // every third point is enough at sheet size
    const step = pts.length > 12 ? 3 : 1, d = [];
    for (let i = 0; i < pts.length; i += step) d.push(`${(pts[i][0] * k).toFixed(1)},${(pts[i][1] * k).toFixed(1)}`);
    const last = pts[pts.length - 1]; d.push(`${(last[0] * k).toFixed(1)},${(last[1] * k).toFixed(1)}`);
    const w = Array.isArray(s.widths) && s.widths.length ? s.widths.reduce((a, v) => a + v, 0) / s.widths.length : 0.3;
    paths.push(`<polyline points="${d.join(' ')}" stroke="${isInk ? '#111' : '#777'}" stroke-opacity="${Math.max(0.15, Math.min(1, (s.dark ?? 1) * (isInk ? 1 : 0.6))).toFixed(2)}" stroke-width="${Math.max(0.6, w * k).toFixed(2)}"/>`);
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbfaf6"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`, ink, pencil, dropped, height };
}

/** A colour for form number i (1..), spread round the hue circle. */
export function formColour(i) {
  const h = (i * 137.508) % 360, c = 0.62, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = 0.3;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => Math.round(255 * (v + m)));
}

/** The named-forms id map (8-bit grey PNG, 0 = unnamed) coloured form by form. A PNG buffer. */
export async function formsImage(maskFile) {
  const { data, info } = await sharp(maskFile).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) { const c = data[i * info.channels] ? formColour(data[i * info.channels]) : [245, 245, 245]; rgb[3 * i] = c[0]; rgb[3 * i + 1] = c[1]; rgb[3 * i + 2] = c[2]; }
  return sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

/** A blank panel with words in it (a painting that was not painted). A PNG buffer. */
export function wordsImage(words, width, height) {
  const lines = [].concat(words);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ececec"/>${lines.map((l, i) => `<text x="50%" y="${height / 2 + (i - (lines.length - 1) / 2) * 34}" text-anchor="middle" font-family="${FONT}" font-size="${i ? 19 : 28}" font-weight="${i ? 400 : 700}" fill="#8a1f1f">${xml(l)}</text>`).join('')}</svg>`)).png().toBuffer();
}

/**
 * Where everything goes. rows: [{label?, height, panels: [{w, h, captions}]}] with each panel's pixel size; returns
 * {width, height, header: [{y}], rows: [{y, labelY, panels: [{x, y, w, h}]}]}. Pure, so the layout is tested without images.
 */
export function layout(headerLines, rows) {
  let y = MARGIN + headerLines * HEAD + (headerLines ? 10 : 0), width = 0; const out = [];
  for (const r of rows) {
    const labelY = r.label ? y + 22 : null; if (r.label) y += 34;
    let x = MARGIN; const panels = [], most = Math.max(0, ...r.panels.map(p => p.captions ?? 0));
    for (const p of r.panels) { const w = Math.max(1, Math.round(p.w * r.height / p.h)); panels.push({ x, y: y + TITLE, w, h: r.height }); x += w + GAP; }
    width = Math.max(width, x - GAP + MARGIN);
    out.push({ y, labelY, panels });
    y += TITLE + r.height + most * LINE + 16;
  }
  return { width: Math.max(width, 640), height: y + MARGIN - 16, rows: out };
}

/**
 * Write the sheet. header: lines of text. rows: [{label?, height, panels: [{title, alert?, captions: [text], image: path | Buffer}]}].
 * `alert` paints a red band with that word across the picture (UNFINISHED, PLAN ONLY).
 */
export async function composeSheet({ header = [], rows, file, quality = 88 }) {
  const sized = [];
  for (const r of rows) {
    const panels = [];
    for (const p of r.panels) { const m = await sharp(p.image).metadata(); panels.push({ ...p, w: m.width, h: m.height }); }
    sized.push({ ...r, panels });
  }
  const L = layout(header.length, sized.map(r => ({ label: r.label, height: r.height, panels: r.panels.map(p => ({ w: p.w, h: p.h, captions: p.captions?.length ?? 0 })) })));
  const text = [], over = [];
  header.forEach((h, i) => text.push(`<text x="${MARGIN}" y="${MARGIN + (i + 1) * HEAD - 7}" font-size="${i ? 18 : 22}" font-weight="${i ? 400 : 700}" fill="${/^(DIFFERS|SWITCH|FAILED)/.test(h) ? '#8a1f1f' : '#111'}">${xml(fit(h, L.width - 2 * MARGIN, i ? 18 : 22))}</text>`));
  for (let ri = 0; ri < sized.length; ri++) {
    const r = sized[ri], at = L.rows[ri];
    if (r.label) text.push(`<text x="${MARGIN}" y="${at.labelY}" font-size="21" font-weight="700" fill="#111">${xml(fit(r.label, L.width - 2 * MARGIN, 21))}</text>`);
    for (let pi = 0; pi < r.panels.length; pi++) {
      const p = r.panels[pi], b = at.panels[pi];
      over.push({ input: await sharp(p.image).resize(b.w, b.h, { fit: 'fill' }).flatten({ background: '#ffffff' }).png().toBuffer(), left: b.x, top: b.y });
      text.push(`<text x="${b.x}" y="${b.y - 9}" font-size="19" font-weight="700" fill="${p.alert ? '#8a1f1f' : '#111'}">${xml(fit(p.title, b.w, 19))}</text>`);
      (p.captions ?? []).forEach((c, ci) => text.push(`<text x="${b.x}" y="${b.y + b.h + 18 + ci * LINE}" font-size="16" fill="#444">${xml(fit(c, b.w, 16))}</text>`));
      if (p.alert) {
        text.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="34" fill="#8a1f1f" fill-opacity="0.88"/><text x="${b.x + 10}" y="${b.y + 24}" font-size="20" font-weight="700" fill="#fff">${xml(fit(p.alert, b.w - 20, 20))}</text>`);
      }
    }
  }
  const words = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" font-family="${FONT}">${text.join('')}</svg>`);
  await sharp({ create: { width: L.width, height: L.height, channels: 3, background: '#ffffff' } }).composite([...over, { input: words, left: 0, top: 0 }]).jpeg({ quality }).toFile(file);
  return { file, width: L.width, height: L.height };
}

const mm = v => (v == null ? '?' : `${+Number(v).toFixed(1)} mm`);
/** Cheat-risk in one line: the level and its four parts. */
export function riskLine(r) {
  if (!r) return 'cheat-risk: not measured (only a painted run has it)';
  if (r.error || !r.parts) return `cheat-risk: could not be measured${r.error ? ` (${r.error})` : ''}`;
  const p = r.parts;
  return `cheat-risk: ${String(r.level).toUpperCase()} ${r.risk} (order of work ${p.progression}, copying ${p.copy}, small marks ${p.small}, pixel fit ${p.pixelFit})${r.flags?.length ? `; ${r.flags.join('; ')}` : ''}`;
}
const planLine = p => (p ? `${p.passages != null ? `${p.passages} passages` : `${p.shapes ?? '?'} shapes`}, ${p.washes ?? '?'} washes, ${p.strokes ?? '?'} strokes` : 'no plan was written');
/** What the author cost: its time, and tokens and dollars when its command reports them. */
const authorLine = a => (a.key === 'auto' || a.cli === 'script' ? '' : `author ${a.seconds != null ? `${a.seconds} s` : 'not called'}${a.calls?.length > 1 ? ` in ${a.calls.length} calls` : ''}${a.tokens ? `, ${a.tokens.toLocaleString('en-US')} tokens` : ', tokens not reported'}${a.costUSD != null ? `, $${a.costUSD.toFixed(2)}` : ''}`);
/** Words wrapped to lines of about `chars` letters. */
export function wrap(text, chars, most = 9) {
  const lines = [''];
  for (const w of String(text).split(/\s+/)) {
    if (lines.at(-1) && (lines.at(-1) + ' ' + w).length > chars) lines.push('');
    lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim().slice(0, chars);
  }
  return lines.length > most ? [...lines.slice(0, most - 1), lines[most - 1].slice(0, chars - 1) + '…'] : lines;
}

/** The panels of one run, left to right, and the lines over them. run: the record of run.json; pics: prepared images. */
export function runPanels(run, pics) {
  const res = run.results, panels = [{ title: 'Source', captions: [run.subject.source], image: pics.source }];
  panels.push({ title: `Opening drawing (${run.drawing.medium.split(/[,(]/)[0].trim()})`, captions: [run.drawing.stem.split('/').pop(), pics.drawingNote ?? ''], image: pics.drawing });
  run.studies.forEach((s, i) => {
    const got = res?.plan?.studies?.[i];
    panels.push({ title: `Study ${i + 1}: ${s.role.split(" (")[0]}`, captions: [`${s.path.split('/').pop()}, shapes from ${s.floorMm2 ?? '?'} mm2`, got ? `gave ${got.shapes} shapes, ${got.washes} washes, ${got.strokes} strokes` : ''], image: s.abs });
  });
  if (pics.forms) panels.push({ title: `Named forms (SAM), ${run.masks.forms.length}`, captions: [fit(run.masks.forms.map(f => f.name).join(', '), 4000, 16), run.masks.read ? 'given to the planner' : 'shown to the author; a script is laid as written'], image: pics.forms });
  if (pics.plan) panels.push({ title: `Wash plan by ${run.author.label ?? run.author.name}`, alert: res?.planPreview ? null : 'NO PLAN',
    captions: [res?.planPreview ? planLine(res?.plan) : 'no plan compiled', res?.planPreview ? `widest wash brush ${mm(res?.plan?.widestBrushMm)}; ${res?.plan?.stages ?? '?'} stages` : '', authorLine(run.author)], image: pics.plan });
  const state = res?.state ?? 'not run';
  panels.push({ title: state === 'finished' ? 'Painting' : `Painting: ${state.toUpperCase()}`, alert: state === 'finished' ? null : state === 'plan only' ? 'PLAN ONLY' : state === 'unfinished' ? 'UNFINISHED' : 'NOT PAINTED',
    captions: [state === 'finished' ? `painted in ${Math.round((run.seconds ?? 0) / 60)} min` : state === 'plan only' ? 'the plan preview shows intended shapes, not brush marks' : `painter exit ${run.exit ?? '?'}; see run.log`, riskLine(res?.cheatRisk)], image: pics.painting });
  return panels;
}

/** The header of one run. */
export function runHeader(run) {
  const c = run.code, h = [`${run.subject.id} (${run.subject.name}) · ${run.mode === 'plan' ? 'PLAN ONLY (CPU)' : 'painting (GPU)'} · author ${run.author.label ?? run.author.name} · ${run.studiesMode === 'author' ? 'open tools' : 'locked inputs'} · ${c.commit ? c.commit.slice(0, 8) : 'no commit'}${c.dirty ? ' + uncommitted changes' : ''} · ${run.started}`];
  h.push(`sheet ${run.sheet.widthMm} mm, ${run.sheet.cells} cells, ${run.sheet.cellMm} mm a cell · ${riskLine(run.results?.cheatRisk)} · widest wash brush ${mm(run.results?.plan?.widestBrushMm)}`);
  for (const d of run.subject.deviations) h.push(`DIFFERS from the record: ${d.what} ${d.now} (record ${d.record})`);
  if (run.settings.length) h.push(`settings changed: ${run.settings.map(s => `${s.name}=${s.value ?? 'painter default'} (default ${s.default})`).join(', ')}`);
  if (Object.keys(run.switches).length) h.push(`SWITCHES in the environment: ${Object.entries(run.switches).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  if (run.author.studiesNote) h.push(`DIFFERS: ${run.author.studiesNote}; the registered studies were used`);
  if (run.failure) h.push(`FAILED: ${run.failure}`);
  return h;
}

/** The pictures a run's panels need, read or drawn. */
export async function runPictures(run, { panelWidth = 900 } = {}) {
  const pics = { source: run.subject.sourceAbs }, res = run.results;
  const vec = run.drawing.files.find(f => /-vectors\.json$/.test(f));
  if (vec && fs.existsSync(vec)) {
    const d = drawingSvg(JSON.parse(fs.readFileSync(vec, 'utf8')), panelWidth);
    pics.drawing = await sharp(Buffer.from(d.svg)).png().toBuffer();
    pics.drawingNote = `${d.ink} ink strokes, ${d.pencil} pencil${d.dropped ? `, ${d.dropped} left out` : ''}`;
  } else { pics.drawing = await wordsImage(['no drawing vectors'], 600, 400); }
  if (run.masks?.review && fs.existsSync(run.masks.review)) pics.forms = run.masks.review;
  else if (run.masks?.mask && fs.existsSync(run.masks.mask)) pics.forms = await formsImage(run.masks.mask);
  const src = await sharp(pics.source).metadata(), W = 600, H = Math.round(600 * src.height / src.width);
  // a run whose plan did not compile keeps its cell, with the reason in it
  if (res?.planPreview) pics.plan = res.planPreview;
  else if (run.failure) pics.plan = await wordsImage(['NO PLAN', ...wrap(run.failure, 52)], W, H);
  pics.painting = res?.painting ?? await wordsImage(res?.state === 'plan only' ? ['PLAN ONLY', 'not painted'] : ['NOT PAINTED', run.failure ? fit(run.failure, 560, 20) : 'no painting was written'], W, H);
  return pics;
}

/** One run's sheet: its row and, when painted, the stage strip under it. */
export async function writeRunSheet(run, file, { height = 440 } = {}) {
  const pics = await runPictures(run), rows = [{ height, panels: runPanels(run, pics) }];
  if (run.results?.strip) rows.push({ label: 'Stages of the painting: the source, then the sheet at 10, 25, 50, 75 and 100% of the strokes', height: 300, panels: [{ title: '', captions: [], image: run.results.strip }] });
  return composeSheet({ header: runHeader(run), rows, file });
}

/**
 * The grid of several runs: subjects down, authors across. With one author each subject's row is its whole run row;
 * with several, a row is the source and then each author's wash plan and painting.
 */
export async function writeGridSheet(runs, file, { title, height = 400 } = {}) {
  const subjects = [...new Set(runs.map(r => r.subject.key))], authors = [...new Set(runs.map(r => r.author.key))], rows = [];
  for (const s of subjects) {
    const mine = runs.filter(r => r.subject.key === s);
    if (authors.length === 1) { const run = mine[0]; rows.push({ label: runHeader(run)[0], height, panels: runPanels(run, await runPictures(run)) }); continue; }
    const panels = [{ title: 'Source', captions: [mine[0].subject.source], image: mine[0].subject.sourceAbs }];
    for (const a of authors) {
      const run = mine.find(r => r.author.key === a); if (!run) continue;
      const all = runPanels(run, await runPictures(run));
      for (const p of all.filter(p => (run.mode === 'plan' ? /^Wash plan/ : /^Wash plan|^Painting/).test(p.title))) panels.push({ ...p, title: p.title.replace(/^Wash plan by /, '').replace(/^Painting/, `${run.author.name}: painting`) });
    }
    rows.push({ label: `${mine[0].subject.id} (${mine[0].subject.name})`, height, panels });
  }
  const first = runs[0], c = first.code;
  const header = [title ?? `${subjects.length} subjects x ${authors.length} authors`, `${first.mode === 'plan' ? 'PLAN ONLY (CPU)' : 'painting (GPU)'} · authors across: ${authors.map(a => { const x = runs.find(r => r.author.key === a).author; return x.label ?? x.name; }).join(' | ')} · locked inputs · target guard gentle · ${c.commit ? c.commit.slice(0, 8) : 'no commit'}${c.dirty ? ' + uncommitted changes' : ''} · ${first.started}`];
  if (Object.keys(first.switches).length) header.push(`SWITCHES in the environment: ${Object.entries(first.switches).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  return composeSheet({ header, rows, file });
}
