import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generate } from './sync-site-media.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const uniforms = code => [...code.match(/const UF = \[([\s\S]*?)\.map\(k => \[k, 'f'\]\)\];/)[0].matchAll(/'([A-Za-z0-9]+)'/g)].map(m => m[1]);
const phase1Block = wgsl => {
  const start = wgsl.indexOf('var near = 0.0;');
  return wgsl.slice(start, wgsl.indexOf('let wv =', start)).replace(/\s+/g, ' ').trim();
};

test("the lab's WebGPU uniform block keeps the painter's 0.3.1 sheet options (mmPerCell, edgeFlowDepth)", () => {
  const lab = uniforms(read('demos/lab/gpu/gpu-sheet.js'));
  for (const k of ['mmPerCell', 'edgeFlowDepth']) assert.ok(lab.includes(k), `lab uniforms lack ${k}`);
  // every option the CLI's block carries after pinFibre, except its CLI-only scheduler pads, is in the lab's block
  const cli = uniforms(read('src/media/gpu/stepfull.mjs')), after = cli.slice(cli.indexOf('pinFibre') + 1).filter(k => !/^pad[B-E]$/.test(k));
  for (const k of after) assert.ok(lab.includes(k), `lab uniforms lack ${k}`);
});

test("the lab's WebGPU edge evaporation is the painter's local dry-fraction rule", () => {
  const lab = phase1Block(read('demos/lab/gpu/gpu-wgsl.js'));
  const cli = phase1Block(read('src/media/gpu/stepfull.wgsl'));
  assert.ok(lab.includes('localDryFraction') && lab.includes('edgeFlowDepth'), 'lab phase1 lacks the 0.3.1 edge rule');
  assert.equal(lab, cli);
});

test("the lab hands the sheet's real cell size to its WebGPU sheet and keeps the default edge depth", () => {
  const code = read('demos/lab/gpu/gpu-sheet.js');
  assert.match(code, /mmPerCell: sheet\.paper\?\.mmPerCell/);
  assert.match(code, /edgeFlowDepth: o\.edgeFlowDepth \?\? 0\.06/);
});

test('every file under demos/lab/media is generated from src/media or a named lab-only file', () => {
  const LAB_ONLY = new Set(['dryer.js', 'lab-media.js', 'mixing.js', 'papers.js', 'pigment-physical.js', 'pigments.js']);
  const base = path.join(ROOT, 'demos', 'lab', 'media'), made = generate();
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const orphans = walk(base).map(f => path.relative(base, f).split(path.sep).join('/')).filter(r => !made.has(r) && !LAB_ONLY.has(r));
  assert.deepEqual(orphans, [], 'stale copies the sync no longer produces (the browser never loads them)');
});
