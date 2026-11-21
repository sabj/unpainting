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

export class CpuDemandWindow {
  constructor(width, height, planes, download, tile = 1, readAhead = null) {
    this.width = width; this.height = height; this.planes = planes;
    this.tile = tile;
    this.download = download; this.rect = null; this.epoch = 0;
    // `ahead`: a rectangle read ahead in this epoch, kept apart from the host planes ({rect, data} packed plane by plane
    // in `planes` order, as readAhead returns it). The window grows into it by copying, cell for cell what a read of the
    // grown window would bring then: host cells are only ever written where the window grows, as before.
    this.ahead = null; this.readAhead = readAhead;
  }
  // Call only once the GPU has actually advanced. A scheduled callback is not an epoch.
  afterFlow() { this.rect = null; this.ahead = null; this.epoch++; }
  covers(rect) { return !!this.rect && contains(this.rect, rect); }
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
    const data = this.ahead.data ??= this.readAhead(rect);
    const copy = (row, x, n) => { if (n <= 0) return; const j = (row - ay) * aw + (x - ax), i = row * this.width + x;
      this.planes.forEach((plane, p) => plane.set(data.subarray(p * area + j, p * area + j + n), i)); };
    for (let row = next[1]; row < next[1] + next[3]; row++) {
      if (!old || row < old[1] || row >= old[1] + old[3]) { copy(row, next[0], next[2]); continue; }
      copy(row, next[0], old[0] - next[0]); copy(row, old[0] + old[2], next[0] + next[2] - old[0] - old[2]);
    }
  }
  require(rect) {
    checkRect(rect, this.width, this.height);
    if (this.rect && contains(this.rect, rect)) return;
    // Fetch whole local tiles so nearby contacts share a read within this epoch.
    const tile=this.tile,x=Math.floor(rect[0]/tile)*tile,y=Math.floor(rect[1]/tile)*tile;
    const expanded=[x,y,Math.min(this.width,Math.ceil((rect[0]+rect[2])/tile)*tile)-x,Math.min(this.height,Math.ceil((rect[1]+rect[3])/tile)*tile)-y];
    const old = this.rect, next = union(old, expanded);
    if (this.ahead && contains(this.ahead.rect, next)) { this.widenFromAhead(old, next); this.rect = next; return; }
    this.ahead = null;
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
    if (!this.rect || !contains(this.rect, rect)) throw new Error('CPU read outside the current fresh window');
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
