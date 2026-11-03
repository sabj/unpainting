// Generated from src/media/paper-certificate.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Exact zero-water certificates only. They are transient (not checkpoint state).
// Direct CPU array writers must invalidate; GPU changes also invalidate through
// the link's existing version. A threshold-only "dry" result is not a certificate.
const ZERO = Symbol('zero paper certificate');
const FIXED = Symbol('dry fixed certificate');
const WET_REACH = Symbol('wet reachability certificate');
const WET_BUF = Symbol('wet reachability buffer');

export function invalidatePaperCertificate(sheet) {
  if (sheet[ZERO]) sheet[ZERO] = null;
  if (sheet[FIXED]) sheet[FIXED] = null;
  if (sheet[WET_REACH]) sheet[WET_REACH] = null;
}

export function certifyZeroPaper(sheet) {
  Object.defineProperty(sheet, ZERO, {configurable:true, writable:true, value:{
    sheet, W:sheet.W, s:sheet.s, gpu:sheet._gpu, version:sheet._gpu?.version, paused:sheet._gpu?.paused,
  }});
  let buf = sheet[WET_BUF];
  if (!buf || buf.n !== sheet.n) {
    buf = { n: sheet.n, epoch: 1, cells: null };
    Object.defineProperty(sheet, WET_BUF, {configurable:true, writable:true, value:buf});
  } else {
    buf.epoch = (buf.epoch + 1) >>> 0;
    if (!buf.epoch) { buf.cells?.fill(0); buf.epoch = 1; }
  }
  Object.defineProperty(sheet, WET_REACH, {configurable:true, writable:true, value:{
    sheet, W:sheet.W, s:sheet.s, gpu:sheet._gpu, version:sheet._gpu?.version, paused:sheet._gpu?.paused,
    epoch: buf.epoch, boxes: [], steps: 0, exactCells: true,
  }});
}

export function hasZeroPaperCertificate(sheet) {
  const c=sheet[ZERO];
  return !!c && c.sheet===sheet && c.W===sheet.W && c.s===sheet.s && c.gpu===sheet._gpu && c.version===sheet._gpu?.version && c.paused===sheet._gpu?.paused;
}

export function validWetReachCertificate(sheet) {
  const c=sheet[WET_REACH];
  return !!c && c.sheet===sheet && c.W===sheet.W && c.s===sheet.s && c.gpu===sheet._gpu && c.version===sheet._gpu?.version && c.paused===sheet._gpu?.paused;
}

export function beginWetOperation(sheet) {
  const valid = validWetReachCertificate(sheet);
  if (sheet[ZERO]) sheet[ZERO] = null;
  if (sheet[FIXED]) sheet[FIXED] = null;
  if (!valid && sheet[WET_REACH]) sheet[WET_REACH] = null;
  return valid;
}

export function syncWetReachVersion(sheet) {
  const c = sheet[WET_REACH];
  if (c && c.sheet === sheet && c.W === sheet.W && c.s === sheet.s && c.gpu === sheet._gpu && c.paused === sheet._gpu?.paused) {
    c.version = sheet._gpu?.version;
  } else if (sheet[WET_REACH]) {
    sheet[WET_REACH] = null;
  }
}

function addWetBox(c, x0, y0, x1, y1, stepAt = c.steps) {
  const boxes = c.boxes, n = boxes.length;
  if (n && boxes[n - 1][4] === stepAt) {
    const b = boxes[n - 1];
    if (x0 <= b[2] + 32 && x1 >= b[0] - 32 && y0 <= b[3] + 32 && y1 >= b[1] - 32) {
      if (x0 < b[0]) b[0] = x0;
      if (y0 < b[1]) b[1] = y0;
      if (x1 > b[2]) b[2] = x1;
      if (y1 > b[3]) b[3] = y1;
      return;
    }
  }
  boxes.push([x0, y0, x1, y1, stepAt]);
}

export function recordWetCell(sheet, i) {
  const valid = beginWetOperation(sheet);
  if (!valid) return;
  const c = sheet[WET_REACH];
  if (c.exactCells) {
    const buf = sheet[WET_BUF];
    const cells = (buf.cells ??= new Uint32Array(sheet.n));
    cells[i] = c.epoch;
  }
  const w = sheet.w, y = (i / w) | 0, x = i - y * w;
  addWetBox(c, x, y, x, y);
}

