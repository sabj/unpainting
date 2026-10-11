import {OPERATION_NAMES, footprint, applyHandOperation, watchContact} from './worker/operations.js';
import { runTape, SHEET_FIELDS } from './worker/live-tape.js';
import { contactAudit } from './worker/contact-audit.js';
import { releasePath } from './ui/contact.js';
import { handBrushOptions, needsRedip } from './brush-load.js';
// The paint lab's simulation: a sheet of paper, water and pigment, and the instruments that touch it. Runs off the
// page's thread; the page sends strokes and settings, and receives the sheet as pixels or draws into the canvas itself.
//
// The sheet is a real piece of paper: a size in inches and a resolution in dots per inch. Brush and nib sizes arrive in
// millimetres, and the brush's load, the time step and the pen's reach scale with the resolution, so the same painting at
// another dpi is the same painting at finer or coarser grain.
//
// Physics runs on WebGPU (gpu-physics.js) when the browser has it, and on the CPU (sheet.js) otherwise or with ?physics=cpu.
// The colour render follows the physics: the WebGPU path composes straight from the GPU buffers, the CPU path draws with
// WebGL2 (render-gpu.js) or as pixels.
//
// The simulation advances on a step budget per frame and never inside a stroke; dried washes older than the top one are
// folded into the paper's colour, so memory stays flat; a new sheet cancels any demonstration; a held pen blots.
import { makePaper } from './media/paper.js';
import { SURFACES, DEFAULT_SURFACE, paperOptions, paperReflectance } from './media/papers.js';
import { createSheet, step, fix, liftResist, setClip, DEFAULTS } from './media/sheet.js';
import { layerRT } from './media/km.js';
import { PIGMENTS as PALETTE, BY_KEY, SHEET_START } from './media/pigments.js';
import { normalizeMix, mixConcentrations } from './media/mixing.js';
import { createBrush, dip, stroke, strokeReach } from './media/brush.js';
import { addPigment } from './media/lab-media.js';
import { createPen, dipPen, penStroke } from './media/pen.js';
import { createPencil, pencilStroke } from './media/pencil.js';
import { createDryer, blow, dryerReach, TICK, HOLD } from './media/dryer.js';
import { gpuAvailable, createGpuRenderer, lastFailure } from './gpu/render-gpu.js';
import { GpuPhysics } from './gpu/gpu-physics.js';
import { playDemo } from './worker/demos.js';
import { nextChunkSteps } from './worker/pacing.js';
import { EXAMPLES, setTargetPlan } from './targets/examples.js';
import { packSheet, unpackSheet } from './worker/sheet-state.js';
import { markStats, brushPigment } from './worker/marks.js';
import { KernelTimer } from './gpu/gpu-timer.js';
import { savedSheet, saveSheet } from './worker/autosave.js';
import { encodeState, decodeState } from './worker/history.js';
import { runEquiv, runDpi } from './worker/checks.js';

// Pigments (pigments.js): K and S per channel with density, staining power and granulation. A sheet carries only the
// pigments it has used: it starts with six, and the first stroke in another adds it (takePigment below), so a sheet
// painted in two colours costs what it did before the palette grew. The WebGPU sheet holds at most sixteen.
if (PALETTE.length > 16) throw new Error('the palette has more pigments than a sheet can hold');
let NAMES = [...SHEET_START], PIGS = NAMES.map(k => BY_KEY[k]);
const MM = 25.4, REF_DPI = 60; // the resolution the brush and pen were tuned at
// Drying spends the largest GPU budget on unchanged physics steps, with no display-frame
// step limit. Short awaited chunks keep input responsive; only presentation frames are skipped.
// Scripted wet passages retain their existing cadence until the script explicitly dries them.
const GPU_BUDGET_MS = { stroke: 4, idle: 8, play: 250, intro: 250, fast: 400, skip: 1500, drying: 1500 };

let paused = false, ticks = 0, strokes = 0, paperSeed = 7, lastTool = null, marks = [];
let W = 0, H = 0, N = 0, dpi = REF_DPI, res = 1, paperIn = [8, 6], paper, sheet, graphite, baseR, active = null, speed = 2, dryer = false, dirty = true, generation = 0, wasWet = false;
let gpu = null, gpuCanvas = null, baseDirty = true, graphiteDirty = true, renderMs = 0, renderCount = 0, lostTimer = 0, failBlob = false, gpuEpoch = 0;
let perturb = 0, skipRender = false, frameCount = 0, glDims = null;
// A frame's steps go to the GPU in chunks of about CHUNK_MS each, the chunk's size found by feedback on their times, until
// the frame's budget is spent. Pointer down, pause and clear end it at the next chunk.
const CHUNK_MS = 8, DRY_CHUNK_MS = 8, DRY_RENDER_MS = 500;
let chunkSteps = 2, inputArrived = false, pendingInput = 0, lastDryBoost = 1;
let dryWait = null, dryPeak = 0, dryStart = 0, lastDryDraw = 0;
let quickDry = false, quickDryStarted = 0;
let quality = 'fast'; // Full retains the resolution-scaled clock; Fast prioritizes interactive working time.
let skipping = false; // the demonstration was asked to skip to its end
// The band at a wash's edge where water evaporates faster, and so the dark rim, is two cells at the reference 60 dpi: about
// 0.85 mm. Held at two cells it shrank to a quarter millimetre at 200 dpi and the rim all but vanished; it is a length.
const edgeCells = () => Math.max(DEFAULTS.edgeWidth, Math.round(DEFAULTS.edgeWidth * dpi / REF_DPI));
let surface = DEFAULT_SURFACE, paperMemo = null, baseIsBare = true; // the kind of paper (papers.js); the last paper made, kept for a new sheet of the same
// demoPlaying: the budget a playing demonstration ('play') or painting in progress ('fast') takes; simTime: the sheet's own
// clock, the sum of its time steps; gpuFrameMs: the last frame's WebGPU step time; moveT: when the page sent the last stroke

let demoPlaying = null, simTime = 0, gpuFrameMs = 0, moveT = 0, lastInputDraw = 0;
let phys = null, physReason = '', physCtx = null, physName = '', stepDebt = 0, lastDt = null, lastWet = false, det = false, frameMs = 0, stepMs = 0, stepCount = 0, strokeMs = 0;

// ---- ordering ------------------------------------------------------------------------------------------------------
// Everything that touches the sheet runs one at a time, in the order it was asked for. With WebGPU physics an operation
// can wait on a read-back, and the frame timer must not run in the middle of a stroke.
let tail = Promise.resolve();
const locked = fn => { const r = tail.then(fn); tail = r.catch(() => {}); return r; };

const scaleReservoirEligible = t => {
  const diameterIn = t.sizeMm / MM;
  return t.tool === 'flat' && Math.abs(t.water - 1) < 0.001 && Math.abs(H / W - 3 / 4) < 0.005 && diameterIn >= 0.25 && diameterIn <= 0.5;
};

async function newSheet({ paperW = 8, paperH = 6, dpi: d = REF_DPI, seed = 7, naive = false, surface: kind = surface }) {
  operation=null;masksDirty=true;replayPoint=null;
  heldTool=null; demoPlaying=null; generation++; dryWait = null; quickDry = false; dryPeak = 0; dryStart = 0; active = null; ticks = 0; simTime = 0; strokes = 0; paperSeed = seed; lastTool = null; wasWet = false; marks = []; stepDebt = 0; lastDt = null; lastWet = false;
  dpi = d; res = naive ? 1 : dpi / REF_DPI; paperIn = [paperW, paperH];
  W = Math.round(paperW * dpi); H = Math.round(paperH * dpi); N = W * H;
  if (gpuCanvas) { gpuCanvas.width = W; gpuCanvas.height = H; }
  surface = SURFACES[kind] ? kind : DEFAULT_SURFACE;
  // a fine sheet's paper takes a second or more to make, and New sheet asks for the same paper again
  const memo = `${surface} ${W} ${H} ${dpi} ${seed}`;
  // mmPerCell tells the brush the cell's real size, for the hand's millimetre-scale wander and the wet rim's tooth
  if (paperMemo?.key !== memo) paperMemo = { key: memo, paper: { ...makePaper(W, H, paperOptions(surface, dpi, seed)), mmPerCell: MM / dpi } };
  paper = paperMemo.paper;
  NAMES = [...SHEET_START]; PIGS = NAMES.map(k => BY_KEY[k]);
  sheet = createSheet(paper, PIGS); graphite = new Float32Array(N);
  baseR = new Float32Array(N * 3); // reflectance of the paper with every folded (older) dried wash on it
  baseR.set(bareBase());
  baseIsBare = true;
  dirty = true; baseDirty = true; graphiteDirty = true;
  if (phys) { phys.setOptions({ sizing: SURFACES[surface].sizing, edgeWidth: edgeCells() }); phys.setPigments(PIGS); await phys.load(sheet, baseR, graphite); }
  else if (gpu && gpuCanvas && (glDims[0] !== W || glDims[1] !== H || glDims[2] !== PIGS.length)) rebuildGl();
  postMessage({ type: 'sheet', width: W, height: H, dpi, paperIn, surface, physics: phys ? 'webgpu' : 'cpu' });
}

