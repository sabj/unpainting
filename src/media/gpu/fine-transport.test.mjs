import test from 'node:test';
import assert from 'node:assert/strict';
import { openGpu } from './stepfull.mjs';
import { GpuFineTransport } from './fine-transport.mjs';
import { carryFine, diffuseFine } from '../fine-transport.mjs';
import { materialFine } from '../fine-material.mjs';
import { absorbFine } from '../fine-film.mjs';
import { makePaper } from '../paper.mjs';
import { createSheet, deposit, step, DEFAULTS } from '../sheet.mjs';
import { attachFine, finePour, fineDeposit, fineTotals } from '../fine-pigment.mjs';

const sum = a => a.reduce((s, v) => s + v, 0);
function compare(actual, expected, label, tolerance = 3e-6) {
  let worst = 0;
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Number.isFinite(actual[i]) && actual[i] >= 0, `${label}: invalid cell ${i}`);
    worst = Math.max(worst, Math.abs(actual[i] - expected[i]));
  }
  assert.ok(worst <= tolerance, `${label}: maximum cell error ${worst}`);
}
async function gpu(t) {
  const impl = await import('webgpu'); Object.assign(globalThis, impl.globals);
  try { return (await openGpu(impl.create([]))).device; }
  catch (e) { if (process.env.GPU_REQUIRED === '1' || e.message !== 'no WebGPU adapter') throw e; t.skip(e.message); }
}
function field(N) {
  const w = N * 5, h = N * 4, n = w * h, f64 = () => new Float64Array(n);
  const cells = [];
  // A cropped active rectangle, in the CPU's block-raster order.
  for (let cy = 1; cy < 3; cy++) for (let cx = 1; cx < 4; cx++)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cells.push((cy * N + y) * w + cx * N + x);
  return { sheet: { w: 5, M: new Uint8Array(20).fill(1), paper: { mmPerCell: .52 } }, N, FW: w, fn: n,
    FX: f64(), FY: f64(), donors: new Uint32Array(n), dg: f64(), out: f64(), r: f64(),
    activeCells: Uint32Array.from(cells), activeWetCells: Uint32Array.from(cells), L: { dt: 2 },
    o: { flow: .16, flowIters: 2, diffuse: .2, filmDiffuse: .35, carryDepth: .08, filmDepth: .03 } };
}

test('Metal fine faces match CPU donor budgets, thinning, reversals and per-face capture at ratios 2/4/8', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  try {
    for (const N of [2, 4, 8]) for (const scale of [.01, 30, 1e-9]) {
      const F = field(N), n = F.fn, wb = new Float32Array(n).fill(scale), wa = Float32Array.from(wb, (_, i) => scale * (.1 + (i % 9) / 3));
      const masses = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
      const mask = new Set(F.activeCells);
      for (const f of F.activeCells) {
        masses[1][f] = .1 + (f % 17) / 11; masses[2][f] = (f % 7) / 13;
        if (mask.has(f + 1) && (f + 1) % F.FW) F.FX[f] = scale * (f % 2 ? -1.1 : .9);
        if (mask.has(f + F.FW)) F.FY[f] = scale * (f % 3 ? .8 : -1.2);
      }
      const capture = { x: Float32Array.from({ length: 20 }, (_, i) => (i % 5) / 5), y: Float32Array.from({ length: 20 }, (_, i) => (i % 3) / 3) };
      const actual = masses.map(a => a.slice()), expected = masses.map(a => a.slice());
      const dActual = masses.map(() => new Float32Array(n)), dExpected = dActual.map(a => a.slice());
      for (let repeat = 0; repeat < 3; repeat++) {
        carryFine(F, expected, wb, wa, capture, dExpected);
        await runner.carry(F, actual, wb, wa, capture, dActual);
        for (let k = 0; k < masses.length; k++) {
          compare(actual[k], expected[k], `ratio ${N}, scale ${scale}, pigment ${k}`);
          compare(dActual[k], dExpected[k], 'capture');
          assert.ok(Math.abs((sum(actual[k]) + sum(dActual[k])) / (sum(masses[k]) || 1) - (k ? 1 : 0)) < 2e-6);
        }
        F.FX = Float64Array.from(F.FX, v => -v); F.FY = Float64Array.from(F.FY, v => -v);
      }
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('an uncaptured real-device error permanently stops fine transport, including empty phases', { timeout: 30000 }, async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const src = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_SRC });
  const dst = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST });
  try {
    const reported = new Promise(resolve => device.addEventListener('uncapturederror', resolve, { once: true }));
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, dst, 0, 64); device.queue.submit([enc.finish()]);
    await reported;
    const F = field(2), water = new Float32Array(F.fn).fill(1), A = new Float32Array(F.fn);
    await assert.rejects(runner.carry(F, [A], water, water), /GPU device error: validation: Copy range/);
    F.G = [A]; F.o.flowIters = 0;
    await assert.rejects(runner.diffuse(F, water), /GPU device error/);
    assert.ok(A.every(v => v === 0));
  } finally { src.destroy(); dst.destroy(); runner.destroy(); device.destroy(); }
});

