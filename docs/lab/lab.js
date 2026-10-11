import {addToolIcons} from './ui/tool-icons.js';
import {createOperationsUI} from './ui/operations.js';
// The paint lab page: pointer input, controls and the frames from the simulation worker.
import {createPlaybackUI,loadBytes,loadTape} from './ui/playback.js';
import { setupScratch } from './ui/scratch.js';
import { pointerSample, createPointerSampler } from './ui/contact.js';
import { createMoveQueue } from './ui/move-queue.js';
import { createCursor } from './ui/cursor.js';
import { PIGMENTS, BY_KEY, stains } from './media/pigments.js';
import { SURFACES } from './media/papers.js';
import { normalizeMix, previewMix } from './media/mixing.js';
import { createTargets } from './targets/targets.js';
import { playFilm, sheetPixels } from './targets/film.js';
let canvas = document.getElementById('canvas');
// pointer listeners sit on the sheet's wrapper, so the canvas can be swapped for a 2D one if the GPU render is lost
const sheetEl = canvas.parentElement, state = document.getElementById('state'), announcer = document.getElementById('announce');
const query = new URLSearchParams(location.search);
if (query.get('intro') === '0') document.getElementById('welcome').hidden = true;
// The sheet is a real piece of paper: a size in inches at a resolution in dots per inch. ?paper=8x6 is the default size.
// Interactive WebGPU resolution follows the viewport, with a bounded mobile/desktop default;
// CPU_DPI on the processor; ?dpi= or the Resolution menu picks another.
const PAPERS = { '6x4.5': [6, 4.5], '8x6': [8, 6], '12x9': [12, 9] }, DPIS = [60, 90, 120, 150, 200, 240, 300], MM = 25.4;
let quality = query.get('quality') === 'full' ? 'full' : 'fast';
const GPU_DPI = matchMedia('(max-width: 860px)').matches ? 90 : 120, CPU_DPI = 60;
const dpiAsked = DPIS.includes(Number(query.get('dpi'))) ? Number(query.get('dpi')) : null;
// the kind of paper: hot press, cold press, rough or toned (papers.js); ?surface= picks one
const SURFACE_KEYS = ['hot', 'cold', 'rough', 'toned'];
let surface = SURFACE_KEYS.includes(query.get('surface')) ? query.get('surface') : 'cold';
let paperKey = PAPERS[query.get('paper')] ? query.get('paper') : '8x6', dpi = dpiAsked ?? (quality === 'full' ? 200 : CPU_DPI);
let W = canvas.width, H = canvas.height, PIXELS_PER_INCH = dpi;
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const operations=createOperationsUI(sheetEl,m=>{cancelStroke();worker.postMessage(m);});
addToolIcons();
// The physics runs on WebGPU in the worker when the browser has it, and the worker then draws straight into this canvas
// from the GPU buffers. Without WebGPU (or with ?physics=cpu) the physics is the CPU's and the colour render runs on WebGL2
// in the worker, straight into this canvas. ?render=cpu keeps the CPU render, which is also the fallback when WebGL2 is
// missing or fails. ?nowebgpu=1 hides WebGPU from the worker, to test that fallback.
let ctx = null, image = null, started = false, gpuCanvas = false;
const wantCpu = query.get('render') === 'cpu';
const now = () => performance.timeOrigin + performance.now(); // one clock with the worker's
const lab = window.__lab = { lags: [], playing: false, render: 'pending', physics: 'pending', physicsReason: '', dpi, paper: paperKey, dpiCheck: (name, opts = {}) => new Promise(resolve => { dpiResolve = resolve; worker.postMessage({ type: 'dpicheck', name, ...opts }); }), equiv: (name, opts = {}) => new Promise(resolve => { equivResolve = resolve; worker.postMessage({ type: 'equiv', name, ...opts }); }), gpuEpoch: 0, gpuReady: false, gpuDrawnEpoch: 0, frames: 0, mainMs: 0, workerRenderMs: 0, workerRenders: 0, probe: (runs = 5) => new Promise(resolve => { probeResolve = resolve; worker.postMessage({ type: 'probe', runs }); }), send: m => worker.postMessage(m) };
let kernelsResolve = null;
lab.kernels = () => new Promise(resolve => { kernelsResolve = resolve; worker.postMessage({type:'kernels'}); });
let probeResolve = null, equivResolve = null, dpiResolve = null, captureResolve = null;
// the whole sheet, packed (sheet-state.js): A painting script saves the paintings in progress with it
lab.capture = () => new Promise(resolve => { captureResolve = resolve; worker.postMessage({ type: 'capture' }); });
function start(mode) {
  if (mode) {
    // the worker builds the GPU renderer and says so ('renderer') or fails ('gpu-failed') before anything else runs
    const offscreen = canvas.transferControlToOffscreen(); gpuCanvas = true;
    worker.postMessage({ type: 'canvas', mode, canvas: offscreen, forceFail: query.get('gpufail') === '1' }, [offscreen]);
  } else useCpuCanvas();
}
const newPaper = () => { const [w, h] = PAPERS[paperKey]; worker.postMessage({ type: 'reset', paperW: w, paperH: h, dpi, surface, seed: PAPER_SEED }); };
function begin() {
  newPaper();
  started = true; state.textContent = 'Making the paper…'; updateActiveTool();
}
// the worker tells us the sheet it made: the canvas is that many pixels, and a 2D canvas is resized to match
let introConsidered = false;
function onSheet(data) {
  if(data.dpi!==dpi)lab.dpiChoice='loaded sheet';
  operations.reset(data.width,data.height);
  W = data.width; H = data.height; PIXELS_PER_INCH = data.dpi; dpi = data.dpi; lab.dpi = dpi; lab.sheet = { width: W, height: H, dpi, paperIn: data.paperIn, surface: data.surface };
  document.getElementById('resolution-choice').textContent=`${lab.dpiChoice??'Selected'} · ${dpi} dpi`;
  if (!gpuCanvas && ctx) { canvas.width = W; canvas.height = H; image = ctx.createImageData(W, H); }
  // a painting in progress loads on its own paper: the controls follow the sheet
  if (data.surface && data.surface !== surface) { surface = data.surface; press('[data-surface]', 'surface', surface); }
  const size = `${data.paperIn[0]}x${data.paperIn[1]}`; if (PAPERS[size] && size !== paperKey) { paperKey = size; paperSelect.value = size; lab.paper = size; }
  if (!playing && strokeCount === 0) state.textContent = 'Drag on the paper to paint';
  sheetEl.style.setProperty('--sheet-ratio',W/H);
  updateActiveTool(); renderMixer(); fitFocus(); queueCursor(); targets.setDisabled(false);
  // the first sheet opens the first target picture, so the page starts painting instead of blank
  if (!introConsidered) { introConsidered = true; if (query.has('example')) targets.openFirst(); }
}
// A 2D canvas for the CPU render. After a lost GPU render the old canvas belongs to the worker, so it is swapped for a new one.
function useCpuCanvas() {
  if (gpuCanvas) { const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh; gpuCanvas = false; }
  ctx = canvas.getContext('2d'); image = ctx.createImageData(W, H); lab.render = 'cpu';
}

