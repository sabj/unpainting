// Which technique a passage was painted with, read off the passage: wet on wet, wet on dry, dry brush or built up.
// Three measurements in the source: `edge`, the share of the perimeter that fades rather than stops; `specks`, bare
// paper inside and in how many pieces; `depth`, tone against the strongest on the sheet. Settings carry less water
// than a full load, which floods the tooth and dries flat. DOM free.

/** Bilinear sample, clamped. */
const at = (F, w, h, x, y) => {
  x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
  const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy, i = iy * w + ix;
  return (1 - v) * ((1 - u) * F[i] + u * F[i + 1]) + v * ((1 - u) * F[i + w] + u * F[i + w + 1]);
};

/** How much of a shape's perimeter fades out rather than stopping. */
export function softEdgeShare(D, mask, w, h, { reach = 6, wide = 2.5, win = null } = {}) {
  let soft = 0, count = 0;
  // `win` {x0, y0, x1, y1}: the mask is empty outside it, so the walk can stay inside (the same cells in the same order)
  const ya = win ? Math.max(1, win.y0) : 1, yb = win ? Math.min(h - 2, win.y1) : h - 2, xa = win ? Math.max(1, win.x0) : 1, xb = win ? Math.min(w - 2, win.x1) : w - 2;
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    if (mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) continue;      // interior
    let nx = 0, ny = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) { nx += dx; ny += dy; }
    }
    const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
    const inside = at(D, w, h, x - nx * reach, y - ny * reach), outside = at(D, w, h, x + nx * reach, y + ny * reach);
    const step = inside - outside;
    if (step < 0.02) continue;
    // How far the fall takes, not where its middle sits: the middle lies on the boundary for hard and lost edges alike.
    const hi = outside + 0.8 * step, lo = outside + 0.2 * step;
    let start = null, end = null;
    for (let d = -reach; d <= reach; d += 0.5) {
      const v = at(D, w, h, x + nx * d, y + ny * d);
      if (start === null && v <= hi) start = d;
      if (start !== null && v <= lo) { end = d; break; }
    }
    count++;
    if (start !== null && end !== null && end - start > wide) soft++;
  }
  return count ? soft / count : 0;
}

/** Bare paper inside a passage, and how broken up it is: a dragged brush leaves it in many small pieces. */
export function toothShowing(D, mask, w, h, { bare = 0.04, win = null } = {}) {
  let inside = 0, pale = 0, runs = 0;
  const ya = win ? Math.max(0, win.y0) : 0, yb = win ? Math.min(h - 1, win.y1) : h - 1, xa = win ? Math.max(0, win.x0) : 0, xb = win ? Math.min(w - 1, win.x1) : w - 1;
  for (let y = ya; y <= yb; y++) {
    let wasPale = false;
    for (let x = xa; x <= xb; x++) {
      const i = y * w + x; if (!mask[i]) { wasPale = false; continue; }
      inside++;
      const isPale = D[i] < bare;
      if (isPale) { pale++; if (!wasPale) runs++; }
      wasPale = isPale;
    }
  }
  return { share: inside ? pale / inside : 0, pieces: inside ? runs / (inside / 1000) : 0 };
}

/**
 * What technique this passage asks for, and how to set the brush and the timing for it.
 *
 * The returned settings are instructions to the painter, in its own terms: how much water the brush carries, whether
 * the paper under it is wet or dry when it arrives, whether the sheet is dried afterwards, and how far the liquid
 * bridges the tooth. Nothing here names a sky or a rock.
 */
