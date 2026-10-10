// Which parts of the CPU copy of the sheet are known to match the GPU copy. A GPU step or dry makes the whole CPU copy stale
// at once (a new epoch, O(1)); reading a rectangle back, or writing one up, makes the tiles it covers fresh again. A stroke
// then reads back only the tiles it needs that are still stale, instead of its whole rectangle every time.
const TILE = 8;
const GROW = 64; // a readback is latency-bound, not size-bound: read whole 64-pixel blocks so the next stroke nearby finds them fresh
const ceilDiv = (a, b) => Math.ceil(a / b);

export class FreshMap {
  constructor(w, h) {
    this.w = w; this.h = h; this.tw = ceilDiv(w, TILE); this.th = ceilDiv(h, TILE);
    this.tiles = new Uint32Array(this.tw * this.th); this.epoch = 1; this.all = true;
  }
  /** The GPU copy moved on: nothing in the CPU copy is known current. */
  stale() { this.epoch++; this.all = false; }
  /** The whole CPU copy matches the GPU copy (after a full read or write). */
  fresh() { this.all = true; }
  /** The CPU copy matches the GPU copy inside `rect`; only tiles wholly inside it count. */
  mark(rect) {
    if (this.all) return;
    const [x0, y0, rw, rh] = rect, xe = x0 + rw, ye = y0 + rh;
    const tx0 = ceilDiv(x0, TILE), ty0 = ceilDiv(y0, TILE), tx1 = xe >= this.w ? this.tw : Math.floor(xe / TILE), ty1 = ye >= this.h ? this.th : Math.floor(ye / TILE);
    for (let ty = ty0; ty < ty1; ty++) if (tx1 > tx0) this.tiles.fill(this.epoch, ty * this.tw + tx0, ty * this.tw + tx1);
  }
  /** The stale tiles `rect` touches: their tile-aligned bounding rectangle, or null when all of them are fresh. */
  staleBounds(rect) {
    if (this.all) return null;
    const [x0, y0, rw, rh] = rect, tx0 = Math.floor(x0 / TILE), ty0 = Math.floor(y0 / TILE), tx1 = Math.min(this.tw, ceilDiv(x0 + rw, TILE)), ty1 = Math.min(this.th, ceilDiv(y0 + rh, TILE));
    let a = Infinity, b = Infinity, c = -1, d = -1;
    for (let ty = ty0; ty < ty1; ty++) {
      const row = ty * this.tw;
      for (let tx = tx0; tx < tx1; tx++) if (this.tiles[row + tx] !== this.epoch) { if (tx < a) a = tx; if (tx > c) c = tx; if (ty < b) b = ty; if (ty > d) d = ty; }
    }
    if (c < 0) return null;
    let X0 = a * TILE, Y0 = b * TILE, X1 = Math.min(this.w, (c + 1) * TILE), Y1 = Math.min(this.h, (d + 1) * TILE);
    if (GROW) { X0 = Math.floor(X0 / GROW) * GROW; Y0 = Math.floor(Y0 / GROW) * GROW; X1 = Math.min(this.w, Math.ceil(X1 / GROW) * GROW); Y1 = Math.min(this.h, Math.ceil(Y1 / GROW) * GROW); }
    // tile-aligned, so reading it makes those tiles fresh
    return [X0, Y0, X1 - X0, Y1 - Y0];
  }
}
