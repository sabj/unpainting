// Shared proof harness: timed physics, native images, no CPU substitution.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { runDoctor } from '../../src/paint/doctor.mjs';

export const PROOF_DRY = { levelMax: 200 };
const MAX_DRY = 200000;

export function proofArgs(argv) {
  const [root, out, seed = '1', mm = '0.26'] = argv;
  if (argv.length > 4 || !root || !out) throw new Error('usage: <repo root> <empty out dir> [seed=1] [mm=0.26]');
  const result = { root: path.resolve(root), out: path.resolve(out), seed: Number(seed), mm: Number(mm) };
  if (!Number.isSafeInteger(result.seed) || !(result.mm >= 0.05 && result.mm <= 1)) throw new Error('need an integer seed and 0.05 <= mm <= 1');
  return result;
}

/** GPU exposes no total evaporation counter. Null means unmeasured, never zero. */
export function dryConservation(initial, final, evaporated = null) {
  if (initial.pig.length !== final.pig.length) throw new Error('dry changed pigment count');
  for (const value of [initial.water, final.water, ...(evaporated === null ? [] : [evaporated]), ...initial.pig, ...final.pig]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('dry has a negative or non-finite mass');
  }
  const waterError = evaporated === null ? null : Math.abs(final.water + evaporated - initial.water) / Math.max(initial.water, 1e-12);
  const pigmentErrors = initial.pig.map((v, k) => Math.abs(final.pig[k] - v) / Math.max(v, 1e-12));
  if (final.water > initial.water + 1e-5 * Math.max(initial.water, 1e-12) || waterError > 1e-5 || pigmentErrors.some(e => e > 1e-5)) throw new Error(`dry lost or created mass: ${JSON.stringify({ waterError, pigmentErrors })}`);
  return { waterError, pigmentErrors };
}

