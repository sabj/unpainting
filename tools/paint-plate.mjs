#!/usr/bin/env node
// Paint a plate with the simulated instruments: glazes of recovered pigment laid by a brush on absorbent paper.
// Usage: node tools/paint-plate.mjs --image <reference> --width 700 --out work/plate
//
// This file runs the stages of a painting in order. The work is in tools/plate:
//   setup.mjs    options and the source image
//   plan.mjs     the palette, pigment demand, masks and the order of the layers
//   sheet.mjs    brush and pen strokes, the value plan, the sheet of paper, looks, marks and scrap calibration
//   pen.mjs      film frames and the plan of the pen drawing
//   drawing.mjs  the order of work, reserves, the drawing passes and the preparation stage
//   paint.mjs    passage brushes, touch-ups, stops at passage boundaries, and the paint loop
//   finish.mjs   lifting, the closing pen, gouache, and the files a finished painting writes
// The stages were one script and still share its names through one object, ctx. A stage reads the names it needs
// from ctx at its top and hands on the names later stages need at its end. A name that more than one stage changes
// lives on ctx itself (ctx.sheet, ctx.STAGE, ctx.layers). Put new logic in small modules under src/ or tools/ with
// unit tests, not in a stage.
import './plate/load-order.mjs';
import {fileURLToPath} from 'node:url';
import {createJSONLWriter} from './painter/jsonl-writer.mjs';
import {onCheckFailure} from '../src/media/checks.mjs';
import {AUTHORING_CONTRACT} from './painter/semantic-areas.mjs';
import {setup} from './plate/setup.mjs';
import {plan} from './plate/plan.mjs';
import {sheetAndBrushes} from './plate/sheet.mjs';
import {penPlan} from './plate/pen.mjs';
import {drawing} from './plate/drawing.mjs';
import {paint} from './plate/paint.mjs';
import {finish} from './plate/finish.mjs';

// PAINT_MEMLOG=s: print process.memoryUsage (MB) every s seconds, to find what grows on big sheets.
if(Number(process.env.PAINT_MEMLOG)>0){const t0=Date.now();setInterval(()=>{const m=process.memoryUsage();console.log(`memlog ${((Date.now()-t0)/1000).toFixed(0)}s rss ${(m.rss/1048576)|0} heapUsed ${(m.heapUsed/1048576)|0} heapTotal ${(m.heapTotal/1048576)|0} external ${(m.external/1048576)|0} arrayBuffers ${(m.arrayBuffers/1048576)|0}`);},Number(process.env.PAINT_MEMLOG)*1000).unref();}
if(process.argv.includes('--areahelp')){console.log(JSON.stringify(AUTHORING_CONTRACT,null,2));process.exit(0);}

// The splay of the wash flat (the brush that lays shaped value planes, and its scrap calibration). Shaped-plane lanes
// are spaced by this brush's edge reach (edgeHalfWidth).
const WASH_FLAT_SPLAY = 0.03;
// This file: the painter's entry point. The repository root is two folders up.
const ENTRY_FILE = fileURLToPath(import.meta.url);
const JSONL = createJSONLWriter();
const removeLogFailureHook = onCheckFailure(JSONL.flush);
process.on('exit', JSONL.close);
process.on('uncaughtExceptionMonitor', JSONL.flush);
const ctx = { WASH_FLAT_SPLAY, ENTRY_FILE, JSONL, sheet: null };
try {
  await setup(ctx);
  await plan(ctx);
  await sheetAndBrushes(ctx);
  await penPlan(ctx);
  await drawing(ctx);
  await paint(ctx);
  await finish(ctx);
} finally {
  try { ctx.sheet?._gpu?.close(); } catch {}
  JSONL.close();
  removeLogFailureHook();
  process.off('exit', JSONL.close);
  process.off('uncaughtExceptionMonitor', JSONL.flush);
}
process.exit(process.exitCode ?? 0);
