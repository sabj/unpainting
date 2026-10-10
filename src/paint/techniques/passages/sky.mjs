// For skies: one wet-in-wet passage. The paper is wetted, the blue floated on in a few broad crossing passes, clouds
// lifted with a tissue while the wash stands, and paper left round the mass. Every length is a fraction of E, the square
// root of the sky's largest painted part in plan cells (calibrated at E about 150), never of the sheet.
// Flags (all read with ctx.num / ctx.opt, all prefixed `sky`):
//   --skymop 0.145     the mop's radius as a fraction of E; its disc is not clamped to the shape, so its overhang
//                      decides how far a wash reaches
//   --skypaper 0.12    cells the picture leaves under this many OD of everything are paper, and are never wetted
//   --skywander 0.55   how far the mask's edge is allowed to wander off the segment's own boundary, in mops
//   --skyarc 0.55      how far a sweep bows away from a ruled line, in mop radii
//   --skyendjit 0.55   how far the ends of a sweep are jittered, in mop radii, so no two stop on one line
//   --skypasses 3      how many broad passes of blue
//   --skyload 0.85     lay this share of what each pass's quantile asks
//   --skycap 0.26      no single pass heavier than this many OD of its strongest pigment
//   --skyquant 0.35    the first pass's quantile of the residual; later passes step up by --skyquantstep
//   --skygran 0.85     granulation while this passage settles (1 is the mop's)
//   --skytop 0.18      extra charge at the top of the sheet, none at the bottom
//   --skycloud 0.34    cells under this quantile of blue inside the mass are where the tissue goes
//   --skyblot 0.8      how much of the standing film the tissue drinks
//   --skygrainshift 2  moves where each brush reads the paper's relief, so broken films do not compound into speckle
export const when = 'washes';

// wet on wet, as the mop lays its first washes
const WOW = { water: 0.88, wetMix: 0.85, bridge: 0.9, bridgeSoft: 3 };

