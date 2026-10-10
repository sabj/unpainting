// --practice 1: lays the stages and passages from practice-plan.mjs with the painter's mark mechanics (lanes, a
// recharging brush, prewetting, frisket, softened edges, a small brush at the focus). The paper dries between stages only.
//   --practicestop 0.7     a passage under this share of its booked tone gets a second touch for what is missing
//   --practicewashes 3     max passages per cell
//   --practicelook 1       charge a passage only for what the sheet still lacks before laying it
//   --practicefilmlate 0.15  frame share floor for each of the last two stages
import { brushedWashPaths, containPaths, sweepCover, washPaths, softArcs, soften } from '../../media/wash.mjs';
import { createBrush, stroke } from '../../media/brush.mjs';
import { step, dry, applyResist, liftResist, setClip } from '../../media/sheet.mjs';
import { distanceToZero } from '../../raster.js';
import { makeMopLanes } from './mop-lanes.mjs';
import { orientationField, furMarks } from '../../crop/fur.mjs';
import { detailMarks } from '../../crop/technique.mjs';
import { planPractice, focalDarkCut, quantile } from './practice-plan.mjs';
import { pieces } from './practice-regions.mjs';

const TECH = {
  wet: { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3 },
  // a wet wash over textured ground: less water, so the brush skips the tooth and leaves sparkle rather than holes
  wetdry: { name: 'wet on dry', water: 0.55, wetMix: 0.6, bridge: 0.55, bridgeSoft: 1.4 },
  dry: { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2 },
  model: { name: 'wet on dry', water: 0.58, wetMix: 0.5, bridge: 0.72, bridgeSoft: 2.0 },
  thick: { name: 'wet on dry', water: 0.45, wetMix: 0.45, bridge: 0.6, bridgeSoft: 1.6 },
};

