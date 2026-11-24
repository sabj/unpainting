// What a look costs (owner, 23 Nov): a model is never charged for how it paints. A look has a fixed price by its size
// and by the share of the sheet or script it paints, whatever is in it: a half-size look of the whole sheet 0.3, a
// full-size one 1.0; a look stopped after a stage its share of the plan's washes; a look of a region the share of the
// script's passages that touch it (both together, their product); never under 0.05. A try's budget is 3.0. The final is
// not charged. Brush sweeps, dryings, water steps, cell-steps, seconds, tokens and steps are recorded beside the
// charge (usage.json), never charged or limited. Why washes for a stage: the late stages are few strokes but many
// sittings (22 Nov, Mittens close-up). A region is not priced by its area: a box of a quarter of the sheet touched 42
// of 46 passages. Pure: nothing is read or written here.

/** The rendering budget of one try, in units, when the command line names none. */
export const DEFAULT_LOOK_UNITS = 3;
/** The price of a look of the whole sheet and script, by its size. */
export const LOOK_PRICE = Object.freeze({ half: 0.3, full: 1.0 });
/** The least any look costs, however small or partial. */
export const LEAST_LOOK_COST = 0.05;
/**
 * What one showing of the ORIGINAL costs, from the same budget as the looks (owner, 23 Nov: "keep the picture away and
 * use it as part of a looks budget"). The pictures are put away when a session plans or looks, and `./unpaint show`
 * brings one back. Small enough that a painter glances at the reference often, and not free: twenty glances are one
 * unit of the three, and a session that never looked could be shown the original 60 times. The old hard mode gave about
 * 100 looks at the target as its whole budget (bench/docs/rules.md), which would be 0.03 here; 0.05 is kept
 * because the looks share this budget and every look already shows the subject beside the sheet. The pictures lie in
 * the folder when the session starts (the first showing, free); the studies and a retry's own earlier painting are
 * shown free, and counted.
 */
export const SHOW_ORIGINAL_COST = 0.05;
/** What showing a picture costs: the original its price, any other nothing. */
export const showCost = original => (original ? SHOW_ORIGINAL_COST : 0);
const round = v => +v.toFixed(2);

/** A look's size from its cells across against the final's: 'full' when it is painted at the final's size, else 'half'. */
export const lookSizeOf = (cells, fullCells) => (cells >= fullCells ? 'full' : 'half');

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
 * The price of a look, from the plan as compiled. `rows`: the plan's washes in painting order, each {stage}
 * (plan-data.mjs planRows); `until`: a stage or null; `regionShare`: the share of the script's passages painted in a
 * region look, or null; `size`: 'half' or 'full'. {cost, size, washShare, regionShare, washes, of, stages: [{stage,
 * cost}] (what stopping after each stage would cost)}.
 */
export function lookCost(rows, { until = null, regionShare = null, size = 'half' } = {}) {
  if (!LOOK_PRICE[size]) throw new Error(`a look is half or full size, not "${size}"`);
  const total = rows.length, stages = [...new Set(rows.map(r => Number(r.stage) || 0))].sort((a, b) => a - b);
  const upTo = s => rows.filter(r => (Number(r.stage) || 0) <= s).length;
  const share = s => (total > 0 ? upTo(s) / total : 1), of = v => round(Math.max(LEAST_LOOK_COST, LOOK_PRICE[size] * v * (regionShare ?? 1)));
  const washes = until == null ? total : upTo(until), washShare = until == null ? 1 : share(until);
  return { cost: of(washShare), size, washShare: round(washShare), regionShare: regionShare == null ? null : round(regionShare), washes, of: total, stages: stages.map(s => ({ stage: s, cost: of(share(s)) })) };
}

/** The prices of a plan's looks in one line, for the answer of a plan: told before anything is spent. */
export function costLine(rows, left, size = 'half') {
  const c = lookCost(rows, { size });
  return ` A look of this plan costs ${c.cost} of your ${left} units left${c.stages.length > 1 ? `; stopped after a stage, its share (${c.stages.slice(0, -1).map(s => `--until ${s.stage}: ${s.cost}`).join(', ')})` : ''}; a look of a region of your own script, the share of its passages that touch it; never under ${LEAST_LOOK_COST}. The price is fixed by size and share: how you paint costs nothing.`;
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

/** The work a plan holds, to a stage: {sweeps, dryings}. `passes`: the plan's washes in painting order, each {stage, layer, strokes (a count)}. */
export function planWork(passes, { until = null } = {}) {
  const upTo = passes.filter(p => until == null || (Number(p.stage) || 0) <= until);
  return { sweeps: upTo.reduce((a, p) => a + (p.strokes || 0), 0), dryings: dryingsOf(upTo) };
}
/** How often the sheet is dried over these washes: once a wet sitting (consecutive washes of one layer are one sitting). */
export const dryingsOf = passes => passes.reduce((n, p, i) => n + (i === 0 || p.layer !== passes[i - 1].layer ? 1 : 0), 0);
/** The work a painted look did, from the painter's own counts: the sweeps it laid, and the dryings of the washes it got through. `passesDone`: null for a whole look. */
export function paintedWork({ sweeps, passes, passesDone = null }) {
  if (!Number.isInteger(sweeps) || sweeps < 0) throw new Error('the painter did not report how many brush sweeps it laid: its work cannot be recorded');
  return { sweeps, dryings: dryingsOf(passesDone == null ? passes : passes.slice(0, passesDone)) };
}
/** The brush sweeps a painter's log reports at its end ("N brush sweeps, ..."), or null. */
export const sweepsInLog = text => { const m = [...String(text).matchAll(/(\d+) brush sweeps, \d+ frames/g)].pop(); return m ? Number(m[1]) : null; };
