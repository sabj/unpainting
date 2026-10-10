import {cachedStep,codeHash} from '../../src/paint/run-cache.mjs';
import path from 'node:path';
// Every runtime dependency of the actual instrument calibration, not target geometry.
export const INSTRUMENT_CACHE_TOOLS=['tools/paint-plate.mjs','tools/painter/semantic-areas.mjs','tools/painter/authored-paint.mjs','tools/painter/authored-gestures.mjs','tools/painter/semantic-instrument-cache.mjs','tools/painter/native-paint-mode.mjs','tools/painter/semantic-brush-observation.mjs'];
export const instrumentCodeHash=root=>codeHash(root,INSTRUMENT_CACHE_TOOLS.map(file=>path.join(root,file)));
export async function cachedSemanticInstrument({cache,code,track,inputs,proofPath,pass,bypass=false,onRecord=()=>{}},calibrate){
 const result=await cachedStep({...cache,enabled:cache.enabled&&!bypass,name:'semantic-instrument',code,track,inputs,log:()=>{}},async()=>{
  const startedAtUTC=new Date().toISOString(),images=[];
  const calibration=await calibrate(images);
  return {calibration,origin:{proofPath,startedAtUTC,completedAtUTC:new Date().toISOString(),images,code}};
 });
 const record={kind:'semantic-instrument-cache',status:!cache.enabled||bypass?'bypass':result.cached?'hit':'miss',origin:result.value.origin,newCalibrationImages:result.cached?0:result.value.origin.images.length};
 onRecord(record);
 // Geometry/IDs belong to this plan; cached measured instrument samples retain their recorded origin.
 return {calibration:{...result.value.calibration,pass},record};
}
