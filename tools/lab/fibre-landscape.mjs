#!/usr/bin/env node
// The working grain-demo's 40 x 40 mm landscape, on the GPU at native density.
// No target pixels: all marks below are the same procedural brush recipe.
// node tools/lab/fibre-landscape.mjs <repo root> <empty out dir> [seed=1] [mm=0.26]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openFibreProof, proofArgs } from './fibre-proof.mjs';
import { paintLandscape } from './fibre-landscape-plan.mjs';

const args = proofArgs(process.argv.slice(2));
const { physicalOf, physicsFields } = await import(pathToFileURL(path.join(args.root, 'src/media/pigment-physical.mjs')));
const pigments = [
  { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) },
  { K: [0.09, 0.28, 0.55], S: [0.03, 0.03, 0.03], ...physicsFields(physicalOf('sienna')) },
];
const proof = await openFibreProof({ ...args, sizeMm: 40, pigments });
try {
  paintLandscape(proof, args.mm);
  await proof.finish({ kind: 'landscape', drawing: 'none; tree is a late pigment accent', recipe: 'grain-demo 40 mm, native export, full dry' });
} finally { proof.close(); }
