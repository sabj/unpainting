// Lossless storage for immutable lower planes. Each layer stays an ordinary array;
// accessing a cropped plane rehydrates the same Float32 bits before a reader or
// writer receives it. Layer identities and material versions remain unchanged,
// keeping existing caches valid. No optical/mass folding or checkpoint format change.
const slots = new WeakMap();
const examined = new WeakMap();

function inflate(record) {
  if (!record.dense) {
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

/**
 * Keep the mutable top, underlay, pending GPU archives, removable-resist layers,
 * pending prep-fade prefix and retained pigments dense. Crops must save >=25%.
 */
export function compactLowerLayers(sheet,{from=1,before=Infinity,retainPigments=[]}={}) {
  // Do not turn asynchronous drying into a synchronous readback for storage work.
  if(sheet._gpu?.queuedDrys)return {packed:0,savedBytes:0};
  const end=Math.min(before,sheet.layers.length-1,sheet.resistFrom??Infinity);
  const pending=new Set((sheet._gpu?.pendingLayers??[]).map(p=>p.index));
  const keep=new Set(retainPigments);
  const references=new Map();
  for(const layer of [sheet.G,sheet.D,sheet.P,...sheet.layers])for(let k=0;k<sheet.K;k++){
    const plane=Object.getOwnPropertyDescriptor(layer,k)?.value;
    if(plane?.buffer)references.set(plane.buffer,(references.get(plane.buffer)??0)+1);
  }
  let packed=0,savedBytes=0;
  for(let l=Math.max(0,from);l<end;l++){
    if(pending.has(l))continue;
    const layer=sheet.layers[l],version=layer._cacheVersion??0;
    for(let k=0;k<sheet.K;k++){
      if(keep.has(k)||slots.get(layer)?.has(k))continue;
      const plane=layer[k];
      if(!(plane instanceof Float32Array)||plane.length!==sheet.n||plane===sheet._zeroLayer)continue;
      if(references.get(plane.buffer)>1)continue; // preserve aliases into retained or mutable reservoirs
      const prior=examined.get(plane);
      if(prior===version)continue;
      const bits=new Uint32Array(plane.buffer,plane.byteOffset,plane.length);
      let x0=sheet.w,y0=sheet.h,x1=-1,y1=-1;
      // Include negative zero and NaN payloads: storage is bit-preserving.
      for(let i=0;i<bits.length;i++)if(bits[i]){
        const x=i%sheet.w,y=Math.floor(i/sheet.w);
        x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      }
      const cw=x1-x0+1,ch=y1-y0+1;
      if(x1<0||cw*ch>=sheet.n*.75){examined.set(plane,version);continue;}
      const crop=new Uint32Array(cw*ch);
      for(let row=0;row<ch;row++)crop.set(bits.subarray((y0+row)*sheet.w+x0,(y0+row)*sheet.w+x0+cw),row*cw);
      const record={n:sheet.n,w:sheet.w,x:x0,y:y0,cw,ch,bits:crop,dense:null,
        shared:typeof SharedArrayBuffer!=='undefined'&&plane.buffer instanceof SharedArrayBuffer};
      install(layer,k,record);packed++;savedBytes+=plane.byteLength-crop.byteLength;
    }
  }
  return {packed,savedBytes};
}

/** Inspect allocated storage without triggering plane getters or GPU readback. */
export function layerStorageStats(sheet, { includeNonzero = true } = {}) {
  const buffers=new Set(), planes=new Set(), nonzeroPlanesSet=new Set(), nonzero=new WeakMap();
  const layers=sheet.layers;
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
