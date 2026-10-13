// The stroke ledger: the marks the stroke gate measures, recorded in every run and every mode.
//
// --marks 1 (or --strokebudget) keeps the full mark tape, which marks.json ships for playback. Without it the painter
// still records a compact tape that holds only what stroke sizes and wash areas need: brush strokes ('s', without
// their copied point objects or flow steps), pen lines ('P'), dips ('d', 'D'), clips ('c'), resists ('r', 'R', the
// masks as bytes) and frame marks ('m'). Flow and dry steps, ink-resolution notes and blot masks are dropped, and
// graphite gestures keep only their kind, so a large native painting stays small. The gate then reads the tape the
// painter holds instead of a marks.json read back from disk.
//
// Recording never changes the painting: the instruments push the same entries either way, and the compact tape keeps
// copies of them.
import { recordMarks } from '../media/brush.mjs';

const DROPPED = new Set(['f', 'y', 'W']);
const KIND_ONLY = new Set(['b', 'g']);

/** The compact form of one tape entry, or null when the gate never reads it. */
export function compactEntry(m) {
  if (!m || DROPPED.has(m.k)) return null;
  if (KIND_ONLY.has(m.k)) return { k: m.k };
  if (m.k === 's') { const { points, fl, ...rest } = m; return rest; }
  if (m.k === 'r') return { ...m, m: Uint8Array.from(m.m), ...(m.s ? { s: Uint8Array.from(m.s) } : {}) };
  // pen lines stay the same object: the pen rewrites a line's path in place when it re-dips mid-line
  return m;
}

/**
 * Starts the tape the brushes, pens and sheet record into. full: the playback tape, unchanged. Otherwise the compact
 * ledger. Either way the returned array is the tape (pass it to tapeSheet).
 */
export function startStrokeLedger({ full }) {
  const tape = recordMarks(true);
  if (full) return tape;
  const push = Array.prototype.push;
  Object.defineProperty(tape, 'push', {
    enumerable: false,
    value(...entries) {
      for (const m of entries) { const c = compactEntry(m); if (c) push.call(this, c); }
      return this.length;
    },
  });
  return tape;
}
