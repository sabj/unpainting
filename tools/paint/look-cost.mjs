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