// The WebGL2 render is built for the sheet's size and pigment count: either changing means a new one.
function rebuildGl() {
  gpu?.dispose(); gpu = createGpuRenderer(gpuCanvas, PIGS); glDims = [W, H, PIGS.length];
  if (gpu) baseDirty = true; else useCpu();
}
// The first stroke in a pigment the sheet does not carry yet adds it. With WebGPU physics the CPU copy is made current
// first and the sheet goes up again at the new size; with the WebGL2 render the shader is rebuilt for the new count.
async function takePigments(keys) {
  const added=keys.filter(key=>!NAMES.includes(key));
  if (!added.length) return;
  if (phys) await phys.syncAll(sheet);
  NAMES = [...NAMES, ...added]; PIGS = [...PIGS, ...added.map(key=>BY_KEY[key])];
  for(const key of added)addPigment(sheet, BY_KEY[key]);
  if (phys) { phys.setPigments(PIGS); await phys.load(sheet, baseR, graphite); baseDirty = true; graphiteDirty = true; }
  else if (gpu && gpuCanvas) rebuildGl();
  dirty = true;
}

// composite one layer of per-pigment masses over a reflectance buffer, in place
function glaze(R, layer) {
  const K = layer.length;
  for (let i = 0; i < N; i++) {
    let xt = 0; for (let k = 0; k < K; k++) xt += layer[k][i];
    if (xt <= 1e-7) continue;
    for (let c = 0; c < 3; c++) {
      let Kc = 0, Sc = 0; for (let k = 0; k < K; k++) { const f = layer[k][i] / xt; Kc += f * PIGS[k].K[c]; Sc += f * PIGS[k].S[c]; }
      const [Rl, Tl] = layerRT(Kc, Sc, xt), r = R[i * 3 + c]; R[i * 3 + c] = Rl + (Tl * Tl * r) / (1 - Rl * r);
    }
  }
}
// the bare paper's reflectance, its colour shaded by its surface: a new sheet's baseR before any wash is folded into it
function bareBase() {
  return paperReflectance(paper, surface, dpi);
}
// keep only the top dried wash as masses (new water can lift it); fold older ones into the paper's colour
function foldLayers() { if(sheet.resist){baseDirty=true;return;}while (sheet.layers.length > 1) { glaze(baseR, sheet.layers.shift()); baseIsBare = false; baseDirty = true; } }

// While masking fluid is on, retain removable layers as masses. Compose their
// colour into a temporary base rather than permanently baking it into the paper.
function renderBase() {
  if(sheet.layers.length<2)return baseR;
  const out=Float32Array.from(baseR);
  for(const layer of sheet.layers.slice(0,-1))glaze(out,layer);
  return out;
}
const concOf = (pigment, amount) => NAMES.map(k => (k === pigment ? amount : 0));

// ---- instruments ---------------------------------------------------------------------------------------------------
// With WebGPU physics the sheet's truth is on the GPU. An instrument reads the stale tiles of the rectangle it can reach
// back to the CPU copy, works there, and sends the rectangle up.
async function touching(points, reach, work) {
  const t0 = performance.now();
  if (!phys) work(); else { const rect = phys.rect(points, reach); await phys.ensureFresh(sheet, rect); work(); phys.up(sheet, rect); }
  strokeMs += performance.now() - t0;
}
// the cells a brush step can touch: the painter's own margin round a stroke (the footprint, the tuft's hairs, the hand's wander)
const brushReach = b => strokeReach(b, paper);
const penReach = p => Math.ceil(p.nib + p.flex + p.reach + p.pad + 6);
const contactVerdict = () => ({surfaceWet: phys ? phys.sheet.surfaceWet : sheet.M.some(v=>v), wholeSimulatorDry: phys ? phys.sheet.knownDry : !lastWet, wetTiles: phys?.sheet.wetTiles ?? null, surfaceTiles: phys?.sheet.surfaceTiles ?? null, ticks, stepCount, paused, dryer, criterion:'existing M flag or pore water >0.02*paper capacity; GPU active-tile reduction, no forced drying'});
async function auditContact(stage, brush, points) {
  if (!points?.length) return;
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('Invalid diagnostic future contact path');
  const reach = brushReach(brush), rect = phys ? phys.rect(points, reach) : (() => {
    const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-reach)),y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-reach));
    return [x,y,Math.min(W,Math.ceil(Math.max(...points.map(p=>p.x))+reach)+1)-x,Math.min(H,Math.ceil(Math.max(...points.map(p=>p.y))+reach)+1)-y];
  })();
  const [x,y,w,h] = rect, x0=Math.max(0,x-2), y0=Math.max(0,y-2), x1=Math.min(W,x+w+2), y1=Math.min(H,y+h+2), neighbors=[];
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(xx<x||xx>=x+w||yy<y||yy>=y+h)neighbors.push(yy*W+xx);
  if (phys) await phys.ensureFresh(sheet, [x0,y0,x1-x0,y1-y0]);
  postMessage({type:'contact-audit',stage,strokes,at:performance.now(),verdict:contactVerdict(),measurement:contactAudit(sheet,brush,rect,neighbors)});
}