const announce = text => { announcer.textContent = text; };
const PIGMENT_TOOLS = ['round', 'flat']; // pen is walnut, pencil graphite, clean water none
const pigmentSet = document.getElementById('pigment-set');
const settings = { tool: 'round', pigment: 'rose', sizeMm: 10, water: 2.0, amount: 0.5, pressure: 0.8, model: 'row', reservoirMode: 'standard', autoRedip: true };
let lastPaintTool = 'round';
let temporaryWater=false, altHeld=false, barrelHeld=false;
const manualPressure=document.getElementById('manual-pressure');
// Mouse and finger strokes use the fixed Pressure slider by default: pressure from pointer speed jumps with uneven
// event timing and leaves blotches. A stylus always uses its own pressure.
document.getElementById('pressure').disabled=!manualPressure.checked;lab.manualPressure=manualPressure.checked;
manualPressure.addEventListener('change',()=>{document.getElementById('pressure').disabled=!manualPressure.checked;lab.manualPressure=manualPressure.checked;queueCursor();});
const qualitySelect=document.getElementById('quality');
qualitySelect.value=quality;lab.quality=quality;
qualitySelect.addEventListener('change',()=>{quality=qualitySelect.value==='full'?'full':'fast';lab.quality=quality;worker.postMessage({type:'quality',value:quality});});
function updateActiveTool() {
  const paintTool = ['round', 'flat', 'water'].includes(settings.tool);
  const diameter = settings.sizeMm / MM;
  const eligible = settings.tool === 'flat' && Math.abs(settings.water - 1) < 0.001 && diameter >= 0.25 && diameter <= 0.5;
  const toolText = paintTool ? `${settings.tool} · ${settings.sizeMm.toFixed(1)} mm` : `${settings.tool} · ${settings.sizeMm.toFixed(1)} mm`;
  const pigmentText = settings.tool === 'pencil' ? 'graphite' : settings.tool === 'pen' ? 'walnut ink' : ['water','dryer','mask','lift','blot'].includes(settings.tool) ? 'no pigment' : settings.mixture ? 'mixed paint' : BY_KEY[settings.pigment].name.toLowerCase();
  const modeText = paintTool && settings.reservoirMode === 'area' ? ` · ${eligible ? 'calibrated load' : 'standard load'}` : '';
  document.getElementById('active-tool').textContent = temporaryWater?'Temporary clean water · release Alt / barrel to return':`${toolText} · ${pigmentText}${modeText}`;
  pigmentSet.disabled = !PIGMENT_TOOLS.includes(settings.tool);
  pigmentSet.hidden = pigmentSet.disabled;
  for (const id of ['water', 'amount', 'pressure']) {
    const useful = id === 'water' ? paintTool : id === 'amount' ? PIGMENT_TOOLS.includes(settings.tool) || settings.tool === 'pen' : settings.tool !== 'dryer';
    document.getElementById(id).closest('label').hidden = !useful;
  }
  document.getElementById('model-label').parentElement.hidden = !paintTool;
}

// the palette: a round swatch per pigment, named by its label and tooltip, the selected one named above the swatches
const pigBox = document.getElementById('pigments'), pigmentName = document.getElementById('pigment-name');
const habit = p => (stains(p) ? 'staining' : 'lifts easily');
for (const p of PIGMENTS) {
  const { key, name, swatch } = p, b = document.createElement('button'), dot = document.createElement('i');
  b.dataset.pigment = key; b.setAttribute('aria-pressed', String(key === settings.pigment)); b.setAttribute('aria-label', `${name}, ${habit(p)}`); b.title = `${name}, ${habit(p)}`;
  dot.style.background = swatch; b.append(dot); pigBox.append(b);
}
const showPigment = () => { const p = BY_KEY[settings.pigment]; pigmentName.textContent = `${p.name} · ${habit(p)}`; };
showPigment();
const press = (selector, attr, value) => document.querySelectorAll(selector).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { settings.tool = b.dataset.tool; if(PIGMENT_TOOLS.includes(settings.tool))lastPaintTool=settings.tool; press('[data-tool]', 'tool', settings.tool); updateActiveTool(); }));
pigBox.addEventListener('click', e => { const b = e.target.closest('[data-pigment]'); if (!b || !BY_KEY[b.dataset.pigment]) return; settings.pigment = b.dataset.pigment; delete settings.mixture; press('[data-pigment]', 'pigment', settings.pigment); showPigment(); renderMixer(); updateActiveTool(); queueCursor(); });

