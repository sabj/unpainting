import test from 'node:test';
import assert from 'node:assert/strict';
import { valueGroups, skyMask, planPenWash, paletteRoles, passageAmounts, fitMix, contrastDarks, PENWASH_MAX_PASSAGES } from './pen-wash-plan.mjs';
import { prunePenLines } from './pen-wash-lines.mjs';
import { washFootprint } from './pen-wash.mjs';
import { expandRecipe, styleAlias } from '../recipe.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const W = 120, H = 90, N = W * H;
// a limited palette of real box paints: blue, yellow earth, red earth
const PIGS = ['ultramarine', 'ochre', 'sienna'].map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));

// A pale sky over a mid building with a dark shadow side, on a light street: grey, so the planner treats it as monochrome.
function scene() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const building = x > 40 && x < 80 && y > 15 && y < 70, shadow = building && x > 64;
    const v = shadow ? 55 : building ? 140 : y >= 70 ? 225 : 235;
    px.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3);
  }
  return { px };
}

test('the three-value map keeps white paper and stays three flat groups', () => {
  const L = Float32Array.from({ length: N }, (_, i) => 100 * (i % W) / W);
  const { groups, shares } = valueGroups(L, W, H, { sigma: 2, minLight: 0.3, maxDark: 0.2 });
  assert.ok(shares[0] >= 0.29, `light share ${shares[0]}`);
  assert.ok(shares[2] <= 0.21, `dark share ${shares[2]}`);
  assert.deepEqual([...new Set(groups)].sort(), [0, 1, 2]);
  // light to dark runs right to left, as the luminance does
  assert.equal(groups[W - 1], 0); assert.equal(groups[0], 2);
});

test('the sky is the light reached from the top edge', () => {
  const g = new Uint8Array(N).fill(1); for (let i = 0; i < W * 20; i++) g[i] = 0; for (let i = N - W * 5; i < N; i++) g[i] = 0;
  const s = skyMask(g, W, H);
  assert.equal(s.reduce((a, v) => a + v, 0), W * 20, 'the light street at the bottom is not sky');
});

test('the value planner makes a few connected washes: sky, local colour, shadow', () => {
  const { px } = scene();
  const plan = planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5 });
  const ids = plan.passages.map(p => p.id);
  assert.ok(plan.monochrome);
  assert.ok(plan.passages.length >= 3 && plan.passages.length <= PENWASH_MAX_PASSAGES, ids.join());
  assert.equal(ids[0], 'sky'); assert.ok(ids.includes('shadow')); assert.ok(ids.some(id => id.startsWith('local')));
  const roles = paletteRoles(PIGS);
  assert.equal(roles.cool, 0); assert.ok(plan.passages[0].dir[roles.cool] > 0.5, 'the sky is mostly the blue');
  for (const p of plan.passages) {
    assert.ok(Math.abs(p.dir.reduce((a, v) => a + v, 0) - 1) < 1e-6, `${p.id} mix sums to one`);
    assert.ok(p.strength > 0 && p.strength <= 0.32, `${p.id} stays a transparent wash`);
  }
  // the shadow glaze sits on the shadow side only, and the lit street stays paper under every wash but the sky
  const shadow = plan.passages.find(p => p.id === 'shadow');
  assert.equal(shadow.mask[40 * W + 72], 1); assert.equal(shadow.mask[40 * W + 50], 0);
  for (const p of plan.passages.slice(1)) assert.equal(p.mask[85 * W + 10], 0, `${p.id} leaves the street white`);
  const deep = planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5, options: { skyStrength: 0.2, skyTo: 0.6 } }).passages[0];
  assert.equal(deep.strength, 0.2); assert.equal(deep.grade.to, 0.6);
  // a graded sky is darker at the top
  const a = passageAmounts(plan.passages[0], W, H, 3);
  assert.ok(a[(2 * W + 10) * 3] > a[(12 * W + 10) * 3]);
});

