#!/usr/bin/env node
// Register a line file to the target it will be painted on (src/paint/methods/drawing-registration.mjs, which the painter
// also runs by itself when a --drawingfile's aspect is off the target's): finds the scale, aspect and shift that lay its
// lines on the target's own edges and writes <out>-lines.json on the target's grid. Planning only.
//
//   node tools/seg/register-lines.mjs <lines-base> <target> --out <stem> [--width 540]
//
// <lines-base> is a --drawingfile base (<base>-lines.json). --width is the grid the target is read at (default 540).
// The record in the file gives the naive box mapping's, the uniform fit's and the registered fit's two-sided chamfer
// score in cells (lines to edges and edges to lines, each capped at 3% of the short side) and share of line on an edge.
import { registerDrawingFile } from '../../src/paint/methods/drawing-registration.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.lastIndexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const [base, target] = args;
const out = opt('out', null);
if (!base || !target || base.startsWith('--') || target.startsWith('--') || !out) {
  console.error('usage: register-lines.mjs <lines-base> <target> --out <stem> [--width 540]');
  process.exit(2);
}
const width = Number(opt('width', 540));
if (!(width >= 64)) throw new Error(`--width: a number of pixels, 64 or more, not ${opt('width')}`);
const rec = await registerDrawingFile({ base, image: target, out: '.', stem: out, width, force: true, log: console.log });
if (!rec) throw new Error(`register lines: ${base}-lines.json is missing or records no image size`);
