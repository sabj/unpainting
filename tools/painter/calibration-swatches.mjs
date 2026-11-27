import {measurePaper as rawMeasurePaper} from '../../src/paint/methods/wetdry.mjs';
import {SWATCH, swatchMask, swatchLanes, scrapDelivery} from '../../src/paint/methods/scrap-swatch.mjs';
import {markLayout, markDelivery} from '../../src/paint/methods/mark-swatch.mjs';
import {dampScrap, liftShare, DAMP_CHANNEL} from '../../src/paint/methods/damp-swatch.mjs';
import {createBrush as rawBrush, dip as rawDip, stroke as rawStroke, candidateContact as rawContact, thirsty, setWashSplat} from '../../src/media/brush.mjs';
import {step, dry as physicalDry, thicknessTotals} from '../../src/media/sheet.mjs';
import {washPaths, brushedWashPaths, sweepCover, footprintSpread, containPaths, setSweepIntervals} from '../../src/media/wash.mjs';
import {distanceToZero} from '../../src/raster.js';
import {LANE_OVERLAP, FLAT_OVERLAP} from '../../src/paint/methods/wash-strokes.mjs';
import {painterBrushOptions, isSection} from '../plate/painter-brush.mjs';
import {dabSpacingFactor} from '../../src/paint/methods/look-scale.mjs';
import {nativeDryOptions} from './native-paint-mode.mjs';
import {prepareWetBed} from './wet-bed-prep.mjs';
import {layIntoWetBed} from './wet-bed-wait.mjs';
import {waitBesideDamp} from './beside-damp.mjs';

