import { layerRT } from '../media/km.js';
// The lab's colour render on the GPU: the same Kubelka-Munk compositing as worker.js's glaze(), in a WebGL2 fragment
// shader. The simulation stays on the CPU; each frame it hands over the sheet's pigment and water state as float
// textures and this draws the sheet straight into the canvas, so no pixels cross threads. Works on an OffscreenCanvas
// in the worker. DOM free apart from the canvas it is given.
const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// The sheet's own Float32Arrays go up as layers of one R32F texture array with no repacking on the CPU: for K pigments,
// layers 0..K-1 are the pigments' G (loose), K..2K-1 D (deposited), 2K..3K-1 P (fixed this pass), 3K..4K-1 the top dried
// layer, 4K graphite and 4K+1 water. uBase is the paper with older washes folded in; it only changes when a wash is folded.
// A sheet carries only the pigments it has used (worker.js), so the shader is built for the sheet's pigment count.
const layerCount = K => 4 * K + 2;
const frag = K => `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform highp sampler2DArray uState;
uniform sampler2D uBase;
uniform vec3 uK[${K}], uS[${K}];
uniform int uHasTop, uH;
out vec4 outColor;
// reflectance and transmittance of a layer, as km.js rt(); b*b = q(q+2) keeps precision when K/S is small
vec2 layerRT(float Kc, float Sc, float x) {
  if (Sc < 1e-7) return vec2(0.0, exp(-Kc * x));
  if (Kc < 1e-7) { float t = Sc * x; return vec2(t / (1.0 + t), 1.0 / (1.0 + t)); }
  float q = Kc / Sc, a = 1.0 + q, b = sqrt(q * (q + 2.0)), bSx = b * Sc * x;
  if (bSx > 20.0) return vec2(a - b, 0.0);
  float e = exp(bSx), ei = 1.0 / e, sh = 0.5 * (e - ei), ch = 0.5 * (e + ei), c = a * sh + b * ch;
  return vec2(sh / c, b / c);
}
vec3 glaze(vec3 R, float m[${K}]) {
  float xt = 0.0; for (int k = 0; k < ${K}; k++) xt += m[k];
  if (xt <= 1e-7) return R;
  vec3 Kc = vec3(0.0), Sc = vec3(0.0);
  for (int k = 0; k < ${K}; k++) { float f = m[k] / xt; Kc += f * uK[k]; Sc += f * uS[k]; }
  for (int c = 0; c < 3; c++) {
    vec2 rt = layerRT(Kc[c], Sc[c], xt);
    R[c] = rt.x + rt.y * rt.y * R[c] / max(1.0 - rt.x * R[c], 1e-6);
  }
  return R;
}
float at(ivec2 p, int layer) { return texelFetch(uState, ivec3(p, layer), 0).r; }
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), uH - 1 - int(gl_FragCoord.y));
  vec3 R = texelFetch(uBase, p, 0).rgb;
  float m[${K}];
  if (uHasTop == 1) {
    for (int k = 0; k < ${K}; k++) m[k] = at(p, ${3 * K} + k);
    R = glaze(R, m);
  }
  for (int k = 0; k < ${K}; k++) m[k] = at(p, k) + at(p, ${K} + k) + at(p, ${2 * K} + k);
  R = glaze(R, m);
  float g = exp(-at(p, ${4 * K}) * 0.9), w = at(p, ${4 * K + 1}), sheen = w > 0.02 ? 1.0 - min(0.025, w * 0.03) : 1.0;
  float reflection = min(0.025, max(0.0, w) * 0.06);
  vec3 rgb = clamp(R * g * sheen + vec3(-reflection, 0.0, reflection), 0.0, 1.0);
  // a NaN is 0, as the CPU render's Uint8ClampedArray makes it
  outColor = vec4(isnan(rgb.x) ? 0.0 : rgb.x, isnan(rgb.y) ? 0.0 : rgb.y, isnan(rgb.z) ? 0.0 : rgb.z, 1.0);
}`;

/** True when a throwaway WebGL2 context can be made here (the page or a worker's OffscreenCanvas). */
export function gpuAvailable() {
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = Boolean(gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 512 && gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) >= layerCount(6));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch { return false; }
}

/**
 * A renderer bound to `canvas` (width x height texels, one per sheet cell). `pigments` supplies K and S per channel.
 * Returns null if the shader does not build. `draw(state)` takes { G, D, P, W, graphite, baseR, top, baseDirty }.
 */
/** Why the last createGpuRenderer returned null, for diagnostics. */
export let lastFailure = '';
const fail = reason => { lastFailure = reason; return null; };

