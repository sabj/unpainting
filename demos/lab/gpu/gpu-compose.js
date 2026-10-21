// The lab's colour render from the WebGPU physics buffers: the same Kubelka-Munk compositing as worker.js renderCpu(), as one
// compute pass over the sheet. The result sits in a buffer of packed RGBA8 rows; it is copied straight into a WebGPU canvas,
// or read back as pixels when the page draws with a 2D canvas. The sheet's fields never leave the GPU for this.
const WGSL = /* wgsl */ `
struct C { w: u32, h: u32, n: u32, K: u32, hasTop: u32, pitch: u32, p0: u32, p1: u32, kk: array<vec4<f32>, 16>, ss: array<vec4<f32>, 16> }
@group(0) @binding(0) var<uniform> c: C;
@group(0) @binding(1) var<storage, read> G: array<f32>;
@group(0) @binding(2) var<storage, read> P: array<f32>;
@group(0) @binding(3) var<storage, read> D: array<f32>;
@group(0) @binding(4) var<storage, read> TOP: array<f32>;
@group(0) @binding(5) var<storage, read> W: array<f32>;
@group(0) @binding(6) var<storage, read> BASE: array<f32>;
@group(0) @binding(7) var<storage, read> GR: array<f32>;
@group(0) @binding(8) var<storage, read_write> OUT: array<u32>;

// reflectance and transmittance of a layer, as km.js rt(); b*b = q(q+2) keeps precision when K/S is small
fn layerRT(Kc: f32, Sc: f32, x: f32) -> vec2<f32> {
  if (Sc < 1e-7) { return vec2<f32>(0.0, exp(-Kc * x)); }
  if (Kc < 1e-7) { let t = Sc * x; return vec2<f32>(t / (1.0 + t), 1.0 / (1.0 + t)); }
  let q = Kc / Sc; let a = 1.0 + q; let b = sqrt(q * (q + 2.0)); let bSx = b * Sc * x;
  if (bSx > 20.0) { return vec2<f32>(a - b, 0.0); }
  let e = exp(bSx); let ei = 1.0 / e; let sh = 0.5 * (e - ei); let ch = 0.5 * (e + ei); let cc = a * sh + b * ch;
  return vec2<f32>(sh / cc, b / cc);
}
fn mass(i: u32, k: u32, top: bool) -> f32 {
  let j = k * c.n + i;
  if (top) { return TOP[j]; }
  return G[j] + D[j] + P[j];
}
fn glaze(R0: vec3<f32>, i: u32, top: bool) -> vec3<f32> {
  var xt = 0.0;
  for (var k = 0u; k < c.K; k++) { xt += mass(i, k, top); }
  if (xt <= 1e-7) { return R0; }
  var Kc = vec3<f32>(0.0); var Sc = vec3<f32>(0.0);
  for (var k = 0u; k < c.K; k++) { let f = mass(i, k, top) / xt; Kc += f * c.kk[k].xyz; Sc += f * c.ss[k].xyz; }
  var R = R0;
  for (var ch = 0u; ch < 3u; ch++) {
    let rt = layerRT(Kc[ch], Sc[ch], xt);
    R[ch] = rt.x + rt.y * rt.y * R[ch] / max(1.0 - rt.x * R[ch], 1e-6);
  }
  return R;
}
fn byte(v: f32) -> u32 { let s = select(0.0, v, v == v); return u32(floor(clamp(s, 0.0, 1.0) * 255.0 + 0.5)); }
@compute @workgroup_size(8, 8)
fn compose(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= c.w || g.y >= c.h) { return; }
  let i = g.y * c.w + g.x;
  var R = vec3<f32>(BASE[3u * i], BASE[3u * i + 1u], BASE[3u * i + 2u]);
  if (c.hasTop == 1u) { R = glaze(R, i, true); }
  R = glaze(R, i, false);
  let gr = exp(-GR[i] * 0.9); let w = W[i];
  let sheen = select(1.0, 1.0 - min(0.025, w * 0.03), w > 0.02);
  let reflection = min(0.025, max(0.0, w) * 0.06);
  let rgb = R * gr * sheen + vec3<f32>(-reflection, 0.0, reflection);
  OUT[g.y * c.pitch + g.x] = byte(rgb.x) | (byte(rgb.y) << 8u) | (byte(rgb.z) << 16u) | (255u << 24u);
}
`;

