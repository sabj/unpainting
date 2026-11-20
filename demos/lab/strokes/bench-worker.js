// The stroke bench's worker: lays each bench stroke (media/stroke-bench.js, the painter's own strokes and brushes) on the
// CPU sheet and on the WebGPU sheet, dries it and posts its colour. The brush, pen and pencil run on the CPU copy in both;
// the WebGPU column flows and dries the water on the GPU, as Paint Lab does.
import { BENCH_STROKES, layBenchStroke, cpuOps, benchPigments } from '../media/stroke-bench.js';
import { layersOf, DEFAULTS } from '../media/sheet.js';
import { renderLayers } from '../media/km.js';
import { BY_KEY } from '../media/pigments.js';
import { paperReflectance } from '../media/papers.js';
import { GpuPhysics } from '../gpu/gpu-physics.js';

const WASH = BY_KEY.ultramarine, GLAZE = { yellow: BY_KEY.hansa, green: BY_KEY.sapgreen, cyan: BY_KEY.cerulean, rose: BY_KEY.rose };
let phys = null, physError = '';

async function gpu() {
  if (phys || physError) return phys;
  try {
    if (!globalThis.navigator?.gpu) throw new Error('no WebGPU in this browser');
    phys = await GpuPhysics.create(benchPigments(WASH, GLAZE), { ...DEFAULTS }, navigator.gpu);
  } catch (e) { physError = String(e?.message ?? e).slice(0, 200); }
  return phys;
}

// The WebGPU sheet's ops: the instrument works on the CPU copy of its rectangle, which is brought down first and sent up after.
const gpuOps = p => {
  let lastO = null;
  return {
    attach: async sheet => { p.setOptions({ ...DEFAULTS }); lastO = null; await p.load(sheet, new Float32Array(sheet.n * 3).fill(1), new Float32Array(sheet.n)); },
    instrument: async (sheet, points, reach, fn) => { const rect = p.rect(points, reach); await p.ensureFresh(sheet, rect); fn(); p.up(sheet, rect); },
    step: async (sheet, n, O) => { if (O !== lastO) { p.setOptions(O); lastO = O; } return p.step(n); },
    read: sheet => p.syncAll(sheet),
    fix: sheet => p.fix(sheet),
  };
};

function colour(sheet, pigments, surface) {
  const base = paperReflectance(sheet.paper, surface, 25.4 / sheet.paper.mmPerCell), paper = new Uint8Array(sheet.n * 3);
  for (let i = 0; i < paper.length; i++) paper[i] = Math.round(255 * base[i]);
  const rgb = renderLayers(layersOf(sheet), pigments, paper, sheet.n), rgba = new Uint8ClampedArray(sheet.n * 4);
  for (let i = 0; i < sheet.n; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  return rgba;
}

let run = 0;
onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  const mine = ++run, { mmPerCell, backends } = data;
  const g = backends.includes('gpu') ? await gpu() : null;
  postMessage({ type: 'caps', gpu: !!g, gpuName: g?.name ?? '', gpuError: physError });
  for (const s of BENCH_STROKES) for (const backend of backends) {
    if (mine !== run) return;
    if (backend === 'gpu' && !g) continue;
    const t = performance.now();
    try {
      const { sheet, pigments, steps } = await layBenchStroke(s, { mmPerCell, wash: WASH, glaze: GLAZE, ops: backend === 'gpu' ? gpuOps(g) : cpuOps() });
      const rgba = colour(sheet, pigments, s.paper);
      postMessage({ type: 'stroke', id: s.id, backend, w: sheet.w, h: sheet.h, rgba, steps, ms: performance.now() - t }, [rgba.buffer]);
    } catch (e) { postMessage({ type: 'stroke', id: s.id, backend, error: String(e?.message ?? e) }); }
  }
  if (mine === run) postMessage({ type: 'done' });
};
