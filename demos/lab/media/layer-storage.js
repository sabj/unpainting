// Generated from src/media/layer-storage.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Lossless storage for immutable lower planes. Each layer stays an ordinary array;
// accessing a cropped plane rehydrates the same Float32 bits before a reader or
// writer receives it. Layer identities and material versions remain unchanged,
// keeping existing caches valid. No optical/mass folding or checkpoint format change.
const slots = new WeakMap();
const examined = new WeakMap();
let inflateEpoch = 0;

function inflate(record) {
  if (!record.dense) {
    inflateEpoch++;
    const {n,shared,w,x,y,cw,ch,bits}=record;
    const dense=shared?new Float32Array(new SharedArrayBuffer(n*4)):new Float32Array(n);
    const out=new Uint32Array(dense.buffer,dense.byteOffset,n);
    for(let row=0;row<ch;row++)out.set(bits.subarray(row*cw,(row+1)*cw),(y+row)*w+x);
    record.dense=dense;
    record.bits=null;
  }
  return record.dense;
}

function install(layer,k,record) {
  let entries=slots.get(layer);
  if(!entries)slots.set(layer,entries=new Map());
  entries.set(k,record);
  const set=value=>{
    Object.defineProperty(layer,k,{value,writable:true,enumerable:true,configurable:true});
    entries.delete(k);
  };
  Object.defineProperty(layer,k,{
    enumerable:true,configurable:true,
    get(){const value=inflate(record);set(value);return value;},
    set,
  });
}

// Read four words at a time, including signed zero and every NaN payload.
function firstWord(bits, a, end) {
  while(a+3<end && !(bits[a]|bits[a+1]|bits[a+2]|bits[a+3]))a+=4;
  while(a<end && !bits[a])a++;
  return a;
}
function lastWord(bits, a, start) {
  while(a-3>=start && !(bits[a]|bits[a-1]|bits[a-2]|bits[a-3]))a-=4;
  while(a>=start && !bits[a])a--;
  return a;
}

/**
 * Keep the mutable top, underlay, pending GPU archives, removable-resist layers,
 * pending prep-fade prefix and retained pigments dense. Crops must save >=25%.
 */
export function compactLowerLayers(sheet,{from=1,before=Infinity,retainPigments=[]}={}) {
  // Do not turn asynchronous drying into a synchronous readback for storage work.
  if(sheet._gpu?.queuedDrys)return {packed:0,savedBytes:0};
  const end=Math.min(before,sheet.layers.length-1,sheet.resistFrom??Infinity);
  const start=Math.max(0,from);
  if(end<=start)return {packed:0,savedBytes:0};
  const pendingList=sheet._gpu?.pendingLayers??[];
  const compactKey=`${start}|${end}|${sheet._layerVer||0}|${pendingList.length}|${inflateEpoch}|${retainPigments.join(',')}`;
  if(sheet._lastCompactKey===compactKey)return {packed:0,savedBytes:0};
  const pending=new Set(pendingList.map(p=>p.index));
  const keep=new Set(retainPigments);
  // Most calls have no new dense planes. Do not census every retained layer
  // (or trigger a cropped getter) until there is actual storage work to do.
  const candidates=[];
  for(let l=start;l<end;l++){
    if(pending.has(l))continue;
    const layer=sheet.layers[l],version=layer._cacheVersion??0;
    for(let k=0;k<sheet.K;k++){
      if(keep.has(k)||slots.get(layer)?.has(k))continue;
      const plane=layer[k];
      if(!(plane instanceof Float32Array)||plane.length!==sheet.n||plane===sheet._zeroLayer||examined.get(plane)===version)continue;
      candidates.push({layer,k,plane,version});
    }
  }
  if(!candidates.length){sheet._lastCompactKey=compactKey;return {packed:0,savedBytes:0};}
  const references=new Map();
  for(const layer of [sheet.G,sheet.D,sheet.P,...sheet.layers])for(let k=0;k<sheet.K;k++){
    const plane=Object.getOwnPropertyDescriptor(layer,k)?.value;
    if(plane?.buffer)references.set(plane.buffer,(references.get(plane.buffer)??0)+1);
  }
  let packed=0,savedBytes=0;
  for(const {layer,k,plane,version} of candidates){
    if(references.get(plane.buffer)>1)continue; // preserve aliases into retained or mutable reservoirs
    const bits=new Uint32Array(plane.buffer,plane.byteOffset,plane.length);
    const w=sheet.w,first=firstWord(bits,0,bits.length);
    if(first===bits.length){examined.set(plane,version);continue;}
    const last=lastWord(bits,bits.length-1,first),y0=Math.floor(first/w),y1=Math.floor(last/w);
    let x0=first-y0*w,x1=-1;
    // Only the outermost occupied rows and the portions outside the current
    // horizontal bounds matter. Never rescan the growing dense interior.
    for(let y=y0;y<=y1;y++){
      const row=y*w,a=firstWord(bits,row,row+x0)-row;
      if(a<x0)x0=a;
      const b=lastWord(bits,row+w-1,row+x1+1)-row;
      if(b>x1)x1=b;
    }
    const cw=x1-x0+1,ch=y1-y0+1;
    if(x1<0||cw*ch>=sheet.n*.75){examined.set(plane,version);continue;}
    const crop=new Uint32Array(cw*ch);
    for(let row=0;row<ch;row++)crop.set(bits.subarray((y0+row)*sheet.w+x0,(y0+row)*sheet.w+x0+cw),row*cw);
    const record={n:sheet.n,w:sheet.w,x:x0,y:y0,cw,ch,bits:crop,dense:null,
      shared:typeof SharedArrayBuffer!=='undefined'&&plane.buffer instanceof SharedArrayBuffer};
    install(layer,k,record);packed++;savedBytes+=plane.byteLength-crop.byteLength;
  }
  sheet._lastCompactKey=compactKey;
  return {packed,savedBytes};
}

