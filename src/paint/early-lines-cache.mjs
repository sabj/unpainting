import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {cachedStep, digest} from './run-cache.mjs';

// Normalize only paths rooted in this run's output directory. Cache artifacts
// carry relative names and bytes, so a hit can populate a fresh output directory.
export const outputRelative = (value, out) => typeof value === 'string' ? value.split(out + path.sep).join('@run-output/') : value;
// Generated drawing JSON embeds output paths in provenance labels. Those labels
// must not invalidate downstream pure steps when only the run directory changes.
// Caller-owned inputs retain their exact byte hash.
export function planFileDigest(file, out) {
  let bytes=fs.readFileSync(file);
  if (file.startsWith(out + path.sep) && /\.json(?:\.gz)?$/.test(file)) {
    if (file.endsWith('.gz')) bytes=zlib.gunzipSync(bytes);
    bytes=Buffer.from(outputRelative(bytes.toString('utf8'),out));
  }
  return digest(bytes);
}
export async function cachedEarlyLines({cache, code, track, argv, out, inputs, prepare}) {
  if (!cache.enabled) return prepare();
  fs.mkdirSync(out,{recursive:true});
  const normalize = v => typeof v === 'string' ? outputRelative(v,out) : Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])) : v;
  const restore = v => typeof v === 'string' ? v.split('@run-output/').join(out + path.sep) : Array.isArray(v) ? v.map(restore) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,restore(x)])) : v;
  const flags = [];
  for (let i=0;i<argv.length;i++) {
    const key=argv[i], value=argv[i+1];
    if (key.startsWith('--')) {
      i++;
      if (!['--out','--pausedir','--resumestate','--resumeprefix','--allowdirty','--speedprofile','--speedcpu'].includes(key)) flags.push(key,normalize(value));
    }
  }
  const result=await cachedStep({...cache,name:'early-lines',code,track,inputs:{...inputs,flags}},async()=>{
    const before=argv.length;
    // Only the line-source stage writes lines-* files, including auxiliary maps.
    const record=await prepare();
    const files=fs.readdirSync(out).filter(f=>f.startsWith('lines-')&&fs.statSync(path.join(out,f)).isFile()).map(name=>({name,bytes:fs.readFileSync(path.join(out,name))}));
    return {record:normalize(record),flags:normalize(argv.slice(before)),files};
  });
  if(result.cached) {
    for(const {name,bytes} of result.value.files) {
      if(path.basename(name)!==name)throw Error('invalid line cache artifact path');
      fs.writeFileSync(path.join(out,name),bytes);
    }
    argv.push(...restore(result.value.flags));
  }
  return restore(result.value.record);
}
