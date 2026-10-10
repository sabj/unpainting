const MIB=1024*1024;
const SIZES=[16,64,256,1024];
/**
 * The stroke plan budget in MiB for a sheet of `cells` cells. GPU_STROKE_PLAN_MIB: 16/64/256/1024, auto (default) or auto64.
 * auto: 16 up to 400 k cells, then the smallest size of at least 32 MiB per 388,800 cells, since a plan grows with stroke
 * area. auto64: auto, at least 64 (batches).
 */
export function planMiB(env,cells){
 if(env===undefined||env===''||env==='auto'||env==='auto64'){
  const need=32*cells/388800, auto=cells<=400000?16:(SIZES.find(m=>m>=need&&m>=64)??1024);
  return env==='auto64'?Math.max(64,auto):auto;
 }
 return Number(env);
}
export function strokePlanBudget(mib=16,cells=0,limits=null){
 if(!SIZES.includes(Number(mib))||!Number.isInteger(cells)||cells<0)throw Error('Stroke plan budget supports bounded 16/64/256/1024 MiB and integer cells');
 const requestedMiB=Number(mib),fits=n=>(n*MIB+cells*4)<=(limits?.maxStorageBufferBindingSize??Infinity)&&(n*MIB+cells*4)<=(limits?.maxBufferSize??Infinity);
 // the largest supported size up to the request that the device holds; 16 must always fit
 const effectiveMiB=SIZES.filter(m=>m<=requestedMiB&&fits(m)).pop()??16;if(!fits(effectiveMiB))throw Error('Device cannot hold original stroke plan/paper storage');
 return {requestedMiB,effectiveMiB,words:effectiveMiB*MIB/4,fitLimitWords:3900000*effectiveMiB/16,paperOffsetBytes:effectiveMiB*MIB,gpuBufferBytes:effectiveMiB*MIB+cells*4,extraMemoryReserveBytes:8*Math.max(0,requestedMiB-16)*MIB,fallback:effectiveMiB!==requestedMiB};
}
export function strokePlanShader(source,words){if(!Number.isInteger(words)||words<4194304||words>268435456)throw Error('Bounded stroke plan words required');if(!source.includes('const SB = 4194304u;'))throw Error('Stroke storage ABI marker missing');return source.replace('const SB = 4194304u;',`const SB = ${words}u;`);}
