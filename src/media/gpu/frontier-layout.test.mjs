import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {frontierLayout,observeFrontier} from './frontier-layout.mjs';
import {GpuSheet} from './stepfull.mjs';
function fixture(n=6){const a=new Uint32Array(5*n+3);a[1]=a[4]=1;a[n]=4;a[n+1]=1;a[2*n]=2;a[2*n+1+0]=a[2*n+1+3]=1;a[3*n+1]=3;a[3*n+2]=0;a[5*n+1]=2;a[4*n+1]=3;a[5*n+2]=1;return a;}
test('normalization ignores only valid queue order and explicitly separates trailing slots',()=>{
  const a=fixture(),b=a.slice(),n=6;
  [b[n],b[n+1]]=[b[n+1],b[n]];[b[3*n+1],b[3*n+2]]=[b[3*n+2],b[3*n+1]];
  b[n+2]=999;b[3*n+3]=888;b[4*n+2]=777; // Invalid values are allowed only outside counted prefixes.
  const x=frontierLayout(a,n),y=frontierLayout(b,n);assert.deepEqual(x.semantic,y.semantic);
  assert.notDeepEqual(x.wet.valid,y.wet.valid);assert.notDeepEqual(x.wet.trailing,y.wet.trailing);
});
test('counts, membership and changed valid tile sets remain strict failures',()=>{
  for(const mutate of [a=>a[12]=7,a=>a[6]=999,a=>a[7]=a[6],a=>a[1]=0,a=>a[1]=2,a=>a[31]=1]){
    const a=fixture();mutate(a);assert.throws(()=>frontierLayout(a,6));
  }
  const a=fixture(),b=a.slice();b[4*6+1]=2;
  assert.notDeepEqual(frontierLayout(a,6).semantic,frontierLayout(b,6).semantic);
});
test('source consumers read counted prefixes; append overwrites a new slot before later passes consume it',()=>{
  const src=readFileSync(new URL('./stepfull.wgsl',import.meta.url),'utf8');
  assert.ok(src.includes('if (g.x >= atomicLoad(&FLAGS2[2u * u.ntiles])) { return; }'));
  assert.ok(src.includes('FLAGS2[u.ntiles + g.x]'));
  assert.ok(src.includes('ARGS[9] = atomicLoad(&FLAGS2[5u * u.ntiles + 1u])'));
  assert.ok(src.includes('FLAGS2[3u * u.ntiles + 1u + wid.x]'));
  const host=readFileSync(new URL('./stepfull.mjs',import.meta.url),'utf8');
  assert.ok(host.includes('pass.dispatchWorkgroupsIndirect(this.b.ARGS, 36)'));
  assert.ok(host.includes('e2.copyBufferToBuffer(this.b.FLAGS2, (5 * this.ntiles + 2) * 4'));
  const optical=readFileSync(new URL('./optical-gpu.wgsl',import.meta.url),'utf8');
  assert.ok(optical.includes('if(q>=tiles[5u*o.ntiles+1u]){return;}'));
});

test('first-dirty and first-wet atomic semantics make narrow-then-logical order a permutation only',()=>{
  const n=6;
  const run=order=>{
    const a=new Uint32Array(5*n+3);
    const markDirty=t=>{if(a[2*n+1+t]===0){a[2*n+1+t]=1;const q=a[5*n+1]++;a[3*n+1+q]=t;}};
    const markWet=t=>{markDirty(t);if(a[t]===0){a[t]=1;const q=a[2*n]++;a[n+q]=t;}};
    for(const t of order){markDirty(t);if(t%2===1)markWet(t);}
    return a;
  };
  const full=run([0,1,2,3,4,5]);
  for(const leading of [[5],[3,1],[4,2,0],[1,5,3]]){
    const candidate=run([...leading,0,1,2,3,4,5]);
    assert.deepEqual(frontierLayout(candidate,n).semantic,frontierLayout(full,n).semantic);
  }
});

test('uploadTop source overwrites historical keep queue while preserving its stale count',()=>{
  const n=6,a=fixture(n);a[5*n+2]=2;a[4*n+2]=4;
  frontierLayout(a,n); // Before the exceptional top replacement, keep history is valid.
  const dirty=new Uint32Array(3*n+1);dirty.fill(1,0,n);
  for(let t=0;t<n;t++)dirty[n+t]=t;
  dirty[3*n]=n;a.set(dirty,2*n+1);
  assert.equal(a[5*n+2],2);assert.deepEqual(Array.from(a.subarray(4*n+1,5*n+1)),new Array(n).fill(0));
  const decoded=frontierLayout(a,n);assert.equal(decoded.keep.historicalInvalid,true);
  assert.equal(decoded.semantic.keep.count,2);assert.deepEqual(decoded.semantic.keep.rawPrefix,[0,0]);
  const changed=a.slice();changed[4*n+3]=5;
  assert.notDeepEqual(frontierLayout(changed,n).semantic,decoded.semantic,'invalid historical tails stay strict');
  const host=readFileSync(new URL('./stepfull.mjs',import.meta.url),'utf8');
  const upload=host.match(/uploadTop\(planes\)[\s\S]*?(?=  \/\*\* Replace the masking-fluid)/)[0];
  assert.ok(upload.includes('new Uint32Array(3 * this.ntiles + 1)'));
  assert.ok(upload.includes('(2 * this.ntiles + 1) * 4'));
  assert.ok(!upload.includes('5 * this.ntiles + 2'));
});

test('observer returns every raw word with decoderError for invalid live membership',()=>{
  const raw=fixture();raw[6]=999;
  const result=observeFrontier(raw,6);
  assert.deepEqual(result.raw,Array.from(raw));assert.match(result.decoderError,/wet invalid or duplicate/);
  assert.equal(result.layout,undefined);
});

test('actual uploadTop mock buffer writes preserve stale keep count and observation keeps raw evidence',()=>{
  const n=6,raw=fixture(n);raw[5*n+2]=2;raw[4*n+2]=4;
  const before=raw.slice(),writes=[],flags={bytes:new Uint8Array(raw.buffer)},top={bytes:new Uint8Array(16)};
  const gpu={resident:true,ntiles:n,b:{FLAGS2:flags,TOP:top},device:{queue:{writeBuffer(buffer,offset,data){
    const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    buffer.bytes.set(bytes,offset);writes.push({which:buffer===flags?'FLAGS2':'TOP',offset,length:bytes.length});
  }}},setOptions(){}};
  GpuSheet.prototype.uploadTop.call(gpu,new Float32Array(4));
  assert.deepEqual(writes,[{which:'FLAGS2',offset:(2*n+1)*4,length:(3*n+1)*4},{which:'TOP',offset:0,length:16}]);
  assert.equal(raw[5*n+2],before[5*n+2]);
  const observation=observeFrontier(raw,n);
  assert.deepEqual(observation.raw,Array.from(raw));assert.equal(observation.decoderError,undefined);
  assert.equal(observation.layout.keep.historicalInvalid,true);
  assert.deepEqual(observation.layout.semantic.keep,{count:2,historicalInvalid:true,rawPrefix:[0,0],rawTrailing:[0,0,0,0]});
  // Different raw prefix or tails cannot pass semantic equality in this state.
  const altered=raw.slice();altered[4*n+1]=5;
  assert.notDeepEqual(observeFrontier(altered,n).layout.semantic,observation.layout.semantic);
});