export function chooseTechnique(D, mask, w, h, { peak = 1, soft = null, wetEdge = 0.5, dryTooth = 0.06, dryPieces = 9, win = null } = {}) {
  const edge = soft ?? softEdgeShare(D, mask, w, h, { win });
  const tooth = toothShowing(D, mask, w, h, { win });
  let depth = 0, count = 0;
  if (win) { for (let y = Math.max(0, win.y0), yb = Math.min(h - 1, win.y1); y <= yb; y++) for (let i = y * w + Math.max(0, win.x0), e = y * w + Math.min(w - 1, win.x1); i <= e; i++) if (mask[i]) { depth += D[i]; count++; } }
  else for (let i = 0; i < w * h; i++) if (mask[i]) { depth += D[i]; count++; }
  depth = count ? depth / count / Math.max(1e-6, peak) : 0;

  // dragged: the tooth shows through in many separate pieces, which only a brush too dry to fill them leaves.
  // --drytooth: the bare-paper share a dragged passage needs.
  if (tooth.share > dryTooth && tooth.pieces > dryPieces) {
    return {
      name: 'dry brush', edge, tooth: tooth.share, depth,
      water: 0.22, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, intoWet: false, dryAfter: false, passes: 1,
    };
  }
  // lost all round: the paint went into standing water, so it has no edge. `edge` is the share of the perimeter that
  // fades, so a high share is the soft one.
  if (edge > wetEdge) {
    return {
      name: 'wet on wet', edge, tooth: tooth.share, depth,
      // 0.98, not 1: brush.mjs only bridges when bridge < 1, and 1 would switch the tooth off altogether
      water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1,
    };
  }
  // deep and hard edged: built up over dry paint, which is the only way to get there without mud
  if (depth > 0.55) {
    return {
      name: 'glazed', edge, tooth: tooth.share, depth,
      water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, dryAfter: true, passes: 2,
    };
  }
  return {
    name: 'wet on dry', edge, tooth: tooth.share, depth,
    water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true, passes: 1,
  };
}


/**
 * Short marks along the form, for the passes that carry detail. Each runs along the picture's own structure; marks
 * are spaced so paper shows between them, and go where the passage still wants paint.
 *
 * @param want  what this passage still wants, per cell, zero outside it
 */
export function detailMarks(want, w, h, { length = 9, spacing = 4, seed = 7, coverage = 0.55, minWant = 0.02 } = {}) {
  let s = (seed | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : want[y * w + x]);

  // the cells worth marking, strongest first, so the darkest touches go in where the passage most wants them
  const cells = [];
  for (let i = 0; i < w * h; i++) if (want[i] > minWant) cells.push(i);
  cells.sort((a, b) => want[b] - want[a]);
  const budget = Math.round(cells.length * coverage / Math.max(1, length));

  const taken = new Uint8Array(w * h), marks = [];
  for (const i of cells) {
    if (marks.length >= budget) break;
    if (taken[i]) continue;
    const x0 = i % w, y0 = (i / w) | 0;
    // along the structure: the direction the passage changes least, found from the gradient turned a quarter
    let gx = 0, gy = 0;
    for (let d = 1; d <= 2; d++) { gx += at(x0 + d, y0) - at(x0 - d, y0); gy += at(x0, y0 + d) - at(x0, y0 - d); }
    const m = Math.hypot(gx, gy);
    let dx = m > 1e-6 ? -gy / m : Math.cos(rnd() * Math.PI), dy = m > 1e-6 ? gx / m : Math.sin(rnd() * Math.PI);
    const wobble = (rnd() - 0.5) * 0.5, c = Math.cos(wobble), sn = Math.sin(wobble);
    [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];

    const len = length * (0.6 + 0.8 * rnd()), pts = [];
    for (let t = -len / 2; t <= len / 2; t += 1) {
      const x = x0 + dx * t, y = y0 + dy * t;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (at(Math.round(x), Math.round(y)) <= minWant) break;      // the mark stops where the passage does
      pts.push({ x, y, want: at(Math.round(x), Math.round(y)) });
    }
    if (pts.length < 3) { taken[i] = 1; continue; }
    // spend the ground this mark and its spacing cover, so the next one lands elsewhere and paper is left between
    for (const p of pts) {
      const px = Math.round(p.x), py = Math.round(p.y);
      for (let oy = -spacing; oy <= spacing; oy++) for (let ox = -spacing; ox <= spacing; ox++) {
        const xx = px + ox, yy = py + oy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox * ox + oy * oy <= spacing * spacing) taken[yy * w + xx] = 1;
      }
    }
    marks.push(pts);
  }
  return marks;
}
