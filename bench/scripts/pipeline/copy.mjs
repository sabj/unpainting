// Where a V4 or V5 plan's drawn lines came from, for the try record. Drawing ink or pencil lines from the subject's
// edges is allowed (Sam, 2026-11-10 14:27): this reports it, and nothing here limits it or is told to the model.
// The record also carries the painter's own hfCorr and its ceiling (tools/guard/cheat-risk.mjs), as measured.
//
// A line is recorded as traced when a tracer stamped it: bench/tools/trace-ink.mjs and closing-ink.mjs mark each line
// they write (`object`, `selection.method`) and the file (`registration`). A drawing left to the painter (no drawing
// file) is the painter reading the lines off the target, and is recorded as such. A model can trace with a tool of its
// own and leave no stamp; hfCorr measures the sheet and does not depend on the stamp.
//
// Copied into the model's worktree as bench/copy.mjs beside plan-args.mjs, so it imports nothing.

const TRACER_METHOD = /^(traced target|target hard-dark-line support)/;
const TRACED_FILE = /^(traced from the target|crop translation of registered traced)/;
const stamped = line => line?.object === 'target-hard-line' || TRACER_METHOD.test(line?.selection?.method ?? '');
const ownStamp = line => Boolean(line?.object || line?.selection?.method);

/**
 * linesByName: { 'opening-lines.json': doc, ... } for the drawing files the painter will read.
 * @returns {{ files: Record<string, { lines: number, traced: number }>, lines: number, traced: number, painterOwnDrawing: boolean }}
 */
export function lineSources(linesByName = {}, { painterOwnDrawing = false } = {}) {
  const files = {};
  let lines = 0, traced = 0;
  for (const [name, doc] of Object.entries(linesByName)) {
    const list = Array.isArray(doc?.lines) ? doc.lines : [], whole = TRACED_FILE.test(doc?.registration ?? '');
    const t = list.filter(l => stamped(l) || (whole && !ownStamp(l))).length;
    files[name] = { lines: list.length, traced: t };
    lines += list.length; traced += t;
  }
  return { files, lines, traced, painterOwnDrawing: Boolean(painterOwnDrawing) };
}

/**
 * The copy record of a finished painting. risk: the painter's cheat-risk.json (or null); lines: lineSources().
 * A painting whose correlation was not measured is recorded as not measured.
 */
export function copyRecord(risk, lines) {
  const about = { lines: lines?.lines ?? null, tracedLines: lines?.traced ?? null, painterOwnDrawing: lines?.painterOwnDrawing ?? null };
  if (!risk || !Number.isFinite(risk.hfCorr) || !Number.isFinite(risk.hfCeiling)) {
    return { hfCorr: null, ceiling: null, over: null, margin: null, ...about, error: risk?.error ? `cheat-risk failed: ${risk.error}` : risk ? 'cheat-risk.json has no hfCorr or no ceiling' : 'no cheat-risk record beside the painting' };
  }
  return { hfCorr: risk.hfCorr, ceiling: risk.hfCeiling, over: risk.hfCorr > risk.hfCeiling, margin: +(risk.hfCeiling - risk.hfCorr).toFixed(3), ...about };
}