let operation=null, postedOperation, masksDirty=true;
function nameOperation(kind, mask=null, extra={}) {
 operation={kind,label:OPERATION_NAMES[kind]||kind,mask,...extra};
 postMessage({type:'operation',...operation});
}
async function handOperation(a,b) {
 const mask=footprint(W,H,a,b,active.radius);
 if(phys)await phys.syncAll(sheet);
 applyHandOperation(sheet,active.kind,mask);
 if(phys)await phys.load(sheet,baseR,graphite);
 masksDirty=true;operation={...operation,mask};dirty=baseDirty=true;
}
let heldTool=null;
const toolLoad=()=>{const a=active||heldTool;if(a?.kind==='pen')return {water:a.pen.ink,pigment:a.pen.ink*a.pen.conc.reduce((s,v)=>s+v,0)};if(a?.kind==='brush')return {water:a.brush.resW+a.brush.hairs.reduce((s,h)=>s+h.water,0),pigment:brushPigment(a.brush)};return null;};
async function begin(pt, t) {
  quickDry = false;
  if(['mask','blot','lift'].includes(t.tool)){
    active={kind:t.tool,radius:t.sizeMm/2/MM*dpi,last:pt};
    nameOperation(t.tool);await handOperation(pt,pt);return;
  }
  if(t.tool==='water')nameOperation('water');
  // a palette pigment the sheet has not used yet joins it before the brush is dipped; an unknown name paints in walnut
  // the hair dryer blows rather than marks: no pigment, no stroke counted, a nozzle whose airflow reaches the size set
  if (t.tool === 'dryer') {
    const dryerTool = createDryer({ radius: (t.sizeMm / MM) * dpi, res });
    active = { kind: 'dryer', dryer: dryerTool, last: pt };
    nameOperation('dryer',footprint(W,H,pt,pt,dryerTool.radius));
    await touching([pt], dryerReach(dryerTool), () => blow(dryerTool, sheet, pt, TICK)); dirty = true;
    return;
  }
  const paintKey = BY_KEY[t.pigment] ? t.pigment : SHEET_START[0];
  const painting=t.tool==='round'||t.tool==='flat';
  if(t.tool==='pen')await takePigments(['walnut']);
  const mixture=painting&&t.mixture ? normalizeMix(t.mixture) : null;
  if (painting) await takePigments(mixture?Object.keys(mixture):[paintKey]);
  const signature=JSON.stringify({...t,auditPoints:undefined,autoRedip:undefined});
  if(!demoPlaying&&heldTool?.signature===signature&&!(heldTool.kind==='brush'&&needsRedip(heldTool.brush,t.autoRedip!==false))){active={...heldTool,last:pt,mark:{mm:t.sizeMm,paint:0,before:toolLoad()?.pigment||0}};marks.push(active.mark);strokes++;return;}
  heldTool=null;
  dryPeak = 0; dryStart = ticks;
  strokes++;
  const sizeRef = (t.sizeMm / 2 / MM) * REF_DPI, radius = (t.sizeMm / 2 / MM) * dpi; // radius in the reference pixels and in this sheet's
  const pigment = t.tool === 'pen' ? 'walnut' : t.tool === 'pencil' ? 'graphite' : t.tool === 'water' ? 'none' : paintKey;
  lastTool = { name: t.tool, size: t.sizeMm, pigment: mixture?'mix':pigment, ...(mixture?{mixture,concentration:t.amount,water:t.water}:{}), reservoir: t.reservoirMode === 'area' && scaleReservoirEligible(t) ? 'scale-aware' : null };
  const mark = { mm: t.sizeMm, tool: t.tool, paint: 0, before: 0 };
  if (t.tool === 'pen') {
    // the nib, flex, reach and reservoir are physical: a finer sheet has more cells across the same nib and more ink to fill them
    const nibMm = ((0.6 + sizeRef * 0.08) / REF_DPI) * MM; mark.mm = nibMm;
    const pen = createPen({ nib: (0.6 + sizeRef * 0.08) * res, flex: 1.5 * res, reach: 12 * res, travel: 1.5 * res, reservoir: 250 * res * res, drop: 2 * res * res, strength: 0.6 + t.amount });
    dipPen(pen, concOf('walnut', 7)); // a drawing ink is several units of pigment per unit of water, not one
    mark.before = (pen.ink + pen.drop) * 7; marks.push(mark);
    active = { kind: 'pen', pen, last: pt, mark, signature }; return;
  }
  if (t.tool === 'pencil') { mark.mm = (((0.5 + sizeRef * 0.05) * 2) / REF_DPI) * MM; marks.push(mark); active = { kind: 'pencil', pencil: createPencil({ point: (0.5 + sizeRef * 0.05) * res, hardness: 0.5 }), last: pt, mark }; return; }
  const flat = t.tool === 'flat', water = t.tool === 'water';
  const seed = (paperSeed * 997 + strokes * 7919) % 2147483647;
  // a hair's load grows with the resolution so a brush holds as much paint per inch of sheet as it did at the reference
  const brushOptions = handBrushOptions(t, { dpi, res, seed });
  const { belly } = brushOptions;
  const brush = createBrush(brushOptions);
  // Opt-in Lab experiment, admitted only for a full wet brush; lower-water scale cases failed the coverage/travel gate.
  if (!water && t.reservoirMode === 'area' && scaleReservoirEligible(t)) {
    const referenceScale = 720 / W;
    const referenceRadius = radius * referenceScale;
    const referenceBristles = Math.max(12, Math.round(referenceRadius * (flat ? 2.3 : 2)));
    const reference = createBrush({ ...brushOptions, radius: referenceRadius, bristles: referenceBristles });
    const hairLength = b => b.hairs.reduce((sum, hair) => sum + hair.len, 0);
    const areaScale = Math.sqrt((W / 720) * (H / 540));
    const targetLoad = brush.capacity * (hairLength(reference) + reference.hairs.length * belly) * areaScale ** 2;
    brush.belly = Math.max(0, (targetLoad / brush.capacity - hairLength(brush)) / brush.hairs.length);
  }
  dip(brush, { water: t.water, conc: water ? concOf(null, 0) : mixture ? mixConcentrations(mixture,t.amount,NAMES) : concOf(paintKey, t.amount) });
  mark.before = brushPigment(brush); marks.push(mark);
  active = { kind: 'brush', brush, last: pt, mark, signature, auditPoints: t.auditPoints };
  if (t.auditPoints?.length) await auditContact('before-initial', brush, t.auditPoints);
  // The brush first marks the paper on the first move, which gives the footprint its heading. A contact laid as the
  // pointer goes down has none, and a wide brush left a hairline across the start of every stroke.
}
async function move(pt) {
  if (!active) return;
  const a = active.last, b = pt, still = Math.hypot(b.x - a.x, b.y - a.y) < 0.4;
  if (still) {
    if (active.kind === 'dryer' && pt.dwell) { await touching([a], dryerReach(active.dryer), () => blow(active.dryer, sheet, a, HOLD)); dirty = true; }
    if (active.kind === 'pen' && pt.dwell) { await touching([a], penReach(active.pen), () => penStroke(active.pen, sheet, [{ ...a, dwell: pt.dwell }])); dirty = true; }
    return;
  }
  if(['mask','blot','lift'].includes(active.kind)){await handOperation(a,b);active.last=pt;return;}
  if(operation&&['dryer','water'].includes(operation.kind))operation={...operation,mask:footprint(W,H,a,b,active.dryer?.radius??active.brush?.radius??1)};
  if (active.kind === 'dryer') await touching([a, b], dryerReach(active.dryer), () => blow(active.dryer, sheet, b, TICK));
  else if (active.kind === 'brush') { const br = active.brush, pts = br.tip ? [a, b, br.tip] : [a, b]; await touching(pts, brushReach(br), () => stroke(br, sheet, [a, b], { lift: false })); }
  else if (active.kind === 'pen') { const v = Math.max(0.3, b.v ?? 1); await touching([a, b], penReach(active.pen), () => penStroke(active.pen, sheet, [{ ...a, v }, { ...b, v }])); }
  else { pencilStroke(active.pencil, paper, graphite, [a, b]); graphiteDirty = true; }
  active.last = pt; dirty = true;
}
async function end(endpoint) {
  if (active?.kind === 'brush') {
    const br = active.brush, last = active.last, tail = endpoint ?? last;
    await touching(br.tip ? [last, tail, br.tip] : [last, tail], brushReach(br), () => stroke(br, sheet, releasePath(last, tail), { lift: true }));
    active.mark.paint = Math.max(0, active.mark.before - brushPigment(br));
    if (active.auditPoints?.length) await auditContact('after-lift', br, active.auditPoints);
  } else if (active?.kind === 'pen') active.mark.paint = Math.max(0, active.mark.before - (active.pen.ink + active.pen.drop) * 7);
  if(!demoPlaying&&active?.signature)heldTool=active;
  active = null; operation=null;dirty = true;
}

