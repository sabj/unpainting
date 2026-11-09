// Data for the "what improved" view of the release comparison page.
// Each entry names a subsystem, what changed (from CHANGELOG.md), the commits and files that did it,
// and the subject and model pairs where the change should be visible. The page fills in the measured
// numbers and the human votes from run records and the browser. Nothing here is a score.
// Edit this list, or pass --improved <file.mjs|file.json> to compare-release.mjs.

export const IMPROVED = [
  {
    id: 'wash-lanes',
    subsystem: 'Wash lanes and graded ramps',
    summary: 'Straight wash lanes keep one sweep across scattered single-cell flecks and split only at real protected highlights. Wide shaped planes sweep as horizontal bands, and multi-lane flat-brush seams no longer overlap.',
    source: 'CHANGELOG.md, 0.3.1',
    files: ['src/paint/methods/stroke-plan.mjs', 'src/paint/methods/light-to-dark.mjs', 'tools/paint-plate.mjs'],
    commits: ['4a993e5', '441d957', '20676e9', '6c6faa6'],
    look: [{ subject: 'sargent', model: 'astra' }, { subject: 'trumbull', model: 'argon' }, { subject: 'south-france', model: 'opus' }],
  },
  {
    id: 'paper-reserves',
    subsystem: 'Paper reserves and catchlights',
    summary: 'Fine catchlights inside dark features stay as bare paper. Midtone snow and foliage specks are no longer reserved. Plane fragments merge before rectangular reserves are cut.',
    source: 'CHANGELOG.md, 0.3.1',
    files: ['src/paint/methods/light-to-dark.mjs', 'src/paint/methods/subject-washes.mjs'],
    commits: ['86ac390', 'fdd4735'],
    look: [{ subject: 'mittens', model: 'opus' }, { subject: 'hills', model: 'argon' }],
  },
  {
    id: 'wet-edges',
    subsystem: 'Wet edges and pigment',
    summary: 'Edge evaporation scales with the dry fraction, and capillary flow follows the wet boundary. Pigment optical constants are restored to one set of values.',
    source: 'CHANGELOG.md, 0.3.1',
    files: ['src/media/sheet.mjs', 'src/media/gpu/stepfull.wgsl', 'src/crop/box.mjs'],
    commits: ['3dd1cbb', 'b95fc20', '1110afc'],
    look: [{ subject: 'hills', model: 'opus' }, { subject: 'trumbull', model: 'argon' }],
  },
  {
    id: 'pen-hand',
    subsystem: 'Pen line and nib',
    summary: 'Pen paths are smoothed with Catmull-Rom splines and the nib has its own dynamics.',
    source: 'CHANGELOG.md, 0.3.1',
    files: ['src/paint/methods/drawing-hand.mjs', 'src/crop/ink-free.mjs'],
    commits: ['b6db40a', 'df18cd2'],
    look: [{ subject: 'south-france', model: 'opus' }, { subject: 'hills', model: 'argon' }],
  },
  {
    id: 'speed',
    subsystem: 'Speed (0.3.0 engine work, kept in 0.3.1)',
    summary: 'Fewer dry-paper checks, fewer GPU readbacks and combined GPU steps. Seconds below come from run cards. Runs shared a machine, so they are noisy.',
    source: 'CHANGELOG.md, 0.3.0',
    files: ['src/media/sheet.mjs', 'src/media/gpu/stepfull.mjs', 'tools/paint-plate.mjs'],
    commits: ['70ceb7c'],
    look: [{ subject: 'south-france', model: 'opus' }, { subject: 'mittens', model: 'opus' }, { subject: 'hills', model: 'argon' }],
  },
  {
    id: 'preflight',
    subsystem: 'Comparison guards',
    summary: 'A comparison run is refused for CPU fallback, narrow renders or a missing GPU or SAM record. This page applies the same rules and adds a commit check.',
    source: 'CHANGELOG.md, 0.3.1',
    files: ['bench/scripts/preflight.mjs', 'bench/scripts/rerender.mjs', 'src/paint/doctor.mjs'],
    commits: ['468e3bd', '8ba139a'],
    look: [],
  },
];

/** Problems with an improved list; an empty array means it is usable. */
export function validateImproved(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['improved data must be an array'];
  list.forEach((e, i) => {
    const at = `entry ${i}${e?.id ? ` (${e.id})` : ''}`;
    for (const k of ['id', 'subsystem', 'summary']) if (typeof e?.[k] !== 'string' || !e[k]) errors.push(`${at}: ${k} must be a non-empty string`);
    for (const k of ['files', 'commits', 'look']) if (!Array.isArray(e?.[k])) errors.push(`${at}: ${k} must be an array`);
    (Array.isArray(e?.look) ? e.look : []).forEach((l, j) => {
      if (typeof l?.subject !== 'string' || typeof l?.model !== 'string') errors.push(`${at}: look ${j} needs subject and model`);
    });
  });
  return errors;
}
