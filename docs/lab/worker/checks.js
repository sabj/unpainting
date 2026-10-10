// The lab's own measurements, run inside its worker: the same demonstration on the CPU physics and on the WebGPU physics,
// compared field by field and pixel by pixel, with the time each took. A run has no clock: a pause is a number of frames, so
// both backends see the same strokes and the same steps. Nothing here is used when painting.
import { markStats } from './marks.js';

const copy = a => Float32Array.from(a);
function snapshot({ sheet, baseR, graphite }) {
  const top = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
  return { W: copy(sheet.W), s: copy(sheet.s), M: copy(sheet.M), ever: copy(sheet.ever), G: sheet.G.map(copy), P: sheet.P.map(copy), D: sheet.D.map(copy), top: top ? top.map(copy) : null, layers: sheet.layers.length, baseR: copy(baseR), graphite: copy(graphite) };
}
const diff = (a, b) => {
  let max = 0, over4 = 0, over3 = 0, ref = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > 1e-4) over4++; if (d > 1e-3) over3++; const r = Math.abs(a[i]); if (r > ref) ref = r; }
  return { max, over4, over3, ref };
};
const worst = list => list.reduce((w, d) => ({ max: Math.max(w.max, d.max), over4: w.over4 + d.over4, over3: w.over3 + d.over3, ref: Math.max(w.ref, d.ref) }), { max: 0, over4: 0, over3: 0, ref: 0 });
function compareSheets(a, b) {
  const out = { W: diff(a.W, b.W), s: diff(a.s, b.s), M: diff(a.M, b.M), ever: diff(a.ever, b.ever), G: worst(a.G.map((x, k) => diff(x, b.G[k]))), P: worst(a.P.map((x, k) => diff(x, b.P[k]))), D: worst(a.D.map((x, k) => diff(x, b.D[k]))), baseR: diff(a.baseR, b.baseR), layers: [a.layers, b.layers] };
  if (a.top && b.top) out.top = worst(a.top.map((x, k) => diff(x, b.top[k])));
  out.fieldMax = Math.max(...['W', 's', 'G', 'P', 'D', 'baseR', 'top'].map(k => out[k]?.max ?? 0));
  return out;
}
function comparePixels(a, b) {
  let max = 0, sum = 0, over2 = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); sum += d; if (d > max) max = d; if (d > 2) over2++; }
  return { max, mean: sum / ((a.length / 4) * 3), over2 };
}

/** Run the named demonstration on each backend and compare. `opts` are the paper size, dpi and seed of the sheet. */
export async function runEquiv(lab, { name = 'wet-in-wet', paperW = 8, paperH = 6, dpi = 60, seed = 7, cpuToo = true, floor = false }) {
  const phys = lab.getPhys(), result = { name, dpi, paperW, paperH, physics: phys ? 'webgpu' : 'cpu', adapter: phys?.name ?? '' };
  lab.det(true);
  const run = async usePhys => {
    lab.setPhys(usePhys ? phys : null); lab.skipRender(true);
    await lab.reset({ paperW, paperH, dpi, seed }); lab.resetStats();
    const t0 = performance.now();
    await lab.play(name);
    if (usePhys) await lab.idle();
    const wall = performance.now() - t0;
    const mid = await (async () => { await lab.sync(); return { snap: snapshot(lab.state()), px: usePhys ? await lab.drawPixels() : lab.renderCpu() }; })();
    if (usePhys) mid.cpuPx = lab.renderCpu();
    // dry it out on a dryer clock: frames until nothing is wet
    const t1 = performance.now(); let frames = 0; lab.setDryer(true);
    do { await lab.frame(); frames++; } while (frames < 4000 && lab.lastWet());
    for (let i = 0; i < 3; i++) await lab.frame(); // the frame after the last wet step is the one that fixes the wash
    lab.setDryer(false); if (usePhys) await lab.idle();
    const dryWall = performance.now() - t1;
    await lab.sync();
    const end = { snap: snapshot(lab.state()), px: usePhys ? await lab.drawPixels() : lab.renderCpu() };
    if (usePhys) end.cpuPx = lab.renderCpu();
    const st = lab.stats();
    return { mid, end, stats: { wallMs: wall, dryFrames: frames, dryWallMs: dryWall, frames: st.frames, steps: st.stepCount, stepMs: st.stepMs, msPerStep: st.stepCount ? st.stepMs / st.stepCount : 0, strokeMs: st.strokeMs, strokes: st.strokes, phys: st.phys, marks: markStats(lab.marks()) } };
  };
  let cpu = null, gpu = null;
  if (cpuToo || !phys) { cpu = await run(false); result.cpu = cpu.stats; }
  if (phys) {
    gpu = await run(true); result.gpu = gpu.stats;
    lab.setPhys(phys);
    if (cpu) {
      result.wet = { sheet: compareSheets(cpu.mid.snap, gpu.mid.snap), pixels: comparePixels(cpu.mid.px, gpu.mid.px) };
      result.dry = { sheet: compareSheets(cpu.end.snap, gpu.end.snap), pixels: comparePixels(cpu.end.px, gpu.end.px) };
    }
    // the GPU render of the GPU sheet against the CPU render of the same sheet read back
    result.renderOnly = { wet: comparePixels(gpu.mid.cpuPx, gpu.mid.px), dry: comparePixels(gpu.end.cpuPx, gpu.end.px) };
  }
  // the floor: the CPU against itself with its flow coefficient nudged by one part in a million
  if (floor && cpu) {
    lab.setPhys(null); lab.setPerturb(1e-6); const p = await run(false); lab.setPerturb(0);
    result.floor = { dry: { sheet: compareSheets(cpu.end.snap, p.end.snap), pixels: comparePixels(cpu.end.px, p.end.px) } };
  }
  if (!phys) lab.setPhys(null);
  lab.skipRender(false); lab.det(false); await lab.reset({ paperW, paperH, dpi, seed });
  return { result };
}