// ---- render --------------------------------------------------------------------------------------------------------
// The sheet as RGBA, on the CPU. The fallback, and the reference the GPU renders are checked against.
function renderCpu() {
  const R = Float32Array.from(renderBase()), top = sheet.layers[sheet.layers.length - 1];
  if (top) glaze(R, top);
  const current = sheet.G.map((Gk, k) => { const out = new Float32Array(N), Dk = sheet.D[k], Pk = sheet.P[k]; for (let i = 0; i < N; i++) out[i] = Gk[i] + Dk[i] + Pk[i]; return out; });
  glaze(R, current);
  const rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const g = Math.exp(-graphite[i] * 0.9), sheen = sheet.W[i] > 0.02 ? 1 - Math.min(0.025, sheet.W[i] * 0.03) : 1, reflection = Math.min(0.025, Math.max(0, sheet.W[i]) * 0.06);
    rgba[i * 4] = (R[i * 3] * g * sheen - reflection) * 255; rgba[i * 4 + 1] = (R[i * 3 + 1] * g * sheen) * 255; rgba[i * 4 + 2] = (R[i * 3 + 2] * g * sheen + reflection) * 255; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
// The same sheet drawn by the WebGL2 renderer into the page's canvas; no pixels come back.
function renderGl(forceBase = false) {
  gpu.draw({ G: sheet.G, D: sheet.D, P: sheet.P, W: sheet.W, graphite, baseR:renderBase(), top: sheet.layers[sheet.layers.length - 1] || null, baseDirty: baseDirty || forceBase });
  baseDirty = false;
}
// The WebGPU composer draws from the physics buffers, into the canvas or into its pixel buffer.
function drawPhys() {
  if (baseDirty) { phys.setBase(renderBase()); baseDirty = false; }
  if (graphiteDirty) { phys.setGraphite(graphite); graphiteDirty = false; }
  phys.draw(physCtx);
}

// What the page's brush preview needs from the brush in hand, sent with the frame: the tuft's tip and bend, each hair's length
// (tuft only) and the water it carries as a share of a full hair. Null between strokes, and for the pen and pencil.
const cursorState = () => {
  if (active?.kind !== 'brush') return null;
  const b = active.brush;
  return { tip: b.tip ? { x: b.tip.x, y: b.tip.y } : null, bend: b.bend, len: b.model === 'tuft' ? b.hairs.map(h => h.len) : null, sat: b.hairs.map(h => h.water / (b.capacity * h.len || 1)) };
};

async function render() {
  const t0 = performance.now();
  let rgba = null, drawn = 0;
  if (phys) { if (!phys.lost) { drawPhys(); if (physCtx) drawn = gpuEpoch; else rgba = await phys.readPixels(); } }
  else if (gpu) { if (!gpu.isLost()) { renderGl(); drawn = gpuEpoch; } } else rgba = renderCpu();
  let wetCells = 0; if (phys) wetCells = lastWet ? 1 : 0; else for (let i = 0; i < N; i++) wetCells += sheet.M[i];
  renderMs += performance.now() - t0; renderCount++;
  const drawnMove = moveT; moveT = 0;
  if ((drawnMove || demoPlaying==='live') && phys) await phys.idle(); // acknowledge completed GPU work, not only submission
  const drying = !active && !paused && Boolean(wetCells) && (!demoPlaying || Boolean(dryWait));
  const wetArea = phys ? (dryWait === 'surface' ? phys.sheet.surfaceTiles : phys.sheet.wetTiles) : wetCells;
  if (drying) dryPeak = Math.max(dryPeak, wetArea || 0);
  const dryingProgress = drying && dryPeak ? Math.max(0, 1 - wetArea / dryPeak) : 0;
  postMessage({ type: 'frame', operation:operation===postedOperation?undefined:operation, masks:masksDirty?{resist:sheet.resist,clip:sheet.clip}:undefined, replayPoint:replayPoint||(demoPlaying&&active?.last?{...active.last,r:active.brush?.radius||active.pen?.nib||1}:null), load: toolLoad(), drying, dryingProgress, dryingSteps: ticks - dryStart, quickDry, quality, moveT: drawnMove, gpuSteps: chunkSteps, gpuFrameMs, rgba, wet: wetCells, layers: sheet.layers.length, dryer, paused, ticks, strokes, lastTool, paperSeed, renderMs, renderCount, gpuDrawn: drawn, marks: markStats(marks, MM), stepMs, stepCount, cursor: cursorState(), physics: phys ? 'webgpu' : 'cpu' }, rgba ? [rgba.buffer] : []);
  masksDirty=false;postedOperation=operation;
}

// Real GPU time per draw from timer queries (EXT_disjoint_timer_query_webgl2), or null where the extension is missing.
function timedGpu(runs) {
  if (!gpu.hasTimer) return null;
  gpu.setTimer(true); gpu.pollTimer();
  for (let i = 0; i < runs; i++) renderGl();
  gpu.finish();
  let times = [];
  for (let tries = 0; tries < 50 && times.length < runs; tries++) { times = times.concat(gpu.pollTimer()); if (times.length < runs) gpu.finish(); }
  gpu.setTimer(false);
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
}

// Both renders of the current sheet with timings, for the equivalence check and the speed comparison.
async function probe({ runs = 5 }) {
  if (phys) await phys.syncAll(sheet);
  const cpuRgba = renderCpu(); let t = performance.now();
  for (let i = 0; i < runs; i++) renderCpu();
  const cpuMs = (performance.now() - t) / runs;
  let gpuRgba = null, gpuMs = null, gpuParts = null, gpuTimerMs = null;
  if (phys && !phys.lost) {
    drawPhys(); gpuRgba = await phys.readPixels(); t = performance.now();
    for (let i = 0; i < runs; i++) { drawPhys(); await phys.idle(); }
    gpuMs = (performance.now() - t) / runs; gpuParts = { renderer: `webgpu ${phys.name}` };
  } else if (gpu && !gpu.isLost()) {
    renderGl(true); gpu.finish(); gpuRgba = gpu.readPixels(); Object.assign(gpu.timing, { fill: 0, upload: 0, draw: 0 }); t = performance.now();
    for (let i = 0; i < runs; i++) { renderGl(); gpu.finish(); }
    gpuMs = (performance.now() - t) / runs;
    gpuTimerMs = timedGpu(runs); gpuParts = { fill: gpu.timing.fill / runs, upload: gpu.timing.upload / runs, draw: gpu.timing.draw / runs, renderer: gpu.timing.renderer };
  }
  const water = Float32Array.from(sheet.W);
  postMessage({ type: 'probe', water, cpu: cpuRgba, gpu: gpuRgba, cpuMs, gpuMs, gpuTimerMs, gpuParts, gpuEpoch, layers: sheet.layers.length, physics: phys ? 'webgpu' : 'cpu' }, [cpuRgba.buffer, water.buffer, ...(gpuRgba ? [gpuRgba.buffer] : [])]);
}

// ---- time ----------------------------------------------------------------------------------------------------------
// One frame: the steps the speed setting asks for, a fix when the sheet has just dried, and a render when anything changed.
// The time step shrinks and the steps multiply with the square of the resolution, so a finer sheet dries on the same clock.
async function frame(force = false, exact = false) {
  // A timer already queued ahead of pointerdown must not start another long drying frame.
  if (!sheet || (!exact && (pendingInput || demoPlaying === 'live'))) return;
  if (paused && !force) { if (dirty) { await render(); dirty = false; } return; }
  // A deliberate Dry layer or demo drying stage uses the existing strong dryer at every resolution.
  // This is accelerated drying, not a promise of the same evolution as slow natural drying.
  // Deterministic diagnostics and an ordinary manual dryer retain their original clock.
  const t0 = performance.now(), strongDry = !exact && quality === 'fast' && (quickDry || Boolean(dryWait) || dryer && demoPlaying === 'fast');
  const dt = strongDry ? 2 : (dryer || quickDry ? 2 : 0.3) / (res * res);
  // Fast drying accelerates evaporation in both the film and the paper's pores.
  // Keeping pore evaporation at its natural rate made a finished landscape wait another13s.
  const dryBoost = strongDry ? 4 : 1;
  const dryingOptions = { dt, evap: DEFAULTS.evap * dryBoost, edgeEvap: DEFAULTS.edgeEvap * dryBoost, paperDry: DEFAULTS.paperDry * dryBoost };
  stepDebt += (force ? 1 : speed) * res * res; const want = Math.floor(stepDebt); stepDebt -= want;
  let wet = false, steps = 0;
  if (phys) {
    if (dt !== lastDt || dryBoost !== lastDryBoost) { phys.setOptions(dryingOptions); lastDt = dt; lastDryBoost = dryBoost; }
    // A stroke's points wait on each frame, so a stroke takes the small budget even while a demonstration plays. A step's cost
    // follows the wet area. A check that counts steps runs them all.
    const fastDry = !exact && !active && (quickDry || dryer || Boolean(dryWait));
    const mode = active ? 'stroke' : fastDry ? 'drying' : skipping ? 'skip' : demoPlaying ?? 'idle';
    // A painting in progress takes no steps while its own stroke is down. Each step leaves the CPU copy stale, and a fine
    // sheet's wide wash brush then read its whole reach back for every point: about 6 MB a point at 200 dpi.
    // the physics in hand for the whole frame: a check may swap it out while this frame waits on the GPU
    const ph = phys, run = exact ? want : active && demoPlaying === 'fast' ? 0 : fastDry ? Infinity : want, t1 = performance.now();
    let any = false; inputArrived = false;
    while (steps < run) {
      if (!exact && steps > 0 && (performance.now() - t1 >= GPU_BUDGET_MS[mode] || inputArrived || (!force && paused))) break;
      // A glaze must stop at the same surface-dry boundary as the CPU path.
      // Large idle batches can otherwise continue into pore drying before the next layer.
      const boundary = dryWait === 'surface' ? Math.max(1, want) : Infinity;
      // Preserve the old adaptive smaller quantum until feedback can carry a full boundary.
      const surfaceBatch = !exact && fastDry && dryWait === 'surface' && Math.floor(chunkSteps) >= boundary;
      const wave = surfaceBatch ? boundary * Math.max(1, Math.floor(chunkSteps / boundary)) : boundary;
      const n = exact ? run : Math.min(run - steps, wave, mode === 'stroke' ? 1 : Math.max(1, Math.floor(chunkSteps)));
      const measured = !ph.sheet.knownDry, t2 = performance.now();
      let ran = n;
      if (surfaceBatch) { const result = await ph.stepSurface(n, boundary); wet = result.wet; ran = result.steps; }
      else wet = await ph.step(n);
      any = true; steps += ran; ticks += ran;
      if (measured && !exact) chunkSteps = nextChunkSteps(chunkSteps, ran, performance.now() - t2, fastDry ? DRY_CHUNK_MS : CHUNK_MS);
      // Present about two drying frames per second; every physics step still runs. Yielding at
      // the short read-back chunks lets a new stroke, pause or clear interrupt the large budget.
      lastWet = wet;
      if (fastDry && !inputArrived && !skipRender && !skipping && (dirty || performance.now() - lastDryDraw >= DRY_RENDER_MS)) {
        await render(); dirty = false; lastDryDraw = performance.now();
      }
      if (!wet || (dryWait === 'surface' && !ph.sheet.surfaceWet)) break;
    }
    if (!any) wet = lastWet;
    else if (!exact) gpuFrameMs = performance.now() - t1;
    lastWet = wet;
  } else {
    const o = { ...DEFAULTS, ...dryingOptions, flow: DEFAULTS.flow * (1 + perturb), sizing: SURFACES[surface].sizing, edgeWidth: edgeCells() }; // perturb: a test's noise floor
    // advance on a budget: at most `want` steps, and never more than 18 ms of work in one frame (unless a check needs exact counts)
    while (steps < want && (exact || performance.now() - t0 < 18)) { wet = step(sheet, o) || wet; steps++; ticks++; }
    lastWet = wet;
  }
  stepMs += performance.now() - t0; stepCount += steps; simTime += steps * dt;
  if (quickDry && (!wetNow() || performance.now() - quickDryStarted > 12000)) {
    const ready = !wetNow(); quickDry = false; dirty = true;
    operation=null;postMessage({ type: 'dry-layer-done', ready });
  }
  if (!wet && wasWet && !active) { if (phys) await phys.fix(sheet); else fix(sheet); foldLayers(); dirty = true; }
  wasWet = wet;
  if ((wet || dirty) && !pendingInput && !skipRender && !skipping) { await render(); dirty = false; }
  frameCount++;
  frameMs += performance.now() - t0;
}
const frameLocked = (force, exact) => locked(() => frame(force, exact));
let frameQueued = false;
setInterval(() => { if (det || frameQueued) return; frameQueued = true; locked(() => { frameQueued = false; return frame(); }).catch(onFailure); }, 40);

// Whether water still stands on the paper. A demonstration's next layer waits for this, not for the pores to dry, on
// both physics: waiting for the WebGPU sheet to be wholly dry laid every glaze on fixed paint, flat and hard-edged,
// where the CPU physics laid it on damp paper that lifts and bleeds.
const wetNow = () => (phys ? phys.sheet.surfaceWet : sheet.M.some(v => v));

// ---- demonstrations ------------------------------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
// A script's strokes and waits, counted by running it against a sheet that does nothing
async function countSteps(script, W, H) {
  let n = 0; const none = async () => {};
  await script({ W, H, begin: async () => { n++; }, move: none, end: none, pauseFor: none, alive: () => true, dryAll: async () => { n++; }, settle: async () => { n++; } });
  return n;
}
async function play(name, deterministic = false, allowed = () => true) {
  const gen = generation, alive = () => gen === generation && allowed();
  // A deterministic run has no clock: a pause is a number of frames, so the same demonstration gives the same sequence of strokes and steps.
  const pauseFor = deterministic ? async ms => { for (let f = Math.max(1, Math.round(ms / 40)); f > 0 && alive(); f--) await frameLocked(false, true); } : ms => (skipping ? Promise.resolve() : sleep(ms));
  // A deterministic run waits on the frames' own verdict, which both physics give the same way; a live run asks the sheet.
  // dryAll waits for the water standing on the surface to go, as a painter waits before the next layer; dryAll(true) waits
  // until the pores are dry too, for a painting handed back dry
  const dryAll = async (full = false) => {
    const wetting = full ? () => lastWet || wetNow() : wetNow;
    const was = dryer; dryer = true;
    if (deterministic) { let f = 0; do { await frameLocked(false, true); f++; } while (f < 600 && alive() && lastWet); }
    else {
      dryWait = full ? 'full' : 'surface'; dryPeak = 0; dryStart = ticks;
      try { while (alive() && await locked(wetting)) await sleep(0); }
      finally { dryWait = null; }
    }
    dryer = was;
  };
  // settle(s): let the wet paint move for as long as s seconds of the reference clock (60 dpi at speed 2) move it, however
  // long a fine sheet takes to get there; a bloom wants this, a fixed pause gives a 200 dpi sheet an eleventh of it
  const settle = async seconds => {
    const until = simTime + seconds * 15;
    if (deterministic) { for (let f = 0; f < 3000 && alive() && simTime < until; f++) await frameLocked(false, true); }
    else for (let t = 0; t < 4500 && alive() && simTime < until; t++) await sleep(40);
  };
  // Progress: the strokes laid and the waits for paint to settle or dry, out of the script's own count of them
  const example = EXAMPLES[name], script = example ? api => example.play(api) : api => playDemo(name, api);
  const total = await countSteps(script, W, H);
  let done = 0;
  const tell = phase => { if (!deterministic) postMessage({ type: 'progress', done, total, phase }); };
  const waiting = wait => async (...args) => { tell('drying'); await wait(...args); done++; tell('painting'); };
  const api = { W, H, caption: text => { if (!deterministic) postMessage({ type: 'caption', text }); }, begin: (pt, t) => { tell('painting');if(!deterministic)postMessage({type:'materials',phase:t.tool==='pen'?'Drawing':t.tool==='water'?'Wetting the paper':name==='glaze'?'Glazing':'Wash',tool:t.tool==='pen'?'Dip pen':t.tool==='flat'?'Flat brush':t.tool==='water'?'Water brush':'Round brush',pigments:t.tool==='water'?[]:[BY_KEY[t.tool==='pen'?'walnut':t.pigment]||BY_KEY.walnut]});return locked(() => begin(pt, t)); }, move: pt => locked(() => move(pt)), end: async () => { await locked(end); done++; tell('painting'); }, pauseFor, alive, dryAll: waiting(dryAll), settle: waiting(settle) };
  // a painting in progress is played fast: no steps during its strokes, the largest GPU budget and a strong dryer
  demoPlaying = example ? 'fast' : 'play';
  try { return await script(api); } finally { demoPlaying = null; if (skipping) { skipping = false; dirty = true; } }
}

// Ten undoable actions, with an exact checkpoint at each visitor stroke end.
let history = [], historyAt = -1, autosaveEnabled = false, savedTick = -1, saving = false;
const reportSaveError = () => postMessage({ type: 'autosave', error: 'Autosave unavailable in this browser. Use Save image to keep a copy.' });
const initialSavedSheet = savedSheet();
initialSavedSheet.then(saved => { if (saved) postMessage({ type: 'resume-available', savedAt: saved.savedAt }); }).catch(reportSaveError);
async function autosave(bytes) {
  if (!autosaveEnabled && !strokes) return;
  autosaveEnabled = true;
  try { await saveSheet(bytes); savedTick = ticks; postMessage({ type: 'autosave', savedAt: Date.now() }); } catch { reportSaveError(); }
}
// Stroke checkpoints already preserve wet paint. The periodic save only captures
// its final dry state: a full-sheet download while drying can hold up the next stroke.
const idleSaveReady = () => sheet && !active && !demoPlaying && !pendingInput && autosaveEnabled && savedTick !== ticks
  && !lastWet && !wetNow() && (!phys || phys.sheet.knownDry);
setInterval(() => {
  if (saving || !idleSaveReady()) return;
  saving = true; locked(async () => { if (idleSaveReady()) await autosave(await exactState()); }).catch(reportSaveError).finally(() => { saving = false; });
}, 5000);
const historyStatus = () => postMessage({ type: 'history', undo: historyAt > 0, redo: historyAt < history.length - 1 });
async function exactState() {
  if (phys) await phys.syncAll(sheet);
  const fields = Object.fromEntries(SHEET_FIELDS.map(k => [k, sheet[k]]));
  // Bare paper is deterministic from the saved surface, dimensions and seed.
  // Preserve actual reflectance whenever an older wash has been folded into it.
  return encodeState({ version: 2, fields, baseR: baseIsBare ? null : baseR, baseIsBare, graphite, names: NAMES, pigments: PIGS, recordedPaper: NAMES.some(k=>k.startsWith('recorded-'))?paper:null, paperIn, dpi, surface, seed: paperSeed,
    ticks, simTime, strokes, marks, lastTool, paused, dryer, speed, wasWet, lastWet, stepDebt, lastDt });
}
async function checkpoint() {
  const bytes = await exactState();
  history.splice(historyAt + 1); history.push(bytes);
  if (history.length > 11) history.shift();
  historyAt = history.length - 1; historyStatus(); await autosave(bytes);
}
async function restoreExact(bytes) {
  const v = await decodeState(bytes);
  if (v.version !== 1 && v.version !== 2) throw new Error('Unsupported saved sheet');
  await newSheet({ paperW: v.paperIn[0], paperH: v.paperIn[1], dpi: v.dpi, surface: v.surface, seed: v.seed });
  NAMES = v.names; PIGS = v.pigments || NAMES.map(k => BY_KEY[k]); if(v.recordedPaper)paper=v.recordedPaper; sheet = createSheet(paper, PIGS);
  Object.assign(sheet, v.fields); sheet.wetDirty = 1;masksDirty=true;
  baseIsBare = v.version === 2 && v.baseIsBare === true;
  if (!baseIsBare) baseR = v.baseR; else baseR.set(bareBase());
  graphite = v.graphite;
  ({ ticks, simTime, strokes, marks, lastTool, paused, dryer, speed, wasWet, lastWet, stepDebt, lastDt } = v);
  if (phys) { phys.setPigments(PIGS); await phys.load(sheet, baseR, graphite); }
  else if (gpu && gpuCanvas) rebuildGl();
  dirty = baseDirty = graphiteDirty = true;
  await render();
}
async function travel(delta) {
  const next = historyAt + delta;
  if (next < 0 || next >= history.length) return;
  await restoreExact(history[next]); historyAt = next; historyStatus(); await autosave(history[next]);
}
async function replaceSheet(fn) {
  if (sheet && historyAt >= 0) history[historyAt] = await exactState();
  await fn(); await checkpoint();
}

// ---- paintings in progress, painted ahead of time ---------------------------------------------------------------------
// A painting script plays each example live on this sheet, as a visitor would watch it, and saves the sheet it hands
// back (sheet-state.js) for the default papers; loading one is a moment where playing it at 200 dpi is minutes.
const stateFile = (name, d) => new URL(`./examples/${name}-${d}dpi.sheet`, import.meta.url);
async function captureSheet() {
  if (phys) await phys.syncAll(sheet);
  return packSheet(sheet, baseR, bareBase(), graphite, { paperIn, dpi, surface, seed: paperSeed, names: NAMES, strokes, wet: wetNow() || lastWet });
}
// Load a saved sheet in place of the current one. Resolves false when there is none for this resolution, to play it instead.
async function loadSheet(name, alive = () => true) {
  const reply = await fetch(stateFile(name, dpi)).catch(() => null);
  if (!reply?.ok) return false;
  const { header: h, field } = await unpackSheet(new Uint8Array(await reply.arrayBuffer()));
  if (!alive()) return false;
  await newSheet({ paperW: h.paperIn[0], paperH: h.paperIn[1], dpi: h.dpi, seed: h.seed, surface: h.surface });
  for (const key of h.names.slice(NAMES.length)) { NAMES = [...NAMES, key]; PIGS = [...PIGS, BY_KEY[key]]; addPigment(sheet, BY_KEY[key]); }
  sheet.W.set(field('W')); sheet.s.set(field('s')); sheet.M.set(field('M')); sheet.ever.set(field('ever'));
  h.names.forEach((key, k) => { sheet.G[k].set(field(`G:${key}`)); sheet.P[k].set(field(`P:${key}`)); sheet.D[k].set(field(`D:${key}`)); });
  if (h.top) sheet.layers = [h.names.map(key => field(`T:${key}`))];
  const R = [0, 1, 2].map(c => field(`R${c}`)); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) baseR[i * 3 + c] *= 1 + R[c][i]; // newSheet made baseR the bare paper
  baseIsBare = false;
  graphite.set(field('graphite')); sheet.wetDirty = 1;
  strokes = h.strokes; wasWet = h.wet; lastWet = h.wet;
  if (phys) { phys.setPigments(PIGS); await phys.load(sheet, baseR, graphite); } else if (gpu && gpuCanvas) rebuildGl();
  postMessage({ type: 'sheet', width: W, height: H, dpi, paperIn, surface, physics: phys ? 'webgpu' : 'cpu' });
  dirty = true; baseDirty = true; graphiteDirty = true;
  return true;
}

