// Native optical observations, never a second execution of the physics.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import sharp from 'sharp';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const FLOOR = 21 * 1024 ** 3, CAP = 512 * 1024 ** 2;

/** The synchronous painter cannot queue unbounded raw frames. One shared slot, one acknowledgement. */
export function createNativeOperationRecorder({directory,width,height,provenance={},byteCap=CAP,diskFloor=FLOOR,timeoutMs=120000}) {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid native recording dimensions');
 const pixels=new SharedArrayBuffer(width*height*3),control=new SharedArrayBuffer(8),error=new SharedArrayBuffer(8192);
 const state=new Int32Array(control);let closed=false;
 const worker=new Worker(new URL(import.meta.url),{execArgv:[],workerData:{nativeRecorder:true,directory,width,height,provenance,byteCap,diskFloor,pixels,control,error}});
 worker.unref();worker.on('error',()=>{}); // Fatal startup is also bounded by the acknowledgement timeout.
 function send(message,rgb){
  if(closed)throw Error('Native recording already closed');
  if(rgb){if(rgb.length!==pixels.byteLength)throw Error('Native recording dimensions changed');new Uint8Array(pixels).set(rgb);}
  Atomics.store(state,0,0);worker.postMessage(message);
  const deadline=Date.now()+timeoutMs;
  while(Atomics.load(state,0)===0){const left=deadline-Date.now();if(left<=0){closed=true;worker.terminate();throw Error('Native recording worker timed out');}Atomics.wait(state,0,0,left);}
  if(Atomics.load(state,0)<0){closed=true;worker.terminate();throw Error(Buffer.from(error).subarray(0,Atomics.load(state,1)).toString());}
 }
 send({kind:'start'});
 return {
  capture(rgb,event={}){send({kind:'capture',event},rgb);},
  finish(rgb,event={}){send({kind:'finish',event},rgb);closed=true;worker.terminate();},
  abort(reason='Painting did not complete'){if(!closed){send({kind:'abort',reason});closed=true;worker.terminate();}},
 };
}

// A complete film must account for every executed mark in the existing physical tape.
export function verifyNativeMarkCoverage(tape,observed){
 const expected={brush:0,ink:0,graphite:0},names={s:'brush',P:'ink',g:'graphite'};
 for(const mark of tape??[])if(names[mark.k])expected[names[mark.k]]++;
 for(const name of Object.keys(expected))if(expected[name]!==observed[name])throw Error(`Incomplete native recording: ${name} tape=${expected[name]} captured=${observed[name]}`);
 return expected;
}

if(!isMainThread&&workerData?.nativeRecorder){
 const {directory,width,height,provenance,byteCap,diskFloor,pixels,control,error}=workerData,state=new Int32Array(control);
 let previous=null,used=0,overheadBytes=0,events=[],started=false;const began=Date.now();
 const manifest={version:1,kind:'native-operation-recording',width,height,provenance,complete:false,events};
 function room(n){const s=fs.statfsSync(directory);if(used+overheadBytes+n>byteCap)throw Error('Native recording byte cap exceeded');if(s.bavail*s.bsize-n<diskFloor)throw Error('Native recording disk floor reached');}
 function write(name,b){room(b.length);fs.writeFileSync(path.join(directory,name),b);used+=b.length;}
 function save(){const b=Buffer.from(JSON.stringify({...manifest,payloadAndEventBytes:used},null,2));room(b.length);fs.writeFileSync(path.join(directory,'operations.json'),b);overheadBytes=b.length;}
 const png=(b,w,h)=>sharp(b,{raw:{width:w,height:h,channels:3}}).png({compressionLevel:6}).toBuffer();
 async function capture(event,final=false){
  const rgb=Buffer.from(pixels),key=!previous||final;let rect=null,payload=null,encoding='replace';
  if(key){rect={x:0,y:0,width,height};payload=await png(rgb,width,height);}
  else {
   let x0=width,y0=height,x1=-1,y1=-1;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;if(rgb[i]!==previous[i]||rgb[i+1]!==previous[i+1]||rgb[i+2]!==previous[i+2]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}}
   if(x1>=0){rect={x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};const plain=Buffer.alloc(rect.width*rect.height*3),xor=Buffer.alloc(plain.length);
    for(let y=0;y<rect.height;y++){const offset=((rect.y+y)*width+rect.x)*3;rgb.copy(plain,y*rect.width*3,offset,offset+rect.width*3);for(let x=0;x<rect.width*3;x++)xor[y*rect.width*3+x]=rgb[offset+x]^previous[offset+x];}
    const a=await png(plain,rect.width,rect.height),b=await png(xor,rect.width,rect.height);if(b.length<a.length){payload=b;encoding='xor';}else payload=a;
   }
  }
  let file=null,payloadSHA256=null;
  if(payload){payloadSHA256=hash(payload);file=payloadSHA256+'.png';if(!fs.existsSync(path.join(directory,file)))write(file,payload);}
  const record={...event,elapsedMs:Date.now()-began,index:events.length,keyframe:key,rectangle:rect,encoding,file,payloadSHA256,previousSHA256:previous?hash(previous):null,pixelSHA256:hash(rgb)};
  const line=Buffer.from(JSON.stringify(record)+'\n');room(line.length);fs.appendFileSync(path.join(directory,'events.jsonl'),line);used+=line.length;events.push(record);previous=Buffer.from(rgb);
 }
 parentPort.on('message',async m=>{
  try{
   if(m.kind==='start'){fs.mkdirSync(directory,{recursive:true});if(fs.existsSync(path.join(directory,'operations.json')))throw Error('Native recording output already exists');room(width*height*3+65536);started=true;save();}
   else if(m.kind==='capture')await capture(m.event);
   else if(m.kind==='finish'){await capture({...m.event,operation:'final'},true);manifest.seconds=(Date.now()-began)/1000;const keys=events.filter(e=>e.keyframe);write('film.json',Buffer.from(JSON.stringify({operations:'operations.json',frames:keys.map(e=>e.file),frameNumbers:keys.map(e=>e.index),aspect:width/height,seconds:manifest.seconds,keyframes:keys.map(e=>({fraction:e.index/(events.length-1),image:e.file})),nativeWidth:width,nativeHeight:height,operationCount:events.length})));manifest.complete=true;save();}
   else if(m.kind==='abort'){manifest.error=m.reason;save();}
   else throw Error('Unknown native recording command');
   Atomics.store(state,0,1);
  }catch(e){manifest.complete=false;manifest.error=String(e.message);try{if(started)save();}catch{}const b=Buffer.from('Native recording failed: '+e.message);new Uint8Array(error).set(b.subarray(0,error.byteLength));Atomics.store(state,1,Math.min(b.length,error.byteLength));Atomics.store(state,0,-1);}
  Atomics.notify(state,0);
 });
}
