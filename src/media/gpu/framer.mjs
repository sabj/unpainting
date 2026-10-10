// Frames and marks without stalling the painter: a frame is a snapshot posted into the GPU queue like a stroke, and a frame
// worker (frame-worker.mjs) renders it. Covers the plain and --wetframes renders; the paper look, separate-resolution ink,
// white gouache and any frame after a dried layer is rewritten (layersChanged) render on the painter's thread.
import { Worker, MessageChannel } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// `n` is the sheet's cells (W2 x H2); w and h are the picture's, which a mark's density is taken at (SC sheet cells a side)
export function createFramer({ sheet, pigments, base, paperRGB, n, w, h, W2, SC, out, quality = 88, wet = null, outW, outH }) {
  const link = sheet._gpu;
  link.syncLower?.(sheet);
  const { port1, port2 } = new MessageChannel();
  // the layers already under the top go to the frame worker now; every later one comes from the GPU worker as it is fixed
  const lower = [];
  for (let L = 0; L < sheet.layers.length - 1; L++) {
    const layer = sheet.layers[L], ks = [];
    for (let k = 0; k < layer.length; k++) { const a = layer[k]; for (let i = 0; i < a.length; i++) if (a[i] !== 0) { ks.push(k); break; } }
    const data = new Float32Array(ks.length * n); ks.forEach((k, q) => data.set(layer[k], q * n));
    lower.push({ ks, data: data.buffer });
  }
  const worker = new Worker(fileURLToPath(new URL('./frame-worker.mjs', import.meta.url)), {
    workerData: { n, w, h, W2, SC, K: pigments.length, Kp: pigments.map(p => p.K), Sp: pigments.map(p => p.S), base: Uint8Array.from(base), paperRGB, out, quality, wet, port: port2, outW, outH, lower },
    transferList: [port2, ...lower.map(l => l.data)],
  });
  let failed = null; worker.on('error', e => { failed = e; });
  link.post({ op: 'framePort', port: port1, wait: false }, [port1]);
  const layerVer = sheet._layerVer || 0;
  let seq = 0, handed = 0;
  const F = {
    /** Usable now: the sheet is still on the GPU and no dried layer has been rewritten since the frame worker started. */
    get active() { return !failed && sheet._gpu === link && !link.paused && !link.stroke && !link.planning && (sheet._layerVer || 0) === layerVer; },
    /** A snapshot of the sheet as the queue stands; returns its id. */
    capture() {
      if (link.needFullUp) link.fullUp(sheet);
      const id = ++seq;
      link.post({ op: 'snap', id, sumMask: (link.topMask | link.wetMask) >>> 0, topMask: link.topMask >>> 0, wantW: !!wet, wait: false });
      return id;
    },
    /** The snapshot is a frame: write it as `name` in the run's folder. */
    name(id, name) { handed++; worker.postMessage({ type: 'name', id, name }); },
    /** The snapshot is a mark against this plan density (paint-plate's mark()). */
    mark(id, pass, planD) { handed++; worker.postMessage({ type: 'mark', id, pass, planD }, [planD.buffer]); },
    /** Wait until every frame handed over is written and every mark worked out; returns the marks in the order given. */
    async drain() {
      if (failed) throw failed;
      const res = await new Promise((resolve, reject) => {
        const onMsg = m => { if (m.type === 'drained') { worker.off('message', onMsg); resolve(m.marks); } };
        worker.on('message', onMsg); worker.once('error', reject);
        worker.postMessage({ type: 'drain', count: handed });
      });
      return res.sort((a, b) => a.id - b.id);
    },
    close() { worker.terminate(); },
  };
  return F;
}