test('Metal fine diffusion retains the physical coefficient and all substeps above 64', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  try {
    for (const N of [2, 4, 8]) {
      const F = field(N), water = Float32Array.from({ length: F.fn }, (_, i) => i % 7 ? .005 + .01 * (i % 11) : 0);
      // The CPU only permits diffusion into a wet listed block; neighbouring dry blocks stay disconnected.
      F.sheet.M.fill(0); for (const f of F.activeCells) F.sheet.M[Math.floor(f / F.FW / N) * 5 + Math.floor(f % F.FW / N)] = 1;
      const A = Float32Array.from(water, (v, i) => v * (i % 13)), expected = A.slice();
      F.o.flowIters = 12; F.G = [expected]; diffuseFine(F, water);
      F.G = [A]; await runner.diffuse(F, water);
      compare(A, expected, `ratio ${N} diffusion`);
      assert.ok(Math.abs(sum(A) / sum(expected) - 1) < 2e-6);
      assert.ok(!runner.hostGeometry && !runner.hostVolume && !runner.hostActive, 'GPU diffusion needs no CPU face-packing scratch');
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('Metal RT0/DCT preserves every coarse face and fine-cell divergence at ratios 2/4/8', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  try {
    for (const N of [2, 4, 8]) {
      const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
      const s = createSheet(paper(6, 5, .52), [{ K: [.46,.29,.05], S: [.02,.02,.02], rho: .047, omega: .5, gamma: .85 }]);
      const F = attachFine(s, paper(6 * N, 5 * N, .52 / N), N, { ...DEFAULTS, flowIters: 0, slide: 0, capRate: 0 });
      for (let c = 0; c < s.n; c++) deposit(s, c, .2 + c * .001);
      F.L.begin(.1); const src = 2 * s.w + 2, q = .04;
      F.L.fx[src] = q; s.W[src] -= q; s.W[src + 1] += q; s.W[1] *= .9;
      F.step();
      const wb = F.wb.slice(), wa = F.wa.slice();
      await runner.flux(F, F.L.fx, F.L.fy, wb, wa);
      const read = device.createBuffer({ size: F.fn * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      try {
        // Read the diagnostic geometry only in this test; the real carry consumes it on-device.
        const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(runner.geometry, 0, read, 0, F.fn * 16); device.queue.submit([enc.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const geom = new Float32Array(read.getMappedRange());
        let worstFlux = 0, worstDivergence = 0, worstBoundary = 0;
        for (let c = 0; c < s.n; c++) {
          let incomingSum = 0, change = 0, water = 0; const cells = [];
          for (let a = 0; a < N * N; a++) {
            const f = F.blockCells[c * N * N + a], x = f % F.FW, y = Math.floor(f / F.FW);
            const incoming = (x ? geom[(f - 1) * 4 + 2] : 0) - geom[f * 4 + 2] + (y ? geom[(f - F.FW) * 4 + 3] : 0) - geom[f * 4 + 3];
            cells.push([f, incoming]); incomingSum += incoming; change += wa[f] - wb[f]; water += wb[f];
            worstFlux = Math.max(worstFlux, Math.abs(geom[f * 4 + 2] - F.FX[f]), Math.abs(geom[f * 4 + 3] - F.FY[f]));
            if (a % N === N - 1) worstBoundary = Math.max(worstBoundary, Math.abs(geom[f * 4 + 2] - N * F.L.fx[c]));
            if (Math.floor(a / N) === N - 1) worstBoundary = Math.max(worstBoundary, Math.abs(geom[f * 4 + 3] - N * F.L.fy[c]));
          }
          for (const [f, incoming] of cells) worstDivergence = Math.max(worstDivergence,
            Math.abs((wa[f] - wb[f]) - incoming + (incomingSum - change) * wb[f] / water));
        }
        assert.ok(worstFlux < 2e-7, `ratio ${N}: flux ${worstFlux}`);
        assert.ok(worstBoundary < 2e-8, `ratio ${N}: boundary ${worstBoundary}`);
        assert.ok(worstDivergence < 2e-7, `ratio ${N}: divergence ${worstDivergence}`);
        read.unmap();
        // A vanishing film's residual is below the oracle's absolute 1e-12
        // solve cutoff. It must not acquire a spurious correction velocity.
        const thin = new Float32Array(F.fn).fill(1e-10), changed = thin.slice(); changed[3] += 1e-14;
        await runner.flux(F, new Float64Array(s.n), new Float64Array(s.n), thin, changed);
        const check = device.createCommandEncoder(); check.copyBufferToBuffer(runner.geometry, 0, read, 0, F.fn * 16); device.queue.submit([check.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const still = new Float32Array(read.getMappedRange());
        for (let f = 0; f < F.fn; f++) { assert.equal(still[f * 4 + 2], 0); assert.equal(still[f * 4 + 3], 0); }
        read.unmap();
        // Packing reuses carry's scratch buffers. Changing/empty active lists
        // must clear old water and masks, rather than revive a preceding crop.
        const original = F.activeCells;
        for (const c of [3, 10, -1]) {
          F.activeCells = c < 0 ? new Uint32Array(0) : F.blockCells.subarray(c*N*N,(c+1)*N*N);
          await runner.flux(F,new Float64Array(s.n),new Float64Array(s.n),wb,wa);
          const copy = device.createCommandEncoder();copy.copyBufferToBuffer(runner.geometry,0,read,0,F.fn*16);device.queue.submit([copy.finish()]);
          await read.mapAsync(GPUMapMode.READ);
          const packed = new Float32Array(read.getMappedRange()), listed = new Set(F.activeCells);
          for (let f=0;f<F.fn;f++) {
            assert.equal(packed[f*4],listed.has(f)?wb[f]:0);
            assert.equal(packed[f*4+1],listed.has(f)?wa[f]:0);
            if(!listed.has(f)){assert.equal(packed[f*4+2],0);assert.equal(packed[f*4+3],0);}
          }
          read.unmap();
        }
        F.activeCells = original;
      } finally { read.destroy(); }
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('Metal reconstruction retains fine relief, coarse block means and untouched inactive blocks', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  try {
    for (const N of [2,4,8]) {
      const paper=(w,h,mm)=>makePaper(w,h,{seed:9,mmPerCell:mm,coldPress:{mmPerCell:mm},cockle:{rmsMm:0}});
      const s=createSheet(paper(6,5,.52),[{K:[.46,.29,.05],S:[.02,.02,.02],rho:.047,omega:.5,gamma:.85}]);
      const F=attachFine(s,paper(6*N,5*N,.52/N),N,{...DEFAULTS,slope:.04,flowIters:0,slide:0,capRate:0});
      for(let c=0;c<s.n;c++){if(c%4)deposit(s,c,.02+c*.006);s.s[c]=.001*(c%7);}
      F.L.begin(.1); F.step();
      const outW=new Float32Array(F.fn).fill(-1),outS=new Float32Array(F.fn).fill(-1),blocks=[1,2,3,6,7,8,9];
      await runner.reconstruct(F,s.W,s.M,s.s,outW,outS,blocks);
      const included=new Set(blocks);
      for(let c=0;c<s.n;c++){
        let w=0,p=0;
        for(let k=0;k<N*N;k++){
          const f=F.blockCells[c*N*N+k];
          if(!included.has(c)){assert.equal(outW[f],-1);assert.equal(outS[f],-1);continue;}
          assert.ok(Math.abs(outW[f]-F.wa[f])<2e-7);assert.ok(Math.abs(outS[f]-F.sa[f])<2e-8);
          w+=outW[f];p+=outS[f];
        }
        if(included.has(c)){assert.ok(Math.abs(w/(N*N)-s.W[c])<5e-8);assert.ok(Math.abs(p/(N*N)-s.s[c])<2e-9);}
      }
      const shuffled=[5,6,1,20,21],listed=new Set(shuffled);
      outW.fill(-2);outS.fill(-2);
      await runner.reconstruct(F,s.W,s.M,s.s,outW,outS,shuffled);
      for(let c=0;c<s.n;c++)for(let k=0;k<N*N;k++){
        const f=F.blockCells[c*N*N+k];
        if(listed.has(c)){assert.ok(Math.abs(outW[f]-F.wa[f])<2e-7);assert.ok(Math.abs(outS[f]-F.sa[f])<2e-8);}
        else{assert.equal(outW[f],-2);assert.equal(outS[f],-2);}
      }
    }
  } finally {runner.destroy();device.destroy();}
});

test('shared fine phase schedule keeps Metal transport and CPU water/materials in parity through drying', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const pig = { K: [.46, .29, .05], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85, floc: .3 };
  const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
  try {
    for (const N of [2, 4, 8]) {
      const make = () => {
        const s = createSheet(paper(6, 5, .52), [pig, { ...pig, gamma: .2 }]);
        const F = attachFine(s, paper(6 * N, 5 * N, .52 / N), N, { ...DEFAULTS, edgeEvap: .0012, fixedBed: 1, granFill: .4, slideCap: 1 });
        for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) deposit(s, y * 6 + x, .3);
        finePour(F, (x, y) => x > .52 && x < 2.6 && y > .52 && y < 2.08, .36);
        finePour(F, (x, y) => x > 1 && y > 1, .12, 1);
        return F;
      };
      const cpu = make(), actual = make(), before = [fineTotals(actual), fineTotals(actual, 1)];
      let count = 0;
      while (cpu.sheet.M.some(Boolean) || cpu.sheet.s.some(v => v > 0)) {
        assert.ok(count++ < 2000, 'drying must converge');
        for (const F of [cpu, actual]) step(F.sheet, { ...F.o, dt: 2 });
        if (cpu.L.steps) cpu.step();
        if (actual.L.steps) await actual.stepAsync(runner);
        assert.deepEqual(actual.sheet.W, cpu.sheet.W); assert.deepEqual(actual.sheet.s, cpu.sheet.s);
        for (const kind of ['G', 'P', 'D']) for (let k = 0; k < 2; k++) compare(actual[kind][k], cpu[kind][k], `${kind} ratio ${N} step ${count}`, 1e-5);
      }
      cpu.fix(); actual.fix();
      for (let k = 0; k < 2; k++) {
        compare(actual.layers[0][k], cpu.layers[0][k], `dry plane ratio ${N}`, 1e-5);
        assert.ok(Math.abs(fineTotals(actual, k) / before[k] - 1) < 2e-6);
      }
      assert.ok(!runner.hostGeometry && !runner.hostVolume && !runner.hostActive, 'coupled GPU drying leaves the CPU-face scratch unallocated');
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('Metal replays opposite film passes before absorption at ratios 2/4/8', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, cockle: { rmsMm: 0 } });
  try {
    for (const N of [2, 4, 8]) {
      const make = () => {
        const s = createSheet(paper(6, 5, .52), [{ K: [.4, .3, .1], S: [.02, .02, .02], rho: .04, omega: .5, gamma: .8, wick: .5 }]);
        const F = attachFine(s, paper(6 * N, 5 * N, .52 / N), N, { ...DEFAULTS, slope: 0, flowIters: 0,
          settle: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0 });
        for (let c = 0; c < s.n; c++) deposit(s, c, 1);
        for (let a = 0; a < N * N; a++) F.G[0][F.blockCells[14 * N * N + a]] = 1 + a / N ** 2;
        F.L.begin(.1);
        for (const q of [.25, -.25]) {
          F.L.film.begin([2, 2, 3, 2]); F.L.film.face(14, false, q);
          s.W[14] -= q; s.W[15] += q; F.L.film.end();
        }
        F.L.film.begin([2, 2, 3, 2], true); F.L.aw[15] = .2; s.W[15] *= .8; F.L.film.end();
        return F;
      };
      const cpu = make(), actual = make(), observed = make(), before = fineTotals(actual);
      cpu.step();
      const plain = Object.fromEntries(['carry', 'flux', 'reconstruct', 'film'].map(name => [name, runner[name].bind(runner)]));
      await observed.stepAsync(plain); await actual.stepAsync(runner);
      for (const kind of ['G', 'P', 'D']) compare(actual[kind][0], cpu[kind][0], `${kind}, reversed film ratio ${N}`);
      for (const kind of ['G', 'P', 'D']) assert.deepEqual(actual[kind][0], observed[kind][0], `${kind}: resident and observed film are exact`);
      assert.ok(actual.P[0].some(v => v > 0), 'mixed pigment reaches the receiving pores');
      assert.ok(Math.abs(fineTotals(actual) / before - 1) < 2e-6);
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('resident multievent fine steps use one submission, no maps, and preserve donor/capture parity', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const pig = { K: [.4,.3,.1], S: [.02,.02,.02], rho: .04, omega: .5, gamma: .8, wick: .5 };
  const paper = (w,h,mm) => makePaper(w,h,{seed:9,mmPerCell:mm,cockle:{rmsMm:0}});
  const submit = device.queue.submit.bind(device.queue);
  try {
    for (const N of [2,4,8]) {
      const make = () => {
        const F = attachFine(createSheet(paper(6,5,.52),[pig]),paper(6*N,5*N,.52/N),N,
          {...DEFAULTS,flowIters:2,fixedBed:1,slideCap:1});
        for (let c=0;c<F.sheet.n;c++) deposit(F.sheet,c,1);
        for (let f=0;f<F.fn;f++) { F.G[0][f]=.1+(f%13)*.01; F.P[0][f]=.03+(f%7)*.01; }
        return F;
      };
      const cpu=make(), actual=make(), before=fineTotals(actual);
      await runner.beginResident(actual);
      runner.water.allocate(actual);
      let maps=0, submissions=0;
      const readers=[runner.read,runner.water.read,runner.materials.read];
      const methods=readers.map(b=>b.mapAsync.bind(b));
      readers.forEach((b,i)=>{b.mapAsync=(...args)=>{maps++;return methods[i](...args);};});
      device.queue.submit=(...args)=>{submissions++;return submit(...args);};
      try {
        for (let repeat=0;repeat<2;repeat++) {
          for (const F of [cpu,actual]) {
            const s=F.sheet, L=F.L;
            L.begin(.2);
            for (const q of [.49,-.31]) {
              L.film.begin([2,2,3,2]);L.film.face(14,false,q);
              s.W[14]-=q;s.W[15]+=q;L.film.end();
            }
            L.film.begin([2,2,3,2],true);L.aw[15]=.2;s.W[15]*=.8;L.film.end();
            const pores=new Float32Array(s.n).fill(.2);
            L.pores.begin([2,2,3,2],pores);L.pores.face(14,15,.08,.4);
            pores[14]-=.08;pores[15]+=.08;L.pores.end(pores);
            L.pd[15]=.1;
          }
          cpu.step();
          const prior=submissions;
          await actual.stepAsync(runner,{keepResident:true});
          assert.equal(submissions-prior,1,'all reconstruction, flux, carry, absorption, film and pore phases share a submission');
          assert.equal(maps,0,'resident ledger replay must never wait for a mapped buffer');
        }
        await runner.syncHost(actual);
        for (const kind of ['G','P','D']) compare(actual[kind][0],cpu[kind][0],`${kind}, batched ratio ${N}`,1e-6);
        assert.ok(Math.abs(fineTotals(actual)/before-1)<1e-6,'batched transfers conserve total pigment');
      } finally {
        device.queue.submit=submit;
        readers.forEach((b,i)=>{b.mapAsync=methods[i];});
      }
    }
  } finally {device.queue.submit=submit;runner.destroy();device.destroy();}
});

test('resident Metal absorption preserves pore pigment, mobility, cropped shares and CPU exchange boundaries', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, cockle: { rmsMm: 0 } });
  const pig = { K: [.4,.3,.1], S: [.02,.02,.02], rho: .04, omega: .5, gamma: .8 };
  try {
    for (const N of [2, 4, 8]) {
      const make = () => {
        const F = attachFine(createSheet(paper(5, 4, .52), [pig,pig,pig,pig]), paper(5*N, 4*N, .52/N), N, DEFAULTS);
        for (let k = 0; k < F.K; k++) for (let f = 0; f < F.fn; f++) {
          F.G[k][f] = k === 3 ? 0 : .03 + ((f + 11*k) % 97) / 17;
          F.P[k][f] = .01 + ((f + 3*k) % 23) / 29;
        }
        return F;
      };
      const expected = make(), actual = make(), blocks = [6,7,12], mobility = [0, .73123456789, 1, .05];
      const shares = Float32Array.from({ length: 20 }, (_, c) => c === 6 ? 1e-10 : c === 7 ? .33333 : .9);
      const before = Array.from({length:4}, (_,k)=>fineTotals(actual,k));
      const absorb = { kind: 'absorb', args: [shares, blocks, mobility] };
      let boundaries = 0, observations = 0;
      const observe = runner.materials.observeSuspended.bind(runner.materials);
      runner.materials.observeSuspended = async F => { observations++; await observe(F); };
      const operations = [absorb, absorb, {kind:'backrun'}, absorb, absorb];
      for (const op of operations) {
        if (op.kind === 'absorb') absorbFine(expected,...op.args);
        else { expected.G[1][0] += .25; expected.P[2][1] += .1; }
      }
      await runner.sequence(actual, operations, async () => {
        boundaries++; actual.G[1][0] += .25; actual.P[2][1] += .1;
      });
      assert.equal(boundaries,1); assert.equal(observations,2,'one film observation at each CPU boundary, not each absorption');
      for (let k = 0; k < 4; k++) {
        for (const kind of ['G','P']) compare(actual[kind][k],expected[kind][k],`${kind} absorption ratio ${N}`,1e-6);
        const added = k === 1 ? .25/N**2 : k === 2 ? .1/N**2 : 0;
        assert.ok(Math.abs(fineTotals(actual,k)-before[k]-added)<2e-6);
        for (const c of [0,1,5,8,13,19]) for (let a=0;a<N*N;a++) {
          const f=actual.blockCells[c*N*N+a];
          assert.equal(actual.G[k][f],expected.G[k][f]); assert.equal(actual.P[k][f],expected.P[k][f]);
        }
      }
      assert.ok(runner.absorption.buffers.reduce((n,b)=>n+b.size,0)<=32+4*8,'no additional fine or palette device plane');
      runner.materials.observeSuspended = observe;
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('Metal materials retain mixed settling, hollow fill, stranding, rewet lift and capped multi-pigment slide', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const pig = { K: [.46,.29,.05], S: [.02,.02,.02], rho: .047, omega: .5, gamma: .85, floc: .3 };
  const paper = (w,h,mm) => makePaper(w,h,{seed:9,mmPerCell:mm,coldPress:{mmPerCell:mm},cockle:{rmsMm:0}});
  try {
    for (const N of [2,4,8]) for (const coSettle of [0,.7]) {
      const make = () => {
        const s=createSheet(paper(5,4,.52),[pig,{...pig,gamma:.15,omega:2,floc:.8},{...pig,gamma:0}]);
        const F=attachFine(s,paper(5*N,4*N,.52/N),N,{...DEFAULTS,coSettle,granFill:1.2,scour:.3,holdDepth:.06,hold:.5,
          rewetLift:.03,fillRef:.04,slideCap:.2,fixedBed:1});
        for(let i=0;i<s.n;i++){deposit(s,i,.2);F.L.turn[i]=.05*(i%3);}
        for(const k of [0,1]){finePour(F,()=>true,.05*(k+1),k);}F.fix();
        for(const k of [0,1]){finePour(F,()=>true,.09*(k+1),k);}F.fix();
        if(coSettle>0)F.layers.at(-1)[0].fill(0); // a sparse top whose first colour is not pigment zero
        F.wa=Float32Array.from({length:F.fn},(_,f)=>[.003,.02,.08,.35][f%4]);
        for(let k=0;k<3;k++)for(let f=0;f<F.fn;f++){F.G[k][f]=.05+((f+3*k)%13)/15;F.D[k][f]=.03+((f+2*k)%7)/20;}
        F.activeWetCells=F.blockCells;F.L.dt=.37;
        return F;
      };
      const expected=make(), actual=make(), before=Array.from({length:3},(_,k)=>fineTotals(actual,k));
      const blocks=Array.from({length:expected.sheet.n},(_,i)=>i);
      for(let repeat=0;repeat<4;repeat++){
        materialFine(expected,expected.wa,blocks);await runner.material(actual,actual.wa);
        for(let k=0;k<3;k++){
          for(const kind of ['G','D'])compare(actual[kind][k],expected[kind][k],`${kind} ratio ${N}, mix ${coSettle}`,3e-6);
          for(let l=0;l<2;l++)compare(actual.layers[l][k],expected.layers[l][k],'rewet layer',1e-6);
          assert.ok(Math.abs(fineTotals(actual,k)/before[k]-1)<2e-6,'all local exchanges and grain faces conserve mass');
        }
      }
    }
  } finally {runner.destroy();device.destroy();}
});

test('resident Metal film is byte-identical to observed phases, including pigment carried into the wet diffusion region', async t => {
  const device = await gpu(t); if (!device) return;
  const observed = new GpuFineTransport(device), resident = new GpuFineTransport(device);
  const pig = { K: [.46,.29,.05], S: [.02,.02,.02], rho: .047, omega: .5, gamma: .85, floc: .3 };
  const paper = (w,h,mm) => makePaper(w,h,{seed:9,mmPerCell:mm,coldPress:{mmPerCell:mm},cockle:{rmsMm:0}});
  try {
    for (const N of [2,4,8]) for (const flowIters of [0,12]) {
      const make = () => {
        const s = createSheet(paper(5,4,.52), [pig, {...pig,gamma:.15}, {...pig,gamma:0}]);
        const F = attachFine(s,paper(5*N,4*N,.52/N),N,{...DEFAULTS,flowIters,fixedBed:1,fillRef:.04,slideCap:.2,rewetLift:.03});
        finePour(F,()=>true,.04,1); F.fix();
        F.activeCells=F.blockCells;
        F.activeWetCells=Uint32Array.from(F.blockCells.filter(f=>Math.floor(f%F.FW/N)>0));
        for(let c=0;c<s.n;c++) { s.M[c]=c%5>0?1:0; F.L.fx[c]=c%5===0?.02:0; }
        F.wb.fill(.2);F.wa.fill(.2);F.L.dt=.4;
        for(let f=0;f<F.fn;f++) {
          // Colour zero starts outside the diffusion region, then crosses its boundary.
          F.G[0][f]=Math.floor(f%F.FW/N)===0?.1:0;
          F.G[1][f]=.03+(f%13)*.001;F.D[1][f]=.02;
        }
        return F;
      };
      const expected=make(),actual=make();
      const before=Array.from({length:3},(_,k)=>fineTotals(actual,k));
      for(let repeat=0;repeat<3;repeat++) {
        await observed.flux(expected,expected.L.fx,expected.L.fy,expected.wb,expected.wa);
        await observed.carry(expected,expected.G,expected.wb,expected.wa);
        await observed.diffuse(expected,expected.wa);
        await observed.material(expected,expected.wa);
        await resident.flux(actual,actual.L.fx,actual.L.fy,actual.wb,actual.wa);
        await resident.film(actual,actual.wb,actual.wa);
        for(let k=0;k<3;k++) {
          for(const kind of ['G','D']) assert.deepEqual(actual[kind][k],expected[kind][k],`${kind} ratio ${N}, flow ${flowIters}, repeat ${repeat}`);
          assert.deepEqual(actual.layers[0][k],expected.layers[0][k]);
          assert.ok(Math.abs(fineTotals(actual,k)-before[k])<2e-6*(before[k]||1));
        }
      }
    }
  } finally { observed.destroy();resident.destroy();device.destroy(); }
});

test('resident film owns the backend through an awaited upload, including otherwise empty calls', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const paper = (w,mm) => makePaper(w,w,{seed:9,mmPerCell:mm,coldPress:{mmPerCell:mm},cockle:{rmsMm:0}});
  const pig = { K:[.46,.29,.05],S:[.02,.02,.02],rho:.047,omega:.5,gamma:.85 };
  const F = attachFine(createSheet(paper(3,.52),[pig]),paper(6,.26),2,{...DEFAULTS,flowIters:0});
  F.activeCells=F.blockCells;F.activeWetCells=F.blockCells;F.wb.fill(.2);F.wa.fill(.2);F.G[0].fill(.1);F.L.dt=.2;
  let release;
  const gate = new Promise(resolve=>{release=resolve;}), upload=runner.materials.uploadSuspended.bind(runner.materials);
  runner.materials.uploadSuspended=async(...args)=>{await gate;return upload(...args);};
  const pending=runner.film(F,F.wb,F.wa);
  try {
    await assert.rejects(runner.carry(F,[],F.wb,F.wa),/already in use/);
    await assert.rejects(runner.diffuse(F,F.wa),/already in use/);
    await assert.rejects(runner.reconstruct(F),/already in use/);
    await assert.rejects(runner.film(F,F.wb,F.wa),/already in use/);
    release();await pending;
    assert.equal(runner.busy,false);
    assert.ok(Math.abs(fineTotals(F)-.1*F.sheet.n)<1e-6);
  } finally {release();await pending;runner.destroy();device.destroy();}
});

test('a complete fine step owns Metal across deferred water reconstruction and releases it after failure', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const paper = (w, mm) => makePaper(w, w, { seed: 9, mmPerCell: mm, cockle: { rmsMm: 0 } });
  const pig = { K: [.4,.3,.1], S: [.02,.02,.02], rho: .04, omega: .5, gamma: .8 };
  const F = attachFine(createSheet(paper(3,.52),[pig]),paper(6,.26),2,{...DEFAULTS,flowIters:0});
  deposit(F.sheet,4,.2); finePour(F,()=>true,.1); step(F.sheet,{...F.o,dt:.1});
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  runner.water.reconstruct=async()=>{await gate;throw new Error('injected reconstruction failure');};
  const pending=F.stepAsync(runner);
  try {
    await assert.rejects(runner.carry(F,[],F.wb,F.wa),/already in use/);
    await assert.rejects(runner.reconstruct(F),/already in use/);
    await assert.rejects(runner.sequence(F,[],()=>{}),/already in use/);
    release();await assert.rejects(pending,/injected reconstruction failure/);
    assert.equal(F.L.steps,2,'partial physical steps remain unconsumed');
    assert.equal(runner.busy,false);assert.equal(runner.sequenceState,null);
  } finally {release();await pending.catch(()=>{});runner.destroy();device.destroy();}
});

test('Metal masked wet fronts match CPU through full angled drying at ratios 4 and 8', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const pig = { K: [.46, .29, .05], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85, floc: .3 };
  const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
  const inside = (x, y) => Math.abs((x - 2.6) * Math.cos(0.4) + (y - 2.6) * Math.sin(0.4)) < 1.5 && Math.abs(-(x - 2.6) * Math.sin(0.4) + (y - 2.6) * Math.cos(0.4)) < 1.5;
  try {
    for (const N of [4, 8]) {
      const make = () => {
        const s = createSheet(paper(10, 10, .52), [pig]);
        const F = attachFine(s, paper(10 * N, 10 * N, .52 / N), N, { ...DEFAULTS, edgeEvap: .0012, fixedBed: 1, granFill: 0, slideCap: 1 });
        fineDeposit(F, inside, .3, .36);
        return F;
      };
      const cpu = make(), actual = make(), before = fineTotals(actual);
      let count = 0;
      while (cpu.sheet.M.some(Boolean) || cpu.sheet.s.some(v => v > 0)) {
        assert.ok(count++ < 2000, 'angled drying must converge');
        for (const F of [cpu, actual]) step(F.sheet, { ...F.o, dt: 2 });
        if (cpu.L.steps) cpu.step();
        if (actual.L.steps) await actual.stepAsync(runner);
      }
      cpu.fix(); actual.fix();
      compare(actual.layers[0][0], cpu.layers[0][0], `angled dry ratio ${N}`, 2e-5);
      assert.ok(Math.abs(fineTotals(actual) / before - 1) < 2e-6);
    }
  } finally { runner.destroy(); device.destroy(); }
});

test('persistent cross-step Metal residency matches CPU through multi-glaze drying, back-runs, fixedBed and fillRef', async t => {
  const device = await gpu(t); if (!device) return;
  const runner = new GpuFineTransport(device);
  const p0 = { K: [.46, .29, .05], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85, floc: .2 };
  const p1 = { K: [.12, .52, .38], S: [.02, .02, .02], rho: .03, omega: .7, gamma: .35, floc: .0 };
  const paper = (w, h, mm) => makePaper(w, h, { seed: 11, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
  const inside1 = (x, y) => Math.abs((x - 2.6) * Math.cos(0.45) + (y - 2.6) * Math.sin(0.45)) < 1.3 && Math.abs(-(x - 2.6) * Math.sin(0.45) + (y - 2.6) * Math.cos(0.45)) < 1.3;
  const inside2 = (x, y) => Math.abs((x - 2.7) * Math.cos(-0.4) + (y - 2.5) * Math.sin(-0.4)) < 1.1 && Math.abs(-(x - 2.7) * Math.sin(-0.4) + (y - 2.5) * Math.cos(-0.4)) < 1.0;
  try {
    const N = 4;
    const make = () => {
      const s = createSheet(paper(10, 10, .52), [p0, p1]);
      return attachFine(s, paper(10 * N, 10 * N, .52 / N), N, { ...DEFAULTS, edgeEvap: .0012, fixedBed: 1, fillRef: .25, granFill: 0, slideCap: 1 });
    };
    const cpu = make(), actual = make();
    // Glaze 1
    for (const F of [cpu, actual]) fineDeposit(F, inside1, .28, .45, 0);
    let steps = 0;
    while (cpu.sheet.M.some(Boolean) || cpu.sheet.s.some(v => v > 0)) {
      assert.ok(steps++ < 2000);
      for (const F of [cpu, actual]) step(F.sheet, { ...F.o, dt: 2 });
      if (cpu.L.steps) cpu.step();
      if (actual.L.steps) await actual.stepAsync(runner, { keepResident: true });
    }
    assert.throws(() => actual.fix(), /sync resident GPU state/);
    await runner.syncHost(actual);
    cpu.fix(); actual.fix();
    compare(actual.layers[0][0], cpu.layers[0][0], 'persistent glaze 1', 2e-5);
    // Glaze 2 (rewet top layer + fixedBed + 2nd pigment + back-run)
    for (const F of [cpu, actual]) { fineDeposit(F, inside2, .24, .35, 1); fineDeposit(F, inside1, .03, .1, 0); }
    const before2 = [fineTotals(actual, 0), fineTotals(actual, 1)];
    steps = 0;
    while (cpu.sheet.M.some(Boolean) || cpu.sheet.s.some(v => v > 0)) {
      assert.ok(steps++ < 2000);
      for (const F of [cpu, actual]) step(F.sheet, { ...F.o, dt: 2 });
      if (cpu.L.steps) cpu.step();
      if (actual.L.steps) await actual.stepAsync(runner, { keepResident: true });
    }
    await runner.syncHost(actual);
    cpu.fix(); actual.fix();
    for (let k = 0; k < 2; k++) {
      compare(actual.layers[0][k], cpu.layers[0][k], `persistent glaze 1 after rewet k=${k}`, 2e-5);
      compare(actual.layers[1][k], cpu.layers[1][k], `persistent glaze 2 k=${k}`, 2e-5);
      assert.ok(Math.abs(fineTotals(actual, k) / before2[k] - 1) < 2e-6);
    }
  } finally { runner.destroy(); device.destroy(); }
});
