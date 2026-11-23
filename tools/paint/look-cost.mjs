// What a look costs, in a unit that does not depend on the machine: RENDERING. One full look of the whole plan on
// the whole sheet costs 1. A look stopped after a stage the model names costs that stage's share of the painting's
// work, taken as the share of the plan's washes laid by then; a look of a region costs the share of the script's
// passages that touch the region and so are painted (and both together, their product). A region is not priced by
// its area: measured (22 Nov, the same script), a box of a quarter of the sheet touched 42 of the 46 passages and
// its look took 0.71 of the full look's time; the passages' share says 0.91, the area's 0.26. Why washes and not strokes: measured on three real looks of one script
// (22 Nov, Mittens close-up, 46 washes, 525 strokes, half size, one machine), a look stopped after stage 1 took 0.36
// of the full look's time and after stage 3 took 0.68; the share of washes says 0.28 and 0.76, the share of strokes
// 0.34 and 0.94: the late stages are few strokes but many sittings, each with its own drying. The cost is computed from the plan, before anything is painted, and told to the
// model before it is spent; a try's budget is a number of these units (default 5). Machine seconds are recorded
// beside each look and never charged. Pure: nothing is read or written here.

/** The rendering budget of one try, in units, when the command line names none. */
export const DEFAULT_LOOK_UNITS = 5;
/** The least any look costs: the sheet is set up, the drawing laid and the paper dried whatever is painted on it. */
export const LEAST_LOOK_COST = 0.05;
const round = v => +v.toFixed(2);

/** What a look is asked of: {until: a stage (1 to 5) or null, region: [x0, y0, x1, y1] mm or a named form or null}. Throws on words that cannot be read. */
export function readLookAsk(words) {
  const ask = { until: null, region: null }, w = [...words];
  while (w.length) {
    const k = w.shift();
    if (k === '--until') { const n = Number(w.shift()); if (!(Number.isInteger(n) && n >= 1 && n <= 9)) throw new Error('--until: the number of a stage of your plan (1 the first washes), after which the look stops'); ask.until = n; }
    else if (k === '--region') {
      const v = w.join(' ').trim(); w.length = 0; if (!v) throw new Error('--region: a box in millimetres, x0,y0,x1,y1, or the name of a form');
      const box = v.split(',').map(Number);
      ask.region = box.length === 4 && box.every(Number.isFinite) ? box : v;
    } else throw new Error(`look: "${k}" is not understood; write ./unpaint look [--until STAGE] [--region x0,y0,x1,y1 | --region FORM NAME]`);
  }
  return ask;
}

/** A region as a box in mm on the sheet: the box given, or the box of the named form. Throws, naming the forms, when it is neither. */
export function regionBox(region, { sheet, forms = [] }) {
  if (region == null) return null;
  let box = region, name = null;
  if (!Array.isArray(region)) { const f = forms.find(x => x.name === region); if (!f?.boxMm) throw new Error(`--region: there is no form "${region}" with a box (the forms: ${forms.map(x => x.name).join(', ') || 'none'}); or give a box, x0,y0,x1,y1 in millimetres`); box = f.boxMm; name = f.name; }
  const [x0, y0, x1, y1] = [Math.max(0, Math.min(box[0], box[2])), Math.max(0, Math.min(box[1], box[3])), Math.min(sheet.widthMm, Math.max(box[0], box[2])), Math.min(sheet.heightMm, Math.max(box[1], box[3]))];
  if (!(x1 > x0 && y1 > y0)) throw new Error(`--region: the box lies off the sheet (${sheet.widthMm} by ${sheet.heightMm} mm)`);
  return { box: [x0, y0, x1, y1].map(v => +v.toFixed(1)), name, share: (x1 - x0) * (y1 - y0) / (sheet.widthMm * sheet.heightMm) };
}

/**
 * The cost of a look in units, from the plan as compiled. `rows`: the plan's washes in painting order, each {stage}
 * (plan-data.mjs planRows); `until`: a stage or null; `regionShare`: the share of the script's passages painted in a region look, or null.
 * {cost, washShare, regionShare, washes, of, stages: [{stage, cost}] (what stopping after each stage would cost)}.
 */
export function lookCost(rows, { until = null, regionShare = null } = {}) {
  const total = rows.length, stages = [...new Set(rows.map(r => Number(r.stage) || 0))].sort((a, b) => a - b);
  const upTo = s => rows.filter(r => (Number(r.stage) || 0) <= s).length;
  const share = s => (total > 0 ? upTo(s) / total : 1), of = v => round(Math.max(LEAST_LOOK_COST, v * (regionShare ?? 1)));
  const washes = until == null ? total : upTo(until), washShare = until == null ? 1 : share(until);
  return { cost: of(washShare), washShare: round(washShare), regionShare: regionShare == null ? null : round(regionShare), washes, of: total, stages: stages.map(s => ({ stage: s, cost: of(share(s)) })) };
}

