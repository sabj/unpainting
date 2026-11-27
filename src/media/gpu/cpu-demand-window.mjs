// CPU window onto the GPU sheet: downloads only the rectangles strokes demand since the last GPU flow.
const contains = (outer, inner) => inner[0] >= outer[0] && inner[1] >= outer[1] &&
  inner[0] + inner[2] <= outer[0] + outer[2] && inner[1] + inner[3] <= outer[1] + outer[3];
const union = (a, b) => {
  if (!a) return b.slice();
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x,
    Math.max(a[1] + a[3], b[1] + b[3]) - y];
};
function rows(rect, width, visit) {
  const [x, y, w, h] = rect;
  for (let row = y; row < y + h; row++) visit(row * width + x, w);
}
function checkRect(rect, width, height) {
  if (rect.length !== 4 || !rect.every(Number.isInteger) || rect[0] < 0 || rect[1] < 0 ||
    rect[2] < 1 || rect[3] < 1 || rect[0] + rect[2] > width || rect[1] + rect[3] > height)
    throw new RangeError('Contact demand must be an integer on-sheet rectangle');
}

// Disjoint pieces of next outside old. Keeping old cells out of the readback
// preserves every CPU-written bit without saving and restoring the old window.
function exposed(old, next) {
  if (!old) return [next];
  const [x,y,w,h] = next, [ox,oy,ow,oh] = old, out = [];
  if (y < oy) out.push([x,y,w,oy-y]);
  if (oy+oh < y+h) out.push([x,oy+oh,w,y+h-oy-oh]);
  if (x < ox) out.push([x,oy,ox-x,oh]);
  if (ox+ow < x+w) out.push([ox+ow,oy,x+w-ox-ow,oh]);
  return out;
}