// The mixing well holds a recipe, and Load mix takes an independent snapshot for the next brush dip.
const mixParts = document.getElementById('mix-parts'), mixStrength = document.getElementById('mix-strength');
const mixLoad = document.getElementById('mix-load'), mixClear = document.getElementById('mix-clear');
const mixStorage = 'paint-lab-mix-v1';
let parts = {};
try { const saved=JSON.parse(localStorage.getItem(mixStorage)); if (saved && normalizeMix(saved) && Object.values(saved).every(v=>Number.isInteger(v)&&v<=99)) parts=saved; } catch {}
function renderMixer() {
  const mix=normalizeMix(parts), entries=Object.entries(mix??{});
  const focused=document.activeElement, focusKey=focused?.dataset.mixKey;
  for(const row of mixParts.children)if(!(row.dataset.key in parts))row.remove();
  for (const key of Object.keys(parts)) {
    const existing=[...mixParts.children].find(row=>row.dataset.key===key);
    if(existing){existing.querySelector("output").textContent=parts[key];existing.querySelector("input").value=parts[key];continue;}
    const row=document.createElement('label'),name=document.createElement('span'),dot=document.createElement('i'),count=document.createElement('output'),slider=document.createElement('input');
    row.className='mix-part';row.dataset.key=key;dot.style.background=BY_KEY[key].swatch;name.append(dot,BY_KEY[key].name);count.textContent=parts[key]||0;
    slider.type='range';slider.min=1;slider.max=99;slider.step=1;slider.value=parts[key]||0;slider.dataset.mixKey=key;slider.setAttribute('aria-label',BY_KEY[key].name+' parts');const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.dataset.removeMix=key;remove.setAttribute('aria-label','Remove '+BY_KEY[key].name);row.append(name,slider,count,remove);mixParts.append(row);
  }
  const preview=previewMix(parts,settings.amount,SURFACES[surface].colour);
  document.getElementById('mix-paint').style.background=`rgb(${preview.paint.join(' ')})`;
  document.getElementById('mix-wash').style.background=`rgb(${preview.wash.join(' ')})`;
  document.getElementById('mix-count').textContent=entries.length?`${Object.values(parts).reduce((s,v)=>s+v,0)} parts`:'Empty';
  mixStrength.value=settings.amount; document.getElementById('mix-strength-out').textContent=mixStrength.value;
  mixLoad.disabled=!mix; mixClear.disabled=!mix&&!settings.mixture;
  const loaded=Boolean(mix&&settings.mixture&&JSON.stringify(mix)===JSON.stringify(settings.mixture));
  document.getElementById('mix-status').textContent=loaded?'Mix on brush. Ready to paint.':mix?'Ready to load.':settings.mixture?'Previous mix on brush. Add colors to mix again.':'Add colors to start mixing.';
  if(focusKey)mixParts.querySelector(`[data-mix-key="${focusKey}"]`)?.focus({preventScroll:true});
}
function changedMix() { try { localStorage.setItem(mixStorage,JSON.stringify(parts)); } catch {} renderMixer(); }
const mixPicker=document.getElementById('mix-picker'), mixAdd=document.getElementById('mix-add');
mixAdd.addEventListener('click',()=>{mixPicker.hidden=!mixPicker.hidden;mixAdd.setAttribute('aria-expanded',String(!mixPicker.hidden));});
for(const {key,name,swatch} of PIGMENTS){
  const b=document.createElement('button'),dot=document.createElement('i');b.type='button';b.setAttribute('aria-label','Add '+name);b.title=name;dot.style.background=swatch;b.append(dot);mixPicker.append(b);
  b.addEventListener('click',()=>{parts[key]=Math.min(99,(parts[key]??0)+1);changedMix();mixPicker.hidden=true;mixAdd.setAttribute('aria-expanded','false');mixParts.querySelector(`[data-mix-key="${key}"]`)?.focus();});
}
mixParts.addEventListener('click',e=>{const key=e.target.closest('[data-remove-mix]')?.dataset.removeMix;if(!key)return;delete parts[key];changedMix();mixAdd.focus();});
mixParts.addEventListener('input',e=>{const key=e.target.dataset.mixKey;if(!key)return;parts[key]=Number(e.target.value);if(!parts[key])delete parts[key];changedMix();});
mixLoad.addEventListener('click',()=>{ const mix=normalizeMix(parts); if(!mix)return; if(!PIGMENT_TOOLS.includes(settings.tool)){settings.tool=lastPaintTool;press('[data-tool]','tool',settings.tool);} settings.mixture=mix; renderMixer(); updateActiveTool(); queueCursor(); announce('Mixture loaded. Drag on the paper to paint.'); });
mixClear.addEventListener('click',()=>{ parts={}; delete settings.mixture; changedMix(); updateActiveTool(); queueCursor(); announce('Mixing palette cleared. Single pigment selected.'); });
mixStrength.addEventListener('input',()=>{ const amount=document.getElementById('amount'); amount.value=mixStrength.value; amount.dispatchEvent(new Event('input',{bubbles:true})); });
renderMixer();
document.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => { settings.model = b.dataset.model; press('[data-model]', 'model', settings.model); }));
const UNITS = { size: ' mm', speed: '×' };
for (const id of ['size', 'water', 'amount', 'pressure', 'speed']) {
  const input = document.getElementById(id), out = document.getElementById(`${id}-out`);
  const apply = () => { out.textContent = `${input.value}${UNITS[id] ?? ''}`; if (id === 'speed') worker.postMessage({ type: 'speed', value: Number(input.value) }); else settings[id === 'size' ? 'sizeMm' : id] = Number(input.value); if (id === 'size' || id === 'water') updateActiveTool(); if(id==='amount')renderMixer(); };
  input.addEventListener('input', apply); apply();
}
const pauseButton = document.getElementById('pause');
const quickDryButton=document.getElementById('dry-layer');
quickDryButton.addEventListener('click',()=>{cancelStroke();worker.postMessage({type:'dry-layer'});});
const PAPER_SEED = 7;
// the kind of paper, its size and its resolution: changing any of them is a new sheet
const paperSelect = document.getElementById('paper'), dpiSelect = document.getElementById('dpi'), surfaceButtons = document.querySelectorAll('[data-surface]');
paperSelect.value = paperKey; dpiSelect.value = String(dpi); press('[data-surface]', 'surface', surface);
const changeSheet = (next = surface) => {
  const keep = () => { paperSelect.value = paperKey; dpiSelect.value = String(dpi); press('[data-surface]', 'surface', surface); };
  if (playing) { keep(); return; }
  cancelStroke(); paperKey = paperSelect.value; if(dpi!==Number(dpiSelect.value))lab.dpiChoice='Selected'; dpi = Number(dpiSelect.value); surface = next; press('[data-surface]', 'surface', surface);
  lab.paper = paperKey; lab.sheet = null; state.textContent = 'Making the paper…'; newPaper();
  const kind = document.querySelector(`[data-surface="${surface}"]`).textContent.toLowerCase();
  announce(`New sheet: ${kind} paper, ${paperKey.replace('x', ' by ')} inches at ${dpi} dots per inch`);
};
for (const el of [paperSelect, dpiSelect]) el.addEventListener('change', () => changeSheet());
surfaceButtons.forEach(b => b.addEventListener('click', () => { if (b.dataset.surface !== surface) changeSheet(b.dataset.surface); }));
pauseButton.addEventListener('click', () => worker.postMessage({type:'pause',on:pauseButton.getAttribute('aria-pressed')!=='true'}));
const download = blob => { if (!blob) return; const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download='paint-lab.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
document.getElementById('save').addEventListener('click', () => { if (gpuCanvas) worker.postMessage({ type: 'snapshot' }); else canvas.toBlob(download); });
for (const action of ['undo', 'redo']) document.getElementById(action).addEventListener('click', () => { cancelStroke(); worker.postMessage({ type: action }); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,select,textarea,[contenteditable]')) { e.preventDefault(); if (!playing) document.getElementById(e.shiftKey ? 'redo' : 'undo').click(); }
});
document.addEventListener('keydown', e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,select,textarea,[contenteditable]')) return;
  if(e.shiftKey&&e.key.toLowerCase()==='d'){e.preventDefault();quickDryButton.click();return;}
  const tool = { r: 'round', f: 'flat', w: 'water', i: 'pen', p: 'pencil', d: 'dryer' }[e.key.toLowerCase()];
  if (tool) { e.preventDefault(); document.querySelector(`[data-tool="${tool}"]`).click(); }
  else if (e.key === '[' || e.key === ']') {
    e.preventDefault(); const size = document.getElementById('size');
    size.value = Math.max(Number(size.min), Math.min(Number(size.max), Number(size.value) + (e.key === '[' ? -0.5 : 0.5)));
    size.dispatchEvent(new Event('input', { bubbles: true })); queueCursor();
  } else if (e.code === 'Space' && !e.target.closest('button,summary')) { e.preventDefault(); pauseButton.click(); }
});
document.getElementById('keep-painting').addEventListener('click', () => { cancelStroke(); worker.postMessage({ type: 'resume' }); document.getElementById('return-sheet').hidden = true; });
document.getElementById('dismiss-return').addEventListener('click', () => { document.getElementById('return-sheet').hidden = true; });
const dryer = document.getElementById('dryer');
dryer.addEventListener('click', () => { const on = dryer.getAttribute('aria-pressed') !== 'true'; dryer.setAttribute('aria-pressed', String(on)); worker.postMessage({ type: 'dryer', on }); });

