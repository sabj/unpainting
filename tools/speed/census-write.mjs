// Node-only census export; physical media stay browser-loadable.
import fs from 'node:fs';
import path from 'node:path';
import { census } from '../../src/media/census.mjs';
export function writeCensus(out, sheets, stats = census) {
  if (!stats) return;
  const layers = Object.fromEntries(Object.entries(sheets).filter(([,s]) => s).map(([name,s]) => {
    const planes=s.layers.flat(), unique=[...new Set(planes)], buffers=[...new Set(planes.map(p=>p.buffer))];
    const nonzero=new Set(unique.filter(p=>p.some(v=>v!==0)));
    return [name, { layers:s.layers.length, planeReferences:planes.length, uniquePlanes:unique.length,
      logicalPlaneBytes:planes.reduce((n,p)=>n+p.byteLength,0),
      allocatedPlaneBytes:buffers.reduce((n,b)=>n+b.byteLength,0),
      nonzeroPlanes:planes.filter(p=>nonzero.has(p)).length, uniqueNonzeroPlanes:nonzero.size }];
  }));
  const jsonlBytes = Object.fromEntries(fs.readdirSync(out).filter(f => f.endsWith('.jsonl')).map(f => [f, fs.statSync(path.join(out,f)).size]));
  fs.writeFileSync(path.join(out,'census.json'), JSON.stringify({ ...stats, layers, jsonlBytes,
    maxRSSKiB: process.resourceUsage().maxRSS,
    scope: 'Counts include calibration/scrap sheets. firstMarkSeconds is first brush/pen API call, possibly calibration. Layer arrays are CPU allocations, not authoritative deferred GPU content. Times are nested, never additive.' }, null, 2));
}
