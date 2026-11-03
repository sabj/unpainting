// A paint plan handed over by another page (the mushroom plates' "Open in Paint Lab"), checked field by field and turned
// into a live tape (live-tape.js) so the lab's own replay paints it: pen strokes, brush dips and strokes, passage clips,
// flows and drying, all at the plan's native sheet size. Only lab.js loads this, and only with ?import=. DOM free.
const PLAN_FORMAT = 'unpainting-paint-plan', PLAN_VERSION = 1;
export const PLAN_STORAGE_KEY = 'unpainting:paint-lab-import';
const PLAN_LIMITS = Object.freeze({ chars: 4500000, cells: 600000, side: 2000, pigments: 16, inkStrokes: 20000, points: 4000, gestures: 5000, steps: 20000 });
const MM = 25.4;

const fail = (path, why) => { throw new TypeError(`${path} ${why}`); };
const num = (v, path, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fail(path, `must be a number from ${lo} to ${hi}`));
const int = (v, path, lo, hi) => (Number.isInteger(num(v, path, lo, hi)) ? v : fail(path, 'must be a whole number'));
const bool = (v, path) => (typeof v === 'boolean' ? v : fail(path, 'must be true or false'));
const str = (v, path, max = 200) => (typeof v === 'string' && v.length <= max ? v : fail(path, `must be text of at most ${max} characters`));
const obj = (v, path) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fail(path, 'must be an object'));
const arr = (v, path, min = 0, max = Infinity) => (Array.isArray(v) && v.length >= min && v.length <= max ? v : fail(path, `must be a list of ${min} to ${max} items`));
const only = (v, path, keys) => { for (const k of Object.keys(v)) if (!keys.includes(k)) fail(`${path}.${k}`, 'is not part of the plan'); return v; };
// Options handed to a media constructor: plain finite numbers or booleans, nested once for the paper's cold-press field.
function options(v, path, depth = 1) {
  obj(v, path);
  for (const [k, x] of Object.entries(v)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(k)) fail(`${path}.${k}`, 'is not an option name');
    if (typeof x === 'boolean') continue;
    if (Array.isArray(x)) { arr(x, `${path}.${k}`, 1, 8).forEach((y, i) => num(y, `${path}.${k}[${i}]`)); continue; }
    if (x && typeof x === 'object' && depth > 0) { options(x, `${path}.${k}`, depth - 1); continue; }
    num(x, `${path}.${k}`);
  }
  return v;
}
// Clip runs [start, length, ...] over the sheet's cells, increasing and inside it.
function runs(v, path, n) {
  arr(v, path, 0, n);
  if (v.length % 2) fail(path, 'must hold start and length pairs');
  let end = 0;
  for (let i = 0; i < v.length; i += 2) { int(v[i], `${path}[${i}]`, end, n - 1); int(v[i + 1], `${path}[${i + 1}]`, 1, n - v[i]); end = v[i] + v[i + 1]; }
  return v;
}
function points(v, path, w, h, last) {
  arr(v, path, 2, PLAN_LIMITS.points);
  v.forEach((q, i) => { arr(q, `${path}[${i}]`, 4, 4); num(q[0], `${path}[${i}][0]`, -w, 2 * w); num(q[1], `${path}[${i}][1]`, -h, 2 * h); num(q[2], `${path}[${i}][2]`, 0, 1); num(q[3], `${path}[${i}][3]`, 0, last); });
  return v;
}
function load(v, path, k) { arr(v, path, k, k).forEach((x, i) => num(x, `${path}[${i}]`, 0, 1000)); return v; }
function dry(v, path) {
  only(obj(v, path), path, ['inPlace', 'maxSteps', 'levelSteps', 'dt', 'transport']);
  if (v.inPlace !== undefined) bool(v.inPlace, `${path}.inPlace`);
  if (!v.inPlace) { int(v.maxSteps, `${path}.maxSteps`, 0, PLAN_LIMITS.steps); int(v.levelSteps, `${path}.levelSteps`, 0, PLAN_LIMITS.steps); num(v.dt, `${path}.dt`, 0.01, 10); }
  if (v.transport !== undefined) transport(v.transport, `${path}.transport`);
  return v;
}
function transport(v, path) { options(v, path, 0); if (v.dt !== undefined) num(v.dt, `${path}.dt`, 0, 10); return v; }

