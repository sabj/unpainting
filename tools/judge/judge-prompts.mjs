#!/usr/bin/env node
// Judge prompts. `prepare` writes the four verbatim prompts with the placeholders filled; the judges run elsewhere.
// `tally` reads their JSON and prints early (<=30%), mid (36 to 60%) and late (70 to 100%) means and tells per letter.
// Usage: node tools/judge/judge-prompts.mjs prepare <frames dir> <build id> [ink|watercolour]
//        node tools/judge/judge-prompts.mjs tally <build id> [run json files...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_REFS = process.env.JUDGE_REFS_ROOT ?? path.resolve(HERE, '..', '..');
const [,, cmd, ...rest] = process.argv;

if (cmd === 'prepare') {
  const [dir, build, medium = 'ink'] = rest;
  const frames = path.resolve(dir);
  const note = `\n\nNotes for this run: the frames are WEBP files, build-003.webp and so on (build-036, build-042, build-048, build-054, build-060 in the middle band) and crop-006.webp, crop-012.webp, crop-024.webp, crop-048.webp, crop-070.webp. Each crop file holds two 512 px regions at 1:1 side by side: on the left the head and hand, on the right the dog and the feet. The Read tool displays them. One extra question for your final message: do the lines describe the subject, that is, are they a drawing a person would make of this man, this dog and this beach, or outlines of where tone will go?\n`;
  for (const persona of ['naive', 'teacher']) {
    const src = fs.readFileSync(path.join(HERE, '..', '..', 'judge', 'prompts', `${medium}-${persona}.md`), 'utf8');
    const out = path.join(frames, `judge-${persona}.json`);
    const text = src.replaceAll('<repo root>', ROOT_REFS).replaceAll('<frames folder>', frames).replaceAll('<output json>', out).replaceAll('.png', '.webp') + note;
    fs.writeFileSync(path.join(frames, `prompt-${persona}.md`), text);
    console.log(`wrote ${path.join(frames, `prompt-${persona}.md`)}`);
  }
} else if (cmd === 'tally') {
  const [build, ...files] = rest;
  const band = pct => (pct <= 30 ? 'early' : pct <= 60 ? 'mid' : 'late');
  const rows = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const sums = { early: [0, 0], mid: [0, 0], late: [0, 0] }, tells = {};
    for (const r of data) { const b = band(r.pct); sums[b][0] += r.score; sums[b][1]++; for (const t of r.tells || []) tells[t] = (tells[t] || 0) + 1; }
    const mean = b => (sums[b][1] ? (sums[b][0] / sums[b][1]).toFixed(1) : '-');
    const tellStr = Object.keys(tells).sort().map(k => k + tells[k]).join(' ');
    rows.push({ file: path.basename(f), early: mean('early'), mid: mean('mid'), late: mean('late'), tells: tellStr });
    console.log(`${path.basename(f)}: ${mean('early')}/${mean('mid')}/${mean('late')}  ${tellStr}`);
  }
  if (rows.length > 1) {
    const avg = b => (rows.reduce((a, r) => a + Number(r[b]), 0) / rows.length).toFixed(2);
    console.log(`mean over ${rows.length} runs: ${avg('early')}/${avg('mid')}/${avg('late')}`);
  }
} else {
  console.error('usage: judge.mjs prepare <frames dir> <build> [ink|watercolour] | tally <build> <json...>');
  process.exit(1);
}
