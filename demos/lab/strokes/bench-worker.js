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
    standing: async sheet => {
      await p.sheet.levelReady();
      const water = new Float32Array(await p.sheet.readWords('W', sheet.n * 4));
      let count = 0; for (const w of water) if (w > 1e-3) count++;
      return count;
    },
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

// A new request cancels at the next ops boundary, then waits for the old run
// to release the shared GPU. No two load/step/read sequences can overlap.
let run = 0, pending = Promise.resolve();
const cancelled = Symbol('cancelled');
onmessage = ({ data }) => {
  if (data.type !== 'run') return;
  const mine = ++run;
  pending = pending.catch(() => {}).then(async () => {
    const check = () => { if (mine !== run) throw cancelled; };
    const send = (message, transfer = []) => { check(); postMessage({ ...message, gen: data.gen }, transfer); };
    const guarded = ops => Object.fromEntries(Object.entries(ops).map(([name, fn]) => [name, async (...args) => {
      check(); const result = await fn(...args); check(); return result;
    }]));
    try {
      check();
      const { mmPerCell, backends } = data;
      const g = backends.includes('gpu') ? await gpu() : null;
      check();
      send({ type: 'caps', gpu: !!g, gpuName: g?.name ?? '', gpuError: physError });
      for (const s of BENCH_STROKES) for (const backend of backends) {
        check();
        if (backend === 'gpu' && !g) continue;
        // CPU ops resolve synchronously: yield so queued reruns can cancel too.
        await new Promise(resolve => setTimeout(resolve, 0));
        check();
        const t = performance.now();
        try {
          const { sheet, pigments, steps } = await layBenchStroke(s, { mmPerCell, wash: WASH, glaze: GLAZE, ops: guarded(backend === 'gpu' ? gpuOps(g) : cpuOps()) });
          check();
          const rgba = colour(sheet, pigments, s.paper);
          send({ type: 'stroke', id: s.id, backend, w: sheet.w, h: sheet.h, rgba, steps, ms: performance.now() - t }, [rgba.buffer]);
        } catch (e) {
          check(); if (e === cancelled) throw e;
          send({ type: 'stroke', id: s.id, backend, error: String(e?.message ?? e) });
        }
      }
      send({ type: 'done' });
    } catch (e) {
      if (e !== cancelled) send({ type: 'error', error: String(e?.message ?? e) });
    }
  });
};
