#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { composition, compositionContext } from './stroke-composition.mjs';
import { readMarkTape } from '../src/media/mark-tape-read.mjs';

export const WIDTH_EDGES = [0, .125, .25, .5, 1, 2, 4, 8, 16, 32, 64, 128, Infinity];
export const LENGTH_EDGES = [0, .5, 1, 2, 3, 6, 12, 24, 48, 96, 192, 384, Infinity];
const positive = (x, name) => { if (!Number.isFinite(x) || x <= 0) throw new Error(`${name} must be positive and finite`); return x; };
const readJSON = f => JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)) : fs.readFileSync(f, 'utf8'));
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const bucket = (x, edges) => edges.findIndex((hi, i) => i > 0 && x < hi) - 1;
const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// A geometric swept-area proxy. Repeated and overlapping marks count again. No claim about pigment deposition.
function measure(points, widths) {
  if (!points.length || points.some(p => p.some(v => !Number.isFinite(v))) || widths.some(w => !Number.isFinite(w) || w < 0)) throw new Error('invalid stroke geometry or width');
  let lengthMm = 0, areaMm2 = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i-1][0], points[i][1] - points[i-1][1]);
    lengthMm += d; areaMm2 += d * (widths[i] + widths[i-1]) / 2;
  }
  const widthMm = median(widths);
  areaMm2 += Math.PI * (widthMm / 2) ** 2;
  return { widthMm, maxWidthMm: Math.max(...widths), lengthMm, areaMm2 };
}

export function normalize(input, { sheetmm } = {}) {
  const marks = [];
  if (Array.isArray(input.marks) && input.w && input.h) {
    const width = positive(Number(sheetmm ?? input.sheetWidthMm ?? input.w * input.mmPerCell), 'sheet width in mm (use --sheetmm or a painter log)');
    const mm = width / input.w, scale = positive(input.scale ?? 1, 'tape scale');
    let frame = 0; const loads = new Map();
    for (const [tapeIndex,m] of input.marks.entries()) {
      if (m.k === 'd') { loads.set(m.b,m.c); continue; }
      if (m.k === 'm') { frame = m.i; continue; }
      if (!['s', 'P'].includes(m.k) || !m.d?.length) continue;
      const pen = m.k === 'P', resolution = pen ? positive(m.r ?? 1, 'pen resolution') : 1;
      const b = pen ? input.penOpts?.[input.pens?.[m.pen] ?? m.pen] : input.brushOpts?.[input.brushes?.[m.b] ?? m.b];
      if (!b) throw new Error('missing recorded brush or pen options');
      const points = m.d.map(q => [q[0] * mm / scale / resolution, q[1] * mm / scale / resolution]);
      const widths = m.d.map(q => pen
        ? (q[5] >= 0 ? q[5] / 100 : b.nib + (b.flex ?? 0) * (q[2] < 0 || q[2] == null ? .5 : q[2] / 100)) * mm / resolution
        : 2 * (q[3] >= 0 ? q[3] / scale : b.radius) * mm);
      marks.push({ kind: pen ? 'pen' : m.wt || (loads.has(m.b) && !loads.get(m.b).some(v=>v>0)) ? 'water' : 'paint', time: frame, tapeIndex, points, widths, pressures:m.d.map(q=>q[2]>=0?q[2]/100:1), ...measure(points, widths) });
    }
    return { tape:input, broadAreas:input.broadAreas, sheet: { widthMm: width, heightMm: input.h * mm }, basis: 'recorded paths', timeUnit: 'saved frame', marks };
  }
  if (Array.isArray(input.commands) && input.grid) {
    const g = input.grid, mm = positive(g.mmPerCell, 'grid.mmPerCell');
    const width = positive(g.w * mm, 'sheet width'), height = positive(g.h * mm, 'sheet height');
    input.commands.forEach((c, time) => {
      if (c.operation === 'dry') return;
      if (c.operation !== 'stroke' || !c.paths?.length) throw new Error('stroke plan must supply paths');
      const widthMm = positive(c.brush?.widthMm, 'brush.widthMm');
      for (const ps of c.paths) {
        const points=ps.map(q=>[q.x*width,q.y*height]), widths=ps.map(q=>q.rMm==null?widthMm:2*q.rMm);
        const concentration=Object.values(c.load?.concentration??{}).reduce((s,v)=>s+v,0);
        marks.push({kind:c.role==='clean-water'?'water':c.role==='pen'?'pen':'paint',time,points,widths,pressures:ps.map(q=>q.p??1),depositRGB:Array(3).fill((c.load?.waterQuantityMm3??1)*concentration),...measure(points,widths)});
      }
    });
    return { broadAreas:input.broadAreas, sheet: { widthMm: width, heightMm: height }, basis: 'planned paths, not proof of execution', timeUnit: 'command index', marks };
  }
  throw new Error('no measurable paths: use a recorded marks.json(.gz) or a stroke plan with grid and commands; value plans and video snapshots alone cannot measure strokes');
}