test('the colour-region planner is the comparison: flat washes per region, light regions left', () => {
  const { px } = scene();
  const plan = planPenWash({ planner: 'colour', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5 });
  assert.ok(plan.passages.length >= 1 && plan.passages.length <= PENWASH_MAX_PASSAGES);
  assert.ok(plan.passages.every(p => p.role === 'region' && !p.grade));
  assert.throws(() => planPenWash({ planner: 'cells', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5 }), /values or colour/);
});

test('line pruning keeps structure whole and thins small repeated marks, most in the light', () => {
  const groups = new Uint8Array(N); for (let i = 0; i < N; i++) groups[i] = (i % W) < W / 2 ? 0 : 2;
  const box = (x, y) => ({ points: [{ x, y, weight: 1 }, { x: x + 2, y, weight: 1 }, { x: x + 2, y: y + 3, weight: 1 }, { x, y: y + 3, weight: 1 }], length: 10 });
  const windows = []; for (let y = 4; y < H - 6; y += 5) for (let x = 2; x < W - 4; x += 4) windows.push(box(x, y));
  const wall = { points: [{ x: 1, y: 1, weight: 1 }, { x: 1, y: H - 2, weight: 1 }], length: H - 3 };
  const speck = { points: [{ x: 50, y: 50 }, { x: 50.5, y: 50 }], length: 0.5 };
  const { lines, stats } = prunePenLines([wall, speck, ...windows], { w: W, h: H, mmPerCell: 0.5, groups, seed: 3 });
  assert.ok(lines.includes(wall) || lines.some(g => g.points.length === 2 && g.length === wall.length), 'structure kept');
  assert.ok(!lines.includes(speck)); assert.equal(stats.short, 1);
  const kept = lines.filter(g => g !== wall && g.length === 10);
  const lit = kept.filter(g => g.points[0].x < W / 2).length, shade = kept.filter(g => g.points[0].x >= W / 2).length;
  assert.ok(kept.length < windows.length, 'some windows omitted');
  assert.ok(shade > lit, `the shadow side keeps more (${shade} vs ${lit})`);
  assert.deepEqual(prunePenLines([wall, speck, ...windows], { w: W, h: H, mmPerCell: 0.5, groups, seed: 3 }).stats, stats, 'deterministic');
  // a long line over lit paper is drawn lighter
  const litWall = lines.find(g => g.length === wall.length);
  assert.ok(litWall.points[0].weight < 1);
});

// Under a pale sky and a dark cornice, a sunlit ochre wall (pale but clearly yellow) with a narrow cast shadow across it, over a grey pavement.
function warmScene() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sky = y < 10, cornice = y >= 10 && y < 15, wall = y < 60, stripe = wall && !sky && Math.abs(x - y - 30) < 3;
    const c = sky ? [225, 232, 240] : cornice ? [150, 130, 100] : stripe ? [120, 110, 105] : wall ? (x < 60 ? [242, 226, 172] : [205, 178, 120]) : [240, 240, 238];
    px.set(c, (y * W + x) * 3);
  }
  return px;
}

