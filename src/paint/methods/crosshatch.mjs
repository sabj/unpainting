// Directional contour-following pen hatching, 60-degree cross-hatching, and fine ink ridge work
// for ink-and-wash and crosshatch studies (--crosshatch 1).

function gaussian(src, w, h, sigma) {
  if (!(sigma > 0.05)) return Float32Array.from(src);
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const ker = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    ker[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += src[row + xx] * ker[k + r];
      }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += tmp[yy * w + x] * ker[k + r];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

function quantile(arr, q) {
  if (!arr.length) return 0;
  const a = Float32Array.from(arr).sort();
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))));
  return a[idx];
}

function smoothTensor(src, w, h, r) {
  const n = w * h;
  const gx = new Float32Array(n), gy = new Float32Array(n);
  const gmag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dx = (src[i + 1 - w] + 2 * src[i + 1] + src[i + 1 + w] - src[i - 1 - w] - 2 * src[i - 1] - src[i - 1 + w]) * 0.125;
      const dy = (src[i - 1 + w] + 2 * src[i + w] + src[i + 1 + w] - src[i - 1 - w] - 2 * src[i - w] - src[i + 1 - w]) * 0.125;
      gx[i] = dx;
      gy[i] = dy;
      gmag[i] = Math.hypot(dx, dy);
    }
  }
  const jxx = new Float32Array(n), jxy = new Float32Array(n), jyy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    jxx[i] = gx[i] * gx[i];
    jxy[i] = gx[i] * gy[i];
    jyy[i] = gy[i] * gy[i];
  }
  const sxx = gaussian(jxx, w, h, r), sxy = gaussian(jxy, w, h, r), syy = gaussian(jyy, w, h, r);
  const smMag = gaussian(gmag, w, h, r * 0.8);
  const theta = new Float32Array(n), coh = new Float32Array(n);
  const defaultAngle = -Math.PI / 4;
  const defCos = Math.cos(2 * defaultAngle), defSin = Math.sin(2 * defaultAngle);
  for (let i = 0; i < n; i++) {
    const tr = sxx[i] + syy[i];
    const df = sxx[i] - syy[i];
    const d = Math.hypot(df, 2 * sxy[i]);
    const c = tr > 1e-6 ? Math.min(1, d / (tr + 1e-5)) : 0;
    coh[i] = c;
    const wGrad = Math.min(1, Math.sqrt(tr) * 18) * c;
    const tx2 = (1 - wGrad) * defCos + wGrad * (-df / Math.max(1e-6, d));
    const ty2 = (1 - wGrad) * defSin + wGrad * (-2 * sxy[i] / Math.max(1e-6, d));
    theta[i] = 0.5 * Math.atan2(ty2, tx2);
  }
  return { theta, coh, smMag };
}

function traceLayer(tone, theta, w, h, {
  angleOffset = 0,
  spacing = 3.6,
  floor = 0.28,
  minLen = 4,
  maxLen = 18,
  step = 0.75,
  phase = 0,
} = {}) {
  const n = w * h;
  const claimed = new Uint8Array(n);
  const claimRad = Math.max(1, spacing * 0.46);
  const rCeil = Math.ceil(claimRad);
  const rSq = claimRad * claimRad;
  const margin = Math.max(2, Math.round(0.015 * Math.min(w, h)));

  const isClaimed = (x, y) => {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < margin || iy < margin || ix >= w - margin || iy >= h - margin) return true;
    return claimed[iy * w + ix] !== 0;
  };

  const markClaim = (x, y) => {
    const cx = Math.round(x), cy = Math.round(y);
    for (let dy = -rCeil; dy <= rCeil; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -rCeil; dx <= rCeil; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= w) continue;
        if (dx * dx + dy * dy <= rSq) claimed[yy * w + xx] = 1;
      }
    }
  };

  const gridStep = Math.max(1.5, spacing * 0.78);
  const seeds = [];
  for (let gy = margin, row = 0; gy < h - margin; gy += gridStep, row++) {
    for (let gx = margin, col = 0; gx < w - margin; gx += gridStep, col++) {
      const jx = (((row * 0.6180339887 + col * 0.3819660113 + phase) % 1) - 0.5) * gridStep * 0.5;
      const jy = (((col * 0.6180339887 + row * 0.2763932023 + phase) % 1) - 0.5) * gridStep * 0.5;
      const x = Math.min(w - margin - 1, Math.max(margin, gx + jx));
      const y = Math.min(h - margin - 1, Math.max(margin, gy + jy));
      const v = tone[Math.round(y) * w + Math.round(x)];
      if (v >= floor) seeds.push({ x, y, v });
    }
  }
  seeds.sort((a, b) => b.v - a.v);

  const lines = [];
  const maxSteps = Math.max(4, Math.round(maxLen / (2 * step)));

  const walk = (x0, y0, dirSign) => {
    const pts = [];
    let x = x0, y = y0;
    let prevDx = Math.cos(theta[Math.round(y) * w + Math.round(x)] + angleOffset) * dirSign;
    let prevDy = Math.sin(theta[Math.round(y) * w + Math.round(x)] + angleOffset) * dirSign;
    for (let k = 0; k < maxSteps; k++) {
      const ix = Math.round(x), iy = Math.round(y);
      if (ix < margin || iy < margin || ix >= w - margin || iy >= h - margin) break;
      const i = iy * w + ix;
      if (tone[i] < floor * 0.85) break;
      if (k > 1 && claimed[i]) break;
      const a = theta[i] + angleOffset;
      let dx = Math.cos(a) * dirSign, dy = Math.sin(a) * dirSign;
      if (dx * prevDx + dy * prevDy < 0) { dx = -dx; dy = -dy; }
      if (dx * prevDx + dy * prevDy < 0.6) break;
      prevDx = dx; prevDy = dy;
      x += dx * step;
      y += dy * step;
      pts.push({ x, y });
    }
    return pts;
  };

  for (const s of seeds) {
    if (isClaimed(s.x, s.y)) continue;
    const back = walk(s.x, s.y, -1).reverse();
    const fwd = walk(s.x, s.y, 1);
    const pts = [...back, { x: s.x, y: s.y }, ...fwd];
    let arc = 0;
    for (let k = 1; k < pts.length; k++) {
      arc += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    }
    if (arc < minLen) continue;
    for (const p of pts) markClaim(p.x, p.y);
    lines.push({
      points: pts,
      weight: Math.min(1, 0.45 + 0.55 * (s.v - floor) / Math.max(0.1, 1 - floor)),
    });
  }
  return lines;
}

