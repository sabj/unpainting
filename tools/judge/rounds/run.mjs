#!/usr/bin/env node
// A blind stage-judge round: one candidate against one control, with three hidden controls, one packet per judge.
//
//   node tools/judge/rounds/run.mjs --host <user@host> --root <painter checkout on the host> [--sshkey <file>] --subject <id> --control <run dir> --candidate <run dir> \
//     --out <key base> --packets <folder for the judges' packets> [--judges claude:2,gpt:2] [--width 432]
//     [--twin <the control's recipe under another seed>] [--negative <a deliberately bad render>]
//   Give each judge the instructions in <packet>/prompt.md.
//   node tools/judge/rounds/run.mjs --ask-gpt <key base>.key.json
//   node tools/judge/rounds/tally.mjs <key base>.key.json
//   node tools/judge/rounds/run.mjs --clean <key base>.key.json       (deletes the local packets)
//
// Every packet shows five runs: the candidate, the control, the control's twin under another letter (the identical
// pair), the live site's own sequence (the positive control: work/references's stage files, the finish the
// site shows last) and a bad run (the negative control). The stages are the live sequence's own, named by percent ("020"), and
// every run's frame at a stage is the one nearest that stage's position (its percent) in work/references/manifest.json.
// The twin should be the control's recipe rendered under another seed (--twin), so the pair is equal in kind but not
// pixel-identical and a judge cannot spot it by matching; without --twin the control's own frames are shown twice.
// The negative should be a real bad render (--negative, for example --drawing none --maxvalues 1: no pen, one flat
// wash per region); without it the control is shown with its pen taken out by a median and blurred at half size. Stages come
// from measure.mjs selectByPosition, one rule for every run, printed before any image is made. Each judge gets its own letters, its own order and its own pairs (present.mjs), in a folder with a neutral
// name, the rubric copied in and no path from this repo. The key stays beside --out, outside every packet.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { liveStages } from './measure.mjs';
import { presentations } from './present.mjs';

