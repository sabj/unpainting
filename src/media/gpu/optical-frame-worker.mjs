import {parentPort,workerData} from 'node:worker_threads';
import path from 'node:path';
import sharp from 'sharp';
import {encodeFrame} from '../frame-file.mjs';
import {createInkComposer} from '../../paint/methods/ink-compose.mjs';
import {execution} from '../../eval/composite.mjs';
import {gaussian} from '../../keyframes/density.mjs';
const {port,out,outW,outH,n,w,h,W2,SC,paperRGB}=workerData;
const rendered=new Map(),named=new Map(),inks=new Map();
const pl2=.2126*paperRGB[0]+.7152*paperRGB[1]+.0722*paperRGB[2];
function density(rgb){const D=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let l=0,c=0;for(let dy=0;dy<SC;dy++)for(let dx=0;dx<SC;dx++){const q=((y*SC+dy)*W2+x*SC+dx)*3;l+=.2126*rgb[q]+.7152*rgb[q+1]+.0722*rgb[q+2];c++;}D[y*w+x]=Math.max(0,-Math.log(Math.max(.02,Math.min(1,l/c/pl2))));}return D;}
let chain=Promise.resolve(),nextId=1,composer=null,inkVersion=null;
function settle(){
 while(rendered.has(nextId)&&named.has(nextId)){const id=nextId++;
 const raw=rendered.get(id),what=named.get(id);rendered.delete(id);named.delete(id);
 chain=chain.then(()=>{
  if(!what.name){const paintedD=density(raw);parentPort.postMessage({id,mark:{id,pass:what.pass,numbers:execution(what.planD,paintedD,w,h,gaussian),paintedD}},[paintedD.buffer]);return;}
  const state=inks.get(what.inkVersion);
  if(state&&inkVersion!==what.inkVersion){composer??=createInkComposer(state);composer.setRatio(state.ratio);inkVersion=what.inkVersion;for(const version of inks.keys())if(version<inkVersion)inks.delete(version);}
  const rgb=state?Buffer.from(composer.compose(raw)):Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength);
  if(what.event)parentPort.postMessage({type:'native',rgb,event:what.event});
  encodeFrame(sharp(rgb,{raw:{width:outW,height:outH,channels:3}}),what.name).toFile(path.join(out,what.name)).then(()=>parentPort.postMessage({id}),error=>parentPort.postMessage({type:'error',error:error.stack??error.message}));
 }).catch(error=>parentPort.postMessage({type:'error',error:error.stack??error.message}));
 }
}
port.on('message',message=>{if(message.error){parentPort.postMessage({type:'error',error:message.error});return;}rendered.set(message.id,message.rgb);settle(message.id);});
parentPort.on('message',message=>{
 if(message.type==='ink'){inks.set(message.state.version,message.state);return;}
 named.set(message.id,message);settle(message.id);
});
