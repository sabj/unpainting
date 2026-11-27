#!/usr/bin/env node
// Node stops parsing test options at the first file pattern. Put npm's extra
// arguments before the patterns so worker limits, reporters and filters work.
import { spawnSync } from 'node:child_process';

const suites = {
  source: { options: ['--test-timeout=300000'], files: ['src/**/*.test.mjs', 'tools/**/*.test.mjs'] },
  bench: { options: [], files: ['bench/scripts/*.test.mjs', 'bench/v6/*.test.mjs'] },
};
const [name, ...options] = process.argv.slice(2), suite = Object.hasOwn(suites, name) ? suites[name] : null;
if (!suite) {
  console.error('test-runner: choose source or bench');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...suite.options, ...options, ...suite.files], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.signal) process.kill(process.pid, result.signal);
  process.exitCode = result.status ?? 1;
}