let playing = false, strokeCount = 0, wasPaused = null;
const controlsPanel = document.getElementById('painting-controls');
const panelButtons = document.querySelectorAll('#panel-tabs [data-panel-toggle]');
const setPanel = active => {
  if (active) controlsPanel.dataset.activePanel = active;
  else delete controlsPanel.dataset.activePanel;
  controlsPanel.classList.toggle('expanded', Boolean(active));
  panelButtons.forEach(b => b.setAttribute('aria-expanded', String(b.dataset.panelToggle === active)));
  requestAnimationFrame(() => { cacheRect(); queueCursor(); });
};
panelButtons.forEach(b => b.addEventListener('click', () => setPanel(controlsPanel.dataset.activePanel === b.dataset.panelToggle ? null : b.dataset.panelToggle)));
// Recorded excerpts and techniques share the top picker and playback controls.
const playbar = document.getElementById('playbar'), playProgress = document.getElementById('play-progress');
const caption = document.getElementById('step-caption'), dryingEl = document.getElementById('drying'), dryingProgress = document.getElementById('drying-progress'), dryingLabel = document.getElementById('drying-label');
const playPause = document.getElementById('play-pause'), replaySpeed = document.getElementById('replay-speed');
const filmCanvas = document.getElementById('film');
let playingWhat = '', playingExample = false, filmRun = 0, filmSkip = false, replayPaused = false, tapeRequest=null;
const setPlaying = on => {
  operations.playing(on);operations.canvas.hidden=on&&lab.mode==='replay';if(!on)operations.clear();
  playing = on; lab.playing = on;document.body.classList.toggle('replaying',on); pauseButton.disabled = on; quickDryButton.disabled = on || Boolean(lab.quickDry);
  playbar.hidden = !on; caption.hidden = !on;if(!on)document.getElementById('current-materials').hidden=true;
  if(on){caption.textContent='Preparing the paper';playProgress.value=0;lab.progress=null;document.getElementById('skip').disabled=true;}
  queueCursor();
};
const cancelPlayback = () => {
  tapeRequest?.abort();tapeRequest=null;
  worker.postMessage({type:'stop-live'});filmRun++; filmCanvas.hidden=true; filmSkip=false; replayPaused=false;
  playPause.textContent='Pause'; playPause.setAttribute('aria-pressed','false');
  worker.postMessage({type:'pause',on:false}); setPlaying(false);
};
const newSheet = () => { playbackUI.dismiss();playbackUI.hide();document.body.classList.remove('has-example');document.getElementById('sheet-title').textContent='Your painting studio'; cancelStroke(); cancelPlayback(); worker.postMessage({type:'clear',seed:PAPER_SEED}); announce('New sheet'); };
function startDemo(name, title) {
  playbackUI.dismiss();playbackUI.hide();document.body.classList.remove('has-example');document.getElementById('sheet-title').textContent=title;
  // Technique samples have live instructions, not a saved-frame recording.
  runMode.value='live';lab.mode='live';document.getElementById('mode-note').textContent='Live technique · paint, water and pigment simulated here.';
  cancelStroke(); setPlaying(true); playPause.hidden=true; handNote=null; playingWhat=title.toLowerCase(); playingExample=false;
  worker.postMessage({type:'play',name,seed:PAPER_SEED});
}
const targets = createTargets({startFilm:playExampleFilm, startDemo, fresh:newSheet,
  resume:()=>{playbackUI.hide();document.body.classList.remove('has-example');document.getElementById('sheet-title').textContent='Saved painting';worker.postMessage({type:'resume'});}, cancel:()=>{cancelStroke();cancelPlayback();playbackUI.dismiss();},
  sheet:()=>({W,H,ready:started&&W>0})});
const playbackUI=createPlaybackUI(f=>targets.replay(f));
// Keep hand tools close to the paper on phones, ahead of secondary reading.
const compactTools=matchMedia('(max-width:860px)');
function placeTools(){const panel=document.querySelector('aside');if(compactTools.matches)document.querySelector('.sheetbar').after(panel);else document.querySelector('.lab').append(panel);}
compactTools.addEventListener('change',placeTools);placeTools();