// ---- GPU failure, fallback ----------------------------------------------------------------------------------------
// A lost WebGL context is not fatal: wait for the browser to restore it, rebuild the renderer and re-upload everything.
// If it does not come back within two seconds, tell the page to switch to the CPU render in place.
// The page (and the gate) follow the GPU renderer by epoch, not by time: epoch counts builds and restores, and ready is
// false from the moment the context is lost until the rebuilt renderer exists.
const gpuState = () => postMessage({ type: 'gpu-state', epoch: gpuEpoch, ready: phys ? !phys.lost : Boolean(gpu && !gpu.isLost()) });
function useCpu() { clearTimeout(lostTimer); gpu = null; dirty = true; postMessage({ type: 'gpu-lost' }); }
function onContextLost(e) { e.preventDefault(); clearTimeout(lostTimer); lostTimer = setTimeout(useCpu, 2000); gpuState(); }
function onContextRestored(tries = 0) {
  clearTimeout(lostTimer);
  gpu = createGpuRenderer(gpuCanvas, PIGS); glDims = [W, H, PIGS.length];
  if (!gpu) { postMessage({ type: 'gpu-diag', reason: lastFailure, tries }); if (tries < 3) lostTimer = setTimeout(() => onContextRestored(tries + 1), 250); else useCpu(); return; }
  baseDirty = true; dirty = true; gpuEpoch++; gpuState(); // every layer and the base upload again on the next draw
}
// The WebGPU device is gone or an operation on it failed: its sheet cannot be read back, so the page reloads on the CPU physics.
let failed = false;
function onFailure(e) {
  if (failed || !phys) { if (!phys) console.error('lab worker error', e); return; }
  failed = true; postMessage({ type: 'physics-failed', reason: String(e?.message ?? e) });
}
// Test hook. A synthetic loss only restores if restoreContext() lands after the browser has finished dispatching the lost
// event, and under load the page's request can arrive first, so ask again until the restored event has come.
function restoreSoon(attempt = 0) {
  if (!gpu || attempt > 30 || (attempt > 0 && !gpu.isLost())) return;
  gpu.restore(); setTimeout(() => restoreSoon(attempt + 1), 50);
}
// Save in GPU mode: the canvas as a PNG, or the pixels read back if the canvas cannot encode itself.
async function snapshot() {
  try {
    if (phys) throw new Error('read back'); // the WebGPU canvas is presented at the end of a task: read the composed pixels instead
    // the canvas keeps no drawing buffer between tasks, so draw again and encode in this same task
    if (!gpu || gpu.isLost()) throw new Error('no renderer');
    renderGl(true);
    if (failBlob) { failBlob = false; throw new Error('forced'); }
    postMessage({ type: 'snapshot', blob: await gpuCanvas.convertToBlob() });
  } catch {
    if (phys && !phys.lost) { baseDirty = true; drawPhys(); const rgba = await phys.readPixels(); postMessage({ type: 'snapshot', rgba, width: W, height: H }, [rgba.buffer]); return; }
    if (!gpu || gpu.isLost()) { postMessage({ type: 'snapshot', blob: null }); return; }
    renderGl(true); const rgba = gpu.readPixels(); postMessage({ type: 'snapshot', rgba, width: W, height: H }, [rgba.buffer]);
  }
}