export class Composer {
  constructor(device, pigments) {
    this.device = device; this.pigments = pigments; this.K = pigments.length;
    const d = device;
    d.pushErrorScope('validation');
    this.module = d.createShaderModule({ code: WGSL });
    this.pipeline = d.createComputePipeline({ layout: 'auto', compute: { module: this.module, entryPoint: 'compose' } });
    this.ubo = d.createBuffer({ size: 32 + 16 * 16 * 2, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ready = d.popErrorScope().then(err => { if (err) this.error = err.message; });
  }
  /** Bind to a GpuSheet's buffers; allocates the output and the two fields the sheet does not hold (base, graphite). */
  attach(gs, baseR, graphite) {
    const d = this.device; this.release();
    const { w, h, n } = gs, K = this.K;
    this.gs = gs; this.w = w; this.h = h; this.n = n;
    this.pitchBytes = Math.ceil((w * 4) / 256) * 256; this.pitch = this.pitchBytes / 4;
    const mk = (size, usage) => d.createBuffer({ size: Math.max(16, size), usage });
    this.base = mk(n * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.gr = mk(n * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.out = mk(this.pitchBytes * h, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.rb = mk(this.pitchBytes * h, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const u = new ArrayBuffer(32 + 16 * 16 * 2), F = new Float32Array(u, 32);
    this.pigments.forEach((p, k) => { F.set([...p.K, 0], k * 4); F.set([...p.S, 0], 64 + k * 4); });
    this.uhead = new Uint32Array(u, 0, 8); this.ubytes = u;
    this.bind();
    this.setBase(baseR); this.setGraphite(graphite);
    d.queue.writeBuffer(this.ubo, 32, u, 32);
  }
  bind() {
    const b = this.gs.b, e = (binding, buffer) => ({ binding, resource: { buffer } });
    this.group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      e(0, this.ubo), e(1, b.G), e(2, b.P), e(3, b.D), e(4, b.TOP), e(5, b.W), e(6, this.base), e(7, this.gr), e(8, this.out)] });
  }
  release() { for (const k of ['base', 'gr', 'out', 'rb']) { this[k]?.destroy(); this[k] = null; } }
  setBase(baseR) { this.device.queue.writeBuffer(this.base, 0, baseR); }
  setGraphite(g) { this.device.queue.writeBuffer(this.gr, 0, g); }
  /** Draw into `ctx` (a configured WebGPU canvas context) when given; otherwise only fill the output buffer. */
  draw(ctx = null, timer = null) {
    const d = this.device, { w, h, n } = this, hasTop = this.gs.hasTop;
    this.uhead.set([w, h, n, this.K, hasTop ? 1 : 0, this.pitch, 0, 0]);
    d.queue.writeBuffer(this.ubo, 0, this.ubytes, 0, 32);
    const enc = d.createCommandEncoder(), pass = timer ? timer.pass(enc, 'compose') : enc.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); pass.end();
    if (ctx) enc.copyBufferToTexture({ buffer: this.out, bytesPerRow: this.pitchBytes, rowsPerImage: h }, { texture: ctx.getCurrentTexture() }, { width: w, height: h });
    d.queue.submit([enc.finish()]);
  }
  /** The last drawn pixels, top row first. Waits for the GPU. */
  async readPixels() {
    const d = this.device, { w, h, pitchBytes } = this, enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.out, 0, this.rb, 0, pitchBytes * h); d.queue.submit([enc.finish()]);
    await this.rb.mapAsync(GPUMapMode.READ);
    const all = new Uint8Array(this.rb.getMappedRange().slice(0)); this.rb.unmap();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(all.subarray(y * pitchBytes, y * pitchBytes + w * 4), y * w * 4);
    return out;
  }
}
