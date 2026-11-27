// GPU transport for the two-grid prototype. One phase uploads its reconstructed
// water/face ledger; all conservative substeps run resident before a readback.
// Sibling GPU modules handle fine reconstruction and materials. Coarse water
// and the remaining exchanges still follow the shared CPU phase schedule.
import { readFileSync } from 'node:fs';
import { flowTime } from '../flow-time.mjs';
import { GpuFineFlux } from './fine-flux.mjs';
import { GpuFineMaterial } from './fine-material.mjs';
import { GpuFineWater } from './fine-water.mjs';
import { GpuFineAbsorb } from './fine-absorb.mjs';
import { FineCommands } from './fine-commands.mjs';
import { deviceHealth, watchDevice, markBroken, assertHealthy } from './device-health.mjs';

const source = readFileSync(new URL('./fine-transport.wgsl', import.meta.url), 'utf8');
const GROUP = 128, STRIDE = 256;

export class GpuFineTransport {
  constructor(device) {
    this.device = device;
    this.health = deviceHealth();
    this.watch = watchDevice(device, reason => markBroken(this.health, reason));
    const module = device.createShaderModule({ label: 'fine conservative transport', code: source });
    const visibility = GPUShaderStage.COMPUTE;
    this.layout = device.createBindGroupLayout({ entries: Array.from({ length: 9 }, (_, binding) => ({
      binding, visibility, buffer: binding === 0 ? { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 } :
        { type: [2, 3, 6, 8].includes(binding) ? 'read-only-storage' : 'storage' },
    })) });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipelines = Object.fromEntries(['conductance', 'flux', 'gather'].map(entryPoint => [entryPoint,
      device.createComputePipeline({ layout, compute: { module, entryPoint } })]));
    this.busy = false;
    this.resident = null;
    this.prolong = new GpuFineFlux(device);
    this.materials = new GpuFineMaterial(device);
    this.water = new GpuFineWater(device);
    this.absorption = new GpuFineAbsorb(device);
    this.commands = new FineCommands(device);
  }