export async function paintPractice(ctx) {
  const { sheet, w, h, n, SC, W2, H2, PIGS, K, expected, used, O, SEED, UPRIGHT, BRUSH, CAL, WET, dip, up, upF, clock, shoot, setStage, mark, flowEvery, num, log, gaussian, SRC } = ctx;
  const plan = await planPractice(ctx);
  const STAGES = plan.stages;
  const STRENGTH = num('strength', 2.2);
  const count = (k, v) => { used[k] = (used[k] || 0) + v; };
  const settle = q => clock('flow', () => { for (let t = 0; t < q; t++) step(sheet, O); });
  const dryAll = () => clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  let laid = 0, dries = 0;
  const booked = new Float32Array(n), washes = new Uint8Array(n), dryHits = new Uint16Array(n), maxWashes = Math.round(num('practicewashes', 9));
  let FIELD = null;

  // film: frames by paint, per stage, with floors for the late stages
  const markCover = num('practicecover4', 0.6);
  const mass = STAGES.map(s => { let m = 0; for (const p of s.passages) for (const i of p.cells) for (let j = 0; j < K; j++) m += s.P[i * K + j]; if (s.marks) for (let i = 0; i < n; i++) m += s.marks.want[i] * markCover; if (s.dry) for (let i = 0; i < n; i++) m += s.dry.want[i] * s.dry.coverage; return m; });
  const FR = Math.max(STAGES.length, Math.round(num('frames', 40)));
  const total = mass.reduce((a, b) => a + b, 0) || 1, late = num('practicefilmlate', 0.15);
  const frames = mass.map((m, p) => Math.max(1, Math.round(FR * Math.max(p >= STAGES.length - 2 ? late : 0, m / total))));
  log(`practice film: ${frames.join(', ')} frames for stages ${STAGES.map(s => s.key).join(', ')} (paint ${mass.map(m => (100 * m / total).toFixed(0) + '%').join(', ')})`);
  let si = 0, stageLaid = 0, shots = 0;
  const stage = extra => setStage({ stage: 'paint', step: `stage ${STAGES[si].key}: ${STAGES[si].name}`, pass: si + 1, of: STAGES.length, pigment: si + 1, practice: STAGES[si].key, ...extra });
  const film = async m => {
    stageLaid += m;
    const every = mass[si] / frames[si];
    while (shots < frames[si] - 1 && stageLaid >= every * (shots + 1)) { shots++; stage({ laying: true }); await shoot(); }
  };
  const endStage = async () => { stage({}); await shoot(); mark(si + 1); si++; stageLaid = 0; shots = 0; };

  // A shape laid in lanes, the brush recharged every few cells from amountAt(x, y) (plan cells). Books nothing.
  const lay = async (mask, { radius, T, amountAt, prewet = false, seed, contain = true, filmMass = 0, hairs = null, small = false, scale = 1 }) => {
    const M = up(mask);
    let paths = brushedWashPaths(M, W2, H2, { pad: 1.5 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: radius, seed, overlap: 0.15, walk: true });
    if (contain) paths = containPaths(paths, distanceToZero(M, W2, H2), W2, H2, { minRadius: 0.8 * SC, minLength: 2 * SC, slack: 0.5 * SC });
    if (!paths.length) paths = washPaths(M, W2, H2, { pad: 0.2 * SC, minRadius: 0.5 * SC, minLength: 2 * SC });
    if (!paths.length) return 0;
    const under = 1 / Math.max(0.4, Math.min(1, sweepCover(paths, M, W2, H2)));
    const every = flowEvery(paths.length);
    const hairN = r => (hairs ? hairs(r) : Math.max(12, Math.ceil(r * 2)));
    const brushOf = r => small
      ? createBrush({ radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 40, belly: 4, feed: 0.15, give: 0.8, free: 0.4, film: 0.22, splay: 0.05, stiffness: 5, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: seed + 3 })
      : createBrush({ flat: true, radius: r, bristles: hairN(r), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: seed + 3 });
    if (prewet) for (const pts of paths) {
      const r = Math.max(SC, ...pts.map(p => p.r));
      const wb = createBrush({ flat: true, radius: r, bristles: hairN(r), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: seed + 900 });
      dip(wb, { water: 1, conc: PIGS.map(() => 0) });
      clock('strokes', () => stroke(wb, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: every, between: s => { if (s % every === 0) clock('flow', () => step(sheet, O)); } }));
    }
    const chunk = Math.max(2, Math.round(num('practicechunk', 6) * SC));
    for (const pts of paths) {
      const r = Math.max(SC, ...pts.map(p => p.r));
      const brush = brushOf(r);
      const len = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
      let run = 0;
      const shaped = pts.map((p, i) => { if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); const u = run / len;
        return { ...p, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / 0.06), Math.min(1, (1 - u) / 0.10)))) }; });
      const chunks = [];
      for (let k = 0; k < shaped.length; k += chunk) chunks.push(shaped.slice(Math.max(0, k - 1), k + chunk + 1));
      let st = 0;
      for (const ch of chunks) {
        const a = new Array(K).fill(0);
        for (const q of ch) { const v = amountAt(Math.min(w - 1, Math.max(0, Math.floor(q.x / SC))), Math.min(h - 1, Math.max(0, Math.floor(q.y / SC)))); for (let j = 0; j < K; j++) a[j] += v[j] / ch.length; }
        dip(brush, { water: WET(T), conc: a.map(v => v * scale * STRENGTH * (CAL[T.name] ?? 1) * under) });
        clock('strokes', () => stroke(brush, sheet, ch, { upright: UPRIGHT, lift: false, flowEvery: every, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
      }
      laid++;
      await film(filmMass / paths.length);
    }
    return paths.length;
  };
  // A loose wash: a big brush in a few long strokes across the shape, not held inside it (mop-lanes.mjs), recharged
  // along each stroke from amountAt so colours mingle. Books nothing.
  const mopLanes = makeMopLanes({ num });
  const layMop = async (mask, { radius, amountAt, prewet, seed, filmMass = 0, scale = 1, angle }) => {
    const M = up(mask);
    const paths = mopLanes(M, W2, H2, radius, angle, seed);
    if (!paths.length) return 0;
    const every = flowEvery(paths.length);
    const T = TECH.wet, cover = Math.max(1, sweepCover(paths, M, W2, H2));
    const hairN = r => Math.max(12, Math.min(40, Math.ceil(r * 2)));
    if (prewet) for (const pts of paths) {
      const wb = createBrush({ radius, bristles: hairN(radius), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: seed + 900 });
      dip(wb, { water: num('loosewetwater', 0.6), conc: PIGS.map(() => 0) });
      clock('strokes', () => stroke(wb, sheet, pts, { upright: UPRIGHT, lift: false, flowEvery: every, between: s2 => { if (s2 % every === 0) clock('flow', () => step(sheet, O)); } }));
    }
    const chunkLen = Math.max(2, radius * 0.8);
    for (const pts of paths) {
      const brush = createBrush({ radius, bristles: hairN(radius), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: seed + 3 });
      const len = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
      let run = 0, d = 0; const chunks = [];
      pts.forEach((p, i) => { if (i) { const s2 = Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); run += s2; d += s2; } const u = run / len;
        const q = { ...p, p: Math.max(0.18, Math.min(1, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / 0.06), Math.min(1, (1 - u) / 0.10)))) };
        if (!chunks.length || d >= chunkLen) { chunks.push(chunks.length ? [chunks.at(-1).at(-1)] : []); d = 0; } chunks.at(-1).push(q); });
      let st = 0;
      for (const ch of chunks) {
        if (ch.length < 2) continue;
        const a = new Array(K).fill(0); let c = 0;
        for (const q of ch) { const x = Math.min(w - 1, Math.max(0, Math.floor(q.x / SC))), y = Math.min(h - 1, Math.max(0, Math.floor(q.y / SC))); if (!mask[y * w + x]) continue; const v = amountAt(x, y); for (let j = 0; j < K; j++) a[j] += v[j]; c++; }
        if (c) for (let j = 0; j < K; j++) a[j] /= c;
        dip(brush, { water: WET(T), conc: a.map(v => v * scale * STRENGTH * (CAL[T.name] ?? 1) / cover) });
        clock('strokes', () => stroke(brush, sheet, ch, { upright: UPRIGHT, lift: false, flowEvery: every, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
      }
      laid++;
      await film(filmMass / paths.length);
    }
    return paths.length;
  };
  // clear water along the far side of a wet shape: the side whose outward normal points away from the light
  const L = plan.light;
  const softenFar = (mask, radius, seed) => {
    const M = up(mask);
    const arcs = softArcs(M, W2, H2, (x, y, nx, ny) => -(nx * L.x + ny * L.y), { share: num('practicesoftshare', 0.4), minRun: Math.max(3, 3 * SC), minLoop: Math.max(10, 10 * SC), smooth: 3 });
    if (!arcs.length) return 0;
    const r = Math.max(1.5 * SC, radius);
    return soften(sheet, arcs, O, { radius: r, offset: r * 0.5, seed, settle: Math.round(num('practicesoftsettle', 30)) });
  };
  // the texture of the source inside a passage: how far its density departs from its own blur at a cell and a half
  const HP = (() => { const B = gaussian(SRC, w, h, 1.5); return Float32Array.from(SRC, (v, i) => Math.abs(v - B[i])); })();

  // frisket over the lights, before the first wash
  const LIGHTS = plan.lights;
  let nl = 0; for (let i = 0; i < n; i++) nl += LIGHTS[i];
  // thin over a --practicerim cell rim and broken by the paper's relief, so a reserved light gets a soft, broken edge
  const rim = num('practicerim', 3);
  const relief = (() => { const ht = Float32Array.from({ length: n }, (_, i) => ctx.paper.height[(((i / w) | 0) * SC) * W2 + (i % w) * SC]); let m = 0, q = 0; for (const v of ht) { m += v; q += v * v; } m /= n; const sd = Math.sqrt(Math.max(1e-9, q / n - m * m)); return Float32Array.from(ht, v => (v - m) / sd); })();
  const softResist = M => Float32Array.from(distanceToZero(M, w, h), (v, i) => { if (!M[i]) return 0; const t = Math.min(1, Math.max(0, (v - 1) / rim)); return Math.min(1, Math.max(0, 0.1 + 0.9 * t * t * (3 - 2 * t) + 0.25 * relief[i])); });
  if (nl) { applyResist(sheet, up(LIGHTS), upF(softResist(LIGHTS))); setStage({ stage: 'frisket', cells: nl }); await shoot(); }

  const MOP = Math.max(3 * SC, Math.round(num('practicemop', 0.16) * Math.min(W2, H2)));
  const hairsFor = r => Math.max(12, Math.min(40, Math.ceil(r * 2)));
  const radiusFor = (p, area) => {
    const r0 = Math.sqrt(area * SC * SC / Math.PI);
    if (p.tech === 'wet' || p.tech === 'wetdry') return p.ground ? Math.max(BRUSH, Math.min(MOP, Math.round(0.55 * r0))) : Math.max(SC, Math.min(BRUSH, Math.round(0.3 * r0)));
    if (p.tech === 'thick') return Math.max(SC, Math.min(Math.round(0.6 * BRUSH), Math.round(0.6 * r0)));
    if (p.tech === 'model') return Math.max(SC, Math.min(Math.round(num('practicemodelbrush', 0.15) * BRUSH), Math.round(0.4 * r0)));
    return Math.max(SC, Math.min(BRUSH, Math.round(0.5 * r0)));
  };
  const stopAt = num('practicestop', 0.7);
  let keep = null;

  for (const [k, S] of STAGES.entries()) {
    const union = new Uint8Array(n);
    for (const [q, p] of S.passages.entries()) {
      // no cell takes more than --practicewashes passages
      const mask = new Uint8Array(n); let area = 0, tex = 0;
      for (const i of p.cells) if (washes[i] < maxWashes && !(keep && keep[i])) { mask[i] = 1; area++; tex += HP[i]; }
      if (area < 4) { if (num('practicetrace', 0) > 0) log(`practice ${S.key} ${p.name}: ${p.cells.length} cells planned, none left open`); continue; }
      tex /= area;
      const tech = p.tech === 'wet' && p.ground && tex > num('practicetexture', 0.05) ? 'wetdry' : p.tech;
      const radius = radiusFor({ ...p, tech }, area);
      let pm = 0; for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) pm += S.P[i * K + j];
      const amountAt = (x, y) => { const i = y * w + x; return Array.from({ length: K }, (_, j) => S.P[i * K + j]); };
      const seed = 17 + 1009 * k + 37 * q + SEED;
      // Look before laying: compare the tone already on these cells with the plan booked once this passage is down.
      // Neighbouring water may have done part of the job; charge only what is missing, skip when nothing is.
      let charge = 1;
      if (area >= 60 && ctx.densityNow && num('practicelook', 1) > 0) {
        const D = ctx.densityNow();
        let got = 0, aim = 0, bk = 0, add = 0, tt = 0;
        for (let i = 0; i < n; i++) if (mask[i]) { got += D[i]; aim += SRC[i]; bk += booked[i]; tt += plan.T[i]; for (let j = 0; j < K; j++) add += S.P[i * K + j]; }
        const before = aim * Math.min(1, bk / Math.max(1e-6, tt)), after = aim * Math.min(1, (bk + add) / Math.max(1e-6, tt));
        if (after > before + 1e-6) charge = Math.max(0, Math.min(1, (after - got) / (after - before)));
        if (charge < 0.15) { count('practice: held, skipped', 1); for (let i = 0; i < n; i++) if (mask[i]) { union[i] = 1; for (let j = 0; j < K; j++) booked[i] += S.P[i * K + j]; } continue; }
      }
      // a loose wash: a big brush, a few strokes, one direction a region, and nothing stopped at the shape's edge
      const mopR = p.ground ? Math.max(BRUSH, Math.round(num('loosemop', 0.12) * Math.min(W2, H2))) : Math.max(3 * SC, Math.round(num('loosemopsubject', 0.045) * Math.min(W2, H2)));
      let sweeps = p.kind === 'mop'
        ? await layMop(mask, { radius: Math.min(mopR, Math.max(3 * SC, Math.round(0.6 * Math.sqrt(area * SC * SC / Math.PI)))), amountAt, prewet: !!p.prewet, seed, filmMass: pm, scale: charge, angle: num('looseangle', -0.35) + 0.5 * Math.sin(1.7 * (k * 7 + q)) })
        : await lay(mask, { radius, T: TECH[tech], amountAt, prewet: !!p.prewet, seed, filmMass: pm, hairs: hairsFor, small: tech === 'thick' && radius < 3 * SC, scale: charge });
      if (p.soften === 'far') count('practice: far edge softened', softenFar(mask, Math.max(1.5 * SC, 0.35 * radius), seed + 5));
      for (let i = 0; i < n; i++) if (mask[i]) { union[i] = 1; washes[i]++; for (let j = 0; j < K; j++) { expected[i * K + j] += S.P[i * K + j] * charge; booked[i] += S.P[i * K + j]; } }
      // the stopping condition: the tone the sheet holds over the passage against the share of the plan booked by now
      if (area >= 60 && ctx.densityNow) {
        settle(10);
        const D = ctx.densityNow();
        let got = 0, aim = 0, bk = 0, tt = 0;
        for (let i = 0; i < n; i++) if (mask[i]) { got += D[i]; aim += SRC[i]; bk += booked[i]; tt += plan.T[i]; }
        const want = aim * Math.min(1, bk / Math.max(1e-6, tt));
        if (want > 1e-6 && got < stopAt * want && p.touches !== 1 && p.kind !== 'mop') {
          const more = Math.min(1, want / Math.max(1e-6, got) - 1);
          sweeps += await lay(mask, { radius, T: TECH[tech], amountAt, seed: seed + 11, filmMass: 0, hairs: hairsFor, small: tech === 'thick' && radius < 3 * SC, scale: more });
          for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) expected[i * K + j] += S.P[i * K + j] * more;
          count('practice: second touch', 1);
        }
      }
      count(`practice ${S.key}: ${tech}`, sweeps);
      if (num('practicetrace', 0) > 0) log(`practice ${S.key} ${p.name}: ${p.cells.length} cells planned, ${area} laid, ${tech}, radius ${radius}, charged ${charge.toFixed(2)}, ${sweeps} sweeps`);
      settle(p.tech === 'wet' ? num('practicesettle1', 40) : 10);
    }
    // dry brush along the form: short strokes that break on the tooth, from a brush with almost no water
    if (S.dry) {
      const short = Math.min(w, h);
      FIELD ??= orientationField(SRC, w, h, gaussian, { sigma: 2 });
      const want = Float32Array.from(S.dry.want, (v, i) => (keep && keep[i] ? 0 : v));
      const marks = furMarks(want, FIELD, w, h, { length: Math.max(4, Math.round(num('loosedrylen', 0.04) * short)), spacing: Math.max(2, Math.round(num('loosedrygap', 0.006) * short)), seed: 9301 + SEED, coverage: S.dry.coverage, minWant: 0.03, curl: num('loosedrycurl', 0) });
      const every = flowEvery(marks.length), tot = marks.reduce((a, m) => a + m.length, 0) || 1;
      const rD = Math.max(0.8 * SC, num('loosedrybrush', 0.0035) * Math.min(W2, H2));
      let st = 0;
      for (const [q, m] of marks.entries()) {
        const c = m[m.length >> 1], ci = Math.min(n - 1, Math.max(0, Math.round(c.y) * w + Math.round(c.x)));
        const wv = m.reduce((a, x) => a + x.want, 0) / m.length;
        const dir = Array.from({ length: K }, (_, j) => S.dry.dir[ci * K + j]);
        const pts = m.map(x => ({ x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: rD, p: x.p != null ? x.p : 0.8 }));
        const b = createBrush({ radius: rD, bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, seed: 9401 + q + SEED });
        dip(b, { water: num('loosedrywater', 0.22), conc: dir.map(v => v * wv * STRENGTH * (CAL['dry brush'] ?? 1) * (plan.dials?.loosedrystrength ?? num('loosedrystrength', 1.3))) });
        clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
        for (const x of m) { const i = Math.round(x.y) * w + Math.round(x.x); if (i >= 0 && i < n) { dryHits[i]++; for (let j = 0; j < K; j++) expected[i * K + j] += dir[j] * x.want * 0.5; } }
        laid++;
        await film(mass[k] * 0.9 * m.length / tot);
      }
      count(`practice ${S.key}: dry-brush strokes`, marks.length);
      log(`practice ${S.key}: ${marks.length} dry-brush strokes of radius ${rD.toFixed(1)} along the form`);
    }
    // the small brush at the focus, where the stage asks for it
    if (S.marks) {
      const short = Math.min(w, h);
      const r4 = Math.max(0.6 * SC, num('practicebrush4', 0.008) * Math.min(W2, H2));
      const want = Float32Array.from(S.marks.want, (v, i) => (keep && keep[i] ? 0 : v));
      const marks = detailMarks(want, w, h, { length: Math.max(4, Math.round(0.035 * short)), spacing: Math.max(2, Math.round(0.008 * short)), seed: 9001 + SEED, coverage: markCover, minWant: 0.03 });
      const every = flowEvery(marks.length), tot = marks.reduce((a, m) => a + m.length, 0) || 1;
      let st = 0;
      for (const [q, m] of marks.entries()) {
        const c = m[m.length >> 1], ci = Math.round(c.y) * w + Math.round(c.x);
        const wv = m.reduce((a, x) => a + x.want, 0) / m.length;
        const dir = Array.from({ length: K }, (_, j) => S.marks.dir[ci * K + j]);
        const pts = m.map(x => ({ x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: r4, p: Math.min(1, 0.45 + 0.55 * x.want / Math.max(1e-4, wv)) }));
        const b = createBrush({ radius: r4, bristles: Math.max(8, Math.ceil(r4 * 3)), capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: 0.15, bridge: 0.55, bridgeSoft: 1.2, streak: 0.5, seed: 9101 + q + SEED });
        dip(b, { water: num('practicewater4', 0.4), conc: dir.map(v => v * wv * STRENGTH * (CAL['wet on dry'] ?? 1) * num('practicestrength4', 2.0)) });
        clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
        for (const x of m) { const i = Math.round(x.y) * w + Math.round(x.x); for (let j = 0; j < K; j++) expected[i * K + j] += dir[j] * x.want; }
        laid++;
        await film(mass[k] * m.length / tot);
      }
      count(`practice ${S.key}: small-brush marks`, marks.length);
      log(`practice ${S.key}: ${marks.length} small-brush marks of radius ${r4.toFixed(1)} at the focus`);
    }
    settle(40); dryAll(); dries++;
    if (k === 0) {
      // After the first stage dries, the frisket comes off and goes back on over the planned lights plus cells left
      // light where the source is light too. setClip also keeps every brush off them.
      if (nl) { liftResist(sheet); clock('dry', () => dry(sheet, 20000, O, { levelMax: 200 })); }
      const D = ctx.densityNow(), lim = num('practicekeep', 0.10), srcLim = num('practicekeepsrc', 0.14);
      keep = Uint8Array.from(LIGHTS);
      let extra = 0;
      for (let i = 0; i < n; i++) if (!keep[i] && union[i] && D[i] < lim && SRC[i] < srcLim) { keep[i] = 1; extra++; }
      log(`practice: ${nl} planned lights and ${extra} more cells the first stage left light where the source is light, held from here on`);
    }
    await endStage();
    if (k === 0) { applyResist(sheet, up(keep)); setClip(sheet, up(Uint8Array.from(keep, v => 1 - v))); }
  }
  setClip(sheet, null);
  liftResist(sheet); clock('dry', () => dry(sheet, 20000, O, { levelMax: 200 }));
  {
    // Uncovered lights above paper white (--practicepaper, source density) get --practicetone of the plan (0 = off)
    // as a pale wash, piece by piece. Pieces under --practicetonemin of the sheet stay bare: small toned pieces read as confetti.
    const paperAt = num('practicepaper', 0.04), share = num('practicetone', 0);
    const TONE = Uint8Array.from({ length: n }, (_, i) => (LIGHTS[i] && SRC[i] >= paperAt && plan.painted[i] ? 1 : 0));
    let nt = 0, sweeps = 0; for (let i = 0; i < n; i++) nt += TONE[i];
    if (nt && share > 0) {
      const amountAt = (x, y) => { const i = y * w + x; return Array.from({ length: K }, (_, j) => ctx.A[i * K + j] * share); };
      for (const [q, cells] of pieces(TONE, w, h, { min: Math.max(8, Math.round(num('practicetonemin', 0.0015) * n)) }).entries()) {
        const m = new Uint8Array(n); for (const i of cells) m[i] = 1;
        sweeps += await lay(m, { radius: Math.max(SC, Math.min(Math.round(0.5 * BRUSH), Math.round(0.4 * Math.sqrt(cells.length * SC * SC / Math.PI)))), T: TECH.dry, amountAt, seed: 8101 + q + SEED });
        for (const i of cells) for (let j = 0; j < K; j++) expected[i * K + j] += ctx.A[i * K + j] * share;
      }
      count('practice: lights toned', sweeps);
      settle(20); dryAll();
      log(`practice: ${nt} light cells above paper white toned at ${share} of their own tint, in ${sweeps} sweeps`);
    }
  }
  log(`practice: ${dries} dries between stages, ${laid} sweeps and marks`);
  {
    // passages per cell, over the painted cells: washes (lane passages) and all marks
    let c = 0, sw = 0, mw = 0, sa = 0, ma = 0; const hist = new Array(6).fill(0);
    for (let i = 0; i < n; i++) if (plan.painted[i]) { c++; sw += washes[i]; mw = Math.max(mw, washes[i]); const all = washes[i] + dryHits[i]; sa += all; ma = Math.max(ma, all); hist[Math.min(5, washes[i])]++; }
    log(`practice: washes per painted cell mean ${(sw / Math.max(1, c)).toFixed(2)}, max ${mw} (${hist.map((v, k) => `${k}${k === 5 ? '+' : ''}: ${(100 * v / Math.max(1, c)).toFixed(0)}%`).join(', ')}); with dry-brush strokes mean ${(sa / Math.max(1, c)).toFixed(2)}, max ${ma}`);
    if (ctx.out) ctx.fs.writeFileSync(ctx.path.join(ctx.out, 'practice.json'), JSON.stringify({ style: plan.style ?? null, dials: plan.dials ?? null, washesMean: +(sw / Math.max(1, c)).toFixed(3), washesMax: mw, washesHist: hist.map(v => +(v / Math.max(1, c)).toFixed(4)), allMean: +(sa / Math.max(1, c)).toFixed(3), allMax: ma }, null, 1));
  }

  // the closing pen: the focal zone widened by a head's width, and within it the darker part of the picture
  const dark = quantile(Array.from(plan.T).filter((v, i) => plan.painted[i]), num('practicependark', 0.6));
  const wide = ctx.dilate(plan.focalZone, w, h, Math.max(2, Math.round(num('practicepenreach', 0.03) * Math.min(w, h))));
  const zone = Uint8Array.from({ length: n }, (_, i) => (wide[i] && plan.T[i] >= dark ? 1 : 0));
  let nz = 0; for (let i = 0; i < n; i++) nz += zone[i];
  log(`practice: the closing pen is kept to ${(100 * nz / n).toFixed(1)}% of the sheet, the focal darks`);
  if (plan.dials && plan.dials.loosepen >= 1) { log('practice: an ink-led piece, the closing pen is kept whole'); return { laid, cutPen: null }; }
  return { laid, cutPen: focalDarkCut({ zone: ctx.dilate(zone, w, h, Math.max(1, Math.round(0.006 * Math.min(w, h)))), w, h }) };
}
