// The opening drawing laid in phases with the painting (src/paint/methods/drawing-phases.mjs decides when each line
// goes down): planned once, before the first mark, from the drawing and the wash plan; laid as the paint loop reaches
// each phase's wash (tools/plate/paint.mjs), on paper measured dry, then dried into it.
import fs from 'node:fs';
import path from 'node:path';
import { dropMask } from '../../src/crop/blockin.mjs';
import { valueTechnique } from '../../src/paint/methods/value-shared.mjs';
import { washClaims, scheduleLines, groupPhases, EDGE_MM } from '../../src/paint/methods/drawing-phases.mjs';
import { passOf } from '../../src/paint/methods/drawing-film.mjs';

/** A passage's cells on the plan grid as {test, box}, its field unpacked into `buf` (cleared again by `clear`). */
function cellsOf(sh, buf, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const put = i => { buf[i] = 1; const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  if (sh._runs) { for (let r = 0; r < sh._runs.length; r += 2) for (let i = sh._runs[r], e = sh._runs[r + 1]; i < e; i++) put(i); }
  else if (sh.box && sh.ids) { const b = sh.box, ids = sh.ids, id = sh.id; for (let y = b.y0; y <= b.y1; y++) for (let i = y * w + b.x0, e = y * w + b.x1; i <= e; i++) if (ids[i] === id) put(i); }
  else { const m = sh.mask, b = sh._mbox ?? sh.box ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }; for (let y = b.y0; y <= b.y1; y++) for (let i = y * w + b.x0, e = y * w + b.x1; i <= e; i++) if (m[i]) put(i); }
  const box = x1 < 0 ? null : { x0, y0, x1, y1 };
  const clear = () => { if (box) for (let y = y0; y <= y1; y++) buf.fill(0, y * w + x0, y * w + x1 + 1); };
  return { test: i => buf[i] === 1, box, clear };
}

/**
 * When each of the opening drawing's strokes goes down. `layers`: the plan's passes in painting order (ctx.layers);
 * `strokes` the drawing's chosen strokes (mm); `sheetMm` the sheet's width; `penLed` a pen drawing; `washSession`
 * the painter's --washsession (a passage laid in its pass's wet session is not on dry paper).
 * Returns {opening, phases: [{at, stage, washId, strokes}], layerStart, washes, why, warnings}.
 */
export function planPhases({ layers, w, h, sheetMm, strokes, penLed = false, washSession = 0 }) {
  const cell = w / sheetMm, r = Math.max(1, Math.round(EDGE_MM * cell));
  const pts = strokes.map(s => ({ points: (s.path?.length ? s.path : (s.outline ?? []).flat()).map(([x, y]) => [x * cell, y * cell]) }));
  const washes = [], layerStart = [], buf = new Uint8Array(w * h);
  // the claims are only needed when some line is timed by them; a pen drawing whose lines no author timed has none
  const needClaims = strokes.some(s => (s.when != null && s.when !== 'before') || (!penLed && (s.when == null || s.when === 'auto') && passOf(s) > 0));
  layers.forEach((L, li) => {
    layerStart[li] = washes.length;
    if (L._erase) return;
    L.shapes.forEach((sh, j) => {
      const vp = sh._valuePlan;
      // laid on dry paper: the painter dries before it (paint.mjs, the dry base), unless it goes into a wet bed
      const dry = vp ? (!valueTechnique(vp).intoWet && !(washSession > 0 && j > 0)) || (Boolean(L._script) && j === 0) : true;
      let claims = null;
      if (needClaims) { const c = cellsOf(sh, buf, w, h); claims = c.box ? washClaims(c.test, c.box, w, h, pts, r) : pts.map(() => ({ edge: false, inside: false })); c.clear(); if (sh.ids) dropMask(sh); }
      washes.push({ stage: Number(vp?.stage) || 0, dry, id: vp?.id ?? null, claims: claims ?? pts.map(() => ({ edge: false, inside: false })) });
    });
  });
  layerStart[layers.length] = washes.length;
  const s = scheduleLines(strokes, washes, { penLed }), g = groupPhases(strokes, s.at);
  const why = {}; s.why.forEach(k => { why[k] = (why[k] ?? 0) + 1; });
  return { opening: g.opening, phases: g.phases.map(p => ({ ...p, stage: washes[p.at]?.stage ?? null, washId: washes[p.at]?.id ?? null })), layerStart, washes: washes.length, why, warnings: s.warnings };
}