  allocate(n, coarse) {
    if (this.n === n && this.coarse === coarse) return;
    this.destroy();
    const d = this.device, limit = Math.min(d.limits.maxBufferSize, d.limits.maxStorageBufferBindingSize);
    if (Math.max(n * 16, coarse * 8) > limit) throw new Error('fine GPU transport exceeds device buffer limits');
    this.n = n; this.coarse = coarse; this.buffers = [];
    const mk = (size, usage) => { const b = d.createBuffer({ size, usage }); this.buffers.push(b); return b; };
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.uniform = mk(64 * STRIDE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.geometry = mk(n * 16, storage | GPUBufferUsage.COPY_SRC); this.volume = mk(n * 4, storage); this.active = mk(n * 4, storage);
    this.mass = mk(n * 4, storage | GPUBufferUsage.COPY_SRC); this.faces = mk(n * 8, storage);
    this.capture = mk(coarse * 8, storage); this.deposit = mk(n * 4, storage | GPUBufferUsage.COPY_SRC);
    this.schedule = mk(16 + 64 * 12, storage | GPUBufferUsage.INDIRECT);
    this.read = mk(n * 8, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const buffers = [this.uniform, this.geometry, this.volume, this.active, this.mass, this.faces, this.capture, this.deposit, this.schedule];
    this.group = d.createBindGroup({ layout: this.layout, entries: buffers.map((buffer, binding) => ({
      binding, resource: { buffer, ...(binding === 0 ? { size: 64 } : {}) },
    })) });
    this.hostCapture = new Float32Array(coarse * 2);
  }

  async beginResident(F) {
    this.watch.tick(); assertHealthy(this.health);
    const top = F.layers.at(-1);
    if (this.resident?.F === F && this.resident.topLayer === top) return;
    if (this.resident) await this.syncHost(this.resident.F);
    this.allocate(F.fn, F.sheet.n);
    const activePigments = [];
    for (let k = 0; k < F.K; k++) {
      if (F.G[k].some(v => v !== 0) || F.D[k].some(v => v !== 0) || F.P[k].some(v => v !== 0) || top?.[k].some(v => v !== 0)) activePigments.push(k);
    }
    await this.materials.uploadAll(F, activePigments);
    this.device.pushErrorScope('validation');
    this.resident = { F, topLayer: top, activePigments, scoped: true };
    F._gpuResident = this;
  }

  async syncHost(F = this.resident?.F) {
    if (!this.resident) return;
    if (F && this.resident.F !== F) throw new Error('fine GPU resident state belongs to another sheet');
    this.commands.flush();
    const res = this.resident; this.resident = null; res.F._gpuResident = null;
    try { await this.materials.observeAll(res.F, res.activePigments); }
    finally {
      if (res.scoped) {
        const error = await this.device.popErrorScope();
        if (error) throw new Error(`fine GPU resident session: ${error.message}`);
      }
    }
    assertHealthy(this.health);
  }

  // Hold suspension, loose deposits and pore pigment resident across phases
  // (and across consecutive steps when keepResident is true). Back-runs sync
  // G/D around their CPU boundary; standalone calls observe back to host.
  async sequence(F, operations, fallback, opts = null) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy) throw new Error('fine GPU transport is already in use');
    const keepResident = !!opts?.keepResident;
    if (keepResident) await this.beginResident(F);
    else if (this.resident) await this.syncHost(this.resident.F);
    this.busy = true;
    const d = this.device, persistent = keepResident && this.resident?.F === F;
    // Fast skip: when persistent residency already confirmed zero pigment across G, P, D, and top
    // (e.g. clean-water prewet/bed steps), no pigment transport or material exchange can occur.
    if (persistent && this.resident.activePigments.length === 0) {
      for (const _op of operations) { /* drain generator so fine mask/ever updates apply */ }
      this.busy = false;
      return;
    }
    let scoped = false;
    try {
      this.allocate(F.fn, F.sheet.n);
      this.sequenceState = {
        F,
        resident: persistent ? this.materials.G : null,
        residentP: persistent ? this.materials.P : null,
        residentD: persistent ? this.materials.D : null,
        activePigments: persistent ? this.resident.activePigments : null,
        water: new Map(),
        scoped: true,
        persistent,
        commands: this.commands,
      };
      if (!persistent) { d.pushErrorScope('validation'); scoped = true; }
      for (const op of operations) {
        if (op.kind === 'absorb') {
          this.sequenceState.resident ??= await this.materials.uploadSuspended(F);
          await this.absorption.advance(this, F, ...op.args, true);
        }
        else if (op.kind === 'backrun') {
          this.commands.flush();
          if (persistent) {
            await this.materials.observeBackrun(F, this.sequenceState.activePigments);
            await fallback(op);
            await this.materials.uploadBackrun(F, this.sequenceState.activePigments);
          } else {
            await this.absorption.observe(this, F);
            if (this.sequenceState.resident) {
              await this.materials.observeSuspended(F); this.sequenceState.resident = null;
            }
            await fallback(op);
          }
        }
        else if (op.kind === 'carry') await this.carry(F, op.args[0], op.args[1], op.args[2], op.args[3], op.args[4], true);
        else if (op.kind === 'flux') await this.flux(F, op.args[0], op.args[1], op.args[2], op.args[3], op.args[4], op.args[5] ?? 'film', true);
        else if (op.kind === 'reconstruct') await this.reconstruct(F, ...op.args, true);
        else if (op.kind === 'reconstructFilm') {
          const out = op.args[3], other = out === F.wb ? F.wa : F.wb, map = this.sequenceState.water;
          const slot = map.has(other) ? 1 - map.get(other) : map.get(out) ?? 0;
          await this.water.reconstruct(F, ...op.args, slot, true, this.commands); map.set(out, slot);
        }
        else if (op.kind === 'waterCopy') {
          const [from, to] = op.args, map = this.sequenceState.water;
          if (map.has(from)) map.set(to, map.get(from));
          else { to.set(from); map.delete(to); }
        }
        else if (op.kind === 'film') {
          if (!persistent) this.commands.flush();
          await this.absorption.observe(this, F);
          await this.film(F, op.args[0], op.args[1], op.args[2], op.args[3] ?? false, true);
        }
        else if (op.kind === 'dryPhase') {
          if (persistent) await this.absorption.dryPhase(this, F, op.args[0], true);
          else {
            this.commands.flush();
            await this.absorption.observe(this, F);
            if (this.sequenceState.resident) { await this.materials.observeSuspended(F); this.sequenceState.resident = null; }
            await fallback(op);
          }
        }
        else throw new Error(`unsupported fine GPU sequence phase: ${op.kind}`);
        this.commands.checkpoint();
      }
      this.commands.flush();
      if (!persistent) {
        await this.absorption.observe(this, F);
        if (this.sequenceState.resident) await this.materials.observeSuspended(F);
        const error = await d.popErrorScope(); scoped = false;
        if (error) throw new Error(`fine GPU sequence: ${error.message}`);
      }
      assertHealthy(this.health);
    } finally {
      if (scoped) await d.popErrorScope();
      this.commands.discard();
      this.sequenceState = null; this.busy = false;
    }
  }

