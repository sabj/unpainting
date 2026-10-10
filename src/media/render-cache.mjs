// Renders the sheet with its older dried layers composited once and cached, bit for bit equal to
// renderLayers(layersOf(sheet)). Whatever writes into a dried layer calls layersChanged (sheet.mjs).
import { coherent, wetSums, syncTopLayer } from './sheet.mjs';
import { renderCells, renderLayers } from './km.mjs';

const ENV = typeof process !== 'undefined' ? process.env : {};

export function renderSheet(sheet, pigments, paperRGB, n, scale = 1, micro = null, exactTop = false) {
  if (ENV.LAYER_CACHE === '0') return renderLayers(plainLayers(sheet), pigments, paperRGB, n, scale, undefined, micro);
  syncTopLayer(sheet);
  const top = exactTop ? plainLayers(sheet).at(-1) : wetSums(sheet);
  const layers = sheet.layers, m = layers.length - 1, K = sheet.K, Kp = pigments.map(p => p.K), Sp = pigments.map(p => p.S);
  // planner and paper-look frames use different backgrounds, so each keeps its own composite
  const caches = sheet._renderCaches ??= new Map();
  let c = caches.get(paperRGB);
  const ver = sheet._layerVer || 0;
  if (c && (c.ver !== ver || c.micro !== micro || c.paper !== paperRGB || c.pig !== pigments || c.scale !== scale || c.n !== n || c.m > Math.max(0, m) || !c.refs.every((r, q) => layers[q] === r))) c = null;
  if (!c) { c = { ver, micro, paper: paperRGB, pig: pigments, scale, n, m: 0, refs: [], R: null }; caches.set(paperRGB, c); }
  for (; c.m < m; c.m++) {
    if (!c.R) { c.R = new Float64Array(n * 3); for (let i = 0; i < n * 3; i++) c.R[i] = paperRGB[i] / 255; }
    c.refs.push(layers[c.m]);
    renderCells([layers[c.m]], Kp, Sp, paperRGB, 0, n, scale, null, null, c.R, c.R, micro);
  }
  // the newest dried layer and what is still wet or unfixed go over the cached composite
  const rest = m >= 0 ? [layers[m], top] : [top];
  const out = new Uint8ClampedArray(n * 3);
  if (c.R) renderCells(rest, Kp, Sp, paperRGB, 0, n, scale, null, out, c.R, null, micro);
  else renderCells(rest, Kp, Sp, paperRGB, 0, n, scale, null, out, null, null, micro);
  if (ENV.LAYER_CACHE_CHECK) { const ref = renderLayers(plainLayers(sheet), pigments, paperRGB, n, scale, undefined, micro); const slack = sheet._gpu ? 1 : 0; /* the GPU's sums are rounded twice, one float apart at worst */ for (let i = 0; i < ref.length; i++) if (Math.abs(ref[i] - out[i]) > slack) throw new Error(`render cache differs at byte ${i}`); }
  return out;
}

function plainLayers(sheet) {
  coherent(sheet);
  const top = sheet.G.map((Gk, k) => { const out = new Float32Array(sheet.n), Dk = sheet.D[k], Pk = sheet.P[k]; for (let i = 0; i < sheet.n; i++) out[i] = Gk[i] + Dk[i] + Pk[i]; return out; });
  return [...sheet.layers, top];
}