export async function paint(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, A, K, PIGS, expected, used, O, SEED, UPRIGHT,
    seg, subject, thickness, gaussian, components, removeSmall, createBrush, dip, stroke, step, dry, blot,
    sweepCover, handAngle, clock, snap, stage, num, opt, log, setClip, render, px,
  } = ctx;

  const region = seg && seg.regions ? seg.regions.find(r => r.name === 'sky') : null;
  if (!region) { log('sky: no sky segment on this source, nothing to paint'); return; }

  const up = m => {
    if (SC === 1) return Uint8Array.from(m, v => (v > 0.5 ? 1 : 0));
    const out = new Uint8Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) out[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)] > 0.5 ? 1 : 0;
    return out;
  };
  const count = m => { let c = 0; for (let i = 0; i < n; i++) c += m[i] ? 1 : 0; return c; };

  const PAPER = num('skypaper', 0.12), WARM = opt('skywarm', '') !== '' ? num('skywarm', 8) : null;
  const RAW = new Uint8Array(n);
  let inRegion = 0;
  for (let i = 0; i < n; i++) {
    if (!(region.mask[i] > 0.5)) continue;
    inRegion++;
    // Exclude the figure so the sky wash preserves its silhouette.
    if (subject && subject[i] > 0.5) continue;
    // the paper the picture leaves bare is the shape of the mass; washed edge to edge, a sky is only a tinted rectangle
    let tot = 0; for (let j = 0; j < K; j++) tot += A[i * K + j];
    if (tot < PAPER) continue;
    // --skywarm T: a cell whose target red leads its blue by more than T levels is not sky (stone, brick, a roof),
    // whatever the map says, so a loose map cannot lay a saturated band along a roofline. Default off.
    if (WARM !== null && px && px[i * 3] - px[i * 3 + 2] > WARM) continue;
    RAW[i] = 1;
  }
  const rawArea = count(RAW);
  if (!rawArea) { log('sky: the region is all subject or all paper'); return; }

  // The size of everything is read off the sky's largest part, not its total: a mop sized for several separate lobes
  // together is wider than any one of them.
  const parts = components(RAW, w, h);
  let big = 0; for (let id = 1; id <= parts.count; id++) if (parts.areas[id] > big) big = parts.areas[id];
  const E = Math.sqrt(Math.max(1, big));
  const MOP = Math.max(3 * SC, Math.round(num('skymop', 0.145) * E * SC));
  // Not scaled with the sky's extent: how long the water moves between passes. Flow levels a wash towards one tone and
  // the mottle is the picture, so those counts are absolute; only the closing of the blotted clouds, which travels a
  // cloud's width, scales with the extent.
  const T = Math.max(0.7, Math.min(2.2, E / num('skyextentref', 150)));
  const steps = k => Math.max(4, Math.round(k));
  const cloudSteps = k => Math.max(4, Math.round(k * T));
  log(`sky: ${(100 * inRegion / n).toFixed(0)}% of the sheet is sky, ${(100 * rawArea / n).toFixed(0)}% of it takes paint in ${parts.count} parts, the largest ${big} cells (extent ${E.toFixed(0)}), so the mop is radius ${MOP} and the physics runs at ${T.toFixed(2)}x`);

  // A segment's mask is a polygon and a polygon has straight sides. A wash has none. The mask's edge is blurred and
  // then pushed about by a smooth random field at about half a mop, inside a band round the boundary so nothing is
  // invented out in clean paper and nothing is eaten out of the middle.
  const noiseField = (seed, scale) => {
    let s = (seed * 7919 + 13) % 2147483647; if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const raw = Float32Array.from({ length: n }, () => rnd() - 0.5);
    const f = gaussian(raw, w, h, Math.max(1, scale));
    let mx = 1e-9; for (let i = 0; i < n; i++) { const v = Math.abs(f[i]); if (v > mx) mx = v; }
    for (let i = 0; i < n; i++) f[i] /= mx;
    return f;
  };
  // the paper the picture keeps inside the mass: the holes a wet-in-wet sky is full of. The wander may move the
  // outline over a cell that is nearly paper, but not over one the picture wants white, or the blur closes every hole
  // and the mass becomes one solid blob.
  const HOLE = num('skyhole', 0.06);
  const totA = Float32Array.from({ length: n }, (_, i) => { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; return t; });
  const wander = (mask, seed, amp = num('skywander', 0.55)) => {
    const sg = Math.max(1, num('skyedgesoft', 0.30) * MOP / SC);
    const blur = gaussian(Float32Array.from(mask, v => (v ? 1 : 0)), w, h, sg);
    // two octaves: a slow one that moves the whole outline about, and a fine one that ravels its edge. The slow one
    // alone gives a smooth rounded curve, which is a shape and not a wash edge.
    const coarse = noiseField(seed, Math.max(1, num('skyedgescale', 0.5) * MOP / SC));
    const fine = noiseField(seed + 977, Math.max(1, num('skyedgefine', 0.16) * MOP / SC));
    const out = new Uint8Array(n);
    // --skyrunoff 1: the blur reads the space off the sheet as bare paper, so along the border the mass thins and the
    // noise eats a strip of it. A painter runs a sky wash off the paper: within two blur widths of the border the mask
    // stands as it is.
    const RUNOFF = num('skyrunoff', 0) > 0 ? Math.ceil(2 * sg) : -1;
    for (let i = 0; i < n; i++) {
      if (RUNOFF >= 0 && mask[i]) { const x = i % w, y = (i / w) | 0; if (x < RUNOFF || y < RUNOFF || x >= w - RUNOFF || y >= h - RUNOFF) { out[i] = 1; continue; } }
      if (!mask[i] && totA[i] < HOLE) continue;        // the picture's own paper, inside the mass as well as outside
      if (blur[i] > 0.94) { out[i] = 1; continue; }    // Keep the interior of the mass.
      if (blur[i] < 0.06) continue;                    // Exclude cells beyond the wash edge.
      if (blur[i] + amp * (0.72 * coarse[i] + 0.55 * fine[i]) > 0.5) out[i] = 1;
    }
    return out;
  };

  const MINPART = Math.max(4, Math.round(num('skyminpart', 0.004) * big));
  let SKY = wander(RAW, 3301 + SEED);
  // the wandering edge may not carry the mass back over a warm cell (--skywarm)
  if (WARM !== null && px) for (let i = 0; i < n; i++) if (SKY[i] && px[i * 3] - px[i * 3 + 2] > WARM) SKY[i] = 0;
  if (removeSmall) SKY = removeSmall(SKY, w, h, MINPART);
  const area = count(SKY);
  if (!area) { log('sky: nothing left of the mass after its edge was softened'); return; }

  // what the sheet still lacks, at the mop's own scale
  const sigma = Math.max(1, MOP / SC / num('skyblur', 8));
  const residual = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    const lack = j => Float32Array.from({ length: n }, (_, i) => Math.max(0, A[i * K + j] - on[i * K + j]));
    // --skymaskedblur 1: what the sky lacks is read from sky cells only (a blur of the lack over the sky divided by a
    // blur of the sky), so dark buildings beside the sky do not charge a blue band along the rooflines. Default 0.
    if (MBLUR) return Array.from({ length: K }, (_, j) => { const l = lack(j); for (let i = 0; i < n; i++) if (!SKY[i]) l[i] = 0; const a = gaussian(l, w, h, sigma); for (let i = 0; i < n; i++) a[i] = SKY_BLUR[i] > 1e-3 ? a[i] / SKY_BLUR[i] : 0; return a; });
    return Array.from({ length: K }, (_, j) => gaussian(lack(j), w, h, sigma));
  };
  const MBLUR = num('skymaskedblur', 0) > 0, SKY_BLUR = MBLUR ? gaussian(Float32Array.from(SKY), w, h, sigma) : null;
  let B = residual();

  // the sky's colour: the pigment the region wants most. A puddle of every pigment turns a sky grey, so the others
  // come in at a share of theirs (--skymixothers), which is the little ultramarine in the cerulean, not mud.
  let jb = 0, bestSum = -1;
  for (let j = 0; j < K; j++) { let s = 0; for (let i = 0; i < n; i++) if (SKY[i]) s += B[j][i]; if (s > bestSum) { bestSum = s; jb = j; } }
  const others = num('skymixothers', 0.6);

  let vals = [];
  const readVals = () => { vals = []; for (let i = 0; i < n; i++) if (SKY[i]) vals.push(B[jb][i]); vals.sort((a, b) => a - b); };
  readVals();
  const cut = p => vals[Math.floor(Math.min(0.99, Math.max(0, p)) * (vals.length - 1))] ?? 0;
  log(`sky: ${PIGS[jb] && PIGS[jb].name ? PIGS[jb].name : `pigment ${jb}`} over the mass, ${cut(0.1).toFixed(2)} / ${cut(0.5).toFixed(2)} / ${cut(0.9).toFixed(2)} OD at its pale, middle and deep ends`);

  // The sweeps are not ruled lanes. Each sweep bows the way a wrist bows, wanders a little on top of the bow, starts and stops at
  // its own point rather than on a line shared with its neighbours, and tapers at both ends because a mop comes off
  // the paper rather than stopping square. The union of a pass is then a soft irregular field, not a slab.
  const arcLanes = (M, Rad, angle, seed) => {
    let s = (seed * 7919 + 13) % 2147483647; if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const ca = Math.cos(angle), sa = Math.sin(angle), nx = -sa, ny = ca;
    let lo = Infinity, hi = -Infinity, alo = Infinity, ahi = -Infinity;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (M[y * W2 + x]) {
      const t = x * nx + y * ny, u = x * ca + y * sa;
      if (t < lo) lo = t; if (t > hi) hi = t; if (u < alo) alo = u; if (u > ahi) ahi = u;
    }
    if (!(hi >= lo)) return [];
    const gap = Math.max(2, num('skygap', 1.05) * Rad), stepLen = Math.max(2, Rad / 4), paths = [];
    let k = 0;
    for (let t = lo + gap * (0.25 + 0.5 * rnd()); t <= hi; t += gap * (0.82 + 0.36 * rnd()), k++) {
      const runs = []; let a = null, b = null;
      for (let u = alo; u <= ahi; u += 1) {
        const x = Math.round(t * nx + u * ca), y = Math.round(t * ny + u * sa);
        const inside = x >= 0 && y >= 0 && x < W2 && y < H2 && M[y * W2 + x];
        if (inside) { if (a === null) a = u; b = u; }
        else if (a !== null && u - b > 1.2 * Rad) { runs.push([a, b]); a = null; }
      }
      if (a !== null) runs.push([a, b]);
      const forward = k % 2 === 0;
      for (const [u0r, u1r] of (forward ? runs : runs.slice().reverse())) {
        // the ends: sometimes a little short of the shape, sometimes a little past it, never on the same line twice
        const jit = num('skyendjit', 0.55) * Rad;
        const u0 = u0r - jit * (rnd() - 0.45), u1 = u1r + jit * (rnd() - 0.45), len = u1 - u0;
        if (len < Rad * 0.7) continue;
        const bow = Rad * num('skyarc', 0.55) * (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd());
        const wob = Rad * num('skywob', 0.22), ph = rnd() * 6.283, ph2 = rnd() * 6.283;
        const pts = [];
        for (let d = 0; d <= len + 1e-6; d += stepLen) {
          const dd = Math.min(d, len), v = dd / len;
          const u = forward ? u0 + dd : u1 - dd;
          const off = bow * Math.sin(Math.PI * v) + wob * Math.sin(v * 4.2 + ph) + 0.6 * wob * Math.sin(v * 9.1 + ph2);
          const r = Math.max(0.3 * Rad, Rad * (0.42 + 0.58 * Math.sin(Math.PI * v) ** 0.5));
          pts.push({ x: t * nx + u * ca + off * nx, y: t * ny + u * sa + off * ny, r, p: 1 });
        }
        if (pts.length >= 2) paths.push(pts);
      }
    }
    return paths;
  };

  const PASSES = Math.max(1, Math.round(num('skypasses', 3)));
  const step0 = num('skyquantstep', 0.2), q0 = num('skyquant', 0.35);
  const softCut = (from, seed) => {
    if (from <= 0) return SKY;
    const t = cut(from), raw = Float32Array.from({ length: n }, (_, i) => (SKY[i] && B[jb][i] >= t ? 1 : 0));
    const soft = gaussian(raw, w, h, Math.max(1, sigma * num('skysoft', 0.4)));
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (SKY[i] && soft[i] > num('skysoftcut', 0.42)) m[i] = 1;
    // a deeper pass has an edge of its own, so it gets its own wander: its footprint must not read as a cut shape
    let out = wander(m, seed, num('skywander', 0.55) * 0.8);
    for (let i = 0; i < n; i++) if (out[i] && !SKY[i]) out[i] = 0;
    return removeSmall ? removeSmall(out, w, h, MINPART) : out;
  };

  // --skydryholes 1: where the target is bare paper (under --skyholeod OD of everything) inside the mass, the cells stay
  // dry. Every sky brush, clean water included, is clipped off them, so the wash goes round dry islands. Specks under
  // --skyholemin of the largest part are ignored. Any clip already in force is kept and restored. Default 0.
  const prevClip = sheet.clip || null;
  let HOLES = null;
  // --skyclipsubject 1: every sky brush is clipped off the figure, since the mop's disc is not held to the sky and can
  // lay a hard-edged tint over it. Default 0. The figure is the ink tiers' subject if any, else the first wash's (--fwmask).
  const FIG = subject || ctx.fwSubject || null;
  const SUBJ_OFF = num('skyclipsubject', 0) > 0 && FIG && setClip;
  if (SUBJ_OFF && !(num('skydryholes', 0) > 0)) {
    const clip = new Uint8Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const c = y * W2 + x; clip[c] = FIG[((y / SC) | 0) * w + ((x / SC) | 0)] > 0.5 ? 0 : (prevClip ? prevClip[c] : 1); }
    setClip(sheet, clip); HOLES = true;
    log('sky: cut in round the figure (its cells clipped off every sky brush)');
  }
  if (num('skydryholes', 0) > 0 && setClip) {
    const inside = gaussian(Float32Array.from(SKY), w, h, Math.max(1, 0.5 * MOP / SC));
    let hm = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (inside[i] > 0.5 && totA[i] < num('skyholeod', 0.06) && !(subject && subject[i] > 0.5)) hm[i] = 1;
    if (removeSmall) hm = removeSmall(hm, w, h, Math.max(3, Math.round(num('skyholemin', 0.0008) * big)));
    let hc = 0; for (let i = 0; i < n; i++) hc += hm[i];
    if (hc) {
      HOLES = hm;
      const clip = new Uint8Array(N2);
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const c = y * W2 + x, pi = ((y / SC) | 0) * w + ((x / SC) | 0); clip[c] = hm[pi] || (SUBJ_OFF && FIG[pi] > 0.5) ? 0 : (prevClip ? prevClip[c] : 1); }
      setClip(sheet, clip);
      log(`sky: ${hc} cells (${(100 * hc / Math.max(1, area)).toFixed(1)}% of the mass) left dry as paper islands`);
    }
  }

  // --skylook 1: the painter looks at the sky between passes. Its mean rendered luminance is compared with the target's;
  // the first pass tells how much a unit of charge darkens this sky, and later passes are scaled to close the gap or
  // skipped. The plan's want alone is not enough: a sky can deliver its planned density and still render too dark.
  const LOOK = num('skylook', 0) > 0 && render && px;
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const skyLum = () => {
    if (!LOOK) return 0;
    const rgb = render(); let s = 0, c = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!SKY[i]) continue; const q = ((y * SC + (SC >> 1)) * W2 + x * SC + (SC >> 1)) * 3; s += lum(rgb[q], rgb[q + 1], rgb[q + 2]); c++; }
    return c ? s / c : 0;
  };
  const TGT_L = LOOK ? (() => { let s = 0, c = 0; for (let i = 0; i < n; i++) if (SKY[i]) { s += lum(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]); c++; } return c ? s / c : 0; })() : 0;
  const L0 = skyLum();
  let pass1 = null;   // { L, charge }: the sky's luminance once the first pass is down, and that pass's mean charge over the sky
  if (LOOK) log(`sky: looking: paper under the sky ${L0.toFixed(0)}, target ${TGT_L.toFixed(0)}`);

  // --skyedgeevap e: how much faster the sky's wet edge dries than its middle (the sheet's edgeEvap, 0.0025 by default).
  // The faster rim draws pigment to it, a dark band where the sky stops at a roofline. Unset: the sheet's own value.
  const OM = { ...O, gran: num('skygran', 0.85), ...(opt('skyedgeevap', '') !== '' ? { edgeEvap: num('skyedgeevap', 0.0025) } : {}) };
  const hairsFor = r => Math.max(12, Math.min(Math.round(num('skyhairs', 40)), Math.ceil(r * 2)));
  const flowEvery = sweeps => Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, sweeps))));
  const CAL = num('skycal', 1.18);          // wet on wet delivers 0.84 of its charge on the scrap
  const STRENGTH = num('strength', 2.2);
  const laidPerCell = new Float32Array(n * K);

  // 1. Wet the paper: clean water over the mass and a little past it, so every edge of the blue runs out into damp paper and feathers
  // instead of drying against dry paper as a cut line. The wetted shape wanders too: a wet edge that follows a
  // polygon hands the polygon straight to the wash that follows it.
  {
    const WR = Math.max(2 * SC, Math.round(MOP * num('skyreach', 0.72)));
    const soft = gaussian(Float32Array.from(SKY), w, h, Math.max(1, num('skyfeather', 0.10) * MOP / SC));
    let M2 = new Uint8Array(n); for (let i = 0; i < n; i++) if (soft[i] > 0.55) M2[i] = 1;
    M2 = wander(M2, 4701 + SEED);
    const paths = arcLanes(up(M2), WR, handAngle(4100 + SEED), 61 + SEED);
    const every = flowEvery(paths.length);
    for (const pts of paths) {
      const b = createBrush({ radius: WR, bristles: hairsFor(WR), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, grainShift: num('skygrainshift', 2), seed: 601 + SEED });
      dip(b, { water: num('skywetwater', 0.45), conc: PIGS.map(() => 0) });
      clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: every, between: s2 => { if (s2 % every === 0) clock('flow', () => step(sheet, OM)); } }));
    }
    clock('flow', () => { for (let q = 0; q < steps(num('skysettle', 15)); q++) step(sheet, OM); });
    used['sky: wetted'] = (used['sky: wetted'] || 0) + paths.length;
    log(`sky: wetted in ${paths.length} arcs with a mop of radius ${WR}`);
    stage({ step: 'wet the paper', pass: 0, of: PASSES + 2, brush: WR });
    snap();
  }

  // 2. The blue, in broad crossing passes at angles far apart, so no lane direction survives.
  for (let p = 0; p < PASSES; p++) {
    // --skyresid 1: before each later pass, read the sheet again and charge the pass from what the sky still lacks, so
    // the deeper part does not take every pass in full. Default 0.
    if (p > 0 && num('skyresid', 0) > 0) { B = residual(); readVals(); log(`sky: looked again before pass ${p + 1}: still lacking ${cut(0.1).toFixed(2)} / ${cut(0.5).toFixed(2)} / ${cut(0.9).toFixed(2)} OD`); }
    // --skydeepfrom (0.42): a later pass covers the part of the sky above this quantile of what it lacks; 0 = the
    // whole sky again, so a pass scaled by --skylook can lift the pale half too
    const MASK = softCut(p === 0 ? 0 : Math.min(0.85, num('skydeepfrom', 0.42) + 0.22 * (p - 1)), 8100 + 211 * p + SEED);
    const mArea = count(MASK);
    if (mArea < num('skypartmin', 0.04) * area) { log(`sky: pass ${p + 1} has nothing deep enough left`); break; }

    const q = Math.min(0.95, Math.max(0.05, q0 + step0 * p));
    const mix = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      const v = []; for (let i = 0; i < n; i++) if (MASK[i]) v.push(B[j][i]);
      v.sort((a, b) => a - b);
      mix[j] = (v[Math.floor(q * (v.length - 1))] ?? 0) * num('skyload', 0.85) * (j === jb ? 1 : others);
    }
    { const cap = num('skycap', 0.26), top = Math.max(...mix); if (top > cap) for (let j = 0; j < K; j++) mix[j] *= cap / top; }
    if (LOOK && p > 0 && pass1) {
      // how much the first pass darkened the sky per unit of its mean charge, and so how much of this pass it takes to
      // bring the sky's mean luminance to the target's (in optical density, log10 of the luminance ratio)
      // --skydrykeep k: the share of a wet wash's density left once dry. The sky is read wet, so it is brought to the
      // target's density over k. Default 1: no allowance.
      const keep = Math.max(0.2, Math.min(1, num('skydrykeep', 1)));
      const Lnow = skyLum(), need = Math.log10(Math.max(1, L0) / Math.max(1, TGT_L)) / keep - Math.log10(Math.max(1, L0) / Math.max(1, Lnow));
      const perCharge = Math.log10(Math.max(1, L0) / Math.max(1, pass1.L)) / Math.max(1e-4, pass1.charge);
      const planned = perCharge * mix[jb] * mArea / Math.max(1, area);
      const s = need <= 0 ? 0 : Math.min(num('skylookmax', 3), need / Math.max(1e-4, planned));
      log(`sky: looked before pass ${p + 1}: sky ${Lnow.toFixed(0)} against the target's ${TGT_L.toFixed(0)}, this pass scaled ${s.toFixed(2)}`);
      if (s <= 0.05) { log(`sky: deep enough, pass ${p + 1} left out`); break; }
      for (let j = 0; j < K; j++) mix[j] *= s;
      const cap2 = num('skycap', 0.26), top2 = Math.max(...mix); if (top2 > cap2) for (let j = 0; j < K; j++) mix[j] *= cap2 / top2;
    }
    if (mix[jb] < num('skyfloor', 0.012)) { log(`sky: pass ${p + 1} wants only ${mix[jb].toFixed(3)} OD, the wash is finished`); break; }

    // a long way apart, so the arcs of one pass cross the arcs of the next at nothing like a grid
    const angle = handAngle(5000 + p * 131 + SEED) + p * num('skyturn', 1.02);
    const RAD = Math.max(2 * SC, Math.round(MOP * (1 - num('skytaper', 0.14) * p)));
    const paths = arcLanes(up(MASK), RAD, angle, 71 + 13 * p + SEED);
    if (!paths.length) { log(`sky: no arc crosses pass ${p + 1}`); continue; }
    const cover = Math.max(1, sweepCover(paths, up(MASK), W2, H2));
    const every = flowEvery(paths.length);
    log(`sky: pass ${p + 1} of ${PASSES} over ${(100 * mArea / n).toFixed(0)}% of the sheet, ${paths.length} arcs at ${angle.toFixed(2)} rad with a mop of radius ${RAD}, puddle [${mix.map(v => v.toFixed(3)).join(' ')}], cover ${cover.toFixed(2)}`);

    // what the picture wants under the brush, read at the mop's scale and normalised over this footprint, so the
    // sweep is recharged as it travels instead of dragging one flat slab across the sheet
    let mean = 0, c = 0; for (let i = 0; i < n; i++) if (MASK[i]) { mean += B[jb][i]; c++; }
    mean = Math.max(1e-4, mean / Math.max(1, c));
    const top = num('skytop', 0.18);
    const at = pt => {
      const sx = Math.min(w - 1, Math.max(0, Math.round(pt.x / SC))), sy = Math.min(h - 1, Math.max(0, Math.round(pt.y / SC)));
      // a sky is laid from the top: the brush comes off the puddle heaviest there and is thinned towards the horizon
      return B[jb][sy * w + sx] * (1 + top * (1 - 2 * (pt.y / Math.max(1, H2 - 1))));
    };
    const lo = num('skygrademin', 0.2), hi = num('skygrademax', 2.1);
    const chunkLen = Math.max(1, num('skygrade', 5)) * RAD / 6;

    const brush = createBrush({
      radius: RAD, bristles: hairsFor(RAD), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25,
      splay: 0.03, stiffness: 8, wetMix: WOW.wetMix, bridge: WOW.bridge, bridgeSoft: WOW.bridgeSoft,
      grainShift: num('skygrainshift', 2), seed: 211 + 17 * p + SEED,
    });
    const base = mix.map(v => v * STRENGTH * CAL / cover);

    for (const pts of paths) {
      const total = pts.reduce((a, pt, i) => a + (i ? Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y) : 0), 0) || 1;
      let run = 0;
      // the pressure a hand puts on a sweep: down at the start, full through the middle, lifted off at the end
      const shaped = pts.map((pt, i) => {
        if (i) run += Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y);
        const u = run / total;
        return { ...pt, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / 0.06), Math.min(1, (1 - u) / 0.10)))) };
      });
      const chunks = []; let d = 0;
      for (let k = 0; k < shaped.length; k++) {
        const pt = shaped[k];
        if (k) d += Math.hypot(pt.x - shaped[k - 1].x, pt.y - shaped[k - 1].y);
        if (!chunks.length || d >= chunkLen) { chunks.push([]); d = 0; if (k) chunks[chunks.length - 1].push(shaped[k - 1]); }
        chunks[chunks.length - 1].push(pt);
      }
      const f = chunks.map(ch => Math.max(lo, Math.min(hi, ch.reduce((a, pt) => a + at(pt), 0) / ch.length / mean)));
      const fmean = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length) || 1;
      clock('strokes', () => chunks.forEach((ch, k) => {
        dip(brush, { water: WOW.water, conc: base.map(v => v * f[k] / fmean) });
        // lift false: no bead dropped at the end of an arc; the hand pulls it along the wash
        stroke(brush, sheet, ch, { upright: UPRIGHT, lift: false, flowEvery: every, between: s2 => { if (s2 % every === 0) clock('flow', () => step(sheet, OM)); } });
      }));
    }
    // let the pass level and run into the one before it before the next crosses it: this is what takes the lanes out
    clock('flow', () => { for (let q2 = 0; q2 < steps(num('skysettle', 15)); q2++) step(sheet, OM); });
    if (LOOK && p === 0) { pass1 = { L: skyLum(), charge: mix[jb] * mArea / Math.max(1, area) }; log(`sky: after pass 1 the sky reads ${pass1.L.toFixed(0)} (paper ${L0.toFixed(0)}, target ${TGT_L.toFixed(0)})`); }
    for (let i = 0; i < n; i++) if (MASK[i]) for (let j = 0; j < K; j++) laidPerCell[i * K + j] += mix[j];
    used['sky wash'] = (used['sky wash'] || 0) + paths.length;
    stage({ step: p === 0 ? 'the blue floated on' : 'a deeper pass across it', pass: p + 1, of: PASSES + 2, pigment: jb, area: +(mArea / n).toFixed(3), technique: 'wet on wet', brush: RAD });
    snap();
  }

  // 3. The clouds, lifted out with a tissue while the wash still stands.
  {
    const t = cut(num('skycloud', 0.34));
    const raw = Float32Array.from({ length: n }, (_, i) => (SKY[i] && B[jb][i] <= t ? 1 : 0));
    // softened at a share of the sky's own extent, so the tissue takes blobs and not a stipple of single cells: a
    // cloud lifted from a wet wash has a soft cauliflower edge, and a speckled lift reads as damage
    const soft = gaussian(raw, w, h, Math.max(1, num('skycloudsoft', 0.011) * E));
    let CLOUD = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (SKY[i] && soft[i] > num('skycloudcut', 0.55)) CLOUD[i] = 1;
    CLOUD = wander(CLOUD, 9301 + SEED, num('skywander', 0.55) * 0.7);
    for (let i = 0; i < n; i++) if (CLOUD[i] && !SKY[i]) CLOUD[i] = 0;
    if (removeSmall) CLOUD = removeSmall(CLOUD, w, h, Math.max(3, Math.round(num('skycloudmin', 0.005) * big)));
    const cells = count(CLOUD);
    // --skyblot 0 means no tissue at all: blot() scales only the water by its strength and would still take
    // --skyblotpig of the standing pigment, leaving pale rimmed patches.
    if (cells && num('skyblot', 0.8) <= 0) log(`sky: no tissue (--skyblot 0), ${(100 * cells / n).toFixed(1)}% of the sheet would have been lifted`);
    else if (cells) {
      const got = blot(sheet, up(CLOUD), { strength: num('skyblot', 0.8), pigmentShare: num('skyblotpig', 0.82) });
      log(`sky: ${(100 * cells / n).toFixed(1)}% of the sheet blotted for the clouds, the tissue takes ${got.pigment.map(v => v.toFixed(2)).join(' ')}`);
      // the wash closes back round each lift: that is what makes the edge soft rather than cut
      clock('flow', () => { for (let q = 0; q < cloudSteps(num('skycloudflow', 40)); q++) step(sheet, OM); });
      for (let i = 0; i < n; i++) if (CLOUD[i]) for (let j = 0; j < K; j++) laidPerCell[i * K + j] *= 1 - num('skyblot', 0.8) * num('skyblotpig', 0.82);
      used['sky: blotted'] = (used['sky: blotted'] || 0) + 1;
      stage({ step: 'the clouds lifted with a tissue', pass: PASSES + 1, of: PASSES + 2, area: +(cells / n).toFixed(3) });
      snap();
    } else log('sky: nothing pale enough inside the mass to lift');
  }

  // 4. Let it flow, then let it dry.
  clock('flow', () => { for (let q = 0; q < steps(num('skyflow', 40)); q++) step(sheet, OM); });
  stage({ step: 'the wash runs and settles', pass: PASSES + 2, of: PASSES + 2 });
  snap();

  // 4b. Blooms (--skyblooms N, default 0), for a broken, mottled sky: clean water touched into a drying wash pushes the
  // settling pigment ahead of it into a frilled rim. After --skybloomwait steps, N drops a --skybloomr share of the mop
  // across go on at the palest places inside the mass, a spacing apart. The physics makes the edges.
  const NBLOOM = Math.round(num('skyblooms', 0));
  if (NBLOOM > 0) {
    clock('flow', () => { for (let q = 0; q < steps(num('skybloomwait', 120)); q++) step(sheet, OM); });
    const cand = []; for (let i = 0; i < n; i++) if (SKY[i] && (!FIG || !(FIG[i] > 0.5))) cand.push(i);
    const tl = i => totA[i];
    cand.sort((a, b) => tl(a) - tl(b));
    const gap = num('skybloomgap', 1.6) * MOP / SC, picked = [];
    for (const i of cand.slice(0, Math.max(NBLOOM, Math.round(cand.length * 0.35)))) {
      if (picked.length >= NBLOOM) break;
      const x = i % w, y = (i / w) | 0;
      if (picked.every(q => Math.hypot(q.x - x, q.y - y) >= gap)) picked.push({ x, y });
    }
    const RB = Math.max(2 * SC, Math.round(MOP * num('skybloomr', 0.35)));
    for (const [k, q] of picked.entries()) {
      const b = createBrush({ radius: RB, bristles: hairsFor(RB), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.05, stiffness: 8, wetMix: 0.9, bridge: 0.95, bridgeSoft: 3, seed: 8800 + k + SEED });
      dip(b, { water: num('skybloomwater', 1), conc: PIGS.map(() => 0) });
      const cx = (q.x + 0.5) * SC, cy = (q.y + 0.5) * SC;
      clock('strokes', () => stroke(b, sheet, [{ x: cx - 0.5, y: cy, r: RB, p: 1 }, { x: cx + 0.5, y: cy, r: RB, p: 1 }], { upright: UPRIGHT, lift: false }));
    }
    clock('flow', () => { for (let q = 0; q < steps(num('skybloomflow', 60)); q++) step(sheet, OM); });
    used['sky: blooms'] = (used['sky: blooms'] || 0) + picked.length;
    log(`sky: ${picked.length} clean-water drops into the drying wash for blooms, radius ${RB}`);
    stage({ step: 'blooms', pass: PASSES + 2, of: PASSES + 2 });
    snap();
  }
  clock('dry', () => dry(sheet, 20000, OM, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  for (let i = 0; i < n * K; i++) expected[i] += laidPerCell[i];
  stage({ step: 'dry', pass: PASSES + 2, of: PASSES + 2 });
  snap();

  // 5. Broken dry-brush strokes where the wash meets white (--skydryedge N, default 0): once the wash is dry, at most N
  // strokes of a nearly dry brush run from inside the wash out over the rim, so the paper's tooth breaks the mark.
  // They start at edge cells a spacing apart that touch paper, not the figure.
  const NDRY = Math.round(num('skydryedge', 0));
  if (NDRY > 0) {
    let s = ((7717 + SEED) * 7919 + 13) % 2147483647; if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const g = gaussian(Float32Array.from(SKY), w, h, Math.max(1, 0.5 * MOP / SC));
    const edge = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (SKY[i] && [i - 1, i + 1, i - w, i + w].some(j => !SKY[j] && !(subject && subject[j] > 0.5) && totA[j] < HOLE)) edge.push(i);
    }
    for (let a = edge.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [edge[a], edge[b]] = [edge[b], edge[a]]; }
    const gap = num('skydrygap', 2) * MOP / SC, picked = [];
    for (const i of edge) { if (picked.length >= NDRY) break; const x = i % w, y = (i / w) | 0; if (picked.every(q => Math.hypot(q.x - x, q.y - y) >= gap)) picked.push({ x, y, i }); }
    const RD = Math.max(2 * SC, Math.round(MOP * num('skydryr', 0.3)));
    const conc = PIGS.map((_, j) => cut(0.5) * STRENGTH * num('skydryload', 0.9) * (j === jb ? 1 : 0));
    for (const [k, q] of picked.entries()) {
      // the outward normal is down the blurred mass's slope; the stroke runs along the hand, turned to point outwards
      const gx = g[q.y * w + Math.min(w - 1, q.x + 1)] - g[q.y * w + Math.max(0, q.x - 1)], gy = g[Math.min(h - 1, q.y + 1) * w + q.x] - g[Math.max(0, q.y - 1) * w + q.x];
      let ang = handAngle(7300 + 29 * k + SEED) + (rnd() - 0.5) * 0.5, dx = Math.cos(ang), dy = Math.sin(ang);
      if (dx * -gx + dy * -gy < 0) { dx = -dx; dy = -dy; }
      const L = (1.2 + 0.8 * rnd()) * MOP, cx = (q.x + 0.5) * SC, cy = (q.y + 0.5) * SC, pts = [];
      for (let d = -0.6 * L; d <= 0.4 * L; d += Math.max(1, RD / 4)) { const u = (d + 0.6 * L) / L; pts.push({ x: cx + dx * d, y: cy + dy * d, r: RD, p: Math.max(0.3, Math.min(1, 0.5 + 1.2 * u) * Math.min(1, (1 - u) / 0.35 + 0.3)) }); }
      const b = createBrush({ flat: true, radius: RD, bristles: Math.max(10, Math.ceil(RD * 1.5)), capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.12, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, grainShift: num('skygrainshift', 2), seed: 7400 + k + SEED });
      dip(b, { water: num('skydrywater', 0.22), conc });
      clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT }));
    }
    clock('dry', () => dry(sheet, 20000, OM, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
    used['sky: dry-brush edge'] = (used['sky: dry-brush edge'] || 0) + picked.length;
    log(`sky: ${picked.length} dry-brush strokes over the edge (of ${edge.length} edge cells), brush radius ${RD}`);
    stage({ step: 'dry-brush edges', pass: PASSES + 2, of: PASSES + 2 });
    snap();
  }
  if (HOLES) setClip(sheet, prevClip);
  // what the look aimed at against what the dried sky reads, so a gap opened later in the painting shows as such
  if (LOOK) log(`sky: finished and dry, the sky reads ${skyLum().toFixed(0)} (target ${TGT_L.toFixed(0)})`);
  // --skydump <file.png> (diagnostic): the sheet as the sky passage leaves it, before anything else is painted
  const dumpTo = opt('skydump', '');
  if (dumpTo && render) { const { default: sharp } = await import('sharp'); await sharp(Buffer.from(render()), { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(dumpTo); log(`sky: sheet after the sky written to ${dumpTo}`); }
}
