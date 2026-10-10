#!/usr/bin/env node
// Every family of judge at once, per configuration, so a change is seen whole.
//
// Families: plan, execution, composability, tooling, the process and the end result. None is a veto. A change is kept
// on the family it targets; the others show what it cost.
//
//   node tools/judge/concert-judge.mjs <round dir> <config> [config ...] [--only plate,plate] [--frames 24]
//   node tools/judge/concert-judge.mjs <round dir> <config> --part <config>     one configuration's rows, for parallel runs
//   node tools/judge/concert-judge.mjs <round dir> <config> [config ...] --merge  the table from every concert-part-*.json
//
// Reads, per plate: source.jpg, plan.jpg, painting.jpg, wash.jpg and ink.jpg when present, frames.json and its frames,
// the painter's log, and an optional judge.json of per-plate verdicts. Writes concert.json and concert.txt.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { gaussian } from '../../src/keyframes/density.mjs';
import { labPlanes, deltaE2000 } from '../../src/eval/colour.mjs';
import { stageMeasures, stageFlags } from '../../src/eval/stages.mjs';
import { styleOf, orderOf } from '../../src/eval/styles.mjs';
import { separate } from '../../src/crop/inkwash.mjs';
import { legibility } from '../../src/eval/legibility.mjs';

const argv = process.argv.slice(2), dir = argv[0];
const configs = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] ?? '').startsWith('--'));
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const only = opt('only')?.split(','), maxFrames = Number(opt('frames') ?? 24), part = opt('part'), merge = argv.includes('--merge');
const judge = fs.existsSync(path.join(dir, 'judge.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'judge.json'), 'utf8')) : [];

const load = async (f, w, h) => {
  let img = sharp(f).flatten({ background: '#fff' }); if (w) img = img.resize(w, h, { fit: 'fill' });
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];
const dens = (img, pl) => Float32Array.from({ length: img.w * img.h }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(img.data, i) / pl)))));
const blurRGB = (img, s) => { const n = img.w * img.h, o = new Uint8ClampedArray(n * 3); for (let c = 0; c < 3; c++) { const B = gaussian(Float32Array.from({ length: n }, (_, i) => img.data[i * 3 + c]), img.w, img.h, s); for (let i = 0; i < n; i++) o[i * 3 + c] = B[i]; } return o; };
const colourErr = (A, B, n) => { let e = 0, k = 0; for (let i = 0; i < n; i += 3) { e += deltaE2000([A.L[i], A.a[i], A.b[i]], [B.L[i], B.a[i], B.b[i]]); k++; } return e / k; };
const toneErr = (A, B, w, h) => { const a = gaussian(A, w, h, 2), b = gaussian(B, w, h, 2); let e = 0; for (let i = 0; i < a.length; i++) e += Math.abs(a[i] - b[i]); return e / a.length; };
const logOf = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const num = (s, re, k = 1) => { const m = s.match(re); return m ? Number(m[k]) : null; };

const rows = merge
  ? fs.readdirSync(dir).filter(f => /^concert-part-.*\.json$/.test(f)).flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  : [];