const lib = path.dirname(fileURLToPath(import.meta.url));
const here = path.dirname(path.dirname(path.dirname(lib)));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const HOST = opt('host');
const ROOT = opt('root');
const SSH = [...(opt('sshkey') ? ['-i', opt('sshkey')] : []), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20'];
const SAFE = /^[\w./-]+$/;
const ssh = (cmd, input) => execFileSync('ssh', [...SSH, HOST, cmd], { input, maxBuffer: 512 * 1024 * 1024 });
const onBox = p => (p.startsWith('/') ? p : `${ROOT}/${p}`);
const randInt = n => crypto.randomInt(n);

/** The frozen endpoint and calibration rules, written into every key before any judge answers. */
export const PROTOCOL = Object.freeze({
  primary: 'finish + mean stage fidelity over the live sequence\'s stages (2 to 10), per judge, candidate against control',
  calibration: 'a judge is valid when its primary for the positive control is above the negative control and its primaries for the identical pair differ by 1 or less',
  win: 'at least 4 valid judges, and at least two thirds of the valid judges, score the candidate above the control on the primary; the same count for the control is a loss; anything else is inconclusive',
});

const COMPOSE = { cols: 3, stripWidth: 216 };
const LIVE = 'work/references';

function subjectSpec(name) {
  const all = JSON.parse(fs.readFileSync(path.join(lib, 'subjects.json'), 'utf8'));
  const s = all[name];
  if (!s) throw new Error(`unknown subject ${name}: ${Object.keys(all).filter(k => !k.startsWith('_')).join(', ')}`);
  const live = JSON.parse(fs.readFileSync(path.join(here, LIVE, 'manifest.json'), 'utf8')).subjects[s.manifest];
  if (!live) throw new Error(`${name}: no subject ${s.manifest} in ${LIVE}/manifest.json`);
  const stages = liveStages(live, LIVE).map(st => ({ ...st, file: onBox(st.file) }));
  const blank = onBox(`${LIVE}/${live.stages.find(st => st.percent === 0).file}`);
  return { ...s, art: s.art, stages, names: stages.map(st => st.name), blank };
}

function uploadLib() {
  ssh(`mkdir -p ${ROOT}/work/judge2/lib`);
  const tar = execFileSync('tar', ['--no-xattrs', '-C', lib, '-cf', '-', 'measure.mjs', 'box.mjs'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  ssh(`tar -C ${ROOT}/work/judge2/lib -xf - 2>/dev/null`, tar);
}
const boxJob = job => JSON.parse(ssh(`cd ${ROOT} && node work/judge2/lib/box.mjs`, JSON.stringify(job)).toString());

/** One judge's images as a box compose spec, and the lines the prompt lists. */
function judgeImages(p, runs, subject, width, dir) {
  const aspect = subject.artSize[1] / subject.artSize[0], height = Math.round(width * aspect);
  const L = r => p.letter[r];
  const frameOf = (r, s) => { const st = runs[r].sel.stages[s]; return st?.frame ? `${runs[r].dir}/${st.frame}` : null; };
  const images = [], lines = [];
  const add = (img, what) => { images.push(img); lines.push(`   ${images.length}. ${path.join(p.dir, img.file)}: ${what}`); };
  const reading = p.order.map(L).join(', ');
  for (const st of subject.stages) {
    const s = st.name;
    add({ file: `img-${images.length + 1}.jpg`, cols: COMPOSE.cols, width, height,
      tiles: [{ src: st.file, label: `Keyframe ${s}: ${st.label}` },
        ...p.order.map(r => ({ src: frameOf(r, s), label: frameOf(r, s) ? `${L(r)}, stage ${s}` : `${L(r)}: no frame at ${s}` }))] },
    `stage ${s}, ${st.label}. The keyframe, then runs ${reading}, left to right and top to bottom.`);
  }
  add({ file: `img-${images.length + 1}.jpg`, cols: subject.names.length, width: COMPOSE.stripWidth, height: Math.round(COMPOSE.stripWidth * aspect),
    tiles: p.order.flatMap(r => subject.names.map(s => ({ src: frameOf(r, s), label: `${L(r)} ${s}` }))) },
  `the strips. One row per run (${reading}, top to bottom), its sheet at ${subject.names.join(', ')}, left to right.`);
  const native = Object.values(runs)[0].sel.native, k = native.width / subject.artSize[0];
  for (const f of subject.focal) {
    const r0 = Math.round(f.r * k), size = 2 * r0;
    const crop = { left: Math.max(0, Math.round(f.x * k) - r0), top: Math.max(0, Math.round(f.y * k) - r0), width: size, height: size };
    crop.left = Math.min(crop.left, native.width - size); crop.top = Math.min(crop.top, native.height - size);
    add({ file: `img-${images.length + 1}.jpg`, cols: p.order.length, width: size, height: size,
      tiles: p.order.map(r => ({ src: frameOf(r, subject.names.at(-1)), crop, label: L(r) })) },
    `detail of ${f.what}, each run's finish at native size (${size} pixels square), runs ${reading} left to right.`);
  }
  return { images, lines };
}

function writePrompt(p, subject, lines, family) {
  const template = fs.readFileSync(path.join(here, 'judge/PROMPT-stage.md'), 'utf8');
  fs.copyFileSync(path.join(here, 'judge/RUBRIC.md'), path.join(p.dir, 'rubric.md'));
  const letters = Object.values(p.letter).sort();
  const deliver = family === 'claude'
    ? `Write the JSON object with the Write tool to ${path.join(p.dir, 'answer.json')}, and nothing else in that file. Then end with one sentence per run, no scores.`
    : 'Do not write any file. Your final message is the JSON object and nothing else: no code fence, no prose.';
  const fill = {
    COUNT: String(letters.length), LABELS: letters.join(', '), SUBJECT: subject.subject, RUBRIC: path.join(p.dir, 'rubric.md'),
    IMAGES: lines.join('\n'), PACKET: p.id, STAGE_COUNT: String(subject.names.length * letters.length),
    STAGES: subject.stages.map(st => `- ${st.name}: ${st.label}.`).join('\n'), STAGE_NAMES: subject.names.join(', '), FIRST_STAGE: subject.names[0],
    PAIRS: p.pairs.map(([a, b], i) => `${i + 1}. ${p.letter[a]} and ${p.letter[b]} (left ${p.letter[a]}, right ${p.letter[b]})`).join('\n'),
    DELIVER: deliver,
  };
  const text = template.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in fill)) throw new Error(`prompt field ${k}`); return fill[k]; });
  fs.writeFileSync(path.join(p.dir, 'prompt.md'), text);
}