/**
 * The phases laid as the painting reaches them. `plan` from planPhases, with `hand` (drawing.mjs vectorHand) set when
 * the opening is laid; `deps`: {sheet(), measurePaperDry, dry(), inkres, out, log, onLaid}.
 * before(k): lays every phase due at or before wash k, on dry paper; finish(): the rest, after the last wash;
 * resumeFrom(k): a painting taken over at wash k has the phases before it on its sheet already.
 */
export function phaseRunner(plan, deps) {
  const record = [];
  const pending = () => plan.phases.filter(p => !p.laid);
  async function before(k, { intoWet = false } = {}) {
    const due = pending().filter(p => p.at <= k);
    if (!due.length) return;
    // (a painting taken over after its opening was laid makes its hand here: the same drawing file, the same pace)
    plan.hand ??= deps.hand?.();
    if (!plan.hand) throw new Error('drawing phases: the opening drawing was not laid, so its later phases have no hand');
    const t0 = Date.now(); let paper = deps.measurePaperDry(deps.sheet()), dried = false;
    // a pencil line goes on dry paper: where the plan meant this paper to be dry and it is not, the hand waits for it
    if (!paper.dry) { deps.dry(); dried = true; paper = deps.measurePaperDry(deps.sheet()); }
    if (!paper.dry) throw new Error(`drawing phases: the paper is still wet after drying (water ${paper.waterMax}), and a line is not drawn into wet paper`);
    const dryMs = Date.now() - t0;
    for (const p of due) {
      const what = p.at >= plan.washes ? 'after the washes' : `with stage ${p.stage}`;
      const got = await plan.hand.lay(p.strokes, { phase: what });
      // the lines dry into the paper where they lie, by the sheet's own dry, as the opening drawing does (a pen's ink
      // keeps its own set or soluble state, --inkfast)
      deps.inkres?.settle();
      const t1 = Date.now(); deps.dry(); const settleMs = Date.now() - t1;
      p.laid = true;
      record.push({ beforeWash: p.at, stage: p.stage, washId: p.washId, lines: p.strokes.length, ids: p.strokes.map(q => q.seq), paperWasDry: !dried, extraDryMs: dried ? dryMs : 0, lineDryMs: settleMs, nextWashIntoWet: intoWet, addedNoCell: got.nothing ?? 0 });
      deps.log(`drawing phase ${what}: ${p.strokes.length} lines ${p.at >= plan.washes ? 'after the last wash' : `before wash ${p.at + 1}`}${p.washId ? ` (${p.washId})` : ''}, on ${dried ? `paper dried for it (${dryMs} ms)` : 'dry paper'}`);
    }
    deps.onLaid?.(k);
  }
  return {
    before, record,
    // the last phases, then the check that the whole drawing inked something (a sheet too coarse for its lines stops
    // the run as it always has; one phase of strokes finer than the sheet samples does not)
    finish: async () => { await before(Infinity); plan.hand?.checkWhole(); },
    resumeFrom(k) { for (const p of plan.phases) if (p.at < k) p.laid = true; },
    write() {
      fs.writeFileSync(path.join(deps.out, 'drawing-phases.json'), JSON.stringify({ washes: plan.washes, opening: plan.opening.length, why: plan.why, warnings: plan.warnings,
        phases: record, addedNoCell: record.reduce((a, r) => a + r.addedNoCell, 0), extraDries: record.filter(r => !r.paperWasDry).length, extraDryMs: record.reduce((a, r) => a + r.extraDryMs, 0) }, null, 1) + '\n');
    },
  };
}
