import {Worker} from 'node:worker_threads';
import {availableParallelism} from 'node:os';

export function createCalibrationPool(config, cache, size = Math.min(8, availableParallelism())) {
 const workers=[],queue=[];let failed=null,closed=false;
 const fail=error=>{failed=error;for(const slot of workers){slot.job?.reject(error);slot.job=null;}for(const job of queue.splice(0))job.reject(error);};
 const dispatch=slot=>{if(slot.job||!queue.length||failed||closed)return;slot.job=queue.shift();slot.worker.postMessage(slot.job.input);};
 const start=()=>{
  const slot={worker:new Worker(new URL('./calibration-worker.mjs',import.meta.url),{workerData:{config,cache},execArgv:[],stdout:true}),job:null};
  slot.worker.stdout.resume();
  slot.worker.on('message',result=>{const job=slot.job;slot.job=null;if(result.error)job.resolve({error:result.error});else job.resolve({value:result.value,cached:result.cached});dispatch(slot);});
  slot.worker.on('error',fail);slot.worker.on('exit',code=>{if(!closed)fail(new Error(`calibration worker exited (${code})`));});workers.push(slot);return slot;
 };
 return {
  run(input){if(closed||failed)return Promise.reject(failed??new Error('calibration pool closed'));return new Promise((resolve,reject)=>{queue.push({input,resolve,reject});let slot=workers.find(s=>!s.job);if(!slot&&workers.length<size)slot=start();if(slot)dispatch(slot);});},
  async close(){closed=true;fail(new Error('calibration pool closed'));await Promise.all(workers.map(s=>s.worker.terminate()));},
 };
}
