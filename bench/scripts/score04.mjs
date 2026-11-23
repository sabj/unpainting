// 0.4's scoring: `npm run bench:score04 -- RUN_FOLDER... | MANIFEST.json --out DIR` (bench/scorer/score04.py; bench/docs/scoring.md).
// Runs the scorer under BENCH_SCORE_PYTHON (else python3), which needs bench/scorer/requirements.txt: a python that
// cannot import them stops here with a plain message, never a partial score.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCORER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scorer', 'score04.py');
const PY = process.env.BENCH_SCORE_PYTHON || 'python3';

const probe = spawnSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error(`bench:score04: ${PY} cannot import numpy, scipy, scikit-image and Pillow (bench/scorer/requirements.txt). Set BENCH_SCORE_PYTHON to a python that can.`);
  process.exit(2);
}
const r = spawnSync(PY, [SCORER, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 2);
