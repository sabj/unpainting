#!/usr/bin/env node
// 40 mm burnt-sienna wash, clean 12 mm water drop at measured shine-off.
// Run this same script against both revisions, with seeds 1, 2 and 3.
// node tools/lab/fibre-bloom.mjs <repo root> <empty out dir> [seed=1] [mm=0.26]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openFibreProof, proofArgs } from './fibre-proof.mjs';
import { paintBloom } from './fibre-bloom-plan.mjs';

const args = proofArgs(process.argv.slice(2)), { root, mm } = args;
const { BOX, physicalPigment } = await import(pathToFileURL(path.join(root, 'src/crop/box.mjs')));
const proof = await openFibreProof({ ...args, sizeMm: 50, pigments: [physicalPigment(BOX.find(p => p.key === 'sienna'))] });
try {
  const preparation = paintBloom(proof, mm);
  await proof.finish({ kind: 'bloom', washMm: 40, dropDiameterMm: 12, preparation });
} finally { proof.close(); }
