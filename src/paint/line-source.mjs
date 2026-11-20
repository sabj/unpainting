// Where the line comes from. The only line source is a drawing file (--drawingfile): a prepared drawing (trace-drawing.py,
// inputKind 'drawing') or lines a plan wrote. The painter never extracts line from the subject; that route (the planner's
// own gestures and outlines, the line model's pool, copied source lines, thin-dark restatements) was removed in 0.4 and
// last exists at commit 49447027. A run that asks for a drawing and names no file draws no line, and says so loudly.
import { linePaths, readLineText, hasLineFile } from '../crop/lines.mjs';

/** The line source of a run: { source: 'prepared drawing' | 'plan lines' | 'none', drawing, file, warning }. */
export function lineSource({ drawing = 'first', drawingFile = '', drawingLast = '', stages = '', resolve = f => f }) {
  if (drawing === 'none') return { source: 'none', drawing: 'none', file: null, warning: null };
  if (!drawingFile) return { source: 'none', drawing: 'none', file: null,
    warning: `!!! NO LINE: --drawing ${drawing} was asked for but no drawing file was given (--drawingfile). The painter draws no line: line extraction from the subject was removed in 0.4. Prepare one with tools/seg/trace-drawing.py and tools/seg/order-strokes.mjs.` };
  const file = linePaths(resolve(drawingFile)).lines;
  if (!hasLineFile(file)) throw new Error(`--drawingfile ${drawingFile}: no line file at ${file}`);
  let kind = null;
  try { kind = JSON.parse(readLineText(file)).inputKind ?? null; } catch (e) { throw new Error(`--drawingfile ${drawingFile}: ${e.message}`); }
  const source = kind === 'drawing' ? 'prepared drawing' : 'plan lines';
  // a closing pen needs its own file (--drawinglast) or a finish stage cut from the drawing (--stages ...finishink)
  const closing = !!drawingLast || /finishink/.test(stages);
  if ((drawing === 'both' || drawing === 'last') && !closing) return { source, drawing: drawing === 'both' ? 'first' : 'none', file,
    warning: `!!! NO CLOSING LINE: --drawing ${drawing} asks for a closing pen but no closing file (--drawinglast) or finish stage (--stages finishink) was given; the closing pen is skipped (it no longer traces the subject).` };
  return { source, drawing, file, warning: null };
}
