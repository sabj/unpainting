// --passages sea,sand,trees,sky,dog: named passages from src/paint/techniques/passages/<name>.mjs. Each exports
// `when` ('washes' follows the mop, 'shapes' the dark shapes, 'finish' the ladder) and `paint(ctx)`.
// A segment with its own passage is left to it: the shape stage and the ladder keep off it.
//   --ladderown 0.5   a ladder glaze with this share of its cells on a passage's segment is left to the passage
import path from 'node:path';
import {passageSchedule} from './passage-schedule.mjs';
import { hasSegments, loadSegments } from '../../crop/segments.mjs';

// ctx.share is the context every passage is handed (the sheet, the plan, the physics, the brush and the path makers);
// ctx.fg is the foreground mask --ladderseg reads, or null. Returns
//   names       the passages asked for
//   owned       a cell mask of the segments that have their own passage
//   fg          ctx.fg with the owned cells taken out (ctx.fg itself when there are no segments)
//   owns(mask)  true when a ladder glaze over mask belongs to a passage and is to be left to it
//   run(when)   paints every passage whose `when` this is, dries the sheet after each and films it
export async function passageHook(ctx) {
  const { share, fg, sheet, O, w, h, n, clock, dry, snap, setStage, opt, num, log } = ctx;
  const names = opt('passages', '').split(',').map(s => s.trim()).filter(Boolean);
  let mods = [];
  for (const name of names) { const mod = await import(`../techniques/passages/${name}.mjs`); mods.push({ name, when: mod.when || 'shapes', paint: mod.paint, region: mod.region, dryAfter: mod.dryAfter }); }
  const lateTrees=num('treelayerslate',0);if(![0,1].includes(lateTrees))throw Error('--treelayerslate takes 0 or 1');
  mods=passageSchedule(mods,{lateTrees:Boolean(lateTrees)});
  const seg = names.length ? await (async () => { const image = opt('image', ''), base = image ? path.basename(image, path.extname(image)) : ''; return base && hasSegments(base) ? loadSegments(base, w, h) : null; })() : null;
  // a passage may find its own cells (export region(ctx) -> cell mask) instead of owning a segment of its name; those
  // cells are owned too
  for (const p of mods) if (p.region) p.mask = await p.region({ ...share, seg });
  const owned = (() => { const m = new Uint8Array(n); if (seg) for (const r of seg.regions) if (names.includes(r.name)) for (let i = 0; i < n; i++) if (r.mask[i]) m[i] = 1; for (const p of mods) if (p.mask) for (let i = 0; i < n; i++) if (p.mask[i]) m[i] = 1; return m; })();
  const ownFg = fg && seg ? Uint8Array.from(fg, (v, i) => (owned[i] ? 0 : v)) : fg;
  // --passexact 1: owned cells are subtracted from a ladder glaze (paint-plate.mjs keep-out) instead of skipping it
  // whole, and the sheet is dried after a passage only when its module exports dryAfter = true
  const exact = num('passexact', 0) > 0;
  const owns = mask => {
    if (!names.length || exact) return false;
    let own = 0, c = 0;
    for (let i = 0; i < n; i++) if (mask[i]) { c++; own += owned[i]; }
    return !!c && own / c >= num('ladderown', 0.5);
  };
  const run = async when => {
    for (const p of mods) if (p.when === when) {
      log(`passage ${p.name} (${when})`);
      const stage = s => { setStage({ stage: 'passage', step: p.name, ...s }); };
      await p.paint({ name: p.name, when, ...share, seg, stage, region: p.mask || null });
      if (!exact || p.dryAfter === true) clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
      snap();
    }
  };
  return { names, owned, fg: ownFg, owns, run, exact, schedule:mods.map(p=>({name:p.name,sourceWhen:p.sourceWhen,effectiveWhen:p.when,wholeModuleDeferred:lateTrees===1&&p.name==='treelayers'})) };
}
