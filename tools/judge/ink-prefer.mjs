#!/usr/bin/env node
// Pairwise preference of two pen-drawing versions, per named crop (bench/ink-heavy/legibility.json): the source, then
// the two drawings in a random order, numbered 1 and 2. A vision model says which reads more like a skilled draughtsman's
// pen drawing of the source: deliberate clean lines, structure in the right place, no squiggly noise, no shadow shapes
// drawn as lines. Reads work/ink-legibility/<label>/crops/<subject>__<crop>/crop.png for both labels.
//   node tools/judge/ink-prefer.mjs --a <label> --b <label> [--judge codex|agy] [--seed 1]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { cropBox, parseReply } from './legibility-core.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const A = opt('a'), B = opt('b'), judge = opt('judge', 'codex'), seed = Number(opt('seed', 1));
if (!A || !B) { console.error('usage: ink-prefer.mjs --a <label> --b <label> [--judge codex|agy] [--seed n]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/legibility.json'), 'utf8')).subjects;
const boxes = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/features.json'), 'utf8'));
const PH = 700, GAP = 16, CAP = 30;
const cap = (t, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${CAP}"><rect width="${w}" height="${CAP}" fill="#fff"/><text x="8" y="22" font-family="Helvetica" font-size="20" font-weight="bold" fill="#000">${t}</text></svg>`);
const PROMPT = 'The image shows a source drawing on the left, then two pen-drawing copies of it numbered 1 and 2. Which copy reads more like a skilled draughtsman\'s pen drawing of the source: deliberate, clean, continuous lines; the structure and features in the right place; no squiggly or broken noise; no shadow or wash shapes outlined as lines? Judge the drawing, not how dark it is. Reply with JSON only: {"better": 1 or 2, "why": "a few words"}';
let rnd = seed >>> 0; const random = () => ((rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function ask(file) {
  const dir = path.dirname(file);
  const r = judge === 'codex'
    ? spawnSync(process.env.CODEX_BIN || 'codex', ['exec', '-i', file, '--sandbox', 'read-only', '--skip-git-repo-check', PROMPT], { cwd: dir, encoding: 'utf8', timeout: 300000 })
    : spawnSync(process.env.AGY_BIN || 'agy', ['-p', `Open the image file ${file} with your file-viewing tool (do not run shell commands). ${PROMPT}`, '--model', opt('model', 'claude-sonnet-4-6'), '--mode', 'plan', '--add-dir', dir], { encoding: 'utf8', timeout: 300000 });
  return parseReply(r.stdout);
}

const out = { a: A, b: B, judge, wins: { [A]: 0, [B]: 0 }, unanswered: 0, crops: {} };
for (const [name, s] of Object.entries(spec)) {
  const key = path.basename(s.image).replace(/\.[a-z]+$/i, ''), meta = await sharp(path.join(root, s.image)).metadata();
  for (const crop of Object.keys(s.crops)) {
    const fa = path.join(root, 'work/ink-legibility', A, 'crops', `${name}__${crop}`, 'crop.png'), fb = path.join(root, 'work/ink-legibility', B, 'crops', `${name}__${crop}`, 'crop.png');
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
    const swap = random() < 0.5, [first, second] = swap ? [fb, fa] : [fa, fb];
    const src = await sharp(path.join(root, s.image)).flatten({ background: '#fff' }).extract(cropBox(boxes[key][crop], meta.width, meta.height)).resize({ height: PH }).png().toBuffer();
    const panels = await Promise.all([src, fs.readFileSync(first), fs.readFileSync(second)].map(async b => { const { data, info } = await sharp(b).resize({ height: PH }).png().toBuffer({ resolveWithObject: true }); return { data, w: info.width }; }));
    const W = panels.reduce((a, p) => a + p.w + GAP, -GAP), comp = []; let x = 0;
    for (const [i, p] of panels.entries()) { comp.push({ input: p.data, left: x, top: CAP }, { input: await sharp(cap(['source', '1', '2'][i], p.w)).png().toBuffer(), left: x, top: 0 }); x += p.w + GAP; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-prefer-')), file = path.join(dir, 'compare.png');
    await sharp({ create: { width: W, height: PH + CAP, channels: 3, background: '#fff' } }).composite(comp).png().toFile(file);
    const j = ask(file); fs.rmSync(dir, { recursive: true, force: true });
    const pick = Number(j?.better);
    if (pick !== 1 && pick !== 2) { out.unanswered++; continue; }
    const winner = (pick === 1) !== swap ? A : B;
    out.wins[winner]++; out.crops[`${name}/${crop}`] = { winner, why: j.why ?? '' };
    console.log(`${name}/${crop}: ${winner} (${j.why ?? ''})`);
  }
}
fs.writeFileSync(path.join(root, 'work/ink-legibility', `prefer-${A}-vs-${B}-${judge}-s${seed}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`${A} ${out.wins[A]}, ${B} ${out.wins[B]}${out.unanswered ? `, ${out.unanswered} unanswered` : ''}`);