export async function openFibreProof({ root, out, seed, mm, sizeMm, pigments, reference = null }) {
  if (process.env.GPU_ASYNC_DRY === '1') throw new Error('proof needs synchronous dry completion and measured step counts; unset GPU_ASYNC_DRY');
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('proof output directory must be empty (keep failed and successful runs separate)');
  const doctor = runDoctor({ root, strictModels: true });
  if (!doctor.ok) throw new Error(`fibre proof preflight failed: ${doctor.failures.join('; ')}`);
  if (reference && (reference.commit !== doctor.checks.code.commit || reference.seed !== seed || reference.mmPerCell !== mm || reference.sizeMm !== sizeMm || !Number.isSafeInteger(reference.solverSteps) || reference.solverSteps < 100 || reference.playback)) throw new Error('playback needs an unobserved reference of this exact revision, paper and density');
  for (const rel of ['.venv-lines', '.venv-seg', 'work/line-models/hf']) {
    if (!fs.existsSync(path.join(root, rel))) throw new Error(`fibre proof preflight failed: ${rel} missing`);
  }
  const get = rel => import(pathToFileURL(path.join(root, 'src', rel)));
  const [S, B, { makePaper }, { renderLayers }, { attachGpu }, checks] = await Promise.all([
    get('media/sheet.mjs'), get('media/brush.mjs'), get('media/paper.mjs'), get('media/km.mjs'), get('media/gpu/link.mjs'), get('media/checks.mjs'),
  ]);
  checks.setStrict(true);
  const started = performance.now();
  const w = Math.round(sizeMm / mm), h = w;
  const sheet = S.createSheet(makePaper(w, h, { seed, mmPerCell: mm, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm } }), pigments);
  const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
  const backend = attachGpu(sheet, O, { mode: 'on', log: m => console.error(m) });
  if (backend.backend !== 'gpu' || backend.fallback) { sheet._gpu?.close(); throw new Error('fibre proof requires GPU with no fallback'); }
  const identity = backend.adapterEvidence?.adapterInfo;
  if (!identity || !Object.values(identity).some(v => typeof v === 'string' && v.trim()) || /swiftshader|llvmpipe|lavapipe|software/i.test(Object.values(identity).join(' '))) {
    sheet._gpu.close(); throw new Error('fibre proof needs a recorded hardware GPU adapter');
  }
  fs.mkdirSync(out, { recursive: true });
  const frames = [], drys = [];
  // A separate replay observes five exact percentages of the completed pilot's
  // solver-step count. It never supplies a runtime sample: the readbacks alter
  // synchronization cost. The solver and its convergence criteria stay intact.
  let solverSteps = 0;
  const pending = new Map(reference ? [10, 25, 50, 75].map(pct => [Math.ceil(reference.solverSteps * pct / 100), pct]) : []);
  const observed = [];
  const setupSeconds = (performance.now() - started) / 1000;
  let physicsSeconds = 0, observationSeconds = 0;
  const timed = fn => { const t = performance.now(); try { return fn(); } finally { physicsSeconds += (performance.now() - t) / 1000; } };
  const raw = fn => timed(() => { S.coherent(sheet); fn(); sheet._gpu.cpuWroteAll(); });
  const capture = name => {
    // Charge queued painting work to painting before doing any optics.
    timed(() => S.coherent(sheet));
    const observing = performance.now();
    const base = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) base.set([246, 245, 239], i * 3);
    frames.push({ name, rgb: Buffer.from(renderLayers(S.layersOf(sheet), pigments, base, w * h)) });
    observationSeconds += (performance.now() - observing) / 1000;
  };
  const observe = at => {
    const pct = pending.get(at);
    if (pct === undefined) return;
    capture(`stages/stage-${String(pct).padStart(3, '0')}.jpg`);
    observed.push({ pct, solverStep: at }); pending.delete(at);
  };
  const api = { ...S, step: (...args) => { const result = S.step(...args); solverSteps++; observe(solverSteps); return result; } };
  const dry = name => {
    const initial = S.totals(sheet);
    const start = performance.now();
    const begin = solverSteps;
    // A watched GPU dry stops at its last requested checkpoint. The terminal
    // sentinel keeps advancing until the wet counter proves convergence; it
    // must never fix the still-wet state at the last visible playback frame.
    const watch = reference ? { steps: [...pending.keys()].filter(t => t > begin).map(t => t - begin - 1).concat(MAX_DRY - 1), onStep: t => observe(begin + t + 1) } : {};
    const steps = timed(() => S.dry(sheet, MAX_DRY, O, { ...PROOF_DRY, ...watch }));
    solverSteps += steps;
    const seconds = (performance.now() - start) / 1000;
    const final = S.totals(sheet), evaporated = null;
    if (steps >= MAX_DRY || sheet.M.some(v => v !== 0)) throw new Error('fibre proof did not dry through the solver');
    const conservation = dryConservation(initial, final, evaporated);
    drys.push({ name, steps, seconds, initial, final, evaporated, ...conservation });
    capture(name);
    return steps;
  };
  const finish = async extra => {
    timed(() => S.coherent(sheet));
    const summary = checks.continuedSummary();
    if (summary.total) throw new Error('continued physics checks cannot count as proof');
    // Include brush construction, dipping, planning and all synchronization,
    // not just calls explicitly wrapped in timed(). Exclude optics and PNG I/O.
    if (reference) {
      if (pending.size || solverSteps !== reference.solverSteps || JSON.stringify(drys.map(d => d.steps)) !== JSON.stringify(reference.drys.map(d => d.steps))) throw new Error('playback diverged from its reference solver schedule');
      capture('stages/stage-100.jpg'); observed.push({ pct: 100, solverStep: solverSteps });
    }
    const paintSeconds = (performance.now() - started) / 1000 - observationSeconds;
    const filenames = [];
    for (const { name, rgb } of frames) {
      const filename = name.endsWith('.jpg') ? name : `${name}.png`;
      const target = path.join(out, filename); fs.mkdirSync(path.dirname(target), { recursive: true });
      const output = sharp(rgb, { raw: { width: w, height: h, channels: 3 } });
      await (filename.endsWith('.jpg') ? output.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }) : output.png()).toFile(target);
      filenames.push(filename);
    }
    const report = {
      commit: doctor.checks.code.commit, backend: backend.backend, fallback: backend.fallback, adapter: backend.adapterEvidence,
      seed, mmPerCell: mm, sizeMm, w, h, sourceWidth: w, paintedWidth: w, sourcescale: 1,
      dimensions: { sheetWidth: w, sourceWidth: w }, solverSteps,
      playback: reference ? { basis: 'solver advances, including damp preparation and complete dry bands', referenceCommit: reference.commit, stages: observed } : null,
      pigments, O, dryOptions: PROOF_DRY, paintSeconds, setupSeconds, physicsSeconds, observationSeconds, drys, frames: filenames,
      checks: summary, ...extra,
    };
    fs.writeFileSync(path.join(out, 'run-card.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    return report;
  };
  return { S: api, B, sheet, O, w, h, raw, timed, capture, dry, finish, close: () => sheet._gpu.close() };
}
