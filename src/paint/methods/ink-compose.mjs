export function createInkComposer({N,W2,H2,width:WH,height:HH}) {
 const nH=WH*HH;
  let x0Tab=null,x1Tab=null,txTab=null,y0Tab=null,y1Tab=null,tyTab=null,hBuf0=null,hBuf1=null;
  let invInkL=null,version=0,lastLo=null,lastOut=null,lastVersion=-1;
  function ensureComposeTables() {
    if (x0Tab) return;
    x0Tab = new Int32Array(WH); x1Tab = new Int32Array(WH); txTab = new Float32Array(WH);
    for (let x = 0; x < WH; x++) {
      const fx = Math.min(W2 - 1, Math.max(0, (x + 0.5) / N - 0.5)), x0 = Math.floor(fx);
      x0Tab[x] = x0 * 3; x1Tab[x] = Math.min(W2 - 1, x0 + 1) * 3; txTab[x] = fx - x0;
    }
    y0Tab = new Int32Array(HH); y1Tab = new Int32Array(HH); tyTab = new Float32Array(HH);
    for (let y = 0; y < HH; y++) {
      const fy = Math.min(H2 - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(fy);
      y0Tab[y] = y0 * W2 * 3; y1Tab[y] = Math.min(H2 - 1, y0 + 1) * W2 * 3; tyTab[y] = fy - y0;
    }
    hBuf0 = new Float64Array(WH * 3);
    hBuf1 = new Float64Array(WH * 3);
  }
  function interpRow(src, yOff, dst, xa = 0, xb = WH - 1) {
    for (let x = xa, o = xa * 3; x <= xb; x++, o += 3) {
      const a = yOff + x0Tab[x], b = yOff + x1Tab[x], tx = txTab[x], tx0 = 1 - tx;
      dst[o] = src[a] * tx0 + src[b] * tx;
      dst[o + 1] = src[a + 1] * tx0 + src[b + 1] * tx;
      dst[o + 2] = src[a + 2] * tx0 + src[b + 2] * tx;
    }
  }
  function composeImpl(lo) {
    ensureComposeTables();
    const rowLen = WH * 3, loRow = W2 * 3, src = Buffer.from(lo.buffer, lo.byteOffset, lo.byteLength);
    let from = 0, to = H2 - 1, xa = 0, xb = WH - 1;
    const kept = !!lastOut && lastVersion === version && lastLo.length === src.length;
    if (kept) {
      const same = y => src.compare(lastLo, y * loRow, (y + 1) * loRow, y * loRow, (y + 1) * loRow) === 0;
      while (from < H2 && same(from)) from++;
      if (from === H2) return lastOut;
      while (to > from && same(to)) to--;
      let c0 = loRow, c1 = -1;
      for (let y = from; y <= to; y++) {
        if (y !== from && y !== to && same(y)) continue;
        const o = y * loRow;
        let a = 0; while (a < c0 && src[o + a] === lastLo[o + a]) a++; if (a < c0) c0 = a;
        let b = loRow - 1; while (b > c1 && src[o + b] === lastLo[o + b]) b--; if (b > c1) c1 = b;
      }
      const p0 = ((c0 / 3) | 0) * 3, p1 = ((c1 / 3) | 0) * 3;
      while (xa < WH - 1 && x1Tab[xa] < p0) xa++;
      while (xb > xa && x0Tab[xb] > p1) xb--;
    } else {
      if (!lastOut || lastOut.length !== nH * 3) lastOut = Buffer.allocUnsafe(nH * 3);
      if (!lastLo || lastLo.length !== src.length) lastLo = Buffer.allocUnsafe(src.length);
    }
    const out = lastOut, i0 = xa * 3, i1 = (xb + 1) * 3;
    let r0 = hBuf0, r1 = hBuf1, cy0 = -1, cy1 = -1;
    for (let y = 0; y < HH; y++) {
      const ya = y0Tab[y], yc = y1Tab[y], ty = tyTab[y], ty0 = 1 - ty, row = y * rowLen;
      if ((ya / loRow < from && yc / loRow < from) || (ya / loRow > to && yc / loRow > to)) continue;
      if (ya !== cy0) {
        if (ya === cy1) { const t = r0; r0 = r1; r1 = t; cy1 = cy0; cy0 = ya; }
        else { interpRow(lo, ya, r0, xa, xb); cy0 = ya; }
      }
      let rb = r0;
      if (yc !== ya) {
        if (yc !== cy1) { interpRow(lo, yc, r1, xa, xb); cy1 = yc; }
        rb = r1;
      }
      for (let i = i0; i < i1; i++) {
        const bLo = r0[i] * ty0 + rb[i] * ty;
        const v = Math.round(bLo * invInkL[row + i]);
        out[row + i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    if (kept) src.copy(lastLo, from * loRow, from * loRow, (to + 1) * loRow); else src.copy(lastLo);
    lastVersion = version;
    return out;
  }

 return {setRatio(ratio){invInkL=ratio;version++;},compose:composeImpl};
}
