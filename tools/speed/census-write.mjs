// Node-only census export; physical media stay browser-loadable.
import fs from 'node:fs';
import path from 'node:path';
import { layerStorageStats } from '../../src/media/layer-storage.mjs';
import { census } from '../../src/media/census.mjs';
export function writeCensus(out, sheets, stats = census) {
  if (!stats) return;
  const layers = Object.fromEntries(Object.entries(sheets).filter(([,s]) => s).map(([name,s]) => {
    const storage=layerStorageStats(s);
    return [name, {...storage,allocatedPlaneBytes:storage.allocatedBytes}];
  }));
  const jsonlBytes = Object.fromEntries(fs.readdirSync(out).filter(f => f.endsWith('.jsonl')).map(f => [f, fs.statSync(path.join(out,f)).size]));
  fs.writeFileSync(path.join(out,'census.json'), JSON.stringify({ ...stats, layers, jsonlBytes,
    maxRSSKiB: process.resourceUsage().maxRSS,
    scope: 'Counts include calibration/scrap sheets. firstMarkSeconds is first brush/pen API call, possibly calibration. Allocated bytes describe CPU storage; nonzero plane counts include pending GPU masks. Times are nested, never additive.' }, null, 2));
}
