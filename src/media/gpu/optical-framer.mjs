import {Worker,MessageChannel} from 'node:worker_threads';

export function createOpticalFramer({sheet,prepare,ink,out,outW,outH,n,w,h,W2,SC,paperRGB,onFrame}) {
 const link=sheet._gpu,{port1,port2}=new MessageChannel();
 const worker=new Worker(new URL('./optical-frame-worker.mjs',import.meta.url),{execArgv:[],workerData:{port:port2,out,outW,outH,n,w,h,W2,SC,paperRGB},transferList:[port2]});
 link.post({op:'opticalPort',port:port1,wait:false},[port1]);
 const layerVer=sheet._layerVer??0,waiting=new Map(),captures=new Map(),results=new Map();let seq=0,failed=null,ratio=null,closed=false;
 const fail=error=>{failed=error;for(const pending of waiting.values())pending.reject(error);waiting.clear();};
 worker.on('error',fail);worker.on('exit',code=>{if(!closed)fail(new Error(`optical frame worker exited (${code})`));});worker.on('message',message=>{
  if(message.type==='native'){try{onFrame?.(message.rgb,message.event);}catch(error){fail(error);}return;}
  if(message.type==='error'){fail(new Error(message.error));return;}
  const pending=waiting.get(message.id);if(pending){waiting.delete(message.id);if(message.mark)results.set(message.id,message.mark);pending.resolve(message.mark);}
 });
 const F={
  optical:true,
  get active(){return !failed&&sheet._gpu===link&&!link.paused&&!link.stroke&&!link.planning&&(sheet._layerVer??0)===layerVer;},
  async ready(){if(failed)throw failed;while(waiting.size>=6)await Promise.race([...waiting.values()].map(p=>p.promise));if(failed)throw failed;},
  capture(){
   if(failed)throw failed;
   const base=prepare();if(link.needFullUp)link.fullUp(sheet);
   const id=++seq,state=ink?.frameComposition();
   if(state&&ratio!==state){ratio=state;worker.postMessage({type:'ink',state});}
   captures.set(id,state?.version??null);
   const sameBase=base?._immutable&&link.lastOpticalBase===base;link.lastOpticalBase=base?._immutable?base:null;
   link.post({op:'opticalSnap',id,base:sameBase?null:base,wait:false});
   link.stats.opticalAsyncFrames=(link.stats.opticalAsyncFrames??0)+1;
   link.stats.opticalReadBytes=(link.stats.opticalReadBytes??0)+Math.ceil(link.n*3/4)*4;
   return id;
  },
  hand(id,what){const promise=new Promise((resolve,reject)=>waiting.set(id,{resolve,reject}));waiting.get(id).promise=promise;promise.catch(()=>{});worker.postMessage({type:'name',id,inkVersion:captures.get(id),...what});captures.delete(id);},
  name(id,name,event){F.hand(id,{name,event});},
  mark(id,pass,planD){F.hand(id,{pass,planD});},
  async drain(){if(failed)throw failed;await Promise.all([...waiting.values()].map(p=>p.promise));if(failed)throw failed;const completed=[...results.values()].sort((a,b)=>a.id-b.id);results.clear();return completed;},
  close(){closed=true;fail(new Error('optical framer closed'));return worker.terminate();},
 };
 return F;
}