for(const b of document.querySelectorAll('[data-start]')){b.disabled=true;b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',()=>{playbackUI.dismiss();if(b.dataset.start==='blank')targets.open('blank');else if(b.dataset.start==='example')targets.randomExample();else targets.randomTechnique();});}
targets.ready.then(()=>document.querySelectorAll('[data-start]').forEach(b=>b.disabled=false));
lab.seek=f=>targets.replay(f);
document.getElementById('replay').addEventListener('click',()=>targets.replay());
document.getElementById('clear').addEventListener('click',newSheet);
document.getElementById('skip').addEventListener('click',()=>{if(!playingExample)worker.postMessage({type:'skip'});else if(lab.mode==='live')worker.postMessage({type:'carry-live'});else {filmSkip=true;} });
playPause.addEventListener('click',()=>{
  replayPaused=!replayPaused;worker.postMessage({type:'live-pause',on:replayPaused});playPause.textContent=replayPaused?'Play':'Pause';playPause.setAttribute('aria-pressed',String(replayPaused));
});
const runMode=document.getElementById('run-mode'),strokeLimit=document.getElementById('stroke-limit');
// Examples open on the painter's own saved frames. Live re-paints only the first recorded strokes with the browser's
// physics, a different build, so it is an opt-in study, not the painting. Technique demos switch to live for themselves.
let exampleMode='replay';lab.mode=exampleMode;
for(const el of [runMode,strokeLimit])el.addEventListener('change',()=>{exampleMode=runMode.value;lab.mode=runMode.value;document.getElementById('mode-note').textContent=lab.mode==='live'?'Live paints the recorded strokes here, with water and pigment physics.':'Recording · original saved frames, stepped without fades. Overlay: stroke path.';targets.replay();});
replaySpeed.addEventListener('change',()=>worker.postMessage({type:'live-speed',value:Number(replaySpeed.value)}));
document.querySelectorAll('[data-seek]').forEach(b=>b.addEventListener('click',()=>targets.replay(Number(b.dataset.seek))));
document.getElementById('redip').addEventListener('click',()=>{worker.postMessage({type:'redip'});announce('Re-dipped. The next stroke starts with a fresh load.');});
document.getElementById('auto-redip').addEventListener('change',e=>{settings.autoRedip=e.target.checked;});
async function playExampleFilm(example, carry=false, seek=0) {
  const run=++filmRun, alive=()=>run===filmRun;
  runMode.value=exampleMode;lab.mode=exampleMode;document.getElementById('mode-note').textContent=exampleMode==='live'?'Live paints the recorded strokes here, with water and pigment physics.':'Recording · original saved frames, stepped without fades. Overlay: stroke path.';
  cancelStroke();hover=null;queueCursor();setPlaying(true);playPause.hidden=false;handNote=null;playingWhat=example.title.toLowerCase();playingExample=true;filmSkip=carry;
  document.getElementById('paint-hint').hidden=true;
  state.textContent=`Playing: ${example.title}`;caption.textContent='Recorded early strokes. Carry on painting when you are ready.';
  const base=new URL('./',import.meta.url);
  document.body.classList.add('has-example');playbackUI.dismiss();playbackUI.example(example,strokeLimit.value,runMode.value);document.getElementById('sheet-title').textContent=example.title.split(' · ')[0];
  const selected=seek?playbackUI.preview(seek):null;lab.seeking=!!selected;
  if(selected){playProgress.value=seek;lab.progress={done:selected.done,total:Number(strokeLimit.value),phase:'restoring'};}
  if(!selected)playbackUI.ready();
  if(runMode.value==='live'){
    lab.target={id:example.id,live:true,started:performance.now()};caption.textContent=selected?`Opening the ${Math.round(seek*100)}% point…`:'Live · first '+Number(strokeLimit.value).toLocaleString()+' recorded strokes';
    try{
      const [tape,checkpoint]=await Promise.all([loadTape(example.live[strokeLimit.value]),selected?loadBytes(selected.state):null]);
      if(alive())worker.postMessage({type:'live',tape,checkpoint,liveRun:run});
    }catch(error){if(alive()){playbackUI.ready();lab.seeking=false;setPlaying(false);state.textContent='Could not load this painting state. Try another thumbnail.';console.error(error);}}
    return true;
  }
  caption.textContent='Recording · saved frames. Overlay: stroke path.';
  const film={...example.film, frames:example.film.frames.map(f=>new URL(f,base).href),paths:example.film.paths?new URL(example.film.paths,base).href:null};
  lab.target={id:example.id,film:true,frames:film.frames.length,started:performance.now()};
  worker.postMessage({type:'pause',on:true});
  playFilm(film,filmCanvas,W,H,{progress:(d,t)=>{playbackUI.ready();lab.seeking=false;playbackUI.update(d/t);document.getElementById('skip').disabled=false;playProgress.value=d/t;lab.replayProgress=d/t;}, skipped:()=>filmSkip,alive,
    seek,paused:()=>replayPaused,speed:()=>Number(replaySpeed.value),brush:()=>document.getElementById('show-brush').checked})
    .then(({final,box})=>{if(!alive())return;state.textContent='Ready to carry on painting';worker.postMessage({type:'base',width:W,height:H,rgba:sheetPixels(final,box,W,H),white:SURFACES.cold.colour,surface:'cold'});})
    .catch(error=>{if(!alive())return;console.error(error);filmCanvas.hidden=true;setPlaying(false);state.textContent='The recording could not be loaded';worker.postMessage({type:'pause',on:false});});
  return true;
}
// What the visitor is handed once a demonstration or an example has played. It stays up until their first stroke, or for
// a few seconds; the frames' own Wet and Dry overwrote it at once.
let handNote = null, frameState = 'Drag on the paper to paint';
const handBack = ({ cancelled, example, wet }) => cancelled ? 'New sheet' : !example ? 'Your turn: drag on the paper' : wet ? 'Your turn: the paper is still wet' : 'Your turn: the washes are dry';

// Mouse/finger pressure responds to current CSS motion; stylus readings remain untouched.
let pointer = null, last = null, lastT = 0, lastMove = 0, lastScreen = null, lastPointerType = null;
const moves = createMoveQueue(message => worker.postMessage(message), requestAnimationFrame, cancelAnimationFrame);
let canvasRect;
const cacheRect = () => { canvasRect = canvas.getBoundingClientRect(); };
new ResizeObserver(cacheRect).observe(sheetEl);
window.addEventListener('scroll', cacheRect, { passive: true, capture: true });
window.addEventListener('resize', cacheRect);
cacheRect();
const contactSampler = createPointerSampler();
const toSheet = (e,previous=null) => {
  const options={manual:manualPressure.checked,dpi:PIXELS_PER_INCH,release:e.type==='pointerup'};
  return previous ? contactSampler.sample(e,canvasRect,W,H,settings.pressure,options)
    : pointerSample(e,canvasRect,W,H,settings.pressure,options);
};
const recordContact=(pt,phase)=>{lab.lastContact={pressure:pt.p,source:pt.pressureSource,phase,pointerType:lastPointerType};(lab.contacts??=[]).push(lab.lastContact);if(lab.contacts.length>100)lab.contacts.shift();};
const toolInHand=()=>temporaryWater?{...settings,tool:'water'}:{...settings};
function cancelStroke() { clearPendingTouch(); if (pointer === null) return; pointer = null; lastScreen=null; moves.discard(); worker.postMessage({ type: 'up',pt:{...last,p:0} }); }
function setTemporaryWater() {
  const next=altHeld||barrelHeld;if(next===temporaryWater)return;
  if(pointer!==null){moves.flush();worker.postMessage({type:'up',pt:{...last,p:0}});}
  temporaryWater=next;lab.temporaryWater=next;
  if(pointer!==null)worker.postMessage({type:'down',pt:last,tool:toolInHand()});
  updateActiveTool();queueCursor();
}
const editing=e=>e.target.closest?.('textarea,select,[contenteditable],input:not([type=range]):not([type=checkbox])');
document.addEventListener('keydown',e=>{if(e.key==='Alt'&&!e.ctrlKey&&!e.metaKey&&!editing(e)){altHeld=true;setTemporaryWater();}});
document.addEventListener('keyup',e=>{if(e.key==='Alt'){altHeld=false;setTemporaryWater();}});
window.addEventListener('blur',()=>{cancelStroke();altHeld=barrelHeld=false;setTemporaryWater();});
// Gesture coordinates are viewport coordinates; painting uses the cached transformed rect.
const touches = new Map(); let gesture = null, zoom = 1, panX = 0, panY = 0, touchStart = null;
let touchTimer = null;
function clearPendingTouch() { clearTimeout(touchTimer); touchTimer = null; touchStart = null; }
function startTouch() {
  const start = touchStart;
  clearPendingTouch();
  if (!start || !started || playing || gesture || pointer !== null) return;
  cacheRect(); canvas.focus({preventScroll:true}); pointer = start.pointerId; lastPointerType='touch'; lastScreen=start; contactSampler.reset(); last = toSheet(start,true); recordContact(last,'down'); lastT = start.timeStamp; lastMove = performance.now();
  document.getElementById('paint-hint').hidden = true;
  worker.postMessage({ type: 'down', pt: last, tool: toolInHand() });
}
const applyView = () => {
  for (const el of [canvas, filmCanvas, operations.canvas, document.getElementById('seek-preview'), document.getElementById('cursor')]) { el.style.transformOrigin = '0 0'; el.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; }
  cacheRect(); queueCursor();
};
let focusScroll=0;
function fitFocus(){
  if(!lab.focus)return;
  cacheRect();queueCursor();
}
function setFocus(on){
  cancelStroke();if(on)focusScroll=scrollY;
  lab.focus=on;document.body.classList.toggle('canvas-focus',on);
  const button=document.getElementById('focus-view');button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Exit fullscreen':'Fullscreen');
  document.getElementById('exit-focus').hidden=!on;
  zoom=1;panX=panY=0;applyView();fitFocus();
  if(on)document.getElementById('exit-focus').focus({preventScroll:true});else{scrollTo(0,focusScroll);button.focus({preventScroll:true});}
}
document.getElementById('focus-view').addEventListener('click',()=>setFocus(!lab.focus));
document.getElementById('exit-focus').addEventListener('click',()=>setFocus(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&lab.focus){e.preventDefault();setFocus(false);}});
window.addEventListener('resize',fitFocus);
const touchPair = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
sheetEl.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || e.target.closest('button')) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); sheetEl.setPointerCapture(e.pointerId);
  if (touches.size === 1) { touchStart = e; touchTimer = setTimeout(startTouch, 90); e.stopImmediatePropagation(); }
  else {
    cancelStroke(); touchStart = null; const r = sheetEl.getBoundingClientRect();
    gesture = { ...touchPair(), zoom, panX, panY, left: r.left, top: r.top }; e.stopImmediatePropagation();
  }
}, true);
sheetEl.addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture) {
    if (touches.size >= 2) {
      const p = touchPair(); zoom = Math.max(1, Math.min(4, gesture.zoom * p.distance / gesture.distance));
      const ratio = zoom / gesture.zoom;
      panX = p.x - gesture.left - (gesture.x - gesture.left - gesture.panX) * ratio;
      panY = p.y - gesture.top - (gesture.y - gesture.top - gesture.panY) * ratio;
      if (zoom === 1) panX = panY = 0;
      applyView();
    }
    e.stopImmediatePropagation(); return;
  }
  if (touchStart) startTouch();
}, true);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) sheetEl.addEventListener(type, e => {
  if (e.pointerType !== 'touch' || e.target.closest('button')) return;
  if (type === 'pointerup' && touchStart?.pointerId === e.pointerId && !gesture) startTouch();
  touches.delete(e.pointerId); clearPendingTouch();
  if (gesture) { e.stopImmediatePropagation(); if (!touches.size) gesture = null; }
}, true);
document.getElementById('reset-view').addEventListener('click', () => { zoom = 1; panX = panY = 0; applyView(); });
sheetEl.addEventListener('pointerdown', e => {
  if (e.target.closest('button'))return;
  if (!started || playing || pointer !== null) return;
  playbackUI.dismiss();
  cacheRect(); // A control can move the sheet without resizing it.
  lastPointerType=e.pointerType;barrelHeld=e.pointerType==='pen'&&Boolean(e.buttons&2);setTemporaryWater();
  canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId); pointer = e.pointerId; lastScreen=e; contactSampler.reset(); last = toSheet(e,true);recordContact(last,'down');lastT = e.timeStamp; lastMove = e.timeStamp;
  document.getElementById('paint-hint').hidden = true;
  worker.postMessage({ type: 'down', pt: last, tool: toolInHand() });
});
sheetEl.addEventListener('pointermove', e => {
  if (e.pointerId !== pointer) return;
  if(e.pointerType==='pen'){barrelHeld=Boolean(e.buttons&2);setTemporaryWater();}
  const coalesced = e.getCoalescedEvents?.(), events = coalesced?.length ? coalesced : [e];
  for (const ev of events) {
    const pt = toSheet(ev,lastScreen), dt = Math.max(1, ev.timeStamp - lastT);recordContact(pt,'move');lastScreen=ev;
    pt.v = Math.min(4, (Math.hypot(pt.x - last.x, pt.y - last.y) / dt) * 16); // sheet px per 16 ms
    moves.push(pt, performance.timeOrigin + ev.timeStamp); last = pt; lastT = ev.timeStamp; lastMove = ev.timeStamp;
  }
});
const up = e => { if (e.pointerId !== pointer) return; const pt=e.type==='pointerup'?toSheet(e,lastScreen):{...last,p:0};recordContact(pt,'up'); pointer = null;lastScreen=null; moves.flush(); worker.postMessage({ type: 'up', pt });barrelHeld=false;setTemporaryWater(); };
sheetEl.addEventListener('pointerup', up); sheetEl.addEventListener('pointercancel', up); sheetEl.addEventListener('lostpointercapture', up);
sheetEl.addEventListener('contextmenu',e=>{if(lastPointerType==='pen')e.preventDefault();});
setInterval(() => {
  if (pointer !== null && (settings.tool === 'pen' || settings.tool === 'dryer') && performance.now() - lastMove > 80) { moves.flush(); worker.postMessage({ type: 'move', pts: [{ ...last, dwell: 2 }] }); } // a held pen blots; a held dryer keeps blowing
}, 30);

