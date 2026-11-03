// Generated from src/media/paper-certificate.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Exact zero-water certificates only. They are transient (not checkpoint state).
// Direct CPU array writers must invalidate; GPU changes also invalidate through
// the link's existing version. A threshold-only "dry" result is not a certificate.
const ZERO = Symbol('zero paper certificate');
const FIXED = Symbol('dry fixed certificate');
export function invalidatePaperCertificate(sheet) { if (sheet[ZERO]) sheet[ZERO] = null; if (sheet[FIXED]) sheet[FIXED] = null; }
export function certifyZeroPaper(sheet) {
  Object.defineProperty(sheet, ZERO, {configurable:true, writable:true, value:{
    sheet, W:sheet.W, s:sheet.s, gpu:sheet._gpu, version:sheet._gpu?.version, paused:sheet._gpu?.paused,
  }});
}
export function hasZeroPaperCertificate(sheet) {
  const c=sheet[ZERO];
  return !!c && c.sheet===sheet && c.W===sheet.W && c.s===sheet.s && c.gpu===sheet._gpu && c.version===sheet._gpu?.version && c.paused===sheet._gpu?.paused;
}

// Fixed pigment is a separate proof: measuring zero water alone cannot establish it.
export const validPaperCertificate = hasZeroPaperCertificate;
export function certifyDryFixed(sheet) {
  certifyZeroPaper(sheet);
  Object.defineProperty(sheet, FIXED, {configurable:true, writable:true, value:{
    zero:sheet[ZERO], layers:(sheet._rawLayers ?? sheet.layers), count:(sheet._rawLayers ?? sheet.layers).length, layerVersion:sheet._layerVer,
    G:sheet.G, P:sheet.P, D:sheet.D,
  }});
}
export function validDryFixedCertificate(sheet) {
  const c=sheet[FIXED];
  return !!c && validPaperCertificate(sheet) && c.zero===sheet[ZERO] &&
    c.layers===(sheet._rawLayers ?? sheet.layers) && c.count===(sheet._rawLayers ?? sheet.layers).length && c.layerVersion===sheet._layerVer &&
    c.G===sheet.G && c.P===sheet.P && c.D===sheet.D;
}