export function summarize(normalized, context = {}) {
  const { marks, sheet, basis, timeUnit } = normalized;
  const hist = edges => edges.slice(0, -1).map((lo, i) => ({ minMm: lo, maxMm: Number.isFinite(edges[i+1]) ? edges[i+1] : null, paint: 0, pen: 0, water: 0 }));
  const widths = hist(WIDTH_EDGES), lengths = hist(LENGTH_EDGES);
  const area = widths.map(b => ({ minMm: b.minMm, maxMm: b.maxMm, areaMm2: 0, share: 0 }));
  const timeline = new Map();
  for (const m of marks) {
    widths[bucket(m.widthMm, WIDTH_EDGES)][m.kind]++;
    lengths[bucket(m.lengthMm, LENGTH_EDGES)][m.kind]++;
    if (m.kind === 'paint') area[bucket(m.widthMm, WIDTH_EDGES)].areaMm2 += m.areaMm2;
    const t = timeline.get(m.time) ?? { time: m.time, paint: 0, pen: 0, water: 0, paintAreaMm2: 0, broadWashAreaMm2: 0 };
    t[m.kind]++;
    if (m.kind === 'paint') { t.paintAreaMm2 += m.areaMm2; if (m.widthMm > sheet.widthMm / 10 && m.lengthMm >= m.widthMm) t.broadWashAreaMm2 += m.areaMm2; }
    timeline.set(m.time, t);
  }
  const paint = marks.filter(m => m.kind === 'paint'), totalArea = paint.reduce((s, m) => s + m.areaMm2, 0);
  area.forEach(b => { b.share = totalArea ? b.areaMm2 / totalArea : 0; });
  const fraction = pred => paint.length ? paint.filter(pred).length / paint.length : null;
  const maxPaint = paint.reduce((n, m) => Math.max(n, m.maxWidthMm), 0);
  const broad = paint.filter(m => m.widthMm > sheet.widthMm / 10 && m.lengthMm >= m.widthMm);
  const early = paint.slice(0, Math.ceil(paint.length / 4));
  const carried=composition(normalized, {...context,tape:context.tape??normalized.tape});
  return { version: 2, basis, sheet, timeUnit, composition: carried, areaMethod: 'sum of path length times local contact width plus round end cap; overlaps and repeated coats count again; geometry proxy, not unique covered area or deposited pigment',
    counts: { paint: paint.length, pen: marks.filter(m => m.kind === 'pen').length, water: marks.filter(m => m.kind === 'water').length },
    histograms: { widthMm: widths, lengthMm: lengths, paintAreaByWidth: area }, marksOverTime: [...timeline.values()].sort((a,b) => a.time-b.time),
    metrics: { tinyPaintAreaShare:carried.tinyCoveredSheetShare, tinyPaintVisibleShare:carried.tinyVisibleShare, tinyPaintFinalPaperDifferenceShare:carried.tinyFinalPaperDifferenceShare, paintUnder1MmShare: fraction(m => m.widthMm < 1), paintUnder3MmLongShare: fraction(m => m.lengthMm < 3), tinyPaintShare: fraction(m => m.widthMm < 1 || m.lengthMm < 3),
      largestPaintWidthMm: maxPaint, largestPaintWidthSheetFraction: paint.length ? maxPaint / sheet.widthMm : null,
      largestAnyWidthMm: marks.reduce((n,m) => Math.max(n,m.maxWidthMm),0),
      broadWashAreaShare: totalArea ? broad.reduce((s,m) => s+m.areaMm2,0) / totalArea : null,
      earlyBroadWashCount: early.filter(m => m.widthMm > sheet.widthMm / 10 && m.lengthMm >= m.widthMm).length, paintAreaMm2: totalArea },
    reference: { kind: 'practice guide, not a measured human percentile band', broadBrushMm: [25.4, 50.8], midBrushMm: [3, 12], fineBrushMm: [.1, 1],
      note: 'Start with a few connected washes several cm wide, then mid brushes, then selected fine marks. Scale to the sheet and reserves; pen lines are exempt from the paint gate.',
      sources: ['https://www.scottsdaleartschool.org/usr/library/documents/supply-lists/castagnet-alvaro_supply-list_watercolor.pdf', 'https://archive.org/details/systemofwatercol00penl/page/n29/mode/2up'] } };
}