/** Inspect allocated storage without triggering plane getters or GPU readback. */
export function layerStorageStats(sheet, { includeNonzero = true } = {}) {
  const buffers=new Set(), planes=new Set(), nonzeroPlanesSet=new Set(), nonzero=new WeakMap();
  const layers=includeNonzero ? sheet.layers : (sheet._rawLayers ?? sheet.layers);
  let nonzeroPlanes=0,compactedPlanes=0,croppedBytes=0,planeReferences=0,logicalPlaneBytes=0,nonzeroPlaneBytes=0;
  const pending=new Map((sheet._gpu?.pendingLayers??[]).map(p=>[p.index,p.mask]));
  if(sheet._gpu?.topPlaceholder)pending.set(layers.length-1,sheet._gpu.topMask);
  for(let l=0;l<layers.length;l++){
    const layer=layers[l];
    for(let k=0;k<layer.length;k++){
      const record=slots.get(layer)?.get(k);
      const plane=record?(record.dense??record.bits):layer[k];
      const bytes=record?record.n*4:plane.byteLength;planeReferences++;logicalPlaneBytes+=bytes;
      buffers.add(plane.buffer);planes.add(plane);
      if(record&&!record.dense){compactedPlanes++;croppedBytes+=plane.byteLength;}
      if(includeNonzero){
      if(!nonzero.has(plane))nonzero.set(plane,record&&!record.dense
        ? new Float32Array(plane.buffer,plane.byteOffset,plane.length).some(v=>v!==0)
        : plane.some(v=>v!==0));
      if(nonzero.get(plane)||(((pending.get(l)??0)>>>k)&1)){nonzeroPlanes++;nonzeroPlaneBytes+=bytes;nonzeroPlanesSet.add(plane);}
      }
    }
  }
  return {layers:layers.length,planeReferences,
    uniquePlanes:planes.size,uniqueNonzeroPlanes:includeNonzero?nonzeroPlanesSet.size:null,
    logicalPlaneBytes,
    nonzeroPlanes:includeNonzero?nonzeroPlanes:null,nonzeroPlaneBytes:includeNonzero?nonzeroPlaneBytes:null,
    allocatedBytes:[...buffers].reduce((n,b)=>n+b.byteLength,0),compactedPlanes,croppedBytes,
    pendingGpuLayers:pending.size};
}
