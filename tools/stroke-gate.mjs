#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, loadStats, normalize, summarize } from './stroke-stats.mjs';

// Provisional engineering limits calibrated on the historical seven-subject set. See docs/stroke-stats.md.
export const DEFAULT_THRESHOLDS = Object.freeze({ maxTinyPaintShare: .30, maxUnder1MmShare: .20, maxUnder3MmLongShare: .25,
  minLargestPaintWidthSheetFraction: .10, minBroadWashAreaShare: .50, minEarlyBroadWashCount: 1 });
export function thresholds(overrides = {}) {
  if (!overrides || Array.isArray(overrides) || typeof overrides !== 'object') throw new Error('threshold config must be an object');
  for (const [key,v] of Object.entries(overrides)) {
    if (!(key in DEFAULT_THRESHOLDS)) throw new Error('unknown stroke threshold '+key);
    if (!Number.isFinite(v) || v < 0 || (key !== 'minEarlyBroadWashCount' && v > 1) || (key === 'minEarlyBroadWashCount' && !Number.isInteger(v))) throw new Error('invalid stroke threshold '+key);
  }
  return {...DEFAULT_THRESHOLDS,...overrides};
}
export function evaluateGate(stats, { mode = 'warn', config = {} } = {}) {
  if (!['warn','reject','off'].includes(mode)) throw new Error('stroke gate mode must be warn, reject or off');
  const limits = thresholds(config), flags = [];
  const add = (code,message) => flags.push({code,message});
  if (!stats?.counts?.paint) add('unmeasured','No paint strokes measured; stroke-size admission is unverified.');
  else {
    const m=stats.metrics, pct=x=>(x*100).toFixed(1)+'%';
    for (const key of ['tinyPaintShare','paintUnder1MmShare','paintUnder3MmLongShare','largestPaintWidthSheetFraction','broadWashAreaShare','earlyBroadWashCount'])
      if (!Number.isFinite(m?.[key]) || m[key] < 0) throw new Error('invalid or missing measured metric '+key);
    for (const [metric,limit,label] of [['tinyPaintShare','maxTinyPaintShare','Paint marks under 1 mm wide or under 3 mm long'],['paintUnder1MmShare','maxUnder1MmShare','Paint marks under 1 mm wide'],['paintUnder3MmLongShare','maxUnder3MmLongShare','Paint marks under 3 mm long']])
      if(m[metric]>limits[limit])add(metric,`${label}: ${pct(m[metric])}, above ${pct(limits[limit])}.`);
    if(m.largestPaintWidthSheetFraction<limits.minLargestPaintWidthSheetFraction)add('smallLargestBrush',`Largest paint contact is ${pct(m.largestPaintWidthSheetFraction)} of sheet width, below ${pct(limits.minLargestPaintWidthSheetFraction)}.`);
    if(m.broadWashAreaShare<limits.minBroadWashAreaShare)add('tooLittleBroadWash',`Washes wider than a tenth of the sheet supply ${pct(m.broadWashAreaShare)} of swept paint area, below ${pct(limits.minBroadWashAreaShare)}.`);
    if(m.earlyBroadWashCount<limits.minEarlyBroadWashCount)add('missingEarlyWash',`Only ${m.earlyBroadWashCount} broad washes in the first quarter of paint marks; need ${limits.minEarlyBroadWashCount}.`);
  }
  return {version:1,mode,thresholds:limits,verified:!!stats?.counts?.paint,passes:flags.length===0,ok:mode!=='reject'||flags.length===0,flags};
}
export function admitStrokePlan(plan, options = {}) { return evaluateGate(summarize(normalize(plan)),options); }
export function printGate(report) {
  if(report.mode==='off')return;
  for(const f of report.flags)console.warn(`stroke gate ${report.mode === 'reject' ? 'reject' : 'warning'}: ${f.message}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const a=cliArgs(process.argv.slice(2)), config=a.config?JSON.parse(fs.readFileSync(a.config,'utf8')):{};
    const data=fs.statSync(a.file).isFile()&&a.file.endsWith('.json')?JSON.parse(fs.readFileSync(a.file,'utf8')):null;
    const stats=data?.version===1&&data.histograms&&data.metrics?data:loadStats(a.file,a);
    const report=evaluateGate(stats,{mode:a.mode??'warn',config}); printGate(report);
    if(a.out){fs.mkdirSync(path.dirname(path.resolve(a.out)),{recursive:true});fs.writeFileSync(a.out,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=4;
  }catch(e){console.error('stroke-gate: '+e.message);process.exitCode=2;}
}