test('a coloured light takes the local wash, a capped wash keeps its hue, and a fine read keeps a cast shadow', () => {
  const px = warmScene(), at = (x, y) => y * W + x;
  const common = { minLight: 0.6, hueGap: 18 }, base = planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5, options: common });
  const warm = planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5, options: { ...common, lightChroma: 14, localMax: 0.22, capLWeight: 0.3, shadowBlurMm: 0.6, shadowMaxDark: 0.3 } });
  const local = plan => ({ mask: Uint8Array.from({ length: N }, (_, i) => (plan.passages.some(p => p.role === 'local' && p.mask[i]) ? 1 : 0)) });
  assert.equal(local(base).mask[at(30, 30)], 0, 'without lightChroma the sunlit wall stays paper');
  assert.equal(local(warm).mask[at(30, 30)], 1, 'the sunlit ochre wall takes the local wash');
  assert.equal(local(warm).mask[at(10, 80)], 0, 'the grey pavement stays paper');
  const roles = paletteRoles(PIGS), l = warm.passages.find(p => p.role === 'local' && p.mask[at(30, 30)]);
  assert.ok(l.strength <= 0.22 && l.dir[roles.cool] < 0.2, `a capped local wash is no grey: ${l.dir.map(v => v.toFixed(2))}`);
  assert.ok(warm.passages.some(p => p.role === 'shadow' && p.mask[at(55, 25)]), 'the narrow cast shadow keeps its own glaze');
  // a hue-weighted fit picks the yellow earth for a pale yellow, where the full-weight fit at a low cap may grey it
  const f = fitMix([74, 2, 18], PIGS, [247, 244, 236], [0.04, 0.08, 0.15, 0.2], 0.3);
  assert.ok(f.dir[roles.warm] >= 0.5, `fit ${f.dir}`);
});

test('foliage gets its own green wash and the shadow pattern can be one connected wash', () => {
  // the warm scene with a green shrub on the wall's lower left and two cast shadows a few cells apart
  const px = warmScene(), at = (x, y) => y * W + x;
  for (let y = 40; y < 58; y++) for (let x = 2; x < 30; x++) px.set([70, 110, 50], at(x, y) * 3);
  for (let y = 20; y < 40; y++) for (let x = 80; x < 86; x++) px.set([120, 110, 105], at(x, y) * 3);
  for (let y = 20; y < 40; y++) for (let x = 89; x < 95; x++) px.set([120, 110, 105], at(x, y) * 3);
  const plan = planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5, options: { minLight: 0.6, hueGap: 18, shadowBlurMm: 0.6, foliageGreen: 5, shadowOneMm: 3 } });
  const foliage = plan.passages.find(p => p.id === 'foliage'), shadows = plan.passages.filter(p => p.id.startsWith('shadow'));
  assert.ok(foliage && foliage.mask[at(15, 50)], 'the shrub has its own wash');
  assert.equal(foliage.mask[at(30, 30)], 0, 'the ochre wall is not foliage');
  assert.equal(shadows.length, 1, plan.passages.map(p => p.id).join());
  assert.equal(shadows[0].mask[at(15, 50)], 0, 'the shadow glaze keeps off the foliage');
  assert.equal(shadows[0].mask[at(87, 30)], 1, 'the gap between the two cast shadows is closed: one wash');
});

test('the deep glaze rule keeps a dark that stands out from its surround, not one inside a dark mass', () => {
  // a light field with a dark opening on the left, and on the right a dark patch inside a mid-dark mass
  const L = new Float32Array(N).fill(85), at = (x, y) => y * W + x;
  for (let y = 30; y < 60; y++) for (let x = 10; x < 25; x++) L[at(x, y)] = 20;
  for (let y = 10; y < 80; y++) for (let x = 60; x < 115; x++) L[at(x, y)] = 32;
  for (let y = 30; y < 60; y++) for (let x = 80; x < 95; x++) L[at(x, y)] = 22;
  const m = contrastDarks(L, W, H, { share: 0.08, minArea: 40, ring: 5, contrast: 15 });
  assert.equal(m[at(17, 45)], 1, 'the opening in the lit wall is kept');
  assert.equal(m[at(87, 45)], 0, 'a dark that only shades into a dark mass is not');
  assert.equal(m[at(40, 45)], 0);
});

