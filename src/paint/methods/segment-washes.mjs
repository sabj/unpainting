// Pipeline: painting, stage 3 (washes).
// --segwash: the mop's regions come from the picture's semantic segments (tools/seg/segments.py) instead of a colour
// and value cut. Each background region gets its own puddle, least washed then largest first, until its pale end is
// satisfied. Foreground regions are left to the shapes; masses.mjs's own cut is the fallback without segments.
// Under --subjectwash 1 the regions are the wash groups (subject-clusters.mjs): a puddle runs on across a subject
// boundary only where colour and value do.
//   --segwashes 3     at most this many washes on one region
//   --massarea 0.04   a region must cover at least this share of the sheet
//   --massfloor 0.10  a region whose puddle is under half this many OD is finished
import path from 'node:path';
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { washGroupRegions } from './subject-washes.mjs';

// null when --segwash is off or the source has no segments; otherwise the ground regions and next(puddleOf), which
// returns the next region to wash as { cd, id, labels, area, mix, j, name } or null when none is left. puddleOf(mask)
// is the mop's own puddle for a region, read off the sheet as it stands.
export async function segmentWashes({ w, h, n, opt, num, log, subjects = null }) {
  if (opt('segwash', '0') === '0') return null;
  const image = opt('image', ''), base = image ? path.basename(image, path.extname(image)) : '';
  if (!base || !hasSegments(base)) { log(`masses: no segments for ${base || 'this source'}, cutting by colour and value`); return null; }
  const seg = subjects ? { regions: washGroupRegions(subjects, await loadSegments(base, w, h)) } : await loadSegments(base, w, h);
  const ground = seg.regions.filter(r => !r.foreground && r.area >= num('massarea', 0.04)).sort((p, q) => q.area - p.area);
  log(`masses: segments ${ground.map(r => `${r.name} ${(100 * r.area).toFixed(0)}%`).join(', ')} are the ground; ${seg.regions.filter(r => r.foreground).map(r => r.name).join(', ') || 'nothing'} is left for the shapes`);
  const washed = new Map();
  const next = puddleOf => {
    for (const r of [...ground].sort((p, q) => (washed.get(p.id) || 0) - (washed.get(q.id) || 0) || q.area - p.area)) {
      if ((washed.get(r.id) || 0) >= num('segwashes', 3)) continue;
      const mix = puddleOf(r.mask); const j = mix.indexOf(Math.max(...mix));
      if (mix[j] < 0.5 * num('massfloor', 0.10)) { washed.set(r.id, Infinity); continue; }
      let area = 0; for (let i = 0; i < n; i++) area += r.mask[i];
      washed.set(r.id, (washed.get(r.id) || 0) + 1);
      return { cd: 0, id: 1, labels: r.mask, area, mix, j, name: r.name };
    }
    return null;
  };
  return { ground, next };
}
