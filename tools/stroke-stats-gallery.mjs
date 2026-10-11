#!/usr/bin/env node
// Build a gallery from [{title,version,run,sheetmm,commit,args}, ...]. Unmeasured references use {image,reason,url}.
import fs from 'node:fs';
import path from 'node:path';
import { loadStats, panelSVG } from './stroke-stats.mjs';
import { evaluateGate } from './stroke-gate.mjs';
const [manifest,out] = process.argv.slice(2);
if(!manifest||!out)throw new Error('usage: stroke-stats-gallery.mjs manifest.json gallery-directory');
fs.mkdirSync(out,{recursive:true});
const rows=JSON.parse(fs.readFileSync(manifest,'utf8')), records=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>x==null?'unmeasured':(100*x).toFixed(1)+'%';
for(const [i,row] of rows.entries()) {
 const key='painting-'+i;
 const image=row.image??path.join(row.run,'paint/painting.jpg');
 const dest=key+path.extname(image);fs.copyFileSync(image,path.join(out,dest));
 if(row.reason){records.push({...row,image:dest});continue;}
 let stats;
 try {stats=await loadStats(row.tape??row.run,{sheetmm:row.sheetmm,...row.compositionInputs});}
 catch(e) {
  if(!row.archivedStats || (e.code!=='ENOENT'&&!e.message.startsWith('run has no mark tape')))throw e;
  stats=JSON.parse(fs.readFileSync(row.archivedStats,'utf8'));
  if(!stats.composition?.broadAreasMeasured){stats.composition=null;stats.measurementUnavailable='Original stroke tape and command log were pruned by sweepd for low disk space; weighted broad-area metrics cannot be recomputed from archived counts.';}
  else {stats.composition.depositMeasured=stats.composition.attributedVisibleShare>0;stats.measurementCache=row.archivedStats;}
 }
 const gate=evaluateGate(stats);
 fs.writeFileSync(path.join(out,key+'.json'),JSON.stringify({...stats,provenance:row},null,2));
 fs.writeFileSync(path.join(out,key+'.svg'),panelSVG(stats,{title:row.title+' '+row.version}));
 fs.writeFileSync(path.join(out,key+'-gate.json'),JSON.stringify(gate,null,2));
 records.push({...row,image:dest,stats,gate,key});
}
function card(r){
 const title=r.title+' '+(r.version??'');
 let h=`<article><h3>${esc(title)}</h3><a class="lightbox-link" href="${esc(r.image)}" data-caption="${esc(title)}"><img loading="lazy" src="${esc(r.image)}" alt="${esc(title)}"></a>`;
 if(r.stats){const m=r.stats.metrics,c=r.stats.composition;
 h+=`<a class="lightbox-link" href="${r.key}.svg" data-caption="${esc(title)}: stroke panel"><img loading="lazy" src="${r.key}.svg" alt="${esc(title)} stroke panel"></a>`;
 if(c){h+=`<p>Tiny paint covers ${pct(c.tinyCoveredSheetShare)} of the sheet. Tiny visible contribution: ${pct(c.tinyVisibleShare)} of paint, ${pct(c.tinyFinalPaperDifferenceShare)} of the final tone and colour difference from paper.</p><details><summary>${c.broadAreas.length} planned broad wash interiors: tiny marks instead of wash</summary><table><thead><tr><th>Broad area</th><th>Area carried by tiny marks</th><th>Tiny visible contribution</th><th>Tiny only</th></tr></thead><tbody>${c.broadAreas.map(a=>`<tr><td>${esc(a.label)}<br><small>${a.areaMm2.toFixed(1)} mm²</small></td><td>${pct(a.tinyCarriedAreaShare)}</td><td>${pct(a.tinyVisibleShare)}</td><td>${pct(a.tinyOnlyShare)}</td></tr>`).join('')}</tbody></table><p>One millimetre around planned boundaries and features is exempt. Each interior must stay at or below 30% tiny area and visible contribution. These are deposit estimates, not a fluid replay.</p></details>`;}
 else h+=`<p class="warning">${esc(r.stats.measurementUnavailable??'Weighted broad areas unmeasured.')}</p>`;
 h+=`<p>${r.stats.measurementUnavailable?'Archived ':''}secondary count shares: under 1 mm wide ${pct(m.paintUnder1MmShare)}; under 3 mm long ${pct(m.paintUnder3MmLongShare)}; either ${pct(m.tinyPaintShare)}.</p>`;
 if(!r.gate.verified)h+='<p class="unmeasured">Unmeasured: broad-area reliance is awaiting the original stroke records.</p>';
 else h+=r.gate.passes?'<p class="pass">Passed the broad-area tiny-mark checks.</p>':'<ul class="warning">'+r.gate.flags.map(f=>'<li>'+esc(f.message)+'</li>').join('')+'</ul>';
 h+=`<p><a href="${r.key}.json">Measurements and provenance</a> · <a href="${r.key}-gate.json">Gate report</a></p><details><summary>Run settings</summary><p>Sheet ${r.stats.sheet.widthMm.toFixed(1)} mm. ${esc(r.stats.sizeSource)}. Commit ${esc(r.commit)}.</p><pre>${esc(JSON.stringify(r.args??[],null,2))}</pre><p>${esc(r.run)}</p></details>`;
 }else h+=`<p>${esc(r.reason)}</p><p><a href="${esc(r.url)}">Artist source</a></p>`;
 return h+'</article>';
}
const passed=records.filter(r=>r.gate?.passes),warnings=records.filter(r=>r.gate?.verified&&!r.gate.passes),unmeasured=records.filter(r=>r.gate&&!r.gate.verified),real=records.filter(r=>r.reason);
const summary={paintings:records.filter(r=>r.stats).length,weightedMeasured:records.filter(r=>r.gate?.verified).length,passed:passed.length,warnings:warnings.length,unmeasured:unmeasured.length,humanReferences:real.length};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(records,null,2));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stroke sizes and tiny-dab gate</title><style>body{font:16px/1.5 system-ui;background:#f7f4ec;color:#242424;margin:auto;padding:20px;max-width:1200px}h1,h2,h3{font-weight:500}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:24px}article{background:white;padding:16px;border:1px solid #ddd}article img{max-width:100%;max-height:480px;display:block;margin:auto}a{color:#1e5b83}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:6px}.unmeasured{color:#666}.warning{color:#893c12}.pass{color:#286443}dialog{border:0;background:#181818;color:white;max-width:100vw;max-height:100vh;padding:12px;width:calc(100vw - 32px)}dialog::backdrop{background:#000c}dialog img{display:block;max-width:100%;max-height:82vh;margin:auto}dialog button{font:inherit;padding:8px 16px;background:#fff;color:#222;border:0;cursor:pointer}.controls{display:flex;justify-content:space-between;gap:10px}#caption{text-align:center;margin:6px}</style><h1>Stroke sizes and tiny-dab gate</h1><p>Seven subjects, v0.1.0 and RC2. The main check is where tiny paint carries a broad low-detail wash interior. Tiny marks on boundaries, textures and small features are exempt. Count shares are secondary.</p><p>The bar apportions the visible paint portion of the final image to large washes, mid marks and tiny marks. Tiny means under 1 mm wide or 3 mm long. Coverage is a clipped union. Observed per-stroke pigment loss is used where available; other marks use recorded finite brush loads. Final tone and colour differences from paper weight each cell, with the ink-first contribution removed.</p><p>Limits: at most 30% tiny area or visible paint contribution in each planned broad interior. Global counts, largest brush and old swept wash shares do not gate. Historical broad areas come from connected value-shape plan clips (including glazes), at least 1% of the sheet and 3 mm support width. One millimetre around all planned value and feature boundaries is excluded.</p><p>These are CPU estimates, without wet spreading or lifting replay. The grey portion of the bar is unattributed visible paint. Thresholds are provisional, with different historical densities recorded in provenance. ${summary.weightedMeasured} paintings have weighted broad-area measurements; ${summary.unmeasured} await pruned stroke records.</p><h2>Proposed: passed checks, ready to judge</h2><p>${passed.length} historical examples pass this stroke gate. Sam's visual judgment still determines painting quality.</p><div class="cards">${passed.map(card).join('')}</div><h2>Work in progress and rejected</h2><p>${warnings.length} historical examples trigger warnings. The default gate permits rendering; hard rejection is optional.</p><div class="cards">${warnings.map(card).join('')}</div><h2>Historical paintings awaiting stroke records</h2><div class="cards">${unmeasured.map(card).join('')}</div><h3>Human process references with unmeasured stroke sizes</h3><p>These references show real process but do not contain physical sheet calibration and a per-stroke track. They cannot establish numeric separation from simulated strokes. No fabricated millimeter histogram is assigned.</p><div class="cards">${real.map(card).join('')}</div><dialog id="lightbox"><div class="controls"><button id="prev" aria-label="Previous image">Previous</button><button id="close">Close</button><button id="next" aria-label="Next image">Next</button></div><p id="caption"></p><img id="full" alt=""></dialog><script>const links=[...document.querySelectorAll('.lightbox-link')],d=document.querySelector('#lightbox'),im=document.querySelector('#full'),cap=document.querySelector('#caption');let at=0,startX=0;function show(i){at=(i+links.length)%links.length;im.src=links[at].href;im.alt=links[at].dataset.caption;cap.textContent=im.alt+' ('+(at+1)+' / '+links.length+')'}links.forEach((a,i)=>a.onclick=e=>{e.preventDefault();show(i);d.showModal()});document.querySelector('#close').onclick=()=>d.close();document.querySelector('#prev').onclick=()=>show(at-1);document.querySelector('#next').onclick=()=>show(at+1);document.addEventListener('keydown',e=>{if(!d.open)return;if(e.key==='ArrowRight'){e.preventDefault();show(at+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(at-1)}});d.addEventListener('touchstart',e=>startX=e.changedTouches[0].clientX,{passive:true});d.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>45)show(at+(dx<0?1:-1))},{passive:true});d.onclick=e=>{if(e.target===d)d.close()};</script></html>`);
console.log(JSON.stringify(summary));
