import {parentPort,workerData} from 'node:worker_threads';
import {createSwatchCalibration} from './calibration-swatches.mjs';
import {cachedStepSync} from '../../src/paint/run-cache.mjs';
const track={start(){},stop(){return [];},current(){return null;},replay(){}};
const {config,cache}=workerData,swatches=createSwatchCalibration(config);
parentPort.on('message',job=>{
 try {
  const result=cachedStepSync({...cache,track,name:'passage-swatch',inputs:{config,job}},()=>job.kind==='mark'?swatches.scrapMark(job.T,job.mark):swatches.scrapSwatches([job.T],undefined,{damp:job.kind==='damp'})[0]);
  parentPort.postMessage({value:result.value,cached:result.cached});
 }catch(error){parentPort.postMessage({error:{message:error.message,stack:error.stack}});}
});