// The brush preview: a small canvas over the paper, so never in the painting or in a save. It is drawn under the pointer on the
// next animation frame after the pointer, a setting or a frame from the worker changes something, and only while it is over the paper.
const cursor = createCursor(document.getElementById('cursor'));
const FINGER_MM = 6; // how far from the touch point a fingertip covers the paper
const PIGMENT_COLOUR = Object.fromEntries(PIGMENTS.map(({ key, swatch }) => [key, swatch]));
let hover = null, heading = { x: 1, y: 0 }, headAt = null, live = null, cursorQueued = false; // live: the brush in hand, from the worker's frame
function paintCursor() {
  cursorQueued = false; cursor.clear(); lab.cursor = null;
  if (!hover || !started || playing) return;
  const r = canvasRect, k = r.width / W, tool = temporaryWater?'water':settings.tool, x = (hover.cx - r.left) / k, y = (hover.cy - r.top) / k;
  // A finger down covers about FINGER_MM round the touch, and the preview is hidden wherever it would sit under it: only a tuft
  // whose tip has dragged clear of the finger and its own footprint is shown. A pen's and a mouse's pointer hides nothing.
  if (hover.touch && !(live?.tip && Math.hypot(live.tip.x - x, live.tip.y - y) > ((FINGER_MM + settings.sizeMm / 2) / MM) * PIXELS_PER_INCH)) return;
  lab.cursor = cursor.draw({
    x, y, w: W, dpi: PIXELS_PER_INCH, tool:['mask','lift','blot'].includes(tool)?'water':tool, model: settings.model, tiltX: hover.tiltX, tiltY: hover.tiltY, flat: tool === 'flat', sizeMm: settings.sizeMm, p: hover.p,
    colour: ['water','dryer','mask','lift','blot'].includes(tool) ? '#7fa6c9' : PIGMENT_TOOLS.includes(tool)&&settings.mixture ? `rgb(${previewMix(settings.mixture,settings.amount,SURFACES[surface].colour).paint.join(' ')})` : PIGMENT_COLOUR[settings.pigment], sat: live?.sat ?? settings.water, tip: live?.tip ?? null, bend: live?.bend ?? 0, len: live?.len ?? null, hx: heading.x, hy: heading.y,
  });
}
const queueCursor = () => { if (!cursorQueued) { cursorQueued = true; requestAnimationFrame(paintCursor); } };
// the overlay is as many pixels as the screen shows of the paper
new ResizeObserver(() => { const r = cursor.el.getBoundingClientRect(); cursor.size(r.width, r.height, window.devicePixelRatio || 1); queueCursor(); }).observe(cursor.el);
function hoverAt(e) {
  const r = canvasRect;
  // a touch does not hover: it has a preview only while the finger is down, and paintCursor hides it where it would sit under the finger
  if ((e.pointerType === 'touch' && e.buttons === 0) || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { hover = null; headAt = null; }
  else {
    if (!headAt) headAt = { x: e.clientX, y: e.clientY };
    const dx = e.clientX - headAt.x, dy = e.clientY - headAt.y, d = Math.hypot(dx, dy);
    if (d > 4) { heading = { x: dx / d, y: dy / d }; headAt = { x: e.clientX, y: e.clientY }; } // a row brush lies across the way the pointer last went
    hover = { cx: e.clientX, cy: e.clientY, touch: e.pointerType === 'touch', ...toSheet(e) };
    if(pointer===e.pointerId&&last)hover.p=last.p;
  }
  queueCursor();
}
for (const type of ['pointermove', 'pointerdown', 'pointerup']) sheetEl.addEventListener(type, hoverAt);
sheetEl.addEventListener('pointerleave', () => { hover = null; headAt = null; queueCursor(); });
document.querySelector('aside').addEventListener('input', queueCursor); document.querySelector('aside').addEventListener('click', queueCursor); document.querySelector('aside').addEventListener('change', queueCursor);

// strokes laid, how wide the marks are in millimetres, and the share of paint laid by marks under a sixteenth of an inch
function showMarks({ strokes, marks, physics, stepMs, stepCount }) {
  lab.stepMs = stepMs; lab.stepCount = stepCount; lab.marks = marks; lab.physics = physics;
  document.getElementById('backend').textContent = `${physics === 'webgpu' ? 'WebGPU' : 'CPU'} physics · ${lab.sheet ? `${lab.sheet.paperIn.join(' × ')} in at ${lab.sheet.dpi} dpi` : ''}`;
  document.getElementById('stroke-count').textContent = `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`;
  document.getElementById('marks').textContent = strokes ? `median mark ${marks.medianMm.toFixed(1)} mm · ${(100 * marks.tinyShare).toFixed(0)}% of paint in marks under ${marks.tinyMm.toFixed(1)} mm` : '';
}
worker.addEventListener('message', ({ data }) => {
  if(data.liveRun!=null&&data.liveRun!==filmRun)return;
  if (data.type === 'caps') {
    lab.physics = data.physics; lab.physicsReason = data.physicsReason; lab.physicsName = data.physicsName;
    lab.dpiChoice=dpiAsked!==null?'URL':quality==='full'?'Full physics':data.webgpu?'Viewport':'CPU default';
    lab.viewportResolution={width:innerWidth,height:innerHeight,defaultDpi:quality==='full'?200:data.webgpu?GPU_DPI:CPU_DPI};
    if (dpiAsked === null) { dpi = quality==='full'?200:data.webgpu?GPU_DPI:CPU_DPI; lab.dpi = dpi; dpiSelect.value = String(dpi); }
    const canOffscreen = typeof canvas.transferControlToOffscreen === 'function';
    // WebGPU physics draws into a WebGPU canvas; otherwise WebGL2 draws the CPU physics
    start(!wantCpu && canOffscreen ? (data.webgpu ? 'webgpu' : data.gpu ? 'gl' : null) : null); if (!gpuCanvas) begin();
  }
  else if (data.type === 'renderer') { lab.render = data.kind === 'webgpu' ? 'webgpu' : 'gpu'; begin(); }
  else if (data.type === 'sheet') onSheet(data);
  else if (data.type === 'physics-failed') { lab.physicsFailure = data.reason; const q = new URLSearchParams(location.search); q.set('physics', 'cpu'); location.replace(`${location.pathname}?${q}`); }
  else if (data.type === 'gpu-failed') { const q = new URLSearchParams(location.search); q.set(data.kind === 'webgpu' ? 'physics' : 'render', 'cpu'); location.replace(`${location.pathname}?${q}`); } // replace, so Back does not return to the failing page
  else if (data.type === 'gpu-state') { lab.gpuEpoch = data.epoch; lab.gpuReady = data.ready; }
  else if (data.type === 'gpu-diag') lab.gpuDiag = `${data.reason} (try ${data.tries})`;
  else if (data.type === 'gpu-lost') useCpuCanvas();
  else if (data.type === 'snapshot') {
    if (data.rgba) { const c = document.createElement('canvas'); c.width = data.width; c.height = data.height; c.getContext('2d').putImageData(new ImageData(data.rgba, data.width, data.height), 0, 0); c.toBlob(download); }
    else download(data.blob);
  }
  else if (data.type === 'live-ready') {playbackUI.ready();lab.seeking=false;playProgress.value=data.done/data.total;playbackUI.update(data.done/data.total);document.getElementById('skip').disabled=false;lab.progress={done:data.done,total:data.total,phase:'painting'};}
  else if(data.type==='operation'){operations.stage(data);lab.operationStage={kind:data.kind,label:data.label,done:data.done};if(playing){caption.textContent=data.label;playbackUI.materials({phase:data.label,tool:'',pigments:[]});}}
  else if (data.type === 'materials') {playbackUI.materials(data);lab.materials=data;if(data.total)caption.textContent=`${data.phase} · ${data.done+1} / ${data.total} strokes`;}
  else if (data.type === 'caption') { if (playing) caption.textContent = data.text; }
  else if (data.type === 'progress') {
    if (!playing) return;
    document.getElementById('skip').disabled=data.phase==='seeking';
    if (playingExample) {playbackUI.update(data.done/data.total);caption.textContent=`${lab.materials?.phase||'Painting'} · ${data.done} / ${data.total} strokes`;}
    playProgress.value = data.total ? data.done / data.total : 0; lab.progress = { done: data.done, total: data.total, phase: data.phase };
    if (!/^Finishing/.test(state.textContent)) state.textContent = `${data.phase === 'drying' ? 'Letting it dry' : 'Painting'}: ${playingWhat}…`;
  }
  else if (data.type === 'resume-available') { targets.resumeAvailable(); }
  else if (data.type === 'autosave') { const el = document.getElementById('autosave-status'); el.textContent = data.error || 'Saved on this device'; el.title = data.savedAt ? new Date(data.savedAt).toLocaleString() : ''; }
  else if (data.type === 'history') { for (const action of ['undo', 'redo']) document.getElementById(action).disabled = !data[action]; }
  else if (data.type === 'capture') { captureResolve?.(data.bytes); captureResolve = null; }
  else if (data.type === 'kernels') { kernelsResolve?.(data); kernelsResolve = null; }
  else if (data.type === 'probe') { probeResolve?.(data); probeResolve = null; }
  else if (data.type === 'equiv') { equivResolve?.(data); equivResolve = null; }
  else if (data.type === 'dpicheck') { dpiResolve?.(data); dpiResolve = null; }
  else if (data.type === 'frame') {
    const t0 = performance.now();
    if (data.rgba && image) { image.data.set(data.rgba); ctx.putImageData(image, 0, 0); }
    operations.frame(data);if(data.operation!==undefined)lab.operation=data.operation; if(data.masks)lab.masks={resistCells:data.masks.resist?.reduce((n,v)=>n+v,0)||0,clipCells:data.masks.clip?.reduce((n,v)=>n+v,0)??null};
    const held = live; live = data.cursor ?? null; if (hover && (live || held)) queueCursor(); // the brush in hand, for the preview
    // how long the last stroke point took from the page to a drawn frame: the lag a painter sees
    if (data.moveT) { lab.lags.push(now() - data.moveT); if (lab.lags.length > 300) lab.lags.shift(); }
    lab.drying = data.drying; lab.dryingProgress = data.dryingProgress; lab.dryingSteps = data.dryingSteps;
    lab.quickDry=Boolean(data.quickDry);quickDryButton.textContent=data.quickDry?'Drying…':'Dry layer';quickDryButton.disabled=playing||Boolean(data.quickDry);
    dryingEl.hidden = !data.drying;
    if (data.dryingProgress > 0) dryingProgress.value = data.dryingProgress; else dryingProgress.removeAttribute('value');
    dryingLabel.textContent = `Drying · ${Math.round(data.dryingProgress * 100)}%`;
    dryingLabel.title = 'Share of the peak wet area that has dried';
    lab.gpuSteps = data.gpuSteps; lab.gpuFrameMs = data.gpuFrameMs; lab.wet = Boolean(data.wet);
    lab.lastTool = data.lastTool;lab.load=data.load;lab.replayPoint=data.replayPoint;
    document.getElementById('load-state').textContent=data.load?`Water ${data.load.water.toFixed(1)} · paint ${data.load.pigment.toFixed(1)} · ${settings.autoRedip?'auto re-dip each wet stroke':'manual re-dip'}`:'';
    if(lab.mode==='live'&&playing)filmCanvas.hidden=true;

    lab.frames++; if (data.gpuDrawn) lab.gpuDrawnEpoch = data.gpuDrawn; lab.workerRenderMs = data.renderMs; lab.workerRenders = data.renderCount;
    if (handNote && (performance.now() > handNote.until || data.strokes !== handNote.strokes)) handNote = null;
    frameState = data.strokes === 0 ? 'Drag on the paper to paint' : (data.paused ? 'Paused' : data.wet ? 'Wet' : 'Dry');
    if (!playing) state.textContent = handNote ? handNote.text : frameState;
    if (wasPaused !== null && data.paused !== wasPaused) announce(data.paused ? 'Drying paused' : 'Drying resumed');
    wasPaused = data.paused;
    if (data.strokes !== strokeCount) canvas.setAttribute('aria-label', `Paper with ${data.strokes} ${data.strokes === 1 ? 'stroke' : 'strokes'}. Drag to paint.`);
    strokeCount = data.strokes;
    pauseButton.setAttribute('aria-pressed', String(data.paused));pauseButton.textContent = data.paused ? 'Resume drying' : 'Pause drying';
    showMarks(data);
    // Frames update live brush load, not the selected controls. Setting handlers update those controls.
    canvas.dataset.ticks=data.ticks;canvas.dataset.strokes=data.strokes;
    dryer.setAttribute('aria-pressed', String(data.dryer));
    lab.mainMs += performance.now() - t0;
  } else if (data.type === 'played') {
    filmCanvas.hidden=true;
    if (data.name === 'film') { worker.postMessage({type:'pause',on:false}); requestAnimationFrame(() => requestAnimationFrame(() => { filmCanvas.hidden = true; })); }
    else if (data.cancelled) filmCanvas.hidden = true;
    setPlaying(false); state.textContent = handBack(data);
    // the note stays until the visitor's own first stroke: counted from the worker's tally, which the frames may not show yet
    if (!data.cancelled) {
      const note = handNote = { text: handBack(data), strokes: data.strokes ?? strokeCount, until: performance.now() + 6000 };
      setTimeout(() => { if (handNote === note) { handNote = null; if (!playing) state.textContent = frameState; } }, 6100); announce(`${data.example ? 'Example' : 'Demonstration'} finished. ${handBack(data)}`); }
  }
});
worker.postMessage({type:'quality',value:quality});
worker.postMessage({ type: 'config', physics: query.get('physics') === 'cpu' ? 'cpu' : 'auto', noWebgpu: query.get('nowebgpu') === '1' });
worker.addEventListener('error', e => {
  e.preventDefault(); cancelStroke(); setPlaying(true);
  document.querySelectorAll('aside button, aside input').forEach(el => { el.disabled = true; });
  const text = `The simulation stopped: ${e.message || 'the paint engine could not start in this browser.'}`;
  state.textContent = text; announce(text);
});

setupScratch(document.getElementById('scratch'),()=>({...settings,surface,scratchDpi:canvas.getBoundingClientRect().width/W*dpi,colour:previewMix(settings.mixture||{[settings.pigment]:1},settings.amount,SURFACES[surface].colour).paint}));