  async carry(F, arrays, wb, wa, catchAt = null, catchInto = null, owned = false) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const cells = F.activeCells, state = this.sequenceState;
    const active = state?.persistent ? state.activePigments : arrays.map((a, k) => cells.some(f => a[f] !== 0) ? k : -1).filter(k => k >= 0);
    if (!active.length) { this.prepared = null; return; }
    let resident = null, residentDeposit = null;
    if (state && arrays === F.G && !catchAt) {
      this.allocate(F.fn, F.sheet.n);
      resident = state.resident ??= await this.materials.uploadSuspended(F);
    } else if (state?.persistent && arrays === F.P && catchInto === F.D) {
      this.allocate(F.fn, F.sheet.n);
      resident = state.residentP; residentDeposit = state.residentD;
    }
    await this.run(F, arrays, active, wb, wa, cells, catchAt, catchInto, null, resident, owned, residentDeposit);
  }

  async flux(F, fx, fy, wb, wa, blocks = null, maskMode = 'film', owned = false) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const wasBusy = this.busy; this.busy = true;
    try {
      this.allocate(wb.length, F.sheet.w * Math.ceil(wb.length / F.FW / F.N));
      await this.prolong.prepare(this, F, fx, fy, wb, wa, maskMode, !!this.sequenceState?.scoped, this.sequenceState?.commands);
      assertHealthy(this.health);
      this.prepared = { F, wb, wa, indirect: true };
    } finally { this.busy = wasBusy; }
  }

  async material(F, wa) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy) throw new Error('fine GPU transport is already in use');
    this.busy = true; this.prepared = null;
    try { await this.materials.advance(F, wa); assertHealthy(this.health); }
    finally { this.busy = false; }
  }

  // The host suspension is observed once, after the complete film sequence.
  // No CPU pigment exchange occurs between advection, diffusion and materials.
  async film(F, wb, wa, blocks = null, skipCarry = false, owned = false) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const wasBusy = this.busy; this.busy = true;
    try {
      this.allocate(F.fn, F.sheet.n);
      const cells = F.activeCells, state = this.sequenceState, persistent = !!state?.persistent;
      const pigments = persistent ? state.activePigments : F.G.map((a, k) => cells.some(f => a[f] !== 0) ? k : -1).filter(k => k >= 0);
      const resident = state?.resident ?? await this.materials.uploadSuspended(F);
      if (!skipCarry && pigments.length) await this.run(F, F.G, pigments, wb, wa, cells, null, null, null, resident, true);
      else this.prepared = null;
      await this.diffuse(F, wa, resident, pigments, true);
      this.prepared = null;
      const slot = state?.water.get(wa);
      const waterSource = slot == null ? null : { buffer: this.water.result, offset: slot * F.fn * 4 };
      await this.materials.advance(F, wa, resident, waterSource, !!state?.scoped, persistent, persistent ? pigments : null, state?.commands);
      assertHealthy(this.health);
      if (state) {
        if (!persistent) state.resident = null;
        state.water.clear();
      }
    }
    finally { this.busy = wasBusy; }
  }

  async reconstruct(F, W, M, s, outW, outS, blocks, owned = false) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const wasBusy = this.busy; this.busy = true; this.prepared = null;
    try {
      // The final observed reconstruction retires the intermediate film slots.
      // Its output replaces outW; only the other retained film needs reading.
      this.sequenceState?.commands.flush();
      const map = this.sequenceState?.water;
      if (map?.size) {
        for (const [out, slot] of map) if (out !== outW) await this.water.observeFilm(F, slot, out);
        map.clear();
      }
      await this.water.reconstruct(F, W, M, s, outW, outS, blocks, null, !!this.sequenceState?.scoped); assertHealthy(this.health);
    }
    finally { this.busy = wasBusy; }
  }

  async diffuse(F, water, resident = null, residentPigments = null, owned = false) {
    this.watch.tick(); assertHealthy(this.health);
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const o = { ...F.o, dt: F.L.dt }, { iters, fraction } = flowTime(F.sheet, o);
    const diff = Math.min(.25, Math.max(0, o.diffuse * fraction)), film = Math.max(0, (o.filmDiffuse ?? 0) * fraction);
    if (!(iters > 0) || !(diff > 0 || film > 0)) return;
    const k0 = iters * F.N * F.N, subs = Math.max(1, Math.ceil(k0 * (diff + Math.min(.2, film)) / .2));
    const cells = F.activeWetCells, active = residentPigments ?? F.G.map((a, k) => cells.some(f => a[f] !== 0) ? k : -1).filter(k => k >= 0);
    if (!active.length) return;
    await this.run(F, F.G, active, water, water, cells, null, null,
      { subs, cd: o.carryDepth ?? .08, diff, film, k: k0 / subs, fd: o.filmDepth ?? .03 }, resident, owned);
  }

  async run(F, arrays, pigments, wb, wa, cells, catchAt, catchInto, diffusion, resident = null, owned = false, residentDeposit = null) {
    if (this.busy && !owned) throw new Error('fine GPU transport is already in use');
    const wasBusy = this.busy;
    this.busy = true;
    const d = this.device; let scoped = false;
    try {
      const n = wb.length, coarse = F.sheet.w * Math.ceil(n / F.FW / F.N);
      this.allocate(n, coarse);
      const prepared = !diffusion && this.prepared?.F === F && this.prepared.wb === wb && this.prepared.wa === wa ? this.prepared : null;
      this.prepared = null;
      // The ordinary coupled path packs both flow and diffusion on-device.
      // Keep the public CPU-face carry path, but allocate its host scratch only
      // if a caller actually supplies those faces without a GPU flux phase.
      const host = !prepared && !diffusion;
      if (host && !this.hostGeometry) {
        this.hostGeometry = new Float32Array(n * 4); this.hostVolume = new Float64Array(n); this.hostActive = new Uint32Array(n);
      }
      const geom = this.hostGeometry, volume = this.hostVolume, mask = this.hostActive;
      if (host) { geom.fill(0); volume.fill(0); mask.fill(0); }
      for (const f of host ? cells : []) {
        mask[f] = 1; geom[f * 4] = wb[f]; geom[f * 4 + 1] = wa[f];
        const x = F.FX[f], y = F.FY[f]; geom[f * 4 + 2] = x; geom[f * 4 + 3] = y;
        if (x > 0) volume[f] += x; else if (x < 0) volume[f + 1] -= x;
        if (y > 0) volume[f] += y; else if (y < 0) volume[f + F.FW] -= y;
      }
      let worst = 0;
      if (host) for (const f of cells) {
        const w = Math.max(wb[f], wa[f]);
        if (volume[f] > 0) worst = Math.max(worst, w > 1e-9 ? volume[f] / (.5 * w) : 1);
      }
      const indirect = !!prepared?.indirect;
      const subs = indirect ? 64 : diffusion?.subs ?? Math.min(64, Math.max(1, Math.ceil(worst)));
      const groups = Math.ceil(n / GROUP), gx = Math.min(groups, d.limits.maxComputeWorkgroupsPerDimension), gy = Math.ceil(groups / gx);
      if (gy > d.limits.maxComputeWorkgroupsPerDimension) throw new Error('fine GPU dispatch exceeds device limits');
      const params = new ArrayBuffer(Math.min(64, subs) * STRIDE), u = new Uint32Array(params), f = new Float32Array(params);
      for (let sub = 0; sub < Math.min(64, subs); sub++) {
        const at = sub * STRIDE / 4;
        u.set([F.FW, n, F.N, F.sheet.w, indirect ? 0 : subs, sub, diffusion ? 1 : 0, catchAt ? 1 : 0, gx * GROUP], at);
        if (diffusion) { f[at + 9] = diffusion.k; f.set([diffusion.cd, diffusion.diff, diffusion.film, diffusion.fd], at + 12); }
      }
      const outerScoped = !!this.sequenceState?.scoped;
      if (!outerScoped) { d.pushErrorScope('validation'); scoped = true; }
      const commands = this.sequenceState?.commands;
      const q = commands ?? d.queue;
      q.writeBuffer(this.uniform, 0, params);
      if (diffusion) {
        const encoder = commands?.encoder ?? d.createCommandEncoder();
        this.prolong.inputs(this, F, wb, wa, cells, encoder, 'film', commands);
        if (!commands) d.queue.submit([encoder.finish()]);
      } else if (host) {
        q.writeBuffer(this.geometry, 0, geom);
        q.writeBuffer(this.volume, 0, Float32Array.from(volume)); q.writeBuffer(this.active, 0, mask);
      }
      if (catchAt) {
        this.prolong.depositCellsSeq = null;
        for (let c = 0; c < coarse; c++) { this.hostCapture[c * 2] = catchAt.x[c]; this.hostCapture[c * 2 + 1] = catchAt.y[c]; }
        q.writeBuffer(this.capture, 0, this.hostCapture);
      }
      if (resident) {
        const enc = commands?.encoder ?? d.createCommandEncoder();
        for (const k of pigments) {
          enc.copyBufferToBuffer(resident, k * n * 4, this.mass, 0, n * 4);
          if (catchAt && residentDeposit) enc.copyBufferToBuffer(residentDeposit, k * n * 4, this.deposit, 0, n * 4);
          const pass = enc.beginComputePass();
          if (diffusion) { pass.setPipeline(this.pipelines.conductance); pass.setBindGroup(0, this.group, [0]); pass.dispatchWorkgroups(gx, gy); }
          for (let sub = 0; sub < subs; sub++) for (const name of ['flux', 'gather']) {
            pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0, this.group, [(sub % 64) * STRIDE]);
            if (indirect) pass.dispatchWorkgroupsIndirect(this.schedule, 16 + sub * 12);
            else pass.dispatchWorkgroups(gx, gy);
          }
          pass.end(); enc.copyBufferToBuffer(this.mass, 0, resident, k * n * 4, n * 4);
          if (catchAt && residentDeposit) enc.copyBufferToBuffer(this.deposit, 0, residentDeposit, k * n * 4, n * 4);
        }
        if (!commands) d.queue.submit([enc.finish()]);
      } else {
        commands?.flush();
        for (const k of pigments) {
          d.queue.writeBuffer(this.mass, 0, arrays[k]);
          if (catchAt) d.queue.writeBuffer(this.deposit, 0, catchInto[k]);
          const enc = d.createCommandEncoder();
          const pass = enc.beginComputePass();
          if (diffusion) { pass.setPipeline(this.pipelines.conductance); pass.setBindGroup(0, this.group, [0]); pass.dispatchWorkgroups(gx, gy); }
          for (let sub = 0; sub < subs; sub++) for (const name of ['flux', 'gather']) {
            pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0, this.group, [(sub % 64) * STRIDE]);
            if (indirect) pass.dispatchWorkgroupsIndirect(this.schedule, 16 + sub * 12);
            else pass.dispatchWorkgroups(gx, gy);
          }
          pass.end(); enc.copyBufferToBuffer(this.mass, 0, this.read, 0, n * 4);
          if (catchAt) enc.copyBufferToBuffer(this.deposit, 0, this.read, n * 4, n * 4);
          d.queue.submit([enc.finish()]);
          await this.read.mapAsync(GPUMapMode.READ);
          try {
            const out = new Float32Array(this.read.getMappedRange()); arrays[k].set(out.subarray(0, n));
            if (catchAt) catchInto[k].set(out.subarray(n, n * 2));
          } finally { this.read.unmap(); }
        }
      }
      if (scoped) {
        const error = await d.popErrorScope(); scoped = false;
        if (error) throw new Error(`fine GPU transport: ${error.message}`);
      }
      assertHealthy(this.health);
    } finally {
      if (scoped) await d.popErrorScope();
      this.busy = wasBusy;
    }
  }

  destroy() {
    if (this.resident) { this.resident.F._gpuResident = null; this.resident = null; }
    this.prolong?.destroy(); this.prepared = null;
    this.materials?.destroy();
    this.water?.destroy();
    this.absorption?.destroy();
    this.commands?.destroy();
    if (this.buffers) for (const buffer of this.buffers) buffer.destroy();
    this.buffers = null; this.n = 0; this.coarse = 0;
    this.hostGeometry = null; this.hostVolume = null; this.hostActive = null; this.hostCapture = null;
  }

  bytes() {
    return [this, this.prolong, this.materials, this.materials.inputs, this.water, this.absorption, this.commands].reduce((sum, owner) =>
      sum + (owner.buffers ?? []).reduce((n, buffer) => n + buffer.size, 0), 0);
  }
}