function traceFineRidges(src, w, h, { K = 1, q = 0.85, minLen = 3.0, maxLen = 28 } = {}) {
  const n = w * h;
  const fine = gaussian(src, w, h, 0.55 * K);
  const wide = gaussian(src, w, h, 2.3 * K);
  const dog = new Float32Array(n);
  const vals = [];
  const margin = Math.max(2, Math.round(0.015 * Math.min(w, h)));
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x;
      const d = Math.max(0, fine[i] - wide[i]);
      dog[i] = d;
      if (d > 0.008) vals.push(d);
    }
  }
  if (!vals.length) return [];
  const thr = Math.max(0.018, quantile(vals, q));
  const { theta } = smoothTensor(dog, w, h, Math.max(1, 1.4 * K));
  return traceLayer(dog, theta, w, h, {
    angleOffset: 0,
    spacing: Math.max(1.5, 1.9 * K),
    floor: thr,
    minLen: minLen * K,
    maxLen: maxLen * K,
    step: 0.65,
    phase: 0.17,
  });
}

export function planCrosshatch(srcD, sheetD, w, h, {
  K = 1,
  spacing = 3.5,
  hatchFloor = 0.26,
  crossFloor = 0.42,
  accentFloor = 0.60,
  crossAngle = Math.PI / 3,
  deficitGain = 0.55,
  log = () => {},
} = {}) {
  const n = w * h;
  const smSrc = gaussian(srcD, w, h, Math.max(0.8, 1.1 * K));
  const smSheet = sheetD ? gaussian(sheetD, w, h, Math.max(0.8, 1.1 * K)) : new Float32Array(n);
  const { theta, smMag } = smoothTensor(smSrc, w, h, Math.max(2, 4.2 * K));

  const tone = new Float32Array(n);
  const vals = [];
  for (let i = 0; i < n; i++) {
    const deficit = sheetD ? Math.max(0, smSrc[i] - smSheet[i]) : 0;
    const raw = smSrc[i] + deficit * deficitGain;
    // Suppress hatching in smooth pale washes (like sky clouds) that lack structural gradient or deep shadow density
    const structGate = smSrc[i] >= crossFloor ? 1 : Math.min(1, smMag[i] / 0.012);
    const t = raw * (0.35 + 0.65 * structGate);
    tone[i] = t;
    if (t > 0.02) vals.push(t);
  }
  const refScale = vals.length ? Math.max(0.55, quantile(vals, 0.97)) : 1;
  const normTone = Float32Array.from(tone, v => Math.min(1.2, v / refScale));

  const primary = traceLayer(normTone, theta, w, h, {
    angleOffset: 0,
    spacing: spacing * K,
    floor: hatchFloor,
    minLen: 4.0 * K,
    maxLen: 16 * K,
    step: 0.75 * K,
    phase: 0.11,
  });

  const cross = traceLayer(normTone, theta, w, h, {
    angleOffset: crossAngle,
    spacing: spacing * 1.25 * K,
    floor: crossFloor,
    minLen: 3.8 * K,
    maxLen: 14 * K,
    step: 0.75 * K,
    phase: 0.47,
  });

  const accents = traceLayer(normTone, theta, w, h, {
    angleOffset: -crossAngle * 0.65,
    spacing: spacing * 1.38 * K,
    floor: accentFloor,
    minLen: 3.2 * K,
    maxLen: 11 * K,
    step: 0.75 * K,
    phase: 0.83,
  });

  const ridges = traceFineRidges(srcD, w, h, { K });
  const field = Float32Array.from(normTone, v => Math.min(1, Math.max(0.18, v)));

  log(`crosshatch: ${primary.length} contour hatches, ${cross.length} 60° cross-hatches, ${accents.length} core accents, ${ridges.length} fine ink ridges`);
  return { field, primary, cross, accents, ridges };
}
