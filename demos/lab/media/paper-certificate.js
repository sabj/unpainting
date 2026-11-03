// Generated from src/media/paper-certificate.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Exact zero-water certificates only. They are transient (not checkpoint state).
// Direct CPU array writers must invalidate; GPU changes also invalidate through
// the link's existing version. A threshold-only "dry" result is not a certificate.
const ZERO = Symbol('zero paper certificate');
export function invalidatePaperCertificate(sheet) { if (sheet[ZERO]) sheet[ZERO] = null; }
export function certifyZeroPaper(sheet) {
  Object.defineProperty(sheet, ZERO, {configurable:true, writable:true, value:{
    sheet, W:sheet.W, s:sheet.s, gpu:sheet._gpu, version:sheet._gpu?.version, paused:sheet._gpu?.paused,
  }});
}
export function hasZeroPaperCertificate(sheet) {
  const c=sheet[ZERO];
  return !!c && c.sheet===sheet && c.W===sheet.W && c.s===sheet.s && c.gpu===sheet._gpu && c.version===sheet._gpu?.version && c.paused===sheet._gpu?.paused;
}