test('with vary, pen weight follows structure and the shadow side', () => {
  const groups = new Uint8Array(N); for (let i = 0; i < N; i++) groups[i] = (i % W) < W / 2 ? 0 : 2;
  const line = (x, len) => ({ points: [{ x, y: 10, weight: 1, width: 2 }, { x, y: 10 + len, weight: 1, width: 2 }], length: len });
  const shadeWall = line(100, 60), litWall = line(10, 60), litMark = line(20, 8);
  const { lines } = prunePenLines([shadeWall, litWall, litMark], { w: W, h: H, mmPerCell: 0.5, groups, seed: 3, options: { vary: 0.6, keepAbove: -99 } });
  const [a, b, c] = [100, 10, 20].map(x => lines.find(g => g.points[0].x === x));
  assert.equal(a.points[0].weight, 1, 'long shadow-side structure stays full');
  assert.ok(b.points[0].weight < 1 && c.points[0].weight < b.points[0].weight, 'lit lines lighter, short lit detail lightest');
  assert.ok(a.points[0].width > 2 && c.points[0].width < 2, 'width follows the same score');
});

test('the one shadow wash can keep the lights inside it', () => {
  // a shaded wall with a sunlit patch in its middle
  const px = warmScene(), at = (x, y) => y * W + x;
  for (let y = 20; y < 58; y++) for (let x = 62; x < 118; x++) px.set([110, 100, 90], at(x, y) * 3);
  for (let y = 32; y < 44; y++) for (let x = 80; x < 96; x++) px.set([235, 215, 160], at(x, y) * 3);
  const opts = { minLight: 0.6, hueGap: 18, shadowBlurMm: 0.6, shadowOneMm: 3 };
  const shadowOf = o => planPenWash({ planner: 'values', px, w: W, h: H, pigments: PIGS, mmPerCell: 0.5, options: o }).passages.find(p => p.id === 'shadow');
  assert.equal(shadowOf(opts).mask[at(88, 38)], 1, 'closed over by default');
  const kept = shadowOf({ ...opts, keepLights: 10, keepLightsMm2: 4 });
  assert.equal(kept.mask[at(88, 38)], 0, 'the sunlit patch stays out of the glaze');
  assert.equal(kept.mask[at(70, 50)], 1, 'the shade around it is still glazed');
});

test('a wash footprint slips off its shape, breaks its edge and keeps off the border', () => {
  const m = new Uint8Array(N); for (let y = 20; y < 60; y++) for (let x = 30; x < 90; x++) m[y * W + x] = 1;
  const f = washFootprint(m, W, H, { slip: 4, angle: 0, edgeSigma: 1, edgeAmp: 0 });
  assert.equal(f[40 * W + 31], 0); assert.equal(f[40 * W + 92], 1);
  const loud = Float32Array.from({ length: N }, (_, i) => (i % 7 === 0 ? 3 : -3)), g = washFootprint(m, W, H, { edgeSigma: 1, edgeAmp: 0.3, noise: loud });
  assert.equal(g[7 * W], 0, 'edge noise raises no island far from the shape');
  const full = new Uint8Array(N).fill(1), v = washFootprint(full, W, H, { margin: 6, edgeAmp: 0 });
  assert.equal(v[0], 0); assert.equal(v[45 * W + 60], 1);
});

test('--style penwash names the pen-and-wash recipe; the default recipe is unchanged', () => {
  assert.deepEqual(styleAlias(['--image', 'a.jpg', '--style', 'penwash']), ['--recipe', 'penwash', '--image', 'a.jpg']);
  assert.deepEqual(styleAlias(['--style', '0.5']), ['--style', '0.5']);
  assert.throws(() => styleAlias(['--recipe', 'v096', '--style', 'penwash']), /conflicts/);
  const pen = expandRecipe({ argv: ['--image', 'a.jpg', '--style', 'penwash'] }).argv;
  const at = k => pen[pen.lastIndexOf(k) + 1];
  assert.equal(at('--penwash'), '1'); assert.equal(at('--drawing'), 'first'); assert.equal(at('--touchpoints'), '0');
  assert.equal(at('--pwallwet'), '1'); assert.equal(at('--pwminlight'), '0.7');
  assert.ok(!pen.includes('--style'));
  const def = expandRecipe({ argv: ['--image', 'a.jpg'] }).argv;
  assert.ok(!def.includes('--penwash'));
  assert.equal(def[def.lastIndexOf('--touchpoints') + 1], '2');
});
