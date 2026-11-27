#!/usr/bin/env node
// Replay a completed, unobserved GPU proof at 10/25/50/75/100% of solver advances.
// node tools/lab/fibre-playback.mjs <repo root> <empty out dir> <reference run-card.json>
import fs from 'node:fs';
import path from 'node:path';
import { openFibreProof } from './fibre-proof.mjs';
import { paintBloom } from './fibre-bloom-plan.mjs';
import { paintLandscape } from './fibre-landscape-plan.mjs';

const [root, out, file] = process.argv.slice(2);
if (!root || !out || !file || process.argv.length !== 5) throw new Error('usage: <repo root> <empty out dir> <reference run-card.json>');
const reference = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!['bloom', 'landscape'].includes(reference.kind)) throw new Error('unknown proof kind');
const { seed, mmPerCell: mm, sizeMm, pigments } = reference;
const proof = await openFibreProof({ root: path.resolve(root), out: path.resolve(out), seed, mm, sizeMm, pigments, reference });
try {
  const preparation = reference.kind === 'bloom' ? paintBloom(proof, mm) : (paintLandscape(proof, mm), undefined);
  await proof.finish({ kind: reference.kind, ...(preparation ? { preparation, washMm: 40, dropDiameterMm: 12 } : {}) });
} finally { proof.close(); }
