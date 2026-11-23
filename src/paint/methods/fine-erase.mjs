// The eraser on a painting whose pencil is drawn on the pen's fine sheet (ink-res.mjs): every rub acts on the
// painting's sheet, where the washes lie over the graphite; the fine sheet is then told what each cell lost, so the
// pencil line it shows at its own resolution is lifted as much. Without a fine sheet carrying the pencil it is the rub alone.
import { thickness, coherent } from '../../media/sheet.mjs';

/** Runs `rub()` (sync or async) on `sheet`, then lifts graphite channel `c` on the fine sheet `fine` as the rub lifted it. */
export function followErase(fine, sheet, c, rub) {
  if (!fine || !fine.channels.includes(c)) return rub();
  coherent(sheet); // the painting's sheet may live on the GPU: read its graphite down either side of the rub
  const before = Float32Array.from(thickness(sheet)[c]);
  const follow = r => { coherent(sheet); fine.erased(c, before, thickness(sheet)[c]); return r; };
  const r = rub();
  return r && typeof r.then === 'function' ? r.then(follow) : follow(r);
}
