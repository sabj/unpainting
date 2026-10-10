// Stops at passage boundaries. With --pausedir DIR the painter offers a stop at every passage boundary: before the
// first wash (the opening drawing done), after each pass of the light-to-dark ladder (after its drying step), and
// before the closing drawing. A harness on the other side of the folder decides where it stops. A stop changes nothing
// about the painting.
//
// Files in the pause folder:
//   control.json        written by the harness at any time: {"stopAt": <boundary index> | "closing" | "end", "seq": n};
//                       the painter reads it again at every boundary. Absent: stop at the first boundary (index 0).
//   progress.json       written by the painter at every boundary it passes, stopping or not.
//   offer-<b>.json      written when the painter stops at boundary b: where it is and what remains.
//   sheet-<b>.png       the sheet as it stands at b (what a look shows).
//   go-<b>.json         written by the harness to release the painter: {"action":"continue","stopAt":...} or
//                       {"action":"save-exit"} (save the painting and exit 75, so a fresh process can take it over with a
//                       revised plan; see --resumestate in tools/paint-plate.mjs).
// Boundary indices: 0 = before the first wash; k = after the k-th pass of the ladder; the closing boundary is named
// "closing". A stop asked for at a pass the painter does not stop at (a touch-up round) is made at the next boundary.
import fs from 'node:fs';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };

export function createPause({ dir, log = console.log, pollMs = 200, maxWaitMs = 6 * 3600 * 1000 }) {
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  let stopAt = 0, seq = 0;
  const reach = (b, closing) => {
    const c = readJson(path.join(dir, 'control.json'));
    if (c && c.stopAt !== undefined && c.seq !== undefined && c.seq >= seq) { stopAt = c.stopAt; seq = c.seq; }
    if (stopAt === 'end') return false;
    if (stopAt === 'closing') return closing;
    return closing || b >= Number(stopAt);
  };
  return {
    dir,
    stopAt: () => stopAt,
    // At a boundary: record progress; if the harness wants a stop here, save the sheet image and wait for the go file.
    // Returns {action:'continue'} or {action:'save-exit'}.
    async boundary(info, { renderPng }) {
      const b = info.closing ? 'closing' : info.index;
      writeJson(path.join(dir, 'progress.json'), { ...info, boundary: b, time: new Date().toISOString() });
      if (!reach(info.index, Boolean(info.closing))) return { action: 'continue' };
      await renderPng(path.join(dir, `sheet-${b}.png`));
      writeJson(path.join(dir, `offer-${b}.json`), { ...info, boundary: b, time: new Date().toISOString() });
      log(`pause: stopped at boundary ${b} (${info.label}); waiting for the harness`);
      const go = path.join(dir, `go-${b}.json`), t0 = Date.now();
      for (;;) {
        const g = readJson(go);
        if (g) {
          if (g.stopAt !== undefined) { stopAt = g.stopAt; if (g.seq !== undefined) seq = g.seq; }
          log(`pause: boundary ${b} released (${g.action}${g.stopAt !== undefined ? ', next stop ' + g.stopAt : ''}) after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
          return { action: g.action === 'save-exit' ? 'save-exit' : 'continue' };
        }
        if (Date.now() - t0 > maxWaitMs) throw new Error(`pause: no go file for boundary ${b} after ${maxWaitMs / 1000} s`);
        await sleep(pollMs);
      }
    },
  };
}