// ---- start-up ------------------------------------------------------------------------------------------------------
// The page says what it wants (?physics=cpu, ?nowebgpu=1 for tests); the worker builds the WebGPU physics if it can and
// reports what this browser offers, so the page knows whether to hand over its canvas and for which kind of drawing.
async function configure({ physics = 'auto', noWebgpu = false }) {
  if (physics !== 'cpu' && !noWebgpu) {
    try {
      phys = await GpuPhysics.create(PIGS, { ...DEFAULTS }, globalThis.navigator?.gpu);
      phys.onLost = reason => onFailure(new Error(`WebGPU device lost: ${reason}`)); physName = phys.name;
    } catch (e) { phys = null; physReason = String(e?.message ?? e).slice(0, 200); }
  } else physReason = physics === 'cpu' ? '?physics=cpu' : 'WebGPU switched off';
  postMessage({ type: 'caps', gpu: gpuAvailable(), webgpu: Boolean(phys), physics: phys ? 'webgpu' : 'cpu', physicsName: physName, physicsReason: physReason });
}

async function onCanvas(data) {
  gpuCanvas = data.canvas;
  if (data.mode === 'webgpu') {
    try {
      if (data.forceFail) throw new Error('forced');
      physCtx = gpuCanvas.getContext('webgpu'); if (!physCtx) throw new Error('no webgpu canvas context');
      physCtx.configure({ device: phys.device, format: 'rgba8unorm', usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, alphaMode: 'opaque' });
    } catch (e) { physCtx = null; postMessage({ type: 'gpu-failed', kind: 'webgpu', reason: String(e?.message ?? e) }); return; }
    gpuEpoch = 1; dirty = true; postMessage({ type: 'renderer', kind: 'webgpu' }); gpuState(); return;
  }
  gpu = data.forceFail ? null : createGpuRenderer(gpuCanvas, PIGS); glDims = [gpuCanvas.width, gpuCanvas.height, PIGS.length];
  if (!gpu) { postMessage({ type: 'gpu-failed', kind: 'gl' }); return; }
  gpuCanvas.addEventListener('webglcontextlost', onContextLost); gpuCanvas.addEventListener('webglcontextrestored', () => onContextRestored());
  baseDirty = true; dirty = true; gpuEpoch++;
  postMessage({ type: 'renderer', kind: 'gpu' }); gpuState();
}

// the sheet and its instruments as the equivalence and benchmark runs see them
const lab = {
  reset: opts => locked(() => newSheet(opts)),
  play: name => play(name, true),
  idle: () => (phys ? phys.idle() : Promise.resolve()),
  sync: () => locked(() => phys?.syncAll(sheet)),
  drawPixels: async () => { if (!phys) return null; baseDirty = true; graphiteDirty = true; drawPhys(); return phys.readPixels(); },
  state: () => ({ sheet, baseR, graphite, phys, N, W, H, dpi }),
  setPhys: p => { phys = p; }, getPhys: () => phys, stats: () => ({ frames: frameCount, stepMs, stepCount, frameMs, renderMs, renderCount, strokeMs, ticks, strokes, phys: phys ? { ...phys.stats } : null }),
  resetStats: () => { frameCount = 0; stepMs = 0; stepCount = 0; frameMs = 0; renderMs = 0; renderCount = 0; strokeMs = 0; phys && Object.assign(phys.stats, { steps: 0, stepMs: 0, down: 0, downMs: 0, downBytes: 0, up: 0, upMs: 0, fixes: 0, fullDown: 0 }); },
  renderCpu, det: on => { det = on; }, marks: () => marks, dpi: () => dpi, skipRender: on => { skipRender = on; },
  setPerturb: v => { perturb = v; }, setDryer: on => { dryer = on; }, wetNow: () => locked(wetNow), lastWet: () => lastWet, frame: () => frameLocked(false, true),
};

