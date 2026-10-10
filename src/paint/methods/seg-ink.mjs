// --segink: under --inktiers the subject is every foreground segment, so tier 1 traces each silhouette, and the
// boundaries between ground segments (sea and sky, sand and sea) become tier-1 lines without edge detection.
// A horizon is indicated with a broken line: each ground line loses --seglineend 0.12 of its length at both ends and
// is cut into --seglinepieces 3 runs with --seglinegap 0.08 of its length between them.
import { gaussian } from '../../keyframes/density.mjs';
import { hasSegments, loadSegments, silhouettes } from '../../crop/segments.mjs';
import { pathLength } from '../../crop/inktiers.mjs';

// null when --segink is off or `base` has no segments. Otherwise
//   mask   the foreground segments, softened by --masksoft, as the ink tiers' subject
//   fg     the same foreground as a hard cell mask, for --ladderseg
//   lines  the broken ground lines, as tier-1 paths { points, length, tier, between }
export async function segmentInk({ base, w, h, n, opt, num, log }) {
  if (opt('segink', '0') === '0' || !base || !hasSegments(base)) return null;
  const seg = await loadSegments(base, w, h);
  const fgRegions = seg.regions.filter(r => r.foreground && r.area > 0);
  const m0 = new Float32Array(n); for (const r of fgRegions) for (let i = 0; i < n; i++) if (r.mask[i]) m0[i] = 1;
  const fg = Uint8Array.from(m0);
  const soft = Math.max(1, Math.round(num('masksoft', 0.01) * Math.min(w, h)));
  const m = gaussian(m0, w, h, soft);
  let subj = 0; for (let i = 0; i < n; i++) if (m[i] > 0.5) subj++;
  const ground = new Set(seg.regions.filter(r => !r.foreground).map(r => r.name));
  const broken = pts => {
    const seg = []; for (let i = 1; i < pts.length; i++) seg.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = seg.reduce((p, q) => p + q, 0); if (total <= 0) return [];
    const at = d => { let acc = 0; for (let i = 0; i < seg.length; i++) { if (acc + seg[i] >= d) { const f = (d - acc) / seg[i]; return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])]; } acc += seg[i]; } return pts[pts.length - 1]; };
    const end = num('seglineend', 0.12) * total, pieces = Math.max(1, Math.round(num('seglinepieces', 3))), gap = num('seglinegap', 0.08) * total;
    const span = (total - 2 * end - (pieces - 1) * gap) / pieces; if (span <= 2) return [pts];
    const out = []; for (let k = 0; k < pieces; k++) { const a = end + k * (span + gap), b = a + span; const run = [at(a)]; let acc = 0; for (let i = 0; i < seg.length; i++) { acc += seg[i]; if (acc > a && acc < b) run.push(pts[i + 1]); } run.push(at(b)); out.push(run); }
    return out;
  };
  const lines = [];
  for (const b of silhouettes(seg.contours)) if (b.between.every(nm => ground.has(nm)) && b.points.length >= 2) for (const run of broken(b.points)) lines.push({ points: run.map(([x, y]) => ({ x, y })), length: pathLength(run.map(([x, y]) => ({ x, y }))), tier: 1, between: b.between });
  log(`ink tiers: subject from the segments (${fgRegions.map(r => r.name).join(', ')}), ${(100 * subj / n).toFixed(1)}% of the sheet; ${lines.length} ground lines (${lines.map(l => `${l.between.join('|')} ${l.length.toFixed(0)}`).join(', ')})`);
  return { mask: m, fg, lines };
}
