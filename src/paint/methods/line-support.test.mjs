import test from "node:test";
import assert from "node:assert/strict";
import { plannedEdges, supportedLines } from "./line-support.mjs";

const w = 60, h = 40, n = w * h;
// a planned passage: the lower half of the sheet; its boundary cells are row 20
const passage = () => {
  const hardCells = [], softCells = [];
  for (let x = 0; x < w; x++) (x < 30 ? hardCells : softCells).push(20 * w + x);
  return { edges: { hardCells, softCells } };
};
const row = (y, x0 = 5, x1 = 55) => ({ points: Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y })), width: 1 });

test("planned edges are the hard and soft boundary cells of every planned passage, and nothing else", () => {
  const e = plannedEdges([passage(), { edges: { hardCells: [5], softCells: [] } }, {}], n);
  assert.equal(e[20 * w + 3], 1, "hard boundary");
  assert.equal(e[20 * w + 40], 1, "soft boundary");
  assert.equal(e[5], 1, "a second passage");
  assert.equal(e[21 * w + 3], 0, "inside the passage");
  assert.equal(e.reduce((a, v) => a + v, 0), w + 1);
});

test("a line along a planned edge is drawn whole, a line inside a planned mass is left off", () => {
  const edges = plannedEdges([passage()], n);
  const on = row(21), inside = row(32);
  const r = supportedLines([on, inside], { edges, w, h, tol: 2 });
  assert.equal(r.kept.length, 1);
  assert.equal(r.kept[0], on, "the kept line is the same gesture, not a cut piece");
  assert.deepEqual(r.dropped, [inside]);
});

test("the registration slack is tol cells: an edge tol away supports the line, one cell further does not", () => {
  const edges = plannedEdges([passage()], n);
  assert.equal(supportedLines([row(23)], { edges, w, h, tol: 3 }).kept.length, 1);
  assert.equal(supportedLines([row(24)], { edges, w, h, tol: 3 }).kept.length, 0);
});

test("a line is drawn when at least half its length restates a planned edge", () => {
  const edges = plannedEdges([passage()], n);
  // runs along the edge from x 5 to 30, then turns down into the mass for 25 cells: 26 of 51 samples on the edge
  const bend = { points: [...Array.from({ length: 26 }, (_, i) => [5 + i, 20]), ...Array.from({ length: 25 }, (_, i) => [30, 21 + i * 0.75])] };
  assert.equal(supportedLines([bend], { edges, w, h, tol: 1 }).kept.length, 1);
  // mostly in the mass: 10 cells on the edge, 30 below it
  const dive = { points: [[5, 20], [15, 20], [15, 39]] };
  assert.equal(supportedLines([dive], { edges, w, h, tol: 1 }).kept.length, 0);
});

test("sparse points are measured along the drawn path, not point by point", () => {
  const edges = plannedEdges([passage()], n);
  // two points on the edge 50 cells apart: the whole span lies on it
  assert.equal(supportedLines([{ points: [[5, 20], [55, 20]] }], { edges, w, h, tol: 1 }).kept.length, 1);
  // two points that touch the edge only at one end: the span crosses the mass
  assert.equal(supportedLines([{ points: [[30, 20], [30, 39]] }], { edges, w, h, tol: 1 }).kept.length, 0);
});

test("a line with no planned passage anywhere near it is left off, and an empty plan leaves every line off", () => {
  const edges = plannedEdges([], n);
  const r = supportedLines([row(10), { points: [[3, 3]] }], { edges, w, h, tol: 2 });
  assert.equal(r.kept.length, 0);
  assert.equal(r.dropped.length, 2);
});
