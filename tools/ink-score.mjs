#!/usr/bin/env node
// Offline developer measurement only. Never import from a painter or planner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.PAINTER_LINES_PYTHON || path.join(process.env.PAINTER_LINES_VENV || path.join(root, '.venv-lines'), 'bin/python');
if (!fs.existsSync(python)) throw Error(`Missing line-model Python: ${python}; set PAINTER_LINES_PYTHON to the repo line-model venv`);
const result = spawnSync(python, [path.join(root, 'tools/ink-score.py'), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, OMP_NUM_THREADS: '2' } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
