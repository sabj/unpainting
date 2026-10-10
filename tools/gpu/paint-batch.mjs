// node tools/gpu/paint-batch.mjs --config sweep.json
// Paint N sheets in one process: each sheet's painter (tools/paint-plate.mjs) runs in its own thread, and one GPU thread
// (src/media/gpu/batch-server.mjs) holds all N sheets in a SheetBatch, so their fluid steps run as shared dispatches.
// Config: { "out": "work/batch/run1", "base": [paint-plate args shared by every sheet, including --image and --width],
//           "sheets": [ { "label": "water07", "args": ["--productionwater", ".7"] }, ... ] }
// Each sheet writes to OUT/<label>/ (its paint-plate --out) with its log in OUT/<label>.log; OUT/batch.json has the timings.
import fs from 'node:fs';
import path from 'node:path';
import { Worker, MessageChannel } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfgPath = process.argv[process.argv.indexOf('--config') + 1];
if (!process.argv.includes('--config') || !cfgPath) { console.error('usage: node tools/gpu/paint-batch.mjs --config sweep.json'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (!Array.isArray(cfg.sheets) || !cfg.sheets.length || cfg.sheets.length > 4096) throw new Error('config: 1 to 4096 sheets');
const labels = new Set(); for (const s of cfg.sheets) { if (!/^[\w.-]+$/.test(s.label ?? '') || labels.has(s.label)) throw new Error(`config: bad or repeated label ${s.label}`); labels.add(s.label); }
if (!Array.isArray(cfg.base) || !cfg.base.length) throw new Error('config: base must be a non-empty list of paint-plate args');
const base = cfg.base;
const out = path.resolve(root, cfg.out ?? `work/batch/${new Date().toISOString().replace(/[:.]/g, '')}`);
fs.mkdirSync(out, { recursive: true });
// env copied into each worker at start: paint-plate's GPU defaults, set before the GPU thread
process.env.GPU_RESIDENT ??= '1'; process.env.GPU_COMPOSITE ??= '1'; process.env.GPU_ASYNC_DRY ??= '1';
process.env.DAWN_FLAGS ??= 'backend=metal';
// 64 MiB stroke plans so big wash strokes fit the GPU plan buffer and none falls back to blocking CPU reads
process.env.GPU_STROKE_PLAN_MIB ??= 'auto64';
process.env.W2_CACHE_DIR ??= path.join(root, 'work/batch-cache', path.basename(out));

const N = cfg.sheets.length, t0 = performance.now(), sheets = [];
// concurrent (config or BATCH_CONCURRENT): max sheets painting at once; a finished slot takes the next sheet (default: all)
const C = Math.max(1, Math.min(N, Number(process.env.BATCH_CONCURRENT ?? cfg.concurrent ?? N)));
// BATCH_SERVERS=k: k GPU threads, each its own device and SheetBatch; sheets dealt round robin
const NSRV = Math.max(1, Math.min(C, Number(process.env.BATCH_SERVERS ?? 2)));
const servers = [];
for (let k = 0; k < NSRV; k++) {
  const count = Math.ceil((C - k) / NSRV);
  const sv = new Worker(path.join(root, 'src/media/gpu/batch-server.mjs'), { workerData: { sheets: count } });
  sv.on('error', e => { console.error('batch GPU thread failed', e); process.exit(1); });
  await new Promise(r => sv.once('message', r)); servers.push(sv);
}
const where = sid => ({ server: servers[sid % NSRV], local: Math.floor(sid / NSRV) });
const paint = (s, sid, slot) => new Promise(resolve => {
  const dir = path.join(out, s.label); fs.rmSync(dir, { recursive: true, force: true });
  const log = fs.createWriteStream(path.join(out, `${s.label}.log`));
  const { port1, port2 } = new MessageChannel();
  where(slot).server.postMessage({ type: 'sheet', sid: where(slot).local, port: port2 }, [port2]);
  const argv = [...base, ...(s.args ?? []), '--out', dir], start = performance.now();
  fs.writeFileSync(path.join(out, `${s.label}.command.json`), JSON.stringify({ argv, env: { DAWN_FLAGS: process.env.DAWN_FLAGS, W2_CACHE_DIR: process.env.W2_CACHE_DIR }, sheet: sid, slot, of: N, concurrent: C }, null, 2));
  const w = new Worker(path.join(root, 'tools/paint-plate.mjs'), { argv, workerData: { gpuBatchPort: port1 }, transferList: [port1], stdout: true, stderr: true });
  w.stdout.pipe(log); w.stderr.pipe(log);
  let error = null; w.on('error', e => { error = String(e.stack ?? e); log.write(`\n[paint-batch] thread error ${error}\n`); });
  w.on('exit', code => { where(slot).server.postMessage({ type: 'gone', sid: where(slot).local }); const rec = { label: s.label, sheet: sid, slot, startS: +((start - t0) / 1000).toFixed(1), code, error, wallS: +((performance.now() - start) / 1000).toFixed(1) }; sheets[sid] = rec; console.log(`[paint-batch] ${s.label} exit ${code} after ${rec.wallS} s`); log.end(); resolve(rec); });
});
let next = 0;
const lane = async slot => { while (next < N) { const sid = next++; await paint(cfg.sheets[sid], sid, slot); } };
await Promise.all(Array.from({ length: C }, (_, slot) => lane(slot)));
const allStats = []; for (const sv of servers) allStats.push(await new Promise(r => { sv.once('message', m => r(m)); sv.postMessage({ type: 'stats' }); }));
const stats = { stats: allStats.map(x => x.stats), workers: allStats.map(x => x.workers), gpuThreadBusy: allStats.map(x => x.gpuThreadBusy), ops: allStats[0].ops };
const wallS = (performance.now() - t0) / 1000, ok = sheets.filter(s => s.code === 0 && !s.error).length;
const summary = { sheets: N, concurrent: C, ok, wallS: +wallS.toFixed(1), jobsPerMin: +(ok / wallS * 60).toFixed(2), perSheet: sheets, batch: stats.stats, workers: stats.workers, gpuThreadBusy: stats.gpuThreadBusy, ops: stats.ops, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(BATCH_|GPU_)/.test(k))), dawn: process.env.DAWN_FLAGS, config: path.resolve(cfgPath) };
fs.writeFileSync(path.join(out, 'batch.json'), JSON.stringify(summary, null, 2));
console.log(`[paint-batch] ${ok}/${N} sheets in ${summary.wallS} s: ${summary.jobsPerMin} jobs/min`);
for (const sv of servers) await sv.terminate();
process.exit(ok === N ? 0 : 1);