export function createSwatchCalibration(config) {
 const {PIGS,O,PAPER_OPTS,GCHUNK,BRUSH,FINAL_W,UPRIGHT,WASH_FLAT_SPLAY,SPEED_PAPER,NATIVE_PAINT_MODE,PB,w,valuePlan,brush,channels,options,spacing,CAL={},STOCK_TECHNIQUES}=config;
 const opt=(key,fallback)=>options[key]??fallback, num=(key,fallback)=>Number(opt(key,fallback));
 setSweepIntervals(config.coverage);setWashSplat(config.WASH_SPLAT_SETTINGS?.enabled,{water:config.WASH_SPLAT_SETTINGS?.water??2});
 const measurePaper=(target,cells,paperOnly=false,options={})=>rawMeasurePaper(target,cells,paperOnly,{uniform:config.uniform,...options});
 const swatchBrush=()=>brush;
 const WET=T=>T.water>=0.3?Math.min(1,T.water*num('waterscale',1)):T.water;
 const MIX=T=>T.intoWet?T.wetMix:T.wetMix*num('drymix',1);
 const washBridge=(T,b)=>num('loadedcontact',0)>0&&!T.name.startsWith('dry brush')?0:b;
 const createBrush=o=>rawBrush(painterBrushOptions(o));
 const dip=(b,o)=>rawDip(b,channels>o.conc.length?{...o,conc:[...o.conc,...new Array(channels-o.conc.length).fill(0)]}:o);
 const dab=(o,t)=>spacing?{...o,spacing:(o?.spacing??0.7)*dabSpacingFactor({width:w,finalWidth:FINAL_W,onSheet:!t||t.w>=w})}:o;
 const stroke=(b,t,p,o)=>rawStroke(b,t,p,dab(o,t));
 const candidateContact=(b,t,p,o)=>rawContact(b,t,p,dab(o,t));
const section = isSection(painterBrushOptions({}));
const scrapSwatches = (techniques, drySwatch = (scrap,max,o,options)=>physicalDry(scrap,max,o,nativeDryOptions(NATIVE_PAINT_MODE.mode,options)), { damp = false } = {}) => {
  const { want } = SWATCH;
  const CHUNK = opt('gradedwash', '1') !== '0' && !(section && PB) ? Math.max(2, Math.round(GCHUNK)) : 0;
  const layout = (lap = null) => {
    const mask = swatchMask(), { width: SW, height: SH } = SWATCH;
    if (section) {
      const sheetMm = PAPER_OPTS.mmPerCell ?? 0, brush = swatchBrush(), mm = sheetMm > 0 ? Math.max(sheetMm * w / FINAL_W, 32 * brush.radius * sheetMm / (SWATCH.x1 - SWATCH.x0)) : 0;
      const radius = mm > 0 ? brush.radius * sheetMm / mm : brush.radius, flat = brush.flat;
      const paths = swatchLanes(radius, { overlap: lap ?? (flat ? FLAT_OVERLAP : LANE_OVERLAP) }), cover = sweepCover(paths, mask, SW, SH);
      const under = opt('undercover', '1') !== '0' ? 1 / Math.max(num('underfloor', 0.4), Math.min(1, cover)) : 1;
      return { mask, paths, bedPaths: washPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3 }), flat, under: under / Math.max(1, cover) / Math.max(1, footprintSpread(paths, mask, SW, SH)),
        paperOptions: mm > 0 ? { ...PAPER_OPTS, seed: 5, mmPerCell: mm, ...(PAPER_OPTS.coldPress ? { coldPress: { ...PAPER_OPTS.coldPress, mmPerCell: mm } } : {}) } : null };
    }
    let paths = washPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3 });
    if (opt('calpipe', '0') !== '0') {
      const lanes = brushedWashPaths(mask, SW, SH, { pad: 1.5, minRadius: 1, minLength: 3, maxRadius: Math.min(BRUSH, 16), seed: 17, overlap: num('overlap', 0.15) });
      paths = containPaths(lanes, distanceToZero(mask, SW, SH), SW, SH, { minRadius: 0.8, minLength: 2, slack: num('slack', 0.5) }).map(pts => {
        const total = pts.reduce((a, q, i) => a + (i ? Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0) || 1;
        let run = 0;
        return pts.map((q, i) => { if (i) run += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y); const u = run / total;
          return { ...q, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / num('land', 0.06)), Math.min(1, (1 - u) / num('lift', 0.10))))) }; });
      });
    }
    const under = opt('calpipe', '0') !== '0' && opt('undercover', '1') !== '0' ? 1 / Math.max(num('underfloor', 0.4), Math.min(1, sweepCover(paths, mask, SW, SH))) : 1;
    return { mask, paths, under, flat: true };
  };
  const plainSquare = layout(), lapped = new Map(), squareOf = T => { if (!section || !Number.isFinite(T?.lap)) return plainSquare; if (!lapped.has(T.lap)) lapped.set(T.lap, layout(T.lap)); return lapped.get(T.lap); };
  const square = plainSquare;
  const paintOpts = (r, T) => ({ flat: square.flat, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11 });
  const contactOf = (scrap, pts, r, T) => { const b = createBrush(paintOpts(r, T)); rawDip(b, { water: WET(T), conc: [0] }); const c = candidateContact(b, scrap, pts, { upright: UPRIGHT, clip: null, neighborRadius: 0, includeTouched: false }); return c.cells.filter(i => c.primaryMask[i]); };
  const prepareBed = valuePlan ? (scrap, pts, r, T, _lane, cells = contactOf(scrap, pts, r, T)) => prepareWetBed({ settings: paintOpts(r, T), bristles: Math.max(12, Math.ceil(r * 2)), seed: 911, pigments: scrap.K, target: scrap, points: pts, prepOpts: { upright: UPRIGHT, lift: false },
    observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), gate: () => measurePaper(scrap, cells, SPEED_PAPER, { stats: 'gate' }), advance: () => step(scrap, { ...O, dt: 2 }), createBrush, dip, thirsty, stroke }) : null;
  const settle = valuePlan ? (scrap, cells) => { const observe = () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }); layIntoWetBed({ paper: observe(), observe, step: o => step(scrap, o), O, info: { scrap: 'wet on wet swatch', cells: cells.length } }); } : null;
  const envOf = (square = plainSquare) => { const { under, flat: _flat, paperOptions, ...lanes } = square; return { ...lanes, pigment: PIGS[0], physics: O, paperOptions: paperOptions ?? { ...PAPER_OPTS, seed: 5 }, charge: want * num('strength', 2.2) * under, upright: UPRIGHT, water: WET, dip, stroke, step, dry: drySwatch, settle,
    waterBrush: r => createBrush({ flat: square.flat, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 5 }),
    paintBrush: (r, T) => createBrush(paintOpts(r, T)), prepareBed }; };
  return techniques.map(T => {
    const env = envOf(squareOf(T));
    if (damp) {
      const scrap = dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions, wait: dampWait,
        lay: under => scrapDelivery(DAMP_WASH(), { ...env, charge: env.charge * CAL['wet on wet'], scrap: under, channel: DAMP_CHANNEL.under, finish: false }) });
      const before = thicknessTotals(scrap)[DAMP_CHANNEL.under], plain = scrapDelivery({ ...T, intoWet: false }, { ...env, scrap, channel: DAMP_CHANNEL.own });
      return { technique: T, plain: { ...plain, lift: liftShare(before, thicknessTotals(scrap)[DAMP_CHANNEL.under]) }, graded: null };
    }
    return { technique: T, plain: scrapDelivery(T, env), graded: CHUNK ? scrapDelivery({ ...T, name: `${T.name} graded`, chunk: CHUNK }, env) : null };
  });
};
const DAMP_WASH = () => STOCK_TECHNIQUES.find(T => T.name === 'wet on wet');
const dampWait = (scrap, cells) => waitBesideDamp({ observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), step: o => step(scrap, o), O });
const scrapMark = (T, mark) => {
  const sheetMm = PAPER_OPTS.mmPerCell ?? 0, L = markLayout(mark, sheetMm * w / FINAL_W);
  const opts = (r, T) => ({ flat: false, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: num('washfree', 0.4), film: 0.25, splay: WASH_FLAT_SPLAY, stiffness: 8, wetMix: MIX(T), bridge: washBridge(T, T.bridge), bridgeSoft: T.bridgeSoft, seed: 11 });
  const contactOf = (scrap, pts, r, T) => { const b = createBrush(opts(r, T)); rawDip(b, { water: WET(T), conc: [0] }); const c = candidateContact(b, scrap, pts, { upright: UPRIGHT, clip: null, neighborRadius: 0, includeTouched: false }); return c.cells.filter(i => c.primaryMask[i]); };
  const prepareBed = (scrap, pts0, r0, T) => { const r = Math.max(2 * r0, 6), pts = pts0.map(q => ({ ...q, r, p: 1 })), cells = contactOf(scrap, pts, r, T);
    return prepareWetBed({ settings: opts(r, T), bristles: Math.max(12, Math.ceil(r * 2)), seed: 911, pigments: scrap.K, target: scrap, points: pts, prepOpts: { upright: UPRIGHT, lift: false },
    observe: () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }), gate: () => measurePaper(scrap, cells, SPEED_PAPER, { stats: 'gate' }), advance: () => step(scrap, { ...O, dt: 2 }), createBrush, dip, thirsty, stroke }); };
  const settle = (scrap, cells) => { const observe = () => measurePaper(scrap, cells, SPEED_PAPER, { uniform: false }); layIntoWetBed({ paper: observe(), observe, step: o => step(scrap, o), O, info: { scrap: 'wet on wet mark swatch', cells: cells.length } }); };
  const env = { pigment: PIGS[0], physics: O, paperOptions: { ...PAPER_OPTS, seed: 5, mmPerCell: L.mm, ...(PAPER_OPTS.coldPress ? { coldPress: { ...PAPER_OPTS.coldPress, mmPerCell: L.mm } } : {}) },
    upright: UPRIGHT, water: WET, dip, stroke, step, settle, prepareBed,
    dry: (scrap, max, o, options) => physicalDry(scrap, max, o, nativeDryOptions(NATIVE_PAINT_MODE.mode, options)), paintBrush: (r, T) => createBrush(opts(r, T)) };
  const washLanes = () => swatchLanes((SWATCH.x1 - SWATCH.x0) / 16), washMask = () => swatchMask();
  const scrap = mark.damp ? dampScrap({ pigment: env.pigment, paperOptions: env.paperOptions, wait: dampWait,
    lay: under => { const mask = washMask(), paths = washLanes(); scrapDelivery(DAMP_WASH(), { ...env, mask, paths, charge: SWATCH.want * num('strength', 2.2) * CAL['wet on wet'] / Math.max(1, sweepCover(paths, mask, SWATCH.width, SWATCH.height)), scrap: under, channel: DAMP_CHANNEL.under, finish: false }); } }) : null;
  if (!scrap) return markDelivery(T, { ...env, mask: L.mask, paths: L.paths, charge: SWATCH.want * num('strength', 2.2) / L.cover });
  const before = thicknessTotals(scrap)[DAMP_CHANNEL.under], r = markDelivery({ ...T, intoWet: false }, { ...env, mask: L.mask, paths: L.paths, charge: SWATCH.want * num('strength', 2.2) / L.cover, scrap, channel: DAMP_CHANNEL.own });
  return { ...r, lift: liftShare(before, thicknessTotals(scrap)[DAMP_CHANNEL.under], L.mask.reduce((a, v) => a + v, 0) / ((SWATCH.x1 - SWATCH.x0) * (SWATCH.y1 - SWATCH.y0))) };
};
 return {scrapSwatches,scrapMark};
}