/** Throws a TypeError naming the first field that does not fit; returns the plan otherwise. */
function validatePlan(plan, knownPigment) {
  only(obj(plan, 'plan'), 'plan', ['format', 'version', 'source', 'title', 'sheet', 'pigments', 'ink', 'passages']);
  if (plan.format !== PLAN_FORMAT) fail('plan.format', `must be "${PLAN_FORMAT}"`);
  if (plan.version !== PLAN_VERSION) fail('plan.version', `must be ${PLAN_VERSION}`);
  str(plan.source, 'plan.source', 40); str(plan.title, 'plan.title');
  const sheet = only(obj(plan.sheet, 'plan.sheet'), 'plan.sheet', ['width', 'height', 'mmPerCell', 'paper', 'paperRGB', 'paperShade']);
  const w = int(sheet.width, 'plan.sheet.width', 16, PLAN_LIMITS.side), h = int(sheet.height, 'plan.sheet.height', 16, PLAN_LIMITS.side), n = w * h;
  if (n > PLAN_LIMITS.cells) fail('plan.sheet', `must have at most ${PLAN_LIMITS.cells} cells`);
  num(sheet.mmPerCell, 'plan.sheet.mmPerCell', 0.02, 5); options(sheet.paper, 'plan.sheet.paper');
  arr(sheet.paperRGB, 'plan.sheet.paperRGB', 3, 3).forEach((c, i) => num(c, `plan.sheet.paperRGB[${i}]`, 0, 255));
  num(sheet.paperShade, 'plan.sheet.paperShade', 0, 1);
  const pigments = arr(plan.pigments, 'plan.pigments', 1, PLAN_LIMITS.pigments), k = pigments.length;
  pigments.forEach((key, i) => { str(key, `plan.pigments[${i}]`, 40); if (!knownPigment(key)) fail(`plan.pigments[${i}]`, `"${key}" is not a lab pigment`); });
  if (new Set(pigments).size !== k) fail('plan.pigments', 'must not repeat a pigment');
  const ink = only(obj(plan.ink, 'plan.ink'), 'plan.ink', ['pigment', 'concentration', 'mix', 'amount', 'pen', 'minWidth', 'dipLength', 'dry', 'strokes']);
  if (!pigments.includes(ink.pigment)) fail('plan.ink.pigment', 'must be one of plan.pigments');
  num(ink.concentration, 'plan.ink.concentration', 0, 50); num(ink.amount, 'plan.ink.amount', 0, 1);
  // mix: other pigments in the ink, pigment per unit of water, to darken the walnut toward a plate's near-black
  if (ink.mix !== undefined) for (const [key, c] of Object.entries(obj(ink.mix, 'plan.ink.mix'))) { if (!pigments.includes(key) || key === ink.pigment) fail(`plan.ink.mix.${key}`, 'must be another of plan.pigments'); num(c, `plan.ink.mix.${key}`, 0, 50); }
  options(ink.pen, 'plan.ink.pen', 0); num(ink.minWidth, 'plan.ink.minWidth', 0, 20); num(ink.dipLength, 'plan.ink.dipLength', 1, 1e6);
  dry(ink.dry, 'plan.ink.dry');
  arr(ink.strokes, 'plan.ink.strokes', 0, PLAN_LIMITS.inkStrokes).forEach((s, i) => {
    const path = `plan.ink.strokes[${i}]`; only(obj(s, path), path, ['role', 'points']);
    if (s.role !== undefined) str(s.role, `${path}.role`, 60);
    points(s.points, `${path}.points`, w, h, 50);
  });
  let gestures = 0;
  arr(plan.passages, 'plan.passages', 0, 64).forEach((p, i) => {
    const path = `plan.passages[${i}]`;
    only(obj(p, path), path, ['id', 'kind', 'flat', 'transport', 'marks', 'settle', 'dry']);
    str(p.id, `${path}.id`, 80); if (!['wash', 'glaze', 'accent'].includes(p.kind)) fail(`${path}.kind`, 'must be wash, glaze or accent');
    bool(p.flat, `${path}.flat`); transport(p.transport, `${path}.transport`); dry(p.dry, `${path}.dry`);
    if (p.settle !== null) { only(obj(p.settle, `${path}.settle`), `${path}.settle`, ['steps', 'dt']); int(p.settle.steps, `${path}.settle.steps`, 0, 1000); num(p.settle.dt, `${path}.settle.dt`, 0, 10); }
    arr(p.marks, `${path}.marks`, 1, 2000).forEach((m, j) => {
      const at = `${path}.marks[${j}]`; only(obj(m, at), at, ['role', 'clip', 'gestures']);
      if (m.role !== undefined) str(m.role, `${at}.role`, 60);
      if (m.clip !== null) runs(m.clip, `${at}.clip`, n);
      arr(m.gestures, `${at}.gestures`, 1, 200).forEach((g, q) => {
        const gp = `${at}.gestures[${q}]`; only(obj(g, gp), gp, ['prewet', 'brush', 'water', 'load', 'spacing', 'flowAfter', 'points']);
        bool(g.prewet, `${gp}.prewet`); bool(g.flowAfter, `${gp}.flowAfter`); options(g.brush, `${gp}.brush`, 0);
        num(g.brush.radius, `${gp}.brush.radius`, 0.1, 400); num(g.water, `${gp}.water`, 0, 10); num(g.spacing, `${gp}.spacing`, 0.05, 10);
        load(g.load, `${gp}.load`, k); points(g.points, `${gp}.points`, w, h, 400);
        if (++gestures > PLAN_LIMITS.gestures) fail('plan.passages', `must hold at most ${PLAN_LIMITS.gestures} brush gestures`);
      });
    });
  });
  return plan;
}