function parseJudges(spec) {
  return spec.split(',').flatMap(part => {
    const [family, n] = part.split(':');
    if (!['claude', 'gpt', 'together'].includes(family) || !(Number(n) > 0)) throw new Error(`--judges: family:count, not ${part}`);
    return Array.from({ length: Number(n) }, () => ({ family }));
  });
}

function build() {
  const subjectName = opt('subject'), out = opt('out')?.replace(/\/+$/, ''), packets = opt('packets');
  const control = opt('control'), candidate = opt('candidate'), twin = opt('twin'), negative = opt('negative');
  if (!HOST || HOST.startsWith('--') || !ROOT || ROOT.startsWith('--') || !subjectName || !out || !packets || !control || !candidate) {
    console.error('usage: run.mjs --host <user@host> --root <dir> [--sshkey <file>] --subject subject-b|subject-a|subject-c|subject-d --control <run> --candidate <run> --out <key base> --packets <folder> [--judges claude:2,gpt:2] [--width 432]');
    process.exit(1);
  }
  for (const p of [control, candidate, twin, negative].filter(Boolean)) if (!SAFE.test(p) || p.includes('..')) throw new Error(`not a plain run path: ${p}`);
  const width = Number(opt('width', 432));
  const judges = parseJudges(opt('judges', 'claude:2,gpt:2'));
  const subject = subjectSpec(subjectName);
  const round = `r${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`; // random suffix: rounds built at once get separate folders
  const work = `${ROOT}/work/judge2/${round}`;
  uploadLib();


  const dirs = { control: onBox(control), candidate: onBox(candidate), positive: `${work}/positive`,
    negative: negative ? onBox(negative) : `${work}/negative`, ...(twin ? { twin: onBox(twin) } : {}) };
  // the positive control is built at the control run's own output size, so a run at --inkres 3 is judged at 1620
  const nativeW = JSON.parse(ssh(`cat ${dirs.control}/frames.json`).toString()).width ?? 540;
  const measured = boxJob({
    controls: [
      { kind: 'live', out: dirs.positive, width: nativeW, height: Math.round(nativeW * subject.artSize[1] / subject.artSize[0]), stages: subject.stages, blank: subject.blank },
      ...(negative ? [] : [{ kind: 'degraded', out: dirs.negative, from: dirs.control, median: 7, factor: 2 }]),
    ],
    runs: Object.values(dirs),
    stages: subject.stages.map(({ name, position }) => ({ name, position })),
  }).runs;
  const sel = Object.fromEntries(Object.keys(dirs).map((k, i) => [k, measured[i]]));
  // The positive control's stages are known by definition: frame k020 is the live stage 020, and so on.
  if (sel.positive?.stages) for (const st of subject.names) sel.positive.stages[st] = { frame: `k${st}.png`, why: `the live stage ${st} itself` };
  const sizes = new Set(Object.values(sel).map(s => `${s.native.width}x${s.native.height}`));
  if (sizes.size !== 1) throw new Error(`runs differ in native size (${[...sizes].join(', ')}): render them at one size first`);
  if (sel.positive.native.width < width) throw new Error(`native width ${sel.positive.native.width} is under the tile width ${width}`);
  console.log(`Stages by one rule (measure.mjs selectByPosition), before blinding:`);
  for (const [role, s] of Object.entries(sel)) {
    console.log(`  ${role} ${s.dir}`);
    for (const st of subject.names) console.log(`    ${st} ${s.stages[st]?.frame ?? '-'}: ${s.stages[st]?.why ?? 'none'}`);
  }


  const runs = {
    candidate: { dir: dirs.candidate, sel: sel.candidate }, control: { dir: dirs.control, sel: sel.control },
    'control-copy': twin ? { dir: dirs.twin, sel: sel.twin } : { dir: dirs.control, sel: sel.control }, positive: { dir: dirs.positive, sel: sel.positive },
    negative: { dir: dirs.negative, sel: sel.negative },
  };
  const pres = presentations(Object.keys(runs), judges, randInt).map((p, k) => {
    const id = crypto.randomBytes(4).toString('hex');
    return { ...p, n: k + 1, id, dir: path.resolve(packets, `p-${id}`) };
  });
  const specs = pres.map(p => ({ p, ...judgeImages(p, runs, subject, width, p.dir) }));
  boxJob({ judges: specs.map(s => ({ dir: `${work}/${s.p.id}`, images: s.images })) });


  for (const s of specs) {
    fs.mkdirSync(s.p.dir, { recursive: true });
    execFileSync('tar', ['-xf', '-', '-C', s.p.dir], { input: ssh(`tar -C ${work}/${s.p.id} -cf - .`) });
    writePrompt(s.p, subject, s.lines, s.p.family);
  }
  const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
  const key = {
    subject: subjectName, created: new Date().toISOString(), host: HOST, work, rule: 'selectByPosition: the frame nearest each live stage\'s timeline position, the last frame for the finish', protocol: PROTOCOL, width,
    stages: subject.names, live: subject.stages.map(({ name, position, file }) => ({ name, position, file })), roles: { candidate, control, identical: ['control', 'control-copy'], twin: twin ?? 'the control shown twice', positive: 'the live sequence\'s own stages',
      negative: negative ?? 'control, median 7, half-size blur' },
    runs: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { dir: r.dir, native: r.sel.native, stages: r.sel.stages }])),
    judges: specs.map(({ p, images }) => ({ n: p.n, id: p.id, family: p.family, dir: p.dir, order: p.order, letter: p.letter, pairs: p.pairs,
      images: images.map(i => ({ file: i.file, sha256: hash(path.join(p.dir, i.file)) })) })),
  };
  fs.writeFileSync(`${out}.key.json`, JSON.stringify(key, null, 1));
  for (const { p } of specs) console.log(`judge ${p.n} (${p.family}): ${p.dir}/prompt.md`);
  console.log(`key ${out}.key.json (box ${work})`);
}