export async function loadStats(inputPath, { sheetmm, log, ...options } = {}) {
  let f = path.resolve(inputPath);
  if (fs.statSync(f).isDirectory()) {
    f = ['marks.json', 'marks.json.gz', 'paint/marks.json', 'paint/marks.json.gz', 'run.json'].map(n => path.join(f,n)).find(n => fs.existsSync(n));
    if (!f) throw new Error('run has no mark tape or stroke-plan run.json; rerun with --marks 1');
  }
  let input = /marks\.json(\.gz)?$/.test(f) ? await readMarkTape(f) : readJSON(f);
  if (input.plan && !input.commands && !input.marks) {
    f = path.isAbsolute(input.plan) ? input.plan : path.resolve(path.dirname(f), input.plan);
    input = readJSON(f);
  }
  let sizeSource = sheetmm == null ? 'input metadata' : '--sheetmm';
  if (sheetmm == null && input.marks && !input.sheetWidthMm && !input.mmPerCell) {
    const dir = path.dirname(f);
    const files = log ? [log] : [path.join(dir,'../run.sh'), path.join(dir,'run.sh'), path.join(dir,'../paint.log'),path.join(dir,'paint.log')];
    for (const p of files) {
      if (!fs.existsSync(p)) continue;
      const s = fs.readFileSync(p,'utf8');
      const exact = s.match(/--sheetmm(?:\s+|=)['"]?([\d.]+)/);
      const physical = s.match(/physical: picture ([\d.]+) mm wide/);
      if (exact || physical) { sheetmm = Number((exact ?? physical)[1]); sizeSource = `${p}${exact ? '' : ' (rounded painter log)'}`; break; }
    }
  }
  const context=input.marks?await compositionContext(f,input,options):{};
  return { ...summarize(normalize(input, { sheetmm }),context), source: f, sizeSource };
}

/**
 * Stats from a tape the painter already holds (src/paint/stroke-ledger.mjs), with the value plan, command log and
 * images found in `dir`. Nothing is read back from marks.json, which a native run may not write or may write larger
 * than one string can hold.
 */
export async function tapeStats(tape, dir, options = {}) {
  const context = await compositionContext(path.join(dir, 'marks.json'), tape, options);
  return { ...summarize(normalize(tape), context), source: 'painter tape', sizeSource: 'input metadata' };
}

export function panelSVG(stats, { title = 'Stroke sizes' } = {}) {
  const colors = { paint: '#246eaa', pen: '#444', water: '#59a5a0' };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 650" role="img"><title>${esc(title)}</title><rect width="760" height="650" fill="#faf8f1"/><g font-family="system-ui,sans-serif" fill="#292929"><text x="20" y="26" font-size="18">${esc(title)}</text><text x="20" y="46" font-size="11">${esc(stats.basis)}; sheet ${stats.sheet.widthMm.toFixed(1)} mm; composition uses clipped deposits and the final image</text>`;
  function chart(rows, x, y, label, mode, edges) {
    const w = 338, h = 140, keys = mode === 'area' ? ['share'] : ['paint','pen','water'];
    const min = edges ? edges[1] / 2 : 1, max = edges ? edges.at(-2) * 2 : rows.length;
    const lx = v => Math.log2(Math.max(v,min)/min) / Math.log2(max/min) * w;
    const peak = mode === 'area' ? 1 : Math.max(1,...rows.flatMap(r => keys.map(k => r[k])));
    svg += `<text x="${x}" y="${y-12}" font-size="13">${esc(label)}</text>`;
    if (mode === 'width') svg += `<rect x="${x+lx(25.4)}" y="${y}" width="${lx(50.8)-lx(25.4)}" height="${h}" fill="#e2d3a3"/><text x="${x+lx(25.4)}" y="${y+12}" font-size="9">wash guide</text>`;
    rows.forEach((r,i) => {
      const left = edges ? lx(r.minMm || min) : i*w/rows.length, right = edges ? lx(r.maxMm ?? max) : (i+1)*w/rows.length;
      keys.forEach((k,j) => { const bh = r[k]/peak*h, bw = (right-left)/keys.length; svg += `<rect x="${x+left+j*bw}" y="${y+h-bh}" width="${Math.max(.5,bw-1)}" height="${bh}" fill="${colors[k]??colors.paint}"><title>${esc(k)}: ${mode==='area' ? (100*r[k]).toFixed(1)+'%' : r[k]}</title></rect>`; });
    });
    svg += `<path d="M${x},${y}v${h}h${w}" fill="none" stroke="#888"/><text x="${x}" y="${y-1}" font-size="9">${mode==='area' ? '100%' : peak}</text>`;
    if (edges) for (const tick of mode === 'length' ? [1,3,12,48,192] : [.25,1,4,16,64]) svg += `<text x="${x+lx(tick)}" y="${y+h+16}" text-anchor="middle" font-size="10">${tick}</text>`;
    else svg += `<text x="${x}" y="${y+h+16}" font-size="10">${esc(stats.timeUnit)}: ${rows[0]?.time??0} to ${rows.at(-1)?.time??0} (equal slots)</text>`;
  }
  chart(stats.histograms.widthMm,20,85,'Contact width (mm, log scale)','width',WIDTH_EDGES);
  chart(stats.histograms.lengthMm,402,85,'Path length (mm, log buckets)','length',LENGTH_EDGES);
  chart(stats.histograms.paintAreaByWidth,20,298,'Swept paint area by width (proxy)','area',WIDTH_EDGES);
  const times = stats.marksOverTime;
  const grouped = Array.from({length:Math.min(40,times.length)},(_,i) => { const a=times.slice(Math.floor(i*times.length/Math.min(40,times.length)),Math.floor((i+1)*times.length/Math.min(40,times.length))); return {time:a[0].time,...Object.fromEntries(['paint','pen','water'].map(k=>[k,a.reduce((s,t)=>s+t[k],0)]))}; });
  chart(grouped,402,298,'Marks over painting order','time');
  svg += `<text x="20" y="480" font-size="12" fill="${colors.paint}">Paint ${stats.counts.paint}</text><text x="150" y="480" font-size="12" fill="${colors.pen}">Pen ${stats.counts.pen}</text><text x="270" y="480" font-size="12" fill="${colors.water}">Water ${stats.counts.water}</text><text x="20" y="504" font-size="11">Practice: connected washes for broad shapes; fine marks for detail. Guide band is qualitative.</text>`;
  svg += compositionBarSVG(stats)+'</g></svg>';
  return svg;
}

export function compositionBarSVG(stats) {
  const c=stats.composition,pct=x=>x==null?'unmeasured':(100*x).toFixed(1)+'%';
  let s='<text x="20" y="532" font-size="13">Composition carried by large, mid and tiny marks (visible paint)</text>';
  if(!c?.depositMeasured)return s+'<text x="20" y="555" font-size="12">Unmeasured: pigment loads or image contribution unavailable.</text>';
  const colors={large:'#246eaa',mid:'#63a88b',tiny:'#d37540'};let x=20;
  for(const g of c.classes) {const width=Math.max(0,g.visibleShare??0)*720;s+=`<rect x="${x}" y="542" width="${width}" height="22" fill="${colors[g.kind]}"><title>${g.kind}: ${pct(g.visibleShare)}</title></rect>`;x+=width;}
  s+=`<rect x="${x}" y="542" width="${Math.max(0,740-x)}" height="22" fill="#ddd"><title>Unattributed paint contribution</title></rect>`;
  s+=`<text x="20" y="583" font-size="11">${c.classes.map(g=>g.kind+' '+pct(g.visibleShare)).join(' · ')} · unassigned ${pct(1-(c.attributedVisibleShare??0))}</text>`;
  s+=`<text x="20" y="603" font-size="11">Tiny covered sheet ${pct(c.tinyCoveredSheetShare)}; visible paint ${pct(c.tinyVisibleShare)}; count ${pct(stats.metrics.tinyPaintShare)}.</text>`;
  s+=`<text x="20" y="623" font-size="11">Broad wash interiors: ${c.broadAreasMeasured?c.broadAreas.length:'unmeasured'}; only tiny reliance inside these areas is gated.</text>`;
  s+='<text x="20" y="642" font-size="10">Per-mark deposit attribution estimate; overlap counted once; transport and lifting are not replayed.</text>';
  return s;
}

export function cliArgs(args) {
  const opts = {}, positional = [];
  for (let i=0;i<args.length;i++) {
    if (args[i].startsWith('--')) { const k=args[i].slice(2); if (!['out','sheetmm','log','mode','config','title','plan','commands','final','ink'].includes(k) || !args[i+1] || args[i+1].startsWith('--')) throw new Error(`unknown option or missing value: ${args[i]}`); opts[k]=args[++i]; }
    else positional.push(args[i]);
  }
  if (positional.length !== 1) throw new Error('usage: stroke-stats.mjs <run directory|marks.json[.gz]|stroke plan> [--sheetmm mm] [--log file] [--out prefix]');
  return { file:positional[0], ...opts, ...(opts.sheetmm == null ? {} : {sheetmm:Number(opts.sheetmm)}) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = cliArgs(process.argv.slice(2)), stats = await loadStats(a.file,a);
    const prefix = path.resolve(a.out ?? 'stroke-stats'); fs.mkdirSync(path.dirname(prefix),{recursive:true});
    fs.writeFileSync(prefix+'.json',JSON.stringify(stats,null,2)+'\n'); fs.writeFileSync(prefix+'.svg',panelSVG(stats,a));
    console.log(JSON.stringify(stats,null,2));
  } catch (e) { console.error('stroke-stats: '+e.message); process.exitCode=2; }
}
