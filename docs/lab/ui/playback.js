import {layerRT} from '../media/km.js';
const BASE=new URL('../',import.meta.url);
const bytes=new Map(),tapes=new Map();
export function loadBytes(path){if(!bytes.has(path))bytes.set(path,fetch(new URL(path,BASE)).then(r=>{if(!r.ok)throw Error(`Checkpoint: ${r.status}`);return r.arrayBuffer();}).catch(e=>{bytes.delete(path);throw e;}));return bytes.get(path);}
export function loadTape(path){if(!tapes.has(path))tapes.set(path,fetch(new URL(path,BASE)).then(r=>{if(!r.ok)throw Error(`Recording: ${r.status}`);return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();}).catch(e=>{tapes.delete(path);throw e;}));return tapes.get(path);}
export function createPlaybackUI(seek){
 const sequence=document.getElementById('sequence'),thumbs=document.getElementById('sequence-thumbs'),preview=document.getElementById('seek-preview'),materials=document.getElementById('current-materials'),welcome=document.getElementById('welcome');
 let stops=[],key='',recording=false;
 function update(fraction){let at=-1;for(let i=0;i<stops.length;i++)if(fraction>=stops[i].fraction-.002)at=i;
  [...thumbs.children].forEach((b,i)=>{b.setAttribute('aria-current',i===at?'step':'false');});
 }
 return {
  dismiss:()=>welcome.hidden=true,
  hide:()=>{sequence.hidden=true;preview.hidden=true;materials.hidden=true;},
  example:(ex,limit,mode)=>{
   recording=mode==='replay';sequence.hidden=false;
   document.getElementById('sequence-title').textContent=recording?'Recording · jump to a saved frame':`${Number(limit).toLocaleString()}-stroke study · jump in anywhere`;
   document.getElementById('sequence-target').src=new URL(ex.target,BASE);document.getElementById('sequence-target').alt=ex.title+' target';
   const next=ex.id+limit+mode;if(next===key)return;key=next;thumbs.replaceChildren();
   stops=recording?[.1,.25,.5,.75,.9,1].map(f=>({fraction:f,image:ex.film.frames[Math.min(ex.film.frames.length-1,Math.floor(f*(ex.film.frames.length-1)))]})):ex.checkpoints?.[limit]||[];
   for(const stop of stops){const b=document.createElement('button');b.type='button';b.dataset.seek=stop.fraction;const im=new Image();im.src=new URL(stop.image,BASE);im.alt='';const label=document.createElement('span');label.textContent=stop.fraction===1?'Finished':Math.round(stop.fraction*100)+'%';b.append(im,label);b.setAttribute('aria-label',`Jump to ${label.textContent.toLowerCase()} of ${ex.title}`);b.addEventListener('click',()=>seek(stop.fraction));thumbs.append(b);}
   update(0);
  },
  preview:(fraction)=>{const stop=stops.find(s=>s.fraction===fraction);if(!stop)return null;preview.src=new URL(stop.image,BASE);preview.hidden=false;update(fraction);return stop;},
  ready:()=>preview.hidden=true,
  update,
  materials:data=>{materials.hidden=false;materials.replaceChildren();const title=document.createElement('strong');title.textContent=data.phase;const tool=document.createElement('span');tool.className='material-tool';tool.textContent=data.tool;materials.append(title,tool);
   for(const p of data.pigments){const chip=document.createElement('span');chip.className='material-pigment';const swatch=document.createElement('i');const rgb=p.K.map((K,c)=>{const[r,t]=layerRT(K,p.S[c],1);return Math.round(255*(r+t*t*.96/(1-r*.96)));});swatch.style.background=`rgb(${rgb.join(',')})`;chip.append(swatch,document.createTextNode(p.name||'Recorded pigment'));materials.append(chip);}
  }
 };
}
