#!/usr/bin/env node
// Inking pipeline, legibility test. Renders each source's pen drawing alone (wash recipe, --inkres 3, --drawingonly 1),
// cuts the named feature crops (bench/ink-heavy/features.json) from drawing-opening.png, and asks a vision model about
// each crop alone: first what it is, with no hint, then which listed parts it can see (bench/ink-heavy/legibility.json).
//   node tools/judge/ink-legibility.mjs --label <name> [--only <subject,..>] [--render 1] [--vision 1] [--note <text>]
// Output under work/ink-legibility/<label>/: runs/<subject>/ (the render), crops/<subject>__<crop>/crop.png (the crop
// alone, in a folder of its own), pairs/<subject>__<crop>.jpg (source | drawing), verdicts.json. --note adds a row to
// work/ink-legibility/LOG.md. The vision check runs the agy CLI (--agy or AGY_BIN names it when it is not on PATH); the render needs PAINTER_SEG_PYTHON and
// PAINTER_SAM_CHECKPOINT as for any painting.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { cropBox, showSize, parseReply, verdict, tally } from './legibility-core.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const label = opt('label');
if (!label) { console.error('usage: ink-legibility.mjs --label <name> [--only subject,..] [--render 1] [--vision 1] [--note text]'); process.exit(2); }
const AGY = opt('agy', process.env.AGY_BIN || 'agy'), MODEL = opt('model', 'gemini-4-argon-high');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/legibility.json'), 'utf8')).subjects;
const boxes = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/features.json'), 'utf8'));
const only = opt('only', '') ? opt('only').split(',') : Object.keys(spec);
const base = path.join(root, 'work/ink-legibility', label);
for (const d of ['runs', 'crops', 'pairs']) fs.mkdirSync(path.join(base, d), { recursive: true });

async function render(name) {
  const out = path.join(base, 'runs', name);
  if (fs.existsSync(path.join(out, 'drawing-opening.png')) && opt('render', '1') === '0') return out;
  fs.rmSync(out, { recursive: true, force: true });
  const args = ['tools/paint-plate.mjs', '--image', spec[name].image, '--width', '540', '--inkrecipe', 'wash', '--inkres', '3', '--drawingonly', '1', '--seed', '0', '--video', '0', '--out', out];
  const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync(path.join(base, 'runs', `${name}.log`), r.stdout + r.stderr);
  if (r.status !== 0 || !fs.existsSync(path.join(out, 'drawing-opening.png'))) throw new Error(`render of ${name} failed; see ${path.join(base, 'runs', name + '.log')}`);
  return out;
}

async function cut(name, out) {
  const drawing = path.join(out, 'drawing-opening.png'), { width: w, height: h } = await sharp(drawing).metadata();
  const flat = f => sharp(f).flatten({ background: '#fff' }).removeAlpha();
  const srcMeta = await sharp(path.join(root, spec[name].image)).metadata();
  const key = path.basename(spec[name].image).replace(/\.[a-z]+$/i, '');
  const made = [];
  for (const crop of Object.keys(spec[name].crops)) {
    const box = boxes[key]?.[crop];
    if (!box) throw new Error(`features.json: no box ${key}/${crop}`);
    const dir = path.join(base, 'crops', `${name}__${crop}`);
    fs.mkdirSync(dir, { recursive: true });
    const mine = cropBox(box, w, h), theirs = cropBox(box, srcMeta.width, srcMeta.height), size = showSize(mine.width, mine.height);
    const drawn = await flat(drawing).extract(mine).resize(size.width, size.height, { kernel: 'lanczos3' }).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'crop.png'), drawn);
    const src = await flat(path.join(root, spec[name].image)).extract(theirs).resize(size.width, size.height, { kernel: 'lanczos3' }).png().toBuffer();
    await sharp({ create: { width: size.width * 2 + 12, height: size.height, channels: 3, background: '#fff' } })
      .composite([{ input: src, left: 0, top: 0 }, { input: drawn, left: size.width + 12, top: 0 }]).jpeg({ quality: 90 }).toFile(path.join(base, 'pairs', `${name}__${crop}.jpg`));
    made.push({ crop, dir });
  }
  return made;
}

function ask(dir, prompt) {
  const file = path.join(dir, 'crop.png');
  const text = `Open the image file ${file} with your file-viewing tool (do not run shell commands). It is a crop of a pen drawing; you have no other context. ${prompt}`;
  return new Promise(resolve => {
    const run = tries => {
      const p = spawn(AGY, ['-p', text, '--model', MODEL, '--mode', 'plan', '--add-dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; const timer = setTimeout(() => p.kill(), 240000);
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', () => {});
      p.on('close', () => { clearTimeout(timer); const j = parseReply(out); if (j || tries <= 0) resolve({ json: j, raw: out.trim().slice(0, 600) }); else run(tries - 1); });
    };
    run(1);
  });
}

async function judge(name, crop, dir) {
  const s = spec[name].crops[crop];
  const naming = await ask(dir, 'Reply with JSON only: {"object": "what it shows, in a few words"}');
  const list = s.parts.map((p, i) => `${i + 1}. ${p}`).join('; ');
  const checklist = await ask(dir, `Tick each part below only if you can clearly see it drawn as lines in this crop (not guessed from context). Parts: ${list}. Reply with JSON only: {"parts": {"1": true|false, ...}} with one entry per part number.`);
  return { ...verdict(s, naming.json, checklist.json), ...(naming.json && checklist.json ? {} : { unanswered: true, raw: [naming.raw, checklist.raw] }) };
}

const verdicts = {}, jobs = [];
for (const name of only) {
  if (!spec[name]) throw new Error(`no subject ${name}`);
  const out = await render(name);
  const { width } = await sharp(path.join(out, 'drawing-opening.png')).metadata();
  console.log(`${name}: drawing-opening.png ${width} px wide`);
  for (const m of await cut(name, out)) jobs.push({ name, ...m });
}
if (opt('vision', '1') === '1') {
  let next = 0;
  await Promise.all(Array.from({ length: Number(opt('parallel', 3)) }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      verdicts[`${j.name}/${j.crop}`] = await judge(j.name, j.crop, j.dir);
      const v = verdicts[`${j.name}/${j.crop}`];
      console.log(`${j.name}/${j.crop}: ${v.recognised ? 'recognised' : 'not recognised'} (said "${v.object}", ${v.seen}/${v.of} parts)${v.unanswered ? ' [no reply]' : ''}`);
    }
  }));
  const t = tally(verdicts);
  fs.writeFileSync(path.join(base, 'verdicts.json'), JSON.stringify({ label, model: MODEL, ...t, verdicts }, null, 1) + '\n');
  console.log(`${label}: ${t.recognised} of ${t.total} crops recognised`);
  if (opt('note', '')) {
    const log = path.join(root, 'work/ink-legibility/LOG.md');
    if (!fs.existsSync(log)) fs.writeFileSync(log, '# Ink legibility log\n\nBlind vision check of 12 named crops of the pen drawing alone (drawing-opening.png). Recognised = named right with no hint and enough parts seen.\n');
    const rows = Object.entries(verdicts).map(([k, v]) => `  - ${k}: ${v.recognised ? 'recognised' : 'no'} — said "${v.object}", ${v.seen}/${v.of} parts`).join('\n');
    fs.appendFileSync(log, `\n## ${label}: ${t.recognised} of ${t.total} recognised\n\n${opt('note')}\n\n${rows}\n`);
  }
}
