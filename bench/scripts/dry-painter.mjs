// A scripted stand-in for a model, used by `run.mjs --dry-run`. It paints through the kit like a model would:
// it reads only kit.coarse(task), lays broad washes light to dark by value band, dries between bands, and ends
// each painting with kit.finish. It is copied to bench/paint.mjs in the run's worktree and runs under the guard.
//   node bench/paint.mjs <crop> [crop ...]
import * as kit from './kit.mjs';

const STROKES_PER_BAND = 25, BANDS = 4;
const tasks = process.argv.slice(2);

for (const task of tasks) {
  const { sheet, O, W, H } = await kit.open(task, { gpu: process.env.BENCH_DRY_GPU === '1' });
  const map = kit.coarse(task);
  const cw = W / map.cols, ch = H / map.rows;
  const brush = kit.createBrush({ radius: Math.round(Math.min(cw, ch) * 0.9), bristles: 16, capacity: 60 });
  for (let band = 0; band < BANDS; band++) {
    // light first: band 0 covers the lightest cells, the last band the darkest
    const lo = band / BANDS, cells = [];
    map.value.forEach((v, i) => { if (1 - v >= lo) cells.push(i); });
    if (!cells.length) map.value.forEach((v, i) => { if (1 - v >= lo - 0.25) cells.push(i); });
    const step = Math.max(1, Math.floor(cells.length / STROKES_PER_BAND));
    for (let k = 0; k < STROKES_PER_BAND && cells.length; k++) {
      const i = cells[(k * step) % cells.length], cx = (i % map.cols + 0.5) * cw, cy = ((i / map.cols | 0) + 0.5) * ch;
      kit.dip(brush, { water: 0.85 - band * 0.15, conc: kit.mix({ ultramarine: 0.08 + band * 0.06, sienna: 0.05 + band * 0.04 }) });
      kit.stroke(brush, sheet, [{ x: Math.max(1, cx - cw * 2), y: cy, p: 1 }, { x: Math.min(W - 1, cx + cw * 2), y: cy + 1, p: 0.8 }],
        { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
    }
    kit.dryAll(sheet, O);
  }
  await kit.finish(`dry run: ${BANDS} value bands, broad washes, light to dark`);
}
