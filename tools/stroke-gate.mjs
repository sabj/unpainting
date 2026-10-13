#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, loadStats, normalize, summarize } from './stroke-stats.mjs';

// Provisional limits for broad low-detail interiors only. Counts and global brush sizes are diagnostics.
export const DEFAULT_THRESHOLDS = Object.freeze({maxBroadAreaTinyAreaShare:.30,maxBroadAreaTinyVisibleShare:.30,maxBroadAreaWiperShare:.30});
export function thresholds(overrides = {}) {
  if (!overrides || Array.isArray(overrides) || typeof overrides !== 'object') throw new Error('threshold config must be an object');
  for (const [key,v] of Object.entries(overrides)) {
    if (!(key in DEFAULT_THRESHOLDS)) throw new Error('unknown stroke threshold '+key);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('invalid stroke threshold '+key);
  }
  return {...DEFAULT_THRESHOLDS,...overrides};
}
export function evaluateGate(stats, { mode = 'warn', config = {} } = {}) {
  if (!['warn','reject','off'].includes(mode)) throw new Error('stroke gate mode must be warn, reject or off');
  const limits = thresholds(config), flags = [], c=stats?.composition;
  const verified=!!stats?.counts?.paint&&!!c?.broadAreasMeasured&&!!c?.depositMeasured;
  const pct=x=>(x*100).toFixed(1)+'%';
  if(verified) {
    if(!Array.isArray(c.broadAreas))throw Error('invalid or missing broad area measurements');
    for(const a of c.broadAreas) {
      for(const metric of ['tinyCarriedAreaShare','tinyVisibleShare'])
        if(a[metric]!==null&&(!Number.isFinite(a[metric])||a[metric]<0||a[metric]>1+1e-9))throw Error('invalid or missing measured metric '+metric);
      // Stats saved before the wiper detector have no wiper share; that metric stays unmeasured for them.
      if(a.windshieldWiperShare!==undefined&&(!Number.isFinite(a.windshieldWiperShare)||a.windshieldWiperShare<0||a.windshieldWiperShare>1+1e-9))throw Error('invalid measured metric windshieldWiperShare');
      for(const [metric,limit,label]of [['tinyCarriedAreaShare','maxBroadAreaTinyAreaShare','interior area carried by tiny marks'],['tinyVisibleShare','maxBroadAreaTinyVisibleShare','visible paint contribution from tiny marks'],['windshieldWiperShare','maxBroadAreaWiperShare','interior filled by narrow overlapping sweeps']])
        if(a[metric]>limits[limit])flags.push({code:metric,areaId:a.id,message:`${a.label}: ${label} ${pct(a[metric])}, above ${pct(limits[limit])}.`});
    }
  }
  const unmeasured=verified?null:'Broad wash interiors or pigment deposits are unmeasured; supply a passage plan and recorded loads. Count share cannot approve or reject a painting.';
  return {version:2,mode,thresholds:limits,verified,passes:verified&&flags.length===0,ok:mode!=='reject'||(verified&&flags.length===0),flags,unmeasured,
    basis:c?.finalImageMeasured?'estimated deposits weighted by final image':'planned or recorded deposit estimate; final appearance unverified'};
}
export function admitStrokePlan(plan, options = {}) { return evaluateGate(summarize(normalize(plan)),options); }
export function printGate(report) {
  if(report.mode==='off')return;
  const messages=[...(report.unmeasured?[report.unmeasured]:[]),...report.flags.map(f=>f.message)];
  for(const message of messages)console.warn(`stroke gate ${report.mode === 'reject' ? 'reject' : 'warning'}: ${message}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const a=cliArgs(process.argv.slice(2)), config=a.config?JSON.parse(fs.readFileSync(a.config,'utf8')):{};
    const data=fs.statSync(a.file).isFile()&&a.file.endsWith('.json')?JSON.parse(fs.readFileSync(a.file,'utf8')):null;
    const stats=data?.histograms&&data.metrics?data:await loadStats(a.file,a);
    const report=evaluateGate(stats,{mode:a.mode??'warn',config}); printGate(report);
    if(a.out){fs.mkdirSync(path.dirname(path.resolve(a.out)),{recursive:true});fs.writeFileSync(a.out,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=4;
  }catch(e){console.error('stroke-gate: '+e.message);process.exitCode=2;}
}