/** Run each GPT judge with ordered image attachments and save the final answer. --gptsandbox selects the sandbox. */
async function askGpt(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  await Promise.all(key.judges.filter(j => j.family === 'gpt').map(j => new Promise((resolve, reject) => {
    const images = j.images.flatMap(i => ['-i', path.join(j.dir, i.file)]);
    const last = path.join(j.dir, 'last-message.txt');
    const child = spawn('codex', ['exec', '-s', opt('gptsandbox', 'danger-full-access'), '--skip-git-repo-check', '-C', j.dir, '-o', last, ...images, '--', fs.readFileSync(path.join(j.dir, 'prompt.md'), 'utf8')],
      { stdio: ['ignore', fs.openSync(path.join(j.dir, 'codex.log'), 'w'), fs.openSync(path.join(j.dir, 'codex.err'), 'w')] });
    child.on('exit', code => {
      if (code !== 0) return reject(new Error(`judge ${j.n}: codex exited ${code}, see ${j.dir}/codex.err`));
      const text = fs.readFileSync(last, 'utf8').trim().replace(/^```(json)?\s*|\s*```$/g, '');
      fs.writeFileSync(path.join(j.dir, 'answer.json'), text);
      console.log(`judge ${j.n} (gpt) answered`);
      resolve();
    });
  })));
}

function clean(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  for (const j of key.judges) {
    if (!path.basename(j.dir).startsWith('p-')) throw new Error(`refusing to delete ${j.dir}: not a packet folder`);
    fs.rmSync(j.dir, { recursive: true, force: true });
    console.log(`deleted ${j.dir}`);
  }
}

if (opt('clean')) clean(opt('clean'));
else if (opt('ask-gpt')) await askGpt(opt('ask-gpt'));
else build();