let playbackRequest = 0, livePaused=false, liveCarry=false, liveSpeed=1, replayPoint=null;
async function liveTape(data,current){
  const tape=data.tape;livePaused=false;liveCarry=false;demoPlaying='live';
  const saved=data.checkpoint?await decodeState(data.checkpoint):null;if(!current())return;
  await locked(async()=>{
    if(!current())return;
    await newSheet({paperW:6,paperH:6*tape.h/tape.w,dpi:60,seed:tape.paper?.seed??9});
    demoPlaying='live';
    PIGS=tape.pigments;NAMES=PIGS.map((_,i)=>`recorded-${i}`);
    paper={...makePaper(W,H,{...tape.paper,scale:Math.max(.2,(tape.paper?.scale||1)*W/tape.w)}),mmPerCell:MM/dpi};
    sheet=createSheet(paper,PIGS);if(saved){Object.assign(sheet,saved.fields);sheet.wetDirty=1;}baseR.set(bareBase());
    if(phys){phys.setPigments(PIGS);await phys.load(sheet,baseR,graphite);}else if(gpu)rebuildGl();
    paused=false;masksDirty=true;strokes=saved?.tape.done||0;await render();
    postMessage({type:'live-ready',liveRun:data.liveRun,done:strokes,total:tape.strokeCount});
  });
  let completed=saved?.tape.done||0,deadline=performance.now(),strokeStart=0,lastPresent=0,presentTravelMs=0,sawWash=tape.marks.slice(0,saved?.tape.index||0).some(m=>m.k==='s');
  try{await runTape(tape,{
    sheet:()=>sheet,
    ready:async done=>{while(livePaused&&current()&&!liveCarry)await sleep(30);return current()&&!liveCarry;},
    begin:(tool,isPen,{mark,done,total})=>{operation=null;active=isPen?{kind:'pen',pen:tool}:{kind:'brush',brush:tool};
      strokeStart=deadline=performance.now();lastPresent=0;presentTravelMs=0;
      const conc=isPen?tool.conc:tape.pigments.map((_,i)=>(tool.resP?.[i]||0)+tool.hairs.reduce((n,h)=>n+(h.pig?.[i]||0),0)),phase=isPen?(sawWash?'Closing ink':'Drawing'):mark.wt?'Rewetting the paper':tool.radius>4?'Washes':'Darks & detail';
      if(!isPen&&!mark.wt)sawWash=true;
      postMessage({type:'operation',liveRun:data.liveRun,kind:mark.wt?'water':'paint',label:phase,done,total});
      postMessage({type:'materials',liveRun:data.liveRun,phase,tool:isPen?'Dip pen':mark.wt?'Water brush':tool.flat?'Flat brush':'Round brush',pigments:tape.pigments.map((p,i)=>({...p,amount:conc[i]||0})).filter(p=>p.amount>0),done,total});
    },
    end:async()=>{if(current()){
      // Flush the last deposited point before lifting, including very short strokes.
      if(presentTravelMs>0)await locked(()=>render());
      presentTravelMs=0;active=null;replayPoint=null;
    }},
    touch:(pts,reach,fn)=>locked(async()=>{
      if(!current())return null;
      const points=active?.brush?.tip?[...pts,active.brush.tip]:pts;
      const rect=phys?phys.rect(points,reach):[
        Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-reach)),
        Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-reach)),0,0];
      if(!phys){rect[2]=Math.max(0,Math.min(W,Math.ceil(Math.max(...points.map(p=>p.x))+reach)+1)-rect[0]);rect[3]=Math.max(0,Math.min(H,Math.ceil(Math.max(...points.map(p=>p.y))+reach)+1)-rect[1]);}
      if(phys)await phys.ensureFresh(sheet,rect);
      const changed=watchContact(sheet,rect);fn();const contact=changed();
      if(phys)phys.up(sheet,rect);
      return contact;
    }),
    present:async(pt,r,done,distance,contact)=>{
      if(!current())return;
      // The indicator and the paint are presented in the same frame, only after
      // deposition. An empty contact never displays an invented brush footprint.
      replayPoint=contact?.mask.some(Boolean)?{...pt,r,contact}:null;
      const travelMs=distance/110*1000/liveSpeed;
      deadline+=travelMs;presentTravelMs+=travelMs;
      // Deposition keeps every sample. Present only the latest applied contact
      // once a display interval of travel or computation has accumulated.
      if(lastPresent && presentTravelMs<16 && performance.now()-lastPresent<16)return;
      await locked(async()=>{if(!current())return;await render();dirty=false;});
      presentTravelMs=0;
      const wait=Math.min(40,deadline-performance.now());if(wait>0)await sleep(wait);else deadline=performance.now();
      lastPresent=performance.now();
    },
    operation:async(event,apply)=>{
      if(!current())return;
      active=null;replayPoint=null;
      let mask=event.mask;
      if(event.kind==='dry'||event.kind==='flow')await locked(async()=>{if(phys)await phys.syncAll(sheet);mask=Uint8Array.from(sheet.W,(v,i)=>v>0||sheet.s[i]>0?1:0);});
      operation={...event,mask};postMessage({type:'operation',liveRun:data.liveRun,...operation});
      await locked(()=>render());
      // Show the affected area before and after the action, including removal.
      const hold=['dip','ink','flow'].includes(event.kind)?35:180;
      await sleep(Math.max(20,hold/liveSpeed));
      while(livePaused&&current()&&!liveCarry)await sleep(30);
      if(!current()||liveCarry)return;
      await apply();if(!current())return;masksDirty=true;
      await locked(()=>current()?render():undefined);await sleep(Math.max(20,hold/liveSpeed));
      if(current())operation=null;
    },
    progress:async(done,total)=>{if(!current())return;strokes=completed=done;await locked(async()=>{await render();dirty=false;});
      postMessage({type:'progress',liveRun:data.liveRun,done,total,phase:'painting'});
      await sleep(Math.max(30/liveSpeed,280/liveSpeed-(performance.now()-strokeStart)));},
    mutate:fn=>locked(async()=>{if(!current())return;if(phys)await phys.syncAll(sheet);fn();if(phys)await phys.load(sheet,baseR,graphite);dirty=baseDirty=true;}),
    flow:(dry,m)=>locked(async()=>{if(!current())return;const opts={...DEFAULTS,dt:dry?2:.3};
      if(phys){phys.setOptions(opts);await phys.step(dry?Math.min(m?.m||30,90):1);}else for(let i=0;i<(dry?Math.min(m?.m||30,90):1);i++)step(sheet,opts);
      lastDt=null;ticks++;dirty=true;})
  },saved?.tape);}finally{if(current()){active=null;replayPoint=null;operation=null;demoPlaying=null;paused=false;await locked(async()=>{await render();await checkpoint();});postMessage({type:'played',liveRun:data.liveRun,name:'live',example:true,wet:true,strokes:completed});}}
}