for (const c of merge ? [] : configs) {
  const plates = fs.readdirSync(path.join(dir, c)).filter(p => fs.existsSync(path.join(dir, c, p, 'painting.jpg')) && (!only || only.includes(p))).sort();
  for (const plate of plates) {
    const d = path.join(dir, c, plate), log = logOf(path.join(dir, c, `${plate}.log`));
    const paint = await load(path.join(d, 'painting.jpg')), w = paint.w, h = paint.h, n = w * h;
    const src = await load(path.join(d, 'source.jpg'), w, h), plan = await load(path.join(d, 'plan.jpg'), w, h);
    const mx = Math.round(0.05 * w), my = Math.round(0.05 * h);
    const light = [...Array(n).keys()].filter(i => { const x = i % w, y = (i / w) | 0; return x >= mx && y >= my && x < w - mx && y < h - my; }).sort((a, b) => lum(src.data, b) - lum(src.data, a)).slice(0, n / 10 | 0);
    // the same rule as the painter's --paper auto: a cool lightest tenth is a sky, and the reference is white paper
    const lightest = [0, 1, 2].map(k => light.reduce((s, i) => s + src.data[i * 3 + k], 0) / light.length);
    const paper = lightest[2] > lightest[0] + 6 ? [247, 244, 236] : lightest, pl = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
    const SD = dens(src, pl), PD = dens(paint, pl), PLD = dens(plan, pl);
    const LS = labPlanes(blurRGB(src, 2), n, paper), LPl = labPlanes(blurRGB(plan, 2), n, paper), LP = labPlanes(blurRGB(paint, 2), n, paper);

    const fam = {};
    fam.plan = { toneErr: toneErr(PLD, SD, w, h), colour: colourErr(LS, LPl, n) };
    fam.execution = { formsKept: num(log, /forms (\d+)% at agreement/), agreement: num(log, /at agreement ([\d.]+)/), covered: num(log, /covered: (\d+)%/) };
    if (fs.existsSync(path.join(d, 'wash.jpg')) && fs.existsSync(path.join(d, 'ink.jpg'))) {
      const WD = dens(await load(path.join(d, 'wash.jpg'), w, h), pl), ID = dens(await load(path.join(d, 'ink.jpg'), w, h), pl);
      let sw = 0, si = 0, ss = 0, holes = 0, want = 0;
      for (let i = 0; i < n; i++) { sw += WD[i]; si += ID[i]; ss += SD[i]; if (SD[i] > 0.15) { want++; if (PD[i] < 0.5 * SD[i]) holes++; } }
      fam.composability = { washShare: sw / Math.max(1e-6, ss), inkShare: si / Math.max(1e-6, ss), unexplained: want ? holes / want : 0 };
    }
    fam.tooling = {
      sweepsPerMP: (num(log, /(\d+) brush sweeps/) ?? 0) / (n / 1e6), penGestures: num(log, /drawing: (\d+) pen gestures/),
      longShare: num(log, /long share ([\d.]+)/), textureMarks: num(log, /texture marks (\d+)/), glazes: num(log, /(\d+) glazes over/),
      dropped: num(log, /(\d+) passages yielded no brush path/) ?? 0,
    };
    if (fs.existsSync(path.join(d, 'frames.json'))) {
      const fj = JSON.parse(fs.readFileSync(path.join(d, 'frames.json'), 'utf8')).frames;
      const pick = fj.length <= maxFrames ? fj : Array.from({ length: maxFrames }, (_, k) => fj[Math.round(k * (fj.length - 1) / (maxFrames - 1))]);
      const frames = [];
      for (const f of pick) {
        const fp = path.join(d, f.src); if (!fs.existsSync(fp)) continue;
        const img = await load(fp, w, h);
        frames.push({ position: f.position, stage: f.stage, D: dens(img, pl), L: Math.abs(f.position - 0.5) < 0.5 / pick.length + 1e-6 || f === pick[pick.length - 1] ? labPlanes(blurRGB(img, 2), n, paper) : null });
      }
      const withL = frames.filter(f => f.L);
      if (frames.length > 3) {
        // midChroma needs Lab on the frame nearest halfway and on the last; fill any missing
        const nearest = frames.reduce((b, f) => (Math.abs(f.position - 0.5) < Math.abs(b.position - 0.5) ? f : b), frames[0]);
        for (const f of [nearest, frames[frames.length - 1]]) if (!f.L) { const img = await load(path.join(d, pick[frames.indexOf(f)].src), w, h); f.L = labPlanes(blurRGB(img, 2), n, paper); }
        // the source's line, so a drawing made before the washes is not read as specks, and the style's order
        // and the painter's own pen marks, from its ink layer, so the lines it drew are read as drawing wherever they fell
        const inkFile = path.join(d, 'ink.jpg');
        const drawn = fs.existsSync(inkFile) ? (D => Uint8Array.from(D, v => (v > 0.15 ? 1 : 0)))(dens(await load(inkFile, w, h), pl)) : undefined;
        const m = stageMeasures(frames, { D: SD, L: LS, line: separate(src.data, w, h, paper).ink, drawn }, w, h, gaussian);
        // Colours open at once (a painter works one brush and one mix at a time). The finished sheet's painted cells are
        // grouped by hue (k-means on a and b, four groups); for each frame between a tenth and nine tenths of the run, the
        // groups holding at least 5% of the paint that are between 15% and 85% built are counted. Laid colour by colour it
        // reads near one; laid value by value across every pigment, every colour is half built together.
        {
          const PDf = frames[frames.length - 1].D, cells = [];
          for (let i = 0; i < n; i += 2) if (PDf[i] > 0.1) cells.push(i);
          if (cells.length > 50) {
            let cen = [[20, 20], [-20, 20], [-20, -20], [20, -20]];
            const assign = new Int8Array(n).fill(-1);
            for (let it = 0; it < 10; it++) {
              const acc = cen.map(() => [0, 0, 0]);
              for (const i of cells) { let b = 0, bd = Infinity; for (let c = 0; c < 4; c++) { const d = (LP.a[i] - cen[c][0]) ** 2 + (LP.b[i] - cen[c][1]) ** 2; if (d < bd) { bd = d; b = c; } } assign[i] = b; acc[b][0] += LP.a[i]; acc[b][1] += LP.b[i]; acc[b][2]++; }
              cen = acc.map((q, c) => (q[2] ? [q[0] / q[2], q[1] / q[2]] : cen[c]));
            }
            const mass = [0, 0, 0, 0]; for (const i of cells) mass[assign[i]] += PDf[i];
            const total = mass.reduce((a, b) => a + b, 0), base = frames[0].D;
            let sum = 0, cnt = 0;
            for (const f of frames) {
              if (f.position < 0.1 || f.position > 0.9) continue;
              const got = [0, 0, 0, 0]; for (const i of cells) got[assign[i]] += Math.max(0, f.D[i] - base[i]);
              let open = 0; for (let c = 0; c < 4; c++) { if (mass[c] < 0.05 * total) continue; const r = got[c] / mass[c]; if (r > 0.15 && r < 0.85) open++; }
              sum += open; cnt++;
            }
            m.openColours = cnt ? sum / cnt : null;
          }
        }
        fam.stages = { ...m, order: orderOf(plate) ?? 'watercolour', flags: stageFlags(m, { order: orderOf(plate) }), fails: [] };
        // A drawing made before the washes must read alone: the share of the source's main outlines with line near
        // them, on the ink layer, calibrated at 420 px. Ink laid after the washes is not held to it.
        const stages = fj.map(q => q.stage), penAt = stages.indexOf('pen'), washAt = stages.indexOf('wash');
        if (drawn && penAt >= 0 && (washAt < 0 || penAt < washAt)) {
          // lighter threshold than the drawn mask: pencil lines (--outlinemedium graphite) sit at 0.1 to 0.2 OD
          const light = dens(await load(inkFile, w, h), pl), faint = Uint8Array.from(light, v => (v > 0.06 ? 1 : 0));
          const L = legibility(faint, SD, w, h, gaussian);
          fam.stages.legibility = L.score;
          if (L.score < 0.45) fam.stages.fails.push(`the drawing made first does not read on its own: ${(100 * L.silhouette).toFixed(0)}% of the main outlines and ${(100 * L.formEdges).toFixed(0)}% of the form edges drawn (a hand-made beach ink drawing reaches 51% of its outlines)`);
        }
      }
      void withL;
    }
    const j = judge.find(r => r.plate === plate)?.[c];
    const f1 = j ? (j.recall + j.precision > 0 ? 2 * j.recall * j.precision / (j.recall + j.precision) : 0) : null;
    fam.end = j ? { colour: j.colourErr, toneErr: j.toneErr, grain: j.grain, inkF1: f1, lanes: j.lanes, edgeRatio: j.edgeRatio } : { colour: colourErr(LS, LP, n), toneErr: toneErr(PD, SD, w, h) };
    rows.push({ config: c, plate, ...fam });
    process.stdout.write('.');
  }
}
console.log('');
if (part) { fs.writeFileSync(path.join(dir, `concert-part-${part}.json`), JSON.stringify(rows, null, 1)); process.exit(0); }
fs.writeFileSync(path.join(dir, 'concert.json'), JSON.stringify(rows, null, 1));