// ---- the same painting at another resolution ---------------------------------------------------------------------
// Area-average an RGBA image down to w x h (fractional boxes), returning floats per channel.
function downsample(rgba, sw, sh, w, h) {
  const out = new Float32Array(w * h * 3), fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, wt = 0;
    const x0 = x * fx, x1 = (x + 1) * fx, y0 = y * fy, y1 = (y + 1) * fy;
    for (let yy = Math.floor(y0); yy < Math.min(sh, Math.ceil(y1)); yy++) {
      const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      for (let xx = Math.floor(x0); xx < Math.min(sw, Math.ceil(x1)); xx++) {
        const a = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0)), i = (yy * sw + xx) * 4;
        r += a * rgba[i]; g += a * rgba[i + 1]; b += a * rgba[i + 2]; wt += a;
      }
    }
    const j = (y * w + x) * 3; out[j] = r / wt; out[j + 1] = g / wt; out[j + 2] = b / wt;
  }
  return out;
}
const meanAbs = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const meanOf = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };

/** Play a demonstration at each resolution, bring each painting to the first one's size, and report how far apart they are. */
export async function runDpi(lab, { name = 'wash', dpis = [60, 120], paperW = 8, paperH = 6, seed = 7, floor = true, naive = true }) {
  const phys = lab.getPhys(); lab.det(true); lab.skipRender(true);
  const paint = async (dpi, s = seed, isNaive = false) => {
    await lab.reset({ paperW, paperH, dpi, seed: s, naive: isNaive }); lab.resetStats();
    const t0 = performance.now(); await lab.play(name);
    let frames = 0; lab.setDryer(true);
    do { await lab.frame(); frames++; } while (frames < 6000 && lab.lastWet());
    for (let i = 0; i < 3; i++) await lab.frame();
    lab.setDryer(false); if (phys) await lab.idle();
    await lab.sync();
    const px = phys ? await lab.drawPixels() : lab.renderCpu(), { W, H } = lab.state();
    const marks = markStats(lab.marks()), res = dpi / 60;
    return { dpi, W, H, px, wall: performance.now() - t0, frames, marks: { ...marks, paintPerRefCell: marks.paint / (res * res) } };
  };
  const runs = [];
  for (const d of dpis) runs.push(await paint(d));
  const base = runs[0], tw = base.W, th = base.H, baseImg = downsample(base.px, base.W, base.H, tw, th);
  const out = { name, dpis, physics: phys ? 'webgpu' : 'cpu', size: [tw, th], runs: runs.map(r => ({ dpi: r.dpi, size: [r.W, r.H], wallMs: Math.round(r.wall), frames: r.frames, mean: meanOf(downsample(r.px, r.W, r.H, tw, th)), marks: r.marks })) };
  out.vsFirst = runs.slice(1).map(r => ({ dpi: r.dpi, meanAbs: meanAbs(baseImg, downsample(r.px, r.W, r.H, tw, th)) }));
  if (floor) { const other = await paint(base.dpi, seed + 1); out.paperFloor = { dpi: other.dpi, meanAbs: meanAbs(baseImg, downsample(other.px, other.W, other.H, tw, th)) }; }
  if (naive && dpis.length > 1) { const d = dpis[dpis.length - 1], n = await paint(d, seed, true); out.unscaled = { dpi: d, meanAbs: meanAbs(baseImg, downsample(n.px, n.W, n.H, tw, th)), mean: meanOf(downsample(n.px, n.W, n.H, tw, th)) }; }
  lab.skipRender(false); lab.det(false); await lab.reset({ paperW, paperH, dpi: 60, seed });
  return { result: out };
}