onmessage = ({ data }) => {
  if (['reset', 'clear', 'resume', 'down', 'load', 'play', 'intro', 'undo', 'redo', 'base', 'live', 'stop-live'].includes(data.type)) playbackRequest++;
  const request = playbackRequest, current = () => request === playbackRequest;
  const run = fn => locked(fn).catch(onFailure);
  const input = fn => {
    inputArrived = true; pendingInput++;
    return run(async () => { try { return await fn(); } finally { pendingInput--; } });
  };
  if(data.type==='live')liveTape(data,current).catch(onFailure);
  else if(data.type==='stop-live'){liveCarry=true;livePaused=false;}
  else if(data.type==='live-pause')livePaused=!!data.on;
  else if(data.type==='live-speed')liveSpeed=data.value;
  else if(data.type==='carry-live'){liveCarry=true;livePaused=false;}
  else if (data.type === 'config') configure(data);
  else if (data.type === 'canvas') run(() => onCanvas(data));
  else if (data.type === 'snapshot') run(snapshot);
  else if (data.type === 'debug') { if (data.action === 'lose') gpu?.lose(); else if (data.action === 'restore') restoreSoon(); else if (data.action === 'failBlob') failBlob = true; else if (data.action === 'loseDevice') phys?.device.destroy(); }
  else if (data.type === 'kernels') input(async () => {
    if (!phys) { postMessage({ type: 'kernels', supported: false }); return; }
    const timer = new KernelTimer(phys.device);
    if (!timer.supported) { postMessage({ type: 'kernels', supported: false }); return; }
    const saved = await exactState(), rows = [];
    try {
      await phys.step(4);
      for (let run = 0; run < 30; run++) {
        const enc = phys.device.createCommandEncoder(); phys.sheet.encodeSteps(enc, 1, timer); phys.device.queue.submit([enc.finish()]);
        phys.composer.draw(null, timer); rows.push(...await timer.collect());
      }
      postMessage({ type: 'kernels', supported: true, rows });
    } finally { timer.destroy(); await restoreExact(saved); }
  });
  else if (data.type === 'contact-audit') run(async () => { if (phys) { if (data.neighborCells?.length) await phys.syncAll(sheet); else await phys.ensureFresh(sheet, data.rect); } postMessage({type:'contact-audit',stage:data.stage ?? 'paper',strokes,at:performance.now(),verdict:contactVerdict(),measurement:contactAudit(sheet,null,data.rect,data.neighborCells??[])}); });
  else if (data.type === 'probe') { if (sheet) run(() => probe(data)); }
  else if (data.type === 'reset') input(() => replaceSheet(() => newSheet(data)));
  else if (data.type === 'resume') input(async () => { const saved = await savedSheet(); if (saved) { await restoreExact(saved.bytes); autosaveEnabled = true; await checkpoint(); } });
  else if (data.type === 'undo' || data.type === 'redo') input(() => travel(data.type === 'undo' ? -1 : 1));
  else if (data.type === 'pause') { inputArrived = true; paused = Boolean(data.on); if (paused) quickDry = false; dirty = true; }
  else if(data.type==='redip'){heldTool=null;postMessage({type:'caption',text:'Brush dipped. Ready to paint.'});}
  else if (data.type === 'quality') { inputArrived = true; quality = data.value === 'full' ? 'full' : 'fast'; dirty = true; }
  else if (data.type === 'remove-mask' || data.type === 'remove-boundary') input(async()=>{
    if(!sheet||demoPlaying)return;
    if(active)await end();
    const kind=data.type==='remove-mask'?'unmask':'unclip';
    nameOperation(kind,kind==='unmask'?sheet.resist:sheet.clip);await render();
    await sleep(180);
    if(phys)await phys.syncAll(sheet);
    if(kind==='unmask'){liftResist(sheet);foldLayers();}else setClip(sheet,null);
    if(phys)await phys.load(sheet,baseR,graphite);
    masksDirty=true;await render();await sleep(180);operation=null;await render();await checkpoint();
  });
  else if (data.type === 'dry-layer') input(async () => {
    if (!sheet || demoPlaying) return;
    if (active) { await end(); await checkpoint(); }
    nameOperation('dry',new Uint8Array(N).fill(1));
    paused = false; quickDry = true; quickDryStarted = performance.now(); dryPeak = 0; dryStart = ticks; dirty = true;
    await render();
  });
  else if (data.type === 'step') { paused = true; dirty = true; run(() => frame(true)); }
  else if (data.type === 'down') input(async () => { await begin(data.pt, data.tool); if (dirty && sheet) { await render(); dirty = false; lastInputDraw = performance.now(); } });
  else if (data.type === 'move') input(async () => {
    // Keep every contact sample in order; present the latest batch at least every 16 ms
    // of completed processing, or immediately when the queued input catches up.
    // Rendering each stale batch (and awaiting its GPU completion) compounds cursor lag.
    for (const pt of data.pts) await move(pt);
    if (Number.isFinite(data.t)) moveT = data.t;
    if (dirty && sheet && (pendingInput === 1 || performance.now() - lastInputDraw >= 16)) { await render(); dirty = false; lastInputDraw = performance.now(); }
  });
  else if (data.type === 'up') input(async () => {
    if (!active) return;
    await end(data.pt);
    // Present the lifted brush and final deposited paint before downloading and
    // compressing the sheet for undo. Saving must not delay the visible lift.
    await render(); dirty = false;
    await checkpoint();
  });
  else if (data.type === 'speed') { inputArrived = true; speed = data.value; }
  else if (data.type === 'skip') { if (demoPlaying) skipping = true; }
  else if (data.type === 'dryer') { inputArrived = true; dryer = data.on;if(dryer)nameOperation('dry',new Uint8Array(N).fill(1));else operation=null;dirty = true; }
  else if (data.type === 'clear') input(async () => { await replaceSheet(() => newSheet({ paperW: paperIn[0], paperH: paperIn[1], dpi, seed: Number.isFinite(data.seed) ? data.seed : paperSeed })); if (current()) postMessage({ type: 'played', cancelled: true }); });
  // a finished painting handed over as the paper: the painter's own last frame, so the visitor paints on over it. `white`
  // is the lab paper's colour, so a pixel of the painting keeps its colour on the lab's paper, texture included
  else if (data.type === 'base') input(async () => {
    await replaceSheet(async () => {
      await newSheet({ paperW: paperIn[0], paperH: paperIn[1], dpi, seed: paperSeed, ...(SURFACES[data.surface] ? { surface: data.surface } : {}) });
      if (data.width !== W || data.height !== H) throw new Error(`base image ${data.width}x${data.height} does not match the ${W}x${H} sheet`);
      const px = data.rgba, white = data.white;
      for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) baseR[i * 3 + c] *= Math.min(1.02, px[i * 4 + c] / white[c]);
      baseIsBare = false; baseDirty = true; dirty = true;
      if (phys) await phys.load(sheet, baseR, graphite);
    });
    if (current()) { await render(); dirty = false; postMessage({ type: 'played', name: 'film', example: true, wet: false, strokes }); }
  });
  else if (data.type === 'capture') run(async () => { const bytes = await captureSheet(); postMessage({ type: 'capture', bytes }, [bytes.buffer]); });
  else if (data.type === 'intro') {
    (async () => {
      const saved = await initialSavedSheet.catch(() => true);
      if (!current()) return;
      if (saved || strokes || active) { postMessage({ type: 'played', cancelled: true }); return; }
      let held = null;
      // A connected wet passage: loaded rounds on dry paper, then cooler charges into
      // overlapping wet footprints. Reserve the center and surrounding white paper.
      // No forced drying separates the hearts; normal transport mixes their pigments.
      const hearts = [
        { scale: 1, pigment: 'rose', amount: 0.35 },
        { scale: 0.88, pigment: 'ultramarine', amount: 0.22 },
        { scale: 0.76, pigment: 'cerulean', amount: 0.3 },
      ];
      demoPlaying = 'intro';
      try {
        for (const heart of hearts) {
          for (let i = 0; i <= 40 && current(); i++) {
            const a = i / 40 * Math.PI * 2, scale = Math.min(W, H) / 65 * heart.scale;
            const pt = { x: W / 2 + scale * 16 * Math.sin(a) ** 3, y: H / 2 - scale * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)), p: 0.85, v: 1 };
            await locked(async () => {
              if (!current()) return;
              if (!i) { await begin(pt, { tool: 'round', pigment: heart.pigment, sizeMm: 12, water: 2, amount: heart.amount, model: 'row' }); held = active; }
              else await move(pt);
              if (i % 2 === 0) { await render(); dirty = false; }
            });
            if (i % 2 === 0) await sleep(25);
          }
          await locked(async () => { if (active === held && held) await end(); held = null; });
          if (!current()) break;
        }
        await locked(async () => { if (current()) { await render(); dirty = false; await checkpoint(); postMessage({ type: 'played', example: false, strokes }); } });
      } finally {
        if (demoPlaying === 'intro') demoPlaying = null;
      }
    })().catch(onFailure);
  }
  else if (data.type === 'load' || data.type === 'play') {
    paused = false;
    if (data.name === 'target') setTargetPlan(data.plan);
    (async () => {
      const loaded = await input(async () => {
        if (!current()) return false;
        if (historyAt >= 0) history[historyAt] = await exactState();
        return data.type === 'load' && await loadSheet(data.name, current);
      });
      if (!current()) return;
      if (!loaded) {
        await locked(async () => { if (current()) await newSheet({ paperW: paperIn[0], paperH: paperIn[1], dpi, seed: Number.isFinite(data.seed) ? data.seed : paperSeed, ...(SURFACES[data.surface] ? { surface: data.surface } : {}) }); });
        if (!current() || !await play(data.name, false, current)) return;
      }
      await locked(async () => {
        if (!current()) return;
        await checkpoint(); await render(); dirty = false;
        if (current()) postMessage({ type: 'played', name: data.name, example: Boolean(EXAMPLES[data.name]), wet: EXAMPLES[data.name]?.wet ?? null, strokes });
      });
    })().catch(onFailure);
  }
  else if (data.type === 'dpicheck') runDpi(lab, data).then(r => postMessage({ type: 'dpicheck', ...r.result })).catch(e => postMessage({ type: 'dpicheck', error: String(e?.stack ?? e) }));
  else if (data.type === 'equiv') runEquiv(lab, data).then(r => postMessage({ type: 'equiv', ...r.result }, r.transfer ?? [])).catch(e => postMessage({ type: 'equiv', error: String(e?.stack ?? e) }));
};
