// Add a clean candidate to a preserved canary. The baseline directory is copied verbatim; its page remains in baseline.html.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const read = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : null;
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const esc = v => String(v??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// Shared by the preserved RC5 page and the candidate: no automatic image streams.
function canaryPlayer(D, SUBJS) {
 const timers=new Map(),revisions=new Map();
 let speedMs=80,autoLoop=document.getElementById('chk-loop').checked,loupeOn=false,loupeZoom=3,activeRow=null,lastRx=.5,lastRy=.5;
 const range=s=>document.querySelector(`input[type=range][data-s="${s}"]`);
 const button=s=>document.querySelector(`button.play-btn[data-s="${s}"]`);
 const globalButton=document.getElementById('btn-all');
 const syncButton=()=>{globalButton.textContent=timers.size?'Pause All':'Play All';};
 function hide(row){row?.querySelectorAll('.loupe-lens').forEach(l=>{l.style.display='none';});}
 function loupe(row,rx,ry){
  row.querySelectorAll('figure').forEach(fig=>{
   const img=fig.querySelector('img'),lens=fig.querySelector('.loupe-lens');
   if(!img?.clientWidth||!lens)return;
   const w=img.clientWidth,h=img.clientHeight,L=Math.min(176,w,h),x=rx*w,y=ry*h;
   Object.assign(lens.style,{display:'block',width:L+'px',height:L+'px',left:Math.max(0,Math.min(w-L,x-L/2))+'px',top:Math.max(0,Math.min(h-L,y-L/2))+'px',backgroundImage:`url("${img.src}")`,backgroundSize:`${w*loupeZoom}px ${h*loupeZoom}px`,backgroundPosition:`${L/2-x*loupeZoom}px ${L/2-y*loupeZoom}px`});
  });
 }
 function toggleLoupe(){
  loupeOn=!loupeOn;document.body.classList.toggle('loupe-on',loupeOn);
  const b=document.getElementById('btn-loupe');b.textContent=`Loupe: ${loupeOn?'ON':'OFF'}`;b.classList.toggle('loupe-active',loupeOn);
  if(activeRow){if(loupeOn)loupe(activeRow,lastRx,lastRy);else hide(activeRow);}
 }
 document.getElementById('btn-loupe').onclick=toggleLoupe;
 document.getElementById('loupe-zoom').onchange=function(){loupeZoom=Number(this.value)||3;if(loupeOn&&activeRow)loupe(activeRow,lastRx,lastRy);};
 const lightbox=document.getElementById('lb');
 lightbox.onclick=()=>{lightbox.style.display='none';};
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape')lightbox.style.display='none';
  if((e.key==='l'||e.key==='L')&&!e.repeat&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))toggleLoupe();
 });
 document.querySelectorAll('.row').forEach(row=>{
  row.querySelectorAll('figure').forEach(fig=>{
   const img=fig.querySelector('img');if(!img)return;
   const lens=document.createElement('div');lens.className='loupe-lens';
   const label=document.createElement('span');label.className='loupe-label';label.textContent=fig.dataset.colLabel||img.alt;lens.appendChild(label);fig.appendChild(lens);
   const point=e=>{
    const r=img.getBoundingClientRect();if(!r.width||e.clientY<r.top||e.clientY>r.bottom)return;
    if(activeRow!==row)hide(activeRow);activeRow=row;
    lastRx=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));lastRy=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    if(loupeOn)loupe(row,lastRx,lastRy);
   };
   img.addEventListener('pointermove',point);
   img.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();point(e);
    if(!loupeOn){lightbox.querySelector('img').src=img.currentSrc||img.src;lightbox.style.display='flex';}
   });
  });
  row.addEventListener('pointerleave',()=>hide(row));
 });
 async function show(s,t){
  const revision=(revisions.get(s)||0)+1;revisions.set(s,revision);
  const r=range(s);if(r)r.value=Math.round(t*1000);
  document.getElementById('pct-'+s).textContent=Math.round(t*100)+'%';
  const keys=Object.keys(D).filter(k=>k.startsWith(s+'-'));
  await Promise.all(keys.map(async k=>{
   const frames=D[k],i=Math.min(frames.length-1,Math.max(0,Math.round(t*(frames.length-1)))),frame=frames[i],img=document.getElementById('img-'+k),box=document.getElementById('txt-'+k);
   if(!img||!frame)return;
   // Wait for each row's frames before advancing, so slow links cannot starve playback.
   const loaded=await new Promise(resolve=>{const preload=new Image();preload.onload=()=>resolve(true);preload.onerror=()=>resolve(false);preload.src=frame.src;});
   if(revisions.get(s)!==revision)return;
   if(loaded)img.src=frame.src;
   if(box){box.textContent=loaded?`${i+1}/${frames.length} · ${frame.text}`:`Could not load ${frame.src}. Scrub or play to retry.`;box.scrollTop=box.scrollHeight;}
  }));
  if(loupeOn&&activeRow?.dataset.syncRow==='play-'+s)loupe(activeRow,lastRx,lastRy);
 }
 function stop(s){const state=timers.get(s);if(state)clearTimeout(state.timeout);timers.delete(s);if(button(s))button(s).textContent='Play';syncButton();}
 function start(s){
  stop(s);const r=range(s);if(!r)return;
  if(+r.value>=1000)r.value=0;
  const state={timeout:null};timers.set(s,state);button(s).textContent='Pause';syncButton();
  const tick=async()=>{
   await show(s,+r.value/1000);
   if(timers.get(s)!==state)return;
   if(+r.value>=1000&&!autoLoop){stop(s);return;}
   state.timeout=setTimeout(()=>{if(timers.get(s)!==state)return;r.value=+r.value>=1000?0:Math.min(1000,+r.value+9);tick();},+r.value>=1000?speedMs*10:speedMs);
  };tick();
 }
 document.querySelectorAll('input[type=range][data-s]').forEach(r=>{r.oninput=()=>{stop(r.dataset.s);show(r.dataset.s,+r.value/1000);};});
 document.querySelectorAll('button.play-btn').forEach(b=>{b.onclick=()=>timers.has(b.dataset.s)?stop(b.dataset.s):start(b.dataset.s);});
 globalButton.onclick=()=>{if(timers.size)SUBJS.forEach(stop);else SUBJS.forEach(start);};
 document.getElementById('speed-sel').onchange=function(){speedMs=Number(this.value)||80;};
 document.getElementById('chk-loop').onchange=function(){autoLoop=this.checked;};
 SUBJS.forEach(s=>{stop(s);show(s,1);});syncButton();
}
export function playbackScript(data){
 const json=v=>JSON.stringify(v).replaceAll('<','\\u003c');
 return `(${canaryPlayer.toString()})(${json(data.play)},${json(Object.keys(data.meta))});`;
}
export function repairPage(dir){
 const file=path.join(dir,'index.html'),source=fs.readFileSync(file,'utf8'),data=read(path.join(dir,'play/play-data.json'));
 if(!data?.play||!data.meta)throw Error('missing playback data');
 if(!fs.existsSync(path.join(dir,'original.html')))fs.writeFileSync(path.join(dir,'original.html'),source);
 const fixed=source.replace(/<script>[\s\S]*?<\/script>/,()=>`<script>${playbackScript(data)}</script>`)
  .replace('</style>','figure,figcaption,.ctl{min-width:0}figcaption{overflow-wrap:anywhere}.row{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:960px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}body{padding:12px}.ctl{max-width:100%}}a{color:var(--accent)}</style>');
 fs.writeFileSync(file,fixed);return {repaired:file};
}
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
  const key=s+'-'+v,src=play?D[key]?.at(-1)?.src??m.img:m.img;
  return `<figure data-col-label="${esc(m.id)}"><span class="pid">${esc(m.id)}</span><a href="${esc(m.img)}" data-lb><img ${play?`id="img-${key}"`:''} src="${esc(src)}" alt="${esc(m.id)}"></a><figcaption>${v} · ${info(m)}</figcaption>${play?`<pre class="term" id="txt-${key}"></pre>`:''}</figure>`;
 };
 const target=s=>{const m=data.meta[s].P;return `<figure data-col-label="${esc(m.id)}"><span class="pid">${esc(m.id)}</span><a href="${esc(m.img)}" data-lb><img src="${esc(m.img)}" alt="Reference ${esc(s)}"></a><figcaption>Reference</figcaption></figure>`;};
 const rows=subjects.map(s=>`<section class="subject-block" id="play-${s}"><div class="subj-head"><h2>${esc(data.meta[s].title)}</h2><div class="ctl"><button class="play-btn" data-s="${s}">Play</button><input type="range" min="0" max="1000" value="1000" data-s="${s}" aria-label="${esc(s)} saved-stage progress"><span id="pct-${s}">100%</span></div></div><div class="row" data-sync-row="play-${s}">${target(s)}${versions.map(v=>figure(s,v,true)).join('')}</div><details><summary>Final images and candidate measurements</summary><div class="row" data-sync-row="static-${s}">${target(s)}${versions.map(v=>figure(s,v,false)).join('')}</div><pre>${esc(JSON.stringify({metrics:data.meta[s].RC6.metrics,gate:data.meta[s].RC6.gate},null,2))}</pre></details></section>`).join('\n');
 const css=source.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
 const script=playbackScript({...data,play:D});
 const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>0.2.0-rc.6 canary</title><style>${css}\nbody{max-width:2000px}.row{grid-template-columns:repeat(5,minmax(0,1fr))}figure,figcaption,.ctl{min-width:0}figcaption{overflow-wrap:anywhere}a{color:var(--accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:960px){.row{grid-template-columns:1fr 1fr}}</style></head><body><div class="topbar"><h1>0.2.0-rc.6 · preserved controls + new candidate</h1><div class="global-ctl"><button id="btn-loupe">Loupe: OFF</button><label>Zoom <select id="loupe-zoom"><option value="2">2x</option><option value="3" selected>3x</option><option value="4">4x</option></select></label><button id="btn-all">Play All</button><label>Speed <select id="speed-sel"><option value="160">0.5x</option><option value="80" selected>1x</option><option value="40">2x</option></select></label><label><input type="checkbox" id="chk-loop" checked>Loop</label></div></div><p><a href="baseline.html">Original archived comparison</a> · <a href="ids.json">Image provenance</a>. Candidate playback advances through saved stages; it is not a count of individual strokes. Captions read each render's recorded commit and drawing stages. Historical media records may be incomplete. Candidate pigment physics and paper-colour stage are opt-in; the latter selects substrate colour without depositing paint.</p>${rows}<div id="lb" onclick="this.style.display='none'"><img alt="Expanded painting"></div><script>${script}</script></body></html>`;
 fs.writeFileSync(path.join(out,'index.html'),page);fs.writeFileSync(path.join(out,'ids.json'),JSON.stringify(ids,null,2)+'\n');fs.writeFileSync(path.join(out,'play/play-data.json'),JSON.stringify({...data,play:D})+'\n');
 return {subjects:subjects.length,candidateFrames:subjects.length*120,out};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>(i%2===0&&a.push([v.slice(2),all[i+1]]),a),[]));
 if(args.repair){console.log(JSON.stringify(repairPage(args.repair)));process.exit(0);}
 if(!args.baseline||!args.runs||!args.out)throw Error('--baseline, --runs and --out are required');
 console.log(JSON.stringify(build({...args,historyRuns:args['history-runs']})));
}