export function recordWetCells(sheet, indices, count = indices.length) {
  const c = sheet[WET_REACH];
  if (!c || !count) return;
  const w = sheet.w;
  let x0 = w, y0 = sheet.h, x1 = -1, y1 = -1;
  if (c.exactCells) {
    const buf = sheet[WET_BUF];
    const cells = (buf.cells ??= new Uint32Array(sheet.n)), epoch = c.epoch;
    for (let j = 0; j < count; j++) {
      const i = indices[j];
      cells[i] = epoch;
      const y = (i / w) | 0, x = i - y * w;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  } else {
    for (let j = 0; j < count; j++) {
      const i = indices[j], y = (i / w) | 0, x = i - y * w;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 >= x0) addWetBox(c, x0, y0, x1, y1);
}

export function recordWetBox(sheet, x0, y0, x1, y1, flows = 0) {
  const c = sheet[WET_REACH];
  if (!c) return;
  c.exactCells = false;
  const stepAt = Math.max(0, c.steps - flows);
  if (x1 >= x0 && y1 >= y0) addWetBox(c, x0, y0, x1, y1, stepAt);
}

export function recordWetStep(sheet, count = 1) {
  const valid = beginWetOperation(sheet);
  if (!valid) return false;
  const c = sheet[WET_REACH];
  if (!c.boxes.length) { sheet[WET_REACH] = null; return false; }
  c.steps += count;
  c.exactCells = false;
  return true;
}

export function clearWetFootprint(sheet, [x0, y0, fw, fh]) {
  const c = sheet[WET_REACH];
  if (!c || !c.exactCells) return;
  const buf = sheet[WET_BUF], cells = buf?.cells;
  if (!cells) return;
  const w = sheet.w, epoch = c.epoch;
  for (let y = y0; y < y0 + fh; y++) {
    const r = y * w;
    for (let x = x0; x < x0 + fw; x++) {
      if (cells[r + x] === epoch) cells[r + x] = 0;
    }
  }
}

export function isFootprintDryCertified(sheet, [x0, y0, fw, fh]) {
  if (hasZeroPaperCertificate(sheet)) return true;
  if (!validWetReachCertificate(sheet)) return false;
  const c = sheet[WET_REACH], boxes = c.boxes, steps = c.steps;
  const x1 = x0 + fw - 1, y1 = y0 + fh - 1;
  let anyBox = false;
  for (let j = 0; j < boxes.length; j++) {
    const b = boxes[j], m = 3 * (steps - b[4]);
    if (x0 <= b[2] + m && x1 >= b[0] - m && y0 <= b[3] + m && y1 >= b[1] - m) { anyBox = true; break; }
  }
  if (!anyBox) return true;
  if (c.exactCells) {
    const cells = sheet[WET_BUF]?.cells;
    if (!cells) return true;
    const w = sheet.w, epoch = c.epoch;
    for (let y = y0; y <= y1; y++) {
      const r = y * w;
      for (let x = x0; x <= x1; x++) if (cells[r + x] === epoch) return false;
    }
    return true;
  }
  return false;
}

export function queryWetReach(sheet, cells, [x0, y0, x1, y1]) {
  if (!validWetReachCertificate(sheet)) return null;
  const c = sheet[WET_REACH], boxes = c.boxes, steps = c.steps;
  if (!boxes.length) return { allZero: true };
  let anyBox = false;
  for (let j = 0; j < boxes.length; j++) {
    const b = boxes[j], m = 3 * (steps - b[4]);
    if (x0 <= b[2] + m && x1 >= b[0] - m && y0 <= b[3] + m && y1 >= b[1] - m) { anyBox = true; break; }
  }
  if (!anyBox) return { allZero: true };
  const w = sheet.w, h = sheet.h;
  if (cells.fullSheet) {
    let wx0 = w, wy0 = h, wx1 = -1, wy1 = -1;
    for (let j = 0; j < boxes.length; j++) {
      const b = boxes[j], m = 3 * (steps - b[4]);
      const bx0 = Math.max(0, b[0] - m), by0 = Math.max(0, b[1] - m), bx1 = Math.min(w - 1, b[2] + m), by1 = Math.min(h - 1, b[3] + m);
      if (bx0 < wx0) wx0 = bx0; if (bx1 > wx1) wx1 = bx1;
      if (by0 < wy0) wy0 = by0; if (by1 > wy1) wy1 = by1;
    }
    if (wx1 < wx0 || wy1 < wy0) return { allZero: true };
    const wetCells = c.exactCells ? sheet[WET_BUF]?.cells : null;
    if (c.exactCells && !wetCells) return { allZero: true };
    return { allZero: false, rect: [wx0, wy0, wx1 - wx0 + 1, wy1 - wy0 + 1], bounds: [wx0, wy0, wx1, wy1], ...(wetCells ? { exactEpoch: c.epoch, wetCells } : {}) };
  }
  if (c.exactCells) {
    const wetCells = sheet[WET_BUF]?.cells;
    if (!wetCells) return { allZero: true };
    const epoch = c.epoch;
    let wx0 = w, wy0 = sheet.h, wx1 = -1, wy1 = -1;
    for (const i of cells) {
      if (wetCells[i] === epoch) {
        const y = (i / w) | 0, x = i - y * w;
        if (x < wx0) wx0 = x; if (x > wx1) wx1 = x;
        if (y < wy0) wy0 = y; if (y > wy1) wy1 = y;
      }
    }
    if (wx1 < wx0) return { allZero: true };
    return { allZero: false, rect: [wx0, wy0, wx1 - wx0 + 1, wy1 - wy0 + 1], exactEpoch: epoch, wetCells };
  }
  let wx0 = w, wy0 = sheet.h, wx1 = -1, wy1 = -1;
  for (const i of cells) {
    const y = (i / w) | 0, x = i - y * w;
    for (let j = 0; j < boxes.length; j++) {
      const b = boxes[j], m = 3 * (steps - b[4]);
      if (x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m) {
        if (x < wx0) wx0 = x; if (x > wx1) wx1 = x;
        if (y < wy0) wy0 = y; if (y > wy1) wy1 = y;
        break;
      }
    }
  }
  if (wx1 < wx0) return { allZero: true };
  return { allZero: false, rect: [wx0, wy0, wx1 - wx0 + 1, wy1 - wy0 + 1], bounds: [wx0, wy0, wx1, wy1] };
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
