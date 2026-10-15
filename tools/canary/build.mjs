// Add a clean candidate to a preserved canary. The baseline directory is copied verbatim; its page remains in baseline.html.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const read = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : null;
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const esc = v => String(v??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function drawingLabel(card, linework) {
 const stages=linework?.stages;
 if(stages) return [['prep','graphite preparation'],['prepInk','opening ink'],['finishInk','finishing ink']].filter(([k])=>stages[k]?.lines>0).map(([k,label])=>`${label} (${stages[k].lines} planned paths)`).join('; ') || 'no planned drawing paths';
 const d=card?.drawing;
 return d?.order==='none'?'none':d?`${d.medium}, drawing ${d.order} (legacy record)`:'not recorded';
}
export function renderRecord(pdir) {
 const card=read(path.join(pdir,'run-card.json')),backend=read(path.join(pdir,'backend.json')),frames=read(path.join(pdir,'frames.json'));
 if(!backend||!frames) throw Error(`missing render metadata: ${pdir}`);
 const commits=[card?.codeSHA,backend.commit,frames.commit].filter(Boolean);
 if(new Set(commits).size!==1)throw Error(`inconsistent render commits: ${pdir}`);
 const code=read(path.join(pdir,'code-state.json'));
 if(code?.dirty||commits[0]?.endsWith('-dirty'))throw Error(`dirty render: ${pdir}`);
 const painting=path.join(pdir,'painting.png');
 if(card?.paintingSHA256&&card.paintingSHA256!==sha(painting))throw Error(`painting hash mismatch: ${pdir}`);
 return {commit:commits[0],release:backend.release,medium:drawingLabel(card,read(path.join(pdir,'linework.json'))),frames:frames.frames,
  strokes:read(path.join(pdir,'cheat-risk.json'))?.strokes,metrics:read(path.join(pdir,'stroke-stats.json'))?.metrics,gate:read(path.join(pdir,'stroke-gate.json'))};
}
export function build({baseline,runs,out,historyRuns}) {
 baseline=path.resolve(baseline);out=path.resolve(out);runs=path.resolve(runs);
 if(out===baseline||baseline.startsWith(out+path.sep)||out.startsWith(baseline+path.sep))throw Error('candidate output must be separate from the preserved baseline');
 const source=fs.readFileSync(path.join(baseline,'index.html'),'utf8'),data=read(path.join(baseline,'play/play-data.json')),ids=read(path.join(baseline,'ids.json'));
 fs.mkdirSync(out,{recursive:true});fs.cpSync(baseline,out,{recursive:true});fs.writeFileSync(path.join(out,'baseline.html'),source);
 const versions=['V01','R4','RC5','RC6'],subjects=Object.keys(data.meta),D={...data.play};
 for(const s of subjects) {
  if(historyRuns)for(const v of versions.filter(v=>v!=='RC6')) {
   const p=path.join(historyRuns,v,s,'p');if(!fs.existsSync(path.join(p,'backend.json')))continue;
   const r=renderRecord(p);Object.assign(data.meta[s][v],{commit:r.commit,medium:r.medium});
   const id=data.meta[s][v].id;if(ids[id])Object.assign(ids[id],{commit:r.commit,medium:r.medium});
  }
  const pdir=path.join(runs,s,'p'),r=renderRecord(pdir),png=path.join(pdir,'painting.png');
  const dst=`img/rc6/${s}.png`;fs.mkdirSync(path.join(out,'img/rc6'),{recursive:true});fs.copyFileSync(png,path.join(out,dst));
  const id=`${data.meta[s].code}-RC6_${sha(png).slice(0,4)}`;
  data.meta[s].RC6={...r,frames:undefined,id,img:dst};ids[id]={subject:s,version:'RC6',commit:r.commit,release:r.release,medium:r.medium,file:dst,imageSHA256:sha(png)};
  const dir=path.join(out,'play/RC6',s);fs.mkdirSync(dir,{recursive:true});
  D[s+'-RC6']=Array.from({length:120},(_,k)=>{
   const index=Math.round(k*(r.frames.length-1)/119),f=r.frames[index],src=`play/RC6/${s}/n${String(k).padStart(4,'0')}.jpg`;
   if(!f?.src)throw Error(`missing saved frame ${s}/${index}`);
   fs.copyFileSync(path.join(pdir,f.src),path.join(out,src));
   return {src,text:`saved stage ${index+1}/${r.frames.length} | ${f.stage??''} | ${f.step??''}`};
  });
 }
 const info=m=>`commit: ${esc(m.commit)} · ${esc(m.release??'historical')} · ${esc(m.medium)}${m.strokes!=null?` · ${m.strokes} strokes`:''}`;
 const figure=(s,v,play)=>{
  const m=data.meta[s][v];if(!m)return '';
  const key=s+'-'+v,src=play?D[key]?.[0]?.src??m.img:m.img;
  return `<figure><span class="pid">${esc(m.id)}</span><a href="${esc(m.img)}" data-lb><img ${play?`id="img-${key}"`:''} src="${esc(src)}" alt="${esc(m.id)}"></a><figcaption>${v} · ${info(m)}</figcaption>${play?`<pre class="term" id="txt-${key}"></pre>`:''}</figure>`;
 };
 const target=s=>{const m=data.meta[s].P;return `<figure><span class="pid">${esc(m.id)}</span><a href="${esc(m.img)}" data-lb><img src="${esc(m.img)}" alt="Reference ${esc(s)}"></a><figcaption>Reference</figcaption></figure>`;};
 const rows=subjects.map(s=>`<section class="subject-block" id="play-${s}"><div class="subj-head"><h2>${esc(data.meta[s].title)}</h2><div class="ctl"><button class="play-btn" data-s="${s}">Play</button><input type="range" min="0" max="1000" value="0" data-s="${s}" aria-label="${esc(s)} saved-stage progress"><span id="pct-${s}">0%</span></div></div><div class="row" data-sync-row="play-${s}">${target(s)}${versions.map(v=>figure(s,v,true)).join('')}</div><details><summary>Final images and candidate measurements</summary><div class="row" data-sync-row="static-${s}">${target(s)}${versions.map(v=>figure(s,v,false)).join('')}</div><pre>${esc(JSON.stringify({metrics:data.meta[s].RC6.metrics,gate:data.meta[s].RC6.gate},null,2))}</pre></details></section>`).join('\n');
 const css=source.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
 let script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];if(!script)throw Error('preserved canary has no playback script');
 const json=v=>JSON.stringify(v).replaceAll('<','\\u003c');
 script=script.replace(/const D = .*?;\nconst SUBJS = .*?;/s,`const D = ${json(D)};\nconst SUBJS = ${json(subjects)};`).replace("['V01', 'R4', 'RC5']","['V01', 'R4', 'RC5', 'RC6']");
 // Start paused so the reference and final-image controls are immediately usable.
 script=script.replace('SUBJS.forEach(s => { show(s, 0); startTimer(s); });','SUBJS.forEach(s => { show(s, 0); });');
 const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>0.2.0-rc.6 canary</title><style>${css}\nbody{max-width:2000px}.row{grid-template-columns:repeat(5,minmax(0,1fr))}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:960px){.row{grid-template-columns:1fr 1fr}}</style></head><body><div class="topbar"><h1>0.2.0-rc.6 · preserved controls + new candidate</h1><div class="global-ctl"><button id="btn-loupe">Loupe: OFF</button><label>Zoom <select id="loupe-zoom"><option>2x</option><option selected>3x</option><option>4x</option></select></label><button id="btn-all">Play All</button><label>Speed <select id="speed-sel"><option value="160">0.5x</option><option value="80" selected>1x</option><option value="40">2x</option></select></label><label><input type="checkbox" id="chk-loop" checked>Loop</label></div></div><p><a href="baseline.html">Original archived comparison</a> · <a href="ids.json">Image provenance</a>. Candidate playback advances through saved stages; it is not a count of individual strokes. Captions read each render's recorded commit and drawing stages. Historical media records may be incomplete. Candidate pigment physics and paper-colour stage are opt-in; the latter selects substrate colour without depositing paint.</p>${rows}<div id="lb" onclick="this.style.display='none'"><img alt="Expanded painting"></div><script>${script}</script></body></html>`;
 fs.writeFileSync(path.join(out,'index.html'),page);fs.writeFileSync(path.join(out,'ids.json'),JSON.stringify(ids,null,2)+'\n');fs.writeFileSync(path.join(out,'play/play-data.json'),JSON.stringify({...data,play:D})+'\n');
 return {subjects:subjects.length,candidateFrames:subjects.length*120,out};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>(i%2===0&&a.push([v.slice(2),all[i+1]]),a),[]));
 if(!args.baseline||!args.runs||!args.out)throw Error('--baseline, --runs and --out are required');
 console.log(JSON.stringify(build({...args,historyRuns:args['history-runs']})));
}
