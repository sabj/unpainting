#!/usr/bin/env node
// Summarize executed instrument records separately from raster scan proxies.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';

export function distribution(values) {
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return {n:0};
  const mean=a.reduce((s,v)=>s+v,0)/a.length;
  const q=p=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];
  return {n:a.length,min:a[0],p10:q(.1),median:q(.5),p90:q(.9),max:a.at(-1),
    cv:mean?Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length)/mean:0};
}
export function drawingAudit(records) {
  const opening=records.filter(r=>r.stage==='opening'),closing=records.filter(r=>r.stage==='closing');
  const summarize=rs=>({gestures:rs.length,totalPathLengthMm:rs.reduce((s,r)=>s+(r.pathLengthMm??0),0),
    pathLengthMm:distribution(rs.map(r=>r.pathLengthMm)),
    contactWidthMm:distribution(rs.flatMap(r=>r.contactWidthMm??[])),
    physicalPressure:distribution(rs.flatMap(r=>r.physicalPressure??[])),
    pressureShares:distribution(rs.flatMap(r=>r.pressureShares??[])),
    speedCellsPerTime:distribution(rs.flatMap(r=>r.speeds??[])),
    dwellTime:rs.reduce((s,r)=>s+(r.dwellTime??0),0),
    refillThreshold:distribution(rs.map(r=>r.refillThreshold)),
    startingFill:distribution(rs.map(r=>r.instrument?.fill)),
    inkAfter:distribution(rs.map(r=>r.inkAfter)),
    reloadsWithinStrokes:rs.reduce((s,r)=>s+(r.reloadsWithinStroke??0),0),
    maximumSurfaceWater:Math.max(0,...rs.map(r=>r.before?.water??0)),
    maximumPoreSaturation:Math.max(0,...rs.map(r=>r.before?.pore??0)),
    techniques:[...new Set(rs.map(r=>r.technique))],materials:[...new Set(rs.map(r=>r.material))]});
  return {kind:'executed instrument records, not inferred from raster',opening:summarize(opening),closing:summarize(closing)};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const args=process.argv.slice(2),i=args.indexOf('--out'),out=i<0?null:args[i+1];
 const dirs=i<0?args:args.slice(0,i),rows=dirs.map(dir=>{
  const p=path.join(dir,'pen-state-audit.json');
  const data=fs.existsSync(p)?fs.readFileSync(p):gunzipSync(fs.readFileSync(p+'.gz'));
  return {run:path.basename(dir),...drawingAudit(JSON.parse(data))};
 });
 const text=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
 if(out)fs.writeFileSync(out,text);else process.stdout.write(text);
}