/** Parse and check stored text. Returns { plan } or { error } with a reader's reason. */
export function readPlan(text, knownPigment) {
  if (typeof text !== 'string' || !text) return { error: 'No mushroom plate was handed over. Open it again from the plate.' };
  if (text.length > PLAN_LIMITS.chars) return { error: 'The mushroom plate is too large to open here.' };
  let plan;
  try { plan = JSON.parse(text); } catch { return { error: 'The mushroom plate could not be read.' }; }
  try { return { plan: validatePlan(plan, knownPigment) }; } catch (e) { return { error: `The mushroom plate does not fit Paint Lab: ${e.message}.` }; }
}

// A sheet a whole number of cells across at its real size: dots per inch and inches, rounded for display only when the
// rounded figures still give the same cells.
function sheetSize(w, h, mmPerCell) {
  const exact = MM / mmPerCell, dpi = Math.round(exact * 100) / 100, paperIn = [Math.round(w / dpi * 100) / 100, Math.round(h / dpi * 100) / 100];
  if (Math.round(paperIn[0] * dpi) === w && Math.round(paperIn[1] * dpi) === h) return { dpi, paperIn };
  return { dpi: exact, paperIn: [w / exact, h / exact] };
}
const dryMark = (d, fallback) => d.inPlace ? { k: 'y', m: 0, o: d.transport ?? fallback } : { k: 'y', m: d.maxSteps, l: d.levelSteps, lm: d.levelSteps, lt: 0.02, dt: d.dt, o: d.transport ?? fallback };

/**
 * A version 2 live tape at the plan's native resolution, and where to stop: `inkEnd` is the index of the mark that dries
 * the pen drawing (the replay pauses after it). `pigment(key)` is the lab's pigment record. Per-event `o` carries a
 * passage's transport options for its flows and drying.
 */
export function planToTape(plan, pigment) {
  const { width: w, height: h, mmPerCell, paper, paperRGB, paperShade } = plan.sheet, { dpi, paperIn } = sheetSize(w, h, mmPerCell);
  const k = plan.pigments.length, ink = plan.ink, inkAt = plan.pigments.indexOf(ink.pigment);
  const marks = [], brushOpts = [];
  const conc = plan.pigments.map((key, i) => (i === inkAt ? ink.concentration : ink.mix?.[key] ?? 0));
  let since = Infinity, strokes = 0;
  for (const s of ink.strokes) {
    if (since >= ink.dipLength) { marks.push({ k: 'D', pen: 0, ink: conc, a: ink.amount }); since = 0; }
    const pts = s.points.map(([x, y, p, nw]) => ({ x, y, p, v: 1, dwell: 0, nw: Math.max(ink.minWidth, nw) }));
    for (let i = 1; i < pts.length; i++) since += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    marks.push({ k: 'P', pen: 0, points: pts, sp: 0.5 }); strokes++;
  }
  const inkEnd = marks.length; marks.push(dryMark(ink.dry, ink.dry.transport));
  for (const passage of plan.passages) {
    for (const mark of passage.marks) {
      marks.push(mark.clip ? { k: 'c', r: mark.clip } : { k: 'c' });
      for (const g of mark.gestures) {
        const b = brushOpts.push({ ...g.brush }) - 1;
        marks.push({ k: 'd', b, w: g.water, c: g.load });
        marks.push({ k: 's', b, points: g.points.map(([x, y, p, r]) => ({ x, y, p, r })), sp: g.spacing, lf: 1 }); strokes++;
        if (g.flowAfter) marks.push({ k: 'f', o: passage.transport });
      }
    }
    marks.push({ k: 'c' });
    for (let i = 0; i < (passage.settle?.steps ?? 0); i++) marks.push({ k: 'f', o: { ...passage.transport, dt: passage.settle.dt } });
    marks.push(dryMark(passage.dry, passage.transport));
  }
  const tape = {
    version: 2, w, h, scale: 10, dpi, paperIn, title: plan.title, source: plan.source,
    paper: structuredClone(paper), paperRGB: [...paperRGB], paperShade,
    pigments: plan.pigments.map(pigment), opts: {}, brushOpts, brushes: [], penOpts: [{ ...ink.pen }], pens: [],
    marks, strokeCount: strokes, inkStrokes: ink.strokes.length,
  };
  return { tape, inkEnd, washes: plan.passages.length };
}