// means per configuration, family by family, in the order the configurations were given
const avg = (c, get) => { const v = rows.filter(r => r.config === c).map(get).filter(x => typeof x === 'number' && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '  -  ');
const cols = [
  ['plan err', r => r.plan.toneErr], ['plan dE', r => r.plan.colour, 1],
  ['forms%', r => r.execution.formsKept, 0], ['agree', r => r.execution.agreement], ['cov%', r => r.execution.covered, 0],
  ['wash', r => r.composability?.washShare], ['ink', r => r.composability?.inkShare], ['holes', r => r.composability?.unexplained],
  ['sweep/MP', r => r.tooling.sweepsPerMP, 0], ['pen', r => r.tooling.penGestures, 0], ['long', r => r.tooling.longShare],
  ['shapes@33', r => r.stages?.earlyShapes], ['speckle', r => r.stages?.speckle, 1], ['back', r => r.stages?.backwardShare], ['pops', r => r.stages?.pops, 1],
  ['midChroma', r => r.stages?.midChroma], ['midHue', r => r.stages?.midHue, 0], ['reach@25', r => r.stages?.reached?.[0]], ['reach@50', r => r.stages?.reached?.[1]],
  ['line@25', r => r.stages?.lineReached?.[0]], ['wash@25', r => r.stages?.washReached?.[0]], ['legible', r => r.stages?.legibility], ['colours', r => r.stages?.openColours],
  ['end dE', r => r.end.colour, 1], ['end err', r => r.end.toneErr], ['grain', r => r.end.grain], ['ink F1', r => r.end.inkF1], ['edges', r => r.end.edgeRatio],
];
const lines = [['config', ...cols.map(k => k[0])].map((s, i) => (i ? s.padStart(9) : s.padEnd(10))).join('')];
for (const c of configs) lines.push([c.padEnd(10), ...cols.map(([, g, dd]) => f(avg(c, g), dd ?? 2).padStart(9))].join(''));
// the same table per style (src/eval/styles.mjs), for the families a style changes most: the process and the end
const styles = [...new Set(rows.map(r => styleOf(r.plate)))].sort();
const few = cols.filter(([k]) => ['shapes@33', 'speckle', 'midChroma', 'line@25', 'wash@25', 'end dE', 'end err', 'grain', 'ink F1'].includes(k));
for (const s of styles) {
  const sub = rows.filter(r => styleOf(r.plate) === s), plates = [...new Set(sub.map(r => r.plate))].sort();
  lines.push('', `${s} (${plates.join(', ')}), order: ${orderOf(plates[0]) ?? 'watercolour'}; flags ${configs.map(c => `${c} ${sub.filter(r => r.config === c).reduce((a, r) => a + (r.stages?.flags?.length ?? 0), 0)}`).join(', ')}`, [''.padEnd(10), ...few.map(k => k[0].padStart(9))].join(''));
  for (const c of configs) {
    const v = ([, g]) => { const x = sub.filter(r => r.config === c).map(g).filter(y => typeof y === 'number' && Number.isFinite(y)); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN; };
    lines.push([c.padEnd(10), ...few.map(k => f(v(k), k[2] ?? 2).padStart(9))].join(''));
  }
}
const flagCount = c => rows.filter(r => r.config === c).reduce((a, r) => a + (r.stages?.flags?.length ?? 0), 0);
const failCount = c => rows.filter(r => r.config === c).reduce((a, r) => a + (r.stages?.fails?.length ?? 0), 0);
lines.push('', 'stage flags per configuration: ' + configs.map(c => `${c} ${flagCount(c)}`).join(', '));
lines.push('stage failures per configuration: ' + configs.map(c => `${c} ${failCount(c)}`).join(', '));
for (const r of rows) for (const f of r.stages?.fails ?? []) lines.push(`  FAIL ${r.config}/${r.plate}: ${f}`);
fs.writeFileSync(path.join(dir, 'concert.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