/** The costs of a plan's looks in one line, for the answer of a plan: told before anything is spent. */
export function costLine(rows, left) {
  const c = lookCost(rows);
  return ` A look of this plan costs ${c.cost} of your ${left} units left${c.stages.length > 1 ? `; stopped early it costs less (${c.stages.slice(0, -1).map(s => `--until ${s.stage}: ${s.cost}`).join(', ')})` : ''}; a look of a region of your own script costs the share of its passages that touch the region.`;
}

/** A script with only the passages that touch a box (mm), and those they are laid into. {script, kept, of}. */
export function scriptInRegion(script, box) {
  const [x0, y0, x1, y1] = box, pts = p => [...(p.regions ?? []).flat(), ...(p.region ?? []), ...(p.paths ?? []).flat(), ...(p.strokes ?? []).flatMap(s => s.points ?? (s.at ? [s.at] : s.from ? [s.from] : []))].filter(q => Array.isArray(q) && q.length >= 2);
  const touches = p => { const P = pts(p); if (!P.length) return true; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of P) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return a <= x1 && c >= x0 && b <= y1 && d >= y0; };
  const all = script.passages ?? [], keep = new Set(all.filter(touches).map(p => p.id));
  // a passage dropped into a wet one is laid into it: the one it is laid into is painted too
  for (let grew = true; grew;) { grew = false; for (const p of all) if (keep.has(p.id) && p.into && !keep.has(p.into)) { keep.add(p.into); grew = true; } }
  return { script: { ...script, passages: all.filter(p => keep.has(p.id)) }, kept: keep.size, of: all.length };
}

/**
 * RENDERING charged by the work a look really does, counted the same on any machine: its brush sweeps (every stroke
 * the painter lays) and its dryings (each wet sitting of the plan is dried once before the next). Both are fixed by
 * the plan, not by the machine. One unit is that sum for one full look of the code planner's plan of the subject
 * (painted at look size when the subject was prepared, prepared.mjs `unit`), so a full look of the automatic plan
 * costs exactly 1.00. A look is quoted from its plan before it is painted and charged the painter's own counts after.
 */
/** The work a plan holds, to a stage: {sweeps, dryings}. `passes`: the plan's washes in painting order, each {stage, layer, strokes (a count)}. */
export function planWork(passes, { until = null } = {}) {
  const upTo = passes.filter(p => until == null || (Number(p.stage) || 0) <= until);
  return { sweeps: upTo.reduce((a, p) => a + (p.strokes || 0), 0), dryings: dryingsOf(upTo) };
}
/** How often the sheet is dried over these washes: once a wet sitting (consecutive washes of one layer are one sitting). */
export const dryingsOf = passes => passes.reduce((n, p, i) => n + (i === 0 || p.layer !== passes[i - 1].layer ? 1 : 0), 0);
/** The work a painted look did, from the painter's own counts: the sweeps it laid, and the dryings of the washes it got through. `passesDone`: null for a whole look. */
export function paintedWork({ sweeps, passes, passesDone = null }) {
  if (!Number.isInteger(sweeps) || sweeps < 0) throw new Error('the painter did not report how many brush sweeps it laid: the look cannot be charged');
  return { sweeps, dryings: dryingsOf(passesDone == null ? passes : passes.slice(0, passesDone)) };
}
/** Units of a piece of work, against the subject's unit (the full automatic look's sweeps plus dryings). `share`: a region's share of the passages. */
export function workUnits(work, unit, share = 1) {
  if (!(unit > 0)) throw new Error('the subject has no rendering unit: prepare it again (a full look of the automatic plan sets it)');
  return round(Math.max(LEAST_LOOK_COST, ((work.sweeps + work.dryings) * share) / unit));
}
/** The brush sweeps a painter's log reports at its end ("N brush sweeps, ..."), or null. */
export const sweepsInLog = text => { const m = [...String(text).matchAll(/(\d+) brush sweeps, \d+ frames/g)].pop(); return m ? Number(m[1]) : null; };

/** The costs of a plan's looks in one line, by its work, for the answer of a plan: quoted before anything is spent. `unit`: {plan}. */
export function workCostLine(passes, unit, left) {
  const stages = [...new Set(passes.map(p => Number(p.stage) || 0))].sort((a, b) => a - b), q = until => workUnits(planWork(passes, { until }), unit.plan);
  return ` A look of this plan is quoted at ${q(null)} of your ${left} units left${stages.length > 1 ? `; stopped early less (${stages.slice(0, -1).map(s => `--until ${s}: ${q(s)}`).join(', ')})` : ''}; a look of a region of your own script is quoted at the share of its passages that touch the region. A look is charged what it really took (its brush sweeps and dryings, as the painter counts them).`;
}