export function createGpuRenderer(canvas, pigments) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return fail('no webgl2 context');
  if (gl.isContextLost()) return fail('context is lost');
  for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++); // Clear stale CONTEXT_LOST errors before checking the render.
  const W = canvas.width, H = canvas.height, N = W * H, K = pigments.length;
  if (K < 1 || gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) < layerCount(K)) return fail(`cannot hold ${K} pigments`);
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, frag(K));
  if (!vs || !fs) return fail(`shader compile: ${gl.getShaderInfoLog(vs || fs) || ''}`);
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail('program link');
  gl.useProgram(prog);
  const LAYERS = layerCount(K);
  const state = gl.createTexture(), baseTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, state);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R32F, W, H, LAYERS);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(gl.getUniformLocation(prog, 'uState'), 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, baseTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, W, H);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(gl.getUniformLocation(prog, 'uBase'), 1);
  { const err = gl.getError(); if (err !== gl.NO_ERROR) return fail(`gl error ${err} after allocating textures`); }
  const flat = key => new Float32Array(pigments.flatMap(p => p[key]));
  gl.uniform3fv(gl.getUniformLocation(prog, 'uK'), flat('K')); gl.uniform3fv(gl.getUniformLocation(prog, 'uS'), flat('S'));
  gl.uniform1i(gl.getUniformLocation(prog, 'uH'), H);
  const uHasTop = gl.getUniformLocation(prog, 'uHasTop');
  // a fullscreen triangle from gl_VertexID needs no vertex data, but some drivers (Firefox) emulate a missing attribute 0 at a cost
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, W, H);
  const base = new Float32Array(N * 4);
  const layer = (index, data) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, state); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, W, H, 1, gl.RED, gl.FLOAT, data); };
  const timing = { fill: 0, upload: 0, draw: 0, renderer: '' };
  try { const e = gl.getExtension('WEBGL_debug_renderer_info'); timing.renderer = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), loseExt = gl.getExtension('WEBGL_lose_context');
  let timerOn = false; const pending = [], gpuTimes = [];
  function draw({ G, D, P, W: water, graphite, baseR, top, baseDirty }) {
    const t0 = performance.now();
    for (let k = 0; k < K; k++) { layer(k, G[k]); layer(K + k, D[k]); layer(2 * K + k, P[k]); if (top) layer(3 * K + k, top[k]); }
    layer(4 * K, graphite); layer(4 * K + 1, water);
    if (baseDirty) {
      for (let i = 0, j = 0; i < N; i++, j += 4) { base[j] = baseR[i * 3]; base[j + 1] = baseR[i * 3 + 1]; base[j + 2] = baseR[i * 3 + 2]; }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, baseTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, base);
    }
    const t1 = performance.now(); timing.upload += t1 - t0;
    gl.uniform1i(uHasTop, top ? 1 : 0);
    let q = null;
    if (tq && timerOn && pending.length < 16) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push(q); }
    timing.draw += performance.now() - t1;
  }
  /** Read the pixels back, top row first. */
  function readPixels() {
    const px = new Uint8Array(N * 4), out = new Uint8ClampedArray(N * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let y = 0; y < H; y++) out.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    return out;
  }
  /** Collect finished GPU timer queries (ms each). Empty when the extension is missing or the timer is off. */
  function pollTimer() {
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift(), disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
      if (!disjoint) gpuTimes.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    return gpuTimes.splice(0);
  }
  // a sheet that takes on a pigment gets a new renderer on the same context: the old one's textures go with it
  const dispose = () => { for (const t of [state, baseTex]) gl.deleteTexture(t); gl.deleteBuffer(vbo); gl.deleteVertexArray(vao); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); };
  const renderer = { draw, timing, readPixels, finish: () => gl.finish(), pollTimer, setTimer: on => { timerOn = Boolean(on && tq); }, hasTimer: Boolean(tq), dispose,
    lose: () => loseExt?.loseContext(), restore: () => loseExt?.restoreContext(), isLost: () => gl.isContextLost() };
  if (selfTest(renderer, pigments, W, H)) return renderer;
  dispose(); return fail('first-draw self-test');
}

// First draw sanity: the shader may link and still draw black or wrong on some drivers. Draw a known sheet (paper on
// the right half, pigment 0 over paper on the left) and compare two pixels with the CPU's Kubelka-Munk.
function selfTest(renderer, pigments, W, H) {
  try {
    const N = W * H, zero = new Float32Array(N), load = new Float32Array(N), base = new Float32Array(N * 3), tint = [0.9, 0.8, 0.7], amount = 0.3;
    for (let i = 0; i < N; i++) { if (i % W < W / 2) load[i] = amount; base[i * 3] = tint[0]; base[i * 3 + 1] = tint[1]; base[i * 3 + 2] = tint[2]; }
    const each = first => pigments.map((_, k) => (k === 0 ? first : zero));
    renderer.draw({ G: each(load), D: each(zero), P: each(zero), W: zero, graphite: zero, baseR: base, top: null, baseDirty: true });
    renderer.finish();
    const px = renderer.readPixels(), at = x => [px[x * 4], px[x * 4 + 1], px[x * 4 + 2]];
    const want = (covered) => tint.map((r, c) => { if (!covered) return r * 255; const [R, T] = layerRT(pigments[0].K[c], pigments[0].S[c], amount); return (R + (T * T * r) / (1 - R * r)) * 255; });
    for (const [x, covered] of [[1, true], [W - 2, false]]) { const got = at(x), exp = want(covered); if (got.some((v, c) => !(Math.abs(v - exp[c]) <= 3))) return false; }
    return true;
  } catch { return false; }
}