export class CpuDemandWindow {
  constructor(width, height, planes, download, tile = 1, readAhead = null, downloadRects = null, { sparse = false } = {}) {
    this.width = width; this.height = height; this.planes = planes;
    this.tile = tile;
    this.download = download; this.rect = null; this.epoch = 0;
    // `ahead`: a rectangle read ahead in this epoch, kept apart from the host planes ({rect, data} packed plane by plane
    // in `planes` order, as readAhead returns it). The window grows into it by copying, cell for cell what a read of the
    // grown window would bring then: host cells are only ever written where the window grows, as before.
    this.ahead = null; this.readAhead = readAhead;
    this.downloadRects = downloadRects;
    this.sparse = !!(sparse && downloadRects);
    if (this.sparse) {
      this.tw = Math.ceil(width / tile); this.th = Math.ceil(height / tile);
      this.tiles = new Uint8Array(this.tw * this.th);
      this.allCovered = false;
    }
  }
  // Call only once the GPU has actually advanced. A scheduled callback is not an epoch.
  afterFlow() { this.rect = null; this.ahead = null; this.epoch++; if (this.sparse) { this.tiles.fill(0); this.allCovered = false; } }
  covers(rect) {
    if (!this.sparse) return !!this.rect && contains(this.rect, rect);
    if (this.allCovered) return true;
    const t = this.tile, tw = this.tw, tiles = this.tiles;
    const tx0 = Math.floor(rect[0] / t), ty0 = Math.floor(rect[1] / t);
    const tx1 = Math.floor((rect[0] + rect[2] - 1) / t), ty1 = Math.floor((rect[1] + rect[3] - 1) / t);
    for (let ty = ty0; ty <= ty1; ty++) { const row = ty * tw; for (let tx = tx0; tx <= tx1; tx++) if (!tiles[row + tx]) return false; }
    return true;
  }
  markAllCovered() { this.rect = [0, 0, this.width, this.height]; if (this.sparse) this.allCovered = true; }
  /** Pre-load a tight list of tile-aligned rectangles in one batched transfer (sparse mode only). */
  preloadRects(rects) {
    if (!this.sparse || this.allCovered || !rects.length) return;
    const t = this.tile, tw = this.tw, tiles = this.tiles, missing = [];
    for (const r of rects) {
      checkRect(r, this.width, this.height);
      const tx0 = Math.floor(r[0] / t), ty0 = Math.floor(r[1] / t);
      const tx1 = Math.floor((r[0] + r[2] - 1) / t), ty1 = Math.floor((r[1] + r[3] - 1) / t);
      this._collectMissing(tx0, ty0, tx1, ty1, missing);
    }
    if (!missing.length) return;
    this.downloadRects(missing);
    for (const r of missing) this.rect = union(this.rect, r);
  }
  _collectMissing(tx0, ty0, tx1, ty1, out) {
    const t = this.tile, tw = this.tw, tiles = this.tiles, W = this.width, H = this.height;
    let prev = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      const row = ty * tw, y = ty * t, rh = Math.min(H, y + t) - y, cur = [];
      for (let tx = tx0; tx <= tx1;) {
        if (tiles[row + tx]) { tx++; continue; }
        const start = tx;
        while (tx <= tx1 && !tiles[row + tx]) { tiles[row + tx] = 1; tx++; }
        const x = start * t, rw = Math.min(W, tx * t) - x;
        const match = prev.find(r => r[0] === x && r[2] === rw && r[1] + r[3] === y);
        if (match) { match[3] += rh; cur.push(match); }
        else { const r = [x, y, rw, rh]; out.push(r); cur.push(r); }
      }
      prev = cur;
    }
  }
  entry(rect) { checkRect(rect, this.width, this.height); this.download(rect); this.rect = rect.slice(); this.ahead = null; }
  /** Reserve one transfer for the next demand inside this rectangle. A stroke with no
   *  footprint, or a window that never grows, pays for no speculative read. */
  prefetch(rect) {
    checkRect(rect, this.width, this.height);
    if (!this.readAhead || (this.rect && (!contains(rect, this.rect) || contains(this.rect, rect)))) return;
    this.ahead = { rect: rect.slice(), data: null };
  }
  // host cells of `next` outside `old` from the read-ahead
  widenFromAhead(old, next) {
    const { rect } = this.ahead, [ax, ay, aw, ah] = rect, area = aw * ah;
    const raw = this.ahead.data ??= this.readAhead(rect);
    const masked = raw && !ArrayBuffer.isView(raw);
    const data = masked ? raw.data : raw;
    const ks = masked ? raw.ks : null;
    const K = (this.planes.length - 4) / 3;
    const activeSet = masked ? new Uint8Array(K) : null;
    if (masked) for (const k of ks) activeSet[k] = 1;
    const copy = (row, x, n) => {
      if (n <= 0) return;
      const j = (row - ay) * aw + (x - ax), i = row * this.width + x;
      if (!masked) {
        this.planes.forEach((plane, p) => plane.set(data.subarray(p * area + j, p * area + j + n), i));
        return;
      }
      const nAct = ks.length;
      for (let p = 0; p < 4; p++) this.planes[p].set(data.subarray(p * area + j, p * area + j + n), i);
      for (let s = 0; s < nAct; s++) {
        const k = ks[s];
        this.planes[4 + k].set(data.subarray((4 + s) * area + j, (4 + s) * area + j + n), i);
        this.planes[4 + K + k].set(data.subarray((4 + nAct + s) * area + j, (4 + nAct + s) * area + j + n), i);
        this.planes[4 + 2 * K + k].set(data.subarray((4 + 2 * nAct + s) * area + j, (4 + 2 * nAct + s) * area + j + n), i);
      }
      for (let k = 0; k < K; k++) if (!activeSet[k]) {
        this.planes[4 + k].fill(0, i, i + n);
        this.planes[4 + K + k].fill(0, i, i + n);
        this.planes[4 + 2 * K + k].fill(0, i, i + n);
      }
    };
    for (let row = next[1]; row < next[1] + next[3]; row++) {
      if (!old || row < old[1] || row >= old[1] + old[3]) { copy(row, next[0], next[2]); continue; }
      copy(row, next[0], old[0] - next[0]); copy(row, old[0] + old[2], next[0] + next[2] - old[0] - old[2]);
    }
  }
  require(rect) {
    checkRect(rect, this.width, this.height);
    if (this.sparse) {
      if (this.allCovered) return;
      const t = this.tile;
      const tx0 = Math.floor(rect[0] / t), ty0 = Math.floor(rect[1] / t);
      const tx1 = Math.floor((rect[0] + rect[2] - 1) / t), ty1 = Math.floor((rect[1] + rect[3] - 1) / t);
      const missing = [];
      this._collectMissing(tx0, ty0, tx1, ty1, missing);
      if (!missing.length) return;
      this.downloadRects(missing);
      for (const r of missing) this.rect = union(this.rect, r);
      return;
    }
    if (this.rect && contains(this.rect, rect)) return;
    // Fetch whole local tiles so nearby contacts share a read within this epoch.
    const tile=this.tile,x=Math.floor(rect[0]/tile)*tile,y=Math.floor(rect[1]/tile)*tile;
    const expanded=[x,y,Math.min(this.width,Math.ceil((rect[0]+rect[2])/tile)*tile)-x,Math.min(this.height,Math.ceil((rect[1]+rect[3])/tile)*tile)-y];
    const old = this.rect, next = union(old, expanded);
    // Batched exposed reads already share a map. Do not fetch an entire long
    // stroke for a local flow epoch when its speculative area more than doubles
    // the current demand. An already-read snapshot can still be reused freely.
    if (this.ahead && contains(this.ahead.rect, next) &&
        (!this.downloadRects || this.ahead.data || this.ahead.rect[2]*this.ahead.rect[3]<=next[2]*next[3]*2)) {
      this.widenFromAhead(old, next); this.rect = next; return;
    }
    this.ahead = null;
    if (this.downloadRects) {
      this.downloadRects(exposed(old, next)); this.rect = next; return;
    }
    // A union includes fresh CPU writes as well as stale cells. Preserve the
    // entire old window bit-for-bit, including signed zero and NaN payloads.
    const saved = old && this.planes.map(plane => {
      const bytes = new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength), size = plane.BYTES_PER_ELEMENT;
      const out = new Uint8Array(old[2] * old[3] * size); let j = 0;
      rows(old, this.width, (i, n) => { out.set(bytes.subarray(i * size, (i + n) * size), j); j += n * size; });
      return out;
    });
    this.download(next);
    if (old) this.planes.forEach((plane, p) => {
      const bytes = new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength), size = plane.BYTES_PER_ELEMENT; let j = 0;
      rows(old, this.width, (i, n) => { bytes.set(saved[p].subarray(j, j + n * size), i * size); j += n * size; });
    });
    this.rect = next;
  }
  assertFresh(rect) {
    if (!this.covers(rect)) throw new Error('CPU read outside the current fresh window');
  }
}

// CPU reference contract for the exact GPU reduction. Invoke after applying only
// CPU dirty payload, before physical advancement; never scan stale host planes.
export function logicalUploadMetadata(remote, width, rect, K) {
  let mask = 0, signedZero = false;
  for (const plane of [remote.W, remote.s, ...remote.G, ...remote.P, ...remote.D]) {
    const bits = new Uint32Array(plane.buffer, plane.byteOffset, plane.length);
    rows(rect, width, (i, n) => { for (let j = i; j < i + n; j++) signedZero ||= bits[j] === 0x80000000; });
  }
  for (let k = 0; k < K; k++) for (const plane of [remote.G[k], remote.P[k], remote.D[k]])
    rows(rect, width, (i, n) => { for (let j = i; j < i + n; j++) if (plane[j] !== 0) mask |= 1 << k; });
  return { mask, signedZero };
}
