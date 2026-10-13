// Which sheet backend a run used, said loudly and kept with the run. The CPU sheet and the GPU sheet each repeat
// themselves, but they paint differently (about a fifth of Mittens' pixels change at 540 px), so a run that fell back to
// the CPU must say so, and two runs on different backends must not be compared as if the change under test made the
// difference.
//
//   cpuFallbackWarning(reason)      the warning attachGpu (link.mjs) prints when --gpu auto falls back to the CPU sheet
//   backendLine(info)               one summary line: the backend used, the adapter, the requested mode, any fallback
//   assertSameBackend(dirs, opts)   for tools that compare runs: reads each run directory's backend.json and throws when
//                                   the backends differ. opts.allowMixed (a deliberate CPU/GPU parity check) only
//                                   warns. A run without backend.json is reported as unknown, not refused.
import fs from 'node:fs';
import path from 'node:path';

export const cpuFallbackWarning = reason => `WARNING: the GPU sheet is unavailable (${reason}). This run paints on the CPU sheet, which paints differently from the GPU sheet: do not compare it with GPU runs. Use --gpu on to stop instead, or --gpu off to choose the CPU.`;

const adapterName = info => {
  const a = info?.adapterEvidence?.adapterInfo ?? {};
  return [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' ');
};

export function backendLine(info) {
  const mode = `--gpu ${info?.mode ?? 'auto'}`;
  if (info?.backend === 'gpu') return `sheet backend: gpu (${[info.adapter, adapterName(info)].filter(Boolean).join(', ')}; ${mode})`;
  if (info?.fallback) return `sheet backend: cpu, FALLBACK from ${mode}: ${info.reason}`;
  return `sheet backend: cpu (${info?.reason ?? mode})`;
}

// what has to match: the backend, and on the GPU the adapter when both runs recorded it
function readBackend(dir) {
  const file = path.join(dir, 'backend.json');
  if (!fs.existsSync(file)) return null;
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { backend: info.backend ?? 'unknown', adapter: info.backend === 'gpu' ? adapterName(info) : '', line: backendLine(info) };
}

export function assertSameBackend(dirs, { allowMixed = false, log = m => console.warn(m) } = {}) {
  const runs = dirs.map(dir => ({ dir, rec: readBackend(dir) }));
  for (const r of runs) if (!r.rec) log(`WARNING: ${r.dir} has no backend.json; cannot check that the runs used the same sheet backend`);
  const known = runs.filter(r => r.rec);
  const differ = known.some(r => r.rec.backend !== known[0].rec.backend || (r.rec.adapter && known[0].rec.adapter && r.rec.adapter !== known[0].rec.adapter));
  if (!differ) return true;
  const msg = `the runs used different sheet backends (${known.map(r => `${r.dir}: ${r.rec.line}`).join('; ')}). CPU and GPU sheets paint differently, so this comparison would mix the backend into the change under test.`;
  if (!allowMixed) throw new Error(`refusing to compare: ${msg} Pass --mixedbackends for a deliberate CPU/GPU parity check.`);
  log(`WARNING: ${msg}`);
  return false;
}
