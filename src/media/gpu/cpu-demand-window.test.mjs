import test from 'node:test';
import assert from 'node:assert/strict';
import { CpuDemandWindow, logicalUploadMetadata } from './cpu-demand-window.mjs';

const bits = a => new Uint32Array(a.buffer, a.byteOffset, a.length);
function fixture() {
  const width = 19, height = 13, K = 16, n = width * height;
  const remote = { W: new Float32Array(n), s: new Float32Array(n),
    G: [], P: [], D: [] };
  for (const name of ['G', 'P', 'D']) for (let k = 0; k < K; k++) remote[name].push(new Float32Array(n));
  const rp = [remote.W, remote.s, ...remote.G, ...remote.P, ...remote.D];
  const host = rp.map(p => p.slice()), downloads = [];
  const copy = (dest, src, rect) => {
    const [x,y,w,h] = rect;
    for (let p = 0; p < src.length; p++) for (let r = y; r < y+h; r++)
      bits(dest[p]).set(bits(src[p]).subarray(r*width+x,r*width+x+w), r*width+x);
  };
  const window = new CpuDemandWindow(width, height, host, rect => { downloads.push(rect.slice()); copy(host,rp,rect); });
  return { width,height,K,n,remote,rp,host,downloads,window,copy };
}

test('late demand expansion preserves all host plane bits and union holes receive GPU state', () => {
  const f = fixture();
  f.window.entry([0,0,f.width,f.height]); // Retain the full first-entry read.
  f.window.afterFlow();
  f.rp.forEach((p,k) => { for(let i=0;i<f.n;i++) p[i]=k*1000+i; });
  f.host.forEach(p => bits(p).fill(0x7fc12345)); // Deliberately poison stale memory.
  const first=[2,3,3,2]; f.window.require(first);
  f.host.forEach((p,k) => { bits(p)[3*f.width+2] = k%2 ? 0x80000000 : 0x7fc23456; });
  const expected=f.host.map(p=>bits(p).slice());
  f.window.require([12,9,2,2]); // A callback later than flowEvery needs safe expansion.
  for(let k=0;k<f.host.length;k++) {
    for(let y=3;y<5;y++) for(let x=2;x<5;x++) assert.equal(bits(f.host[k])[y*f.width+x],expected[k][y*f.width+x]);
    assert.equal(f.host[k][7*f.width+8],f.rp[k][7*f.width+8]); // Union hole, not stale poison.
  }
  const count=f.downloads.length;
  f.window.require(first); assert.equal(f.downloads.length,count); // Loopback.
  f.window.assertFresh([8,7,1,1]);
  assert.throws(()=>f.window.assertFresh([0,0,1,1]),/outside/);
});

test('multiple real flow epochs invalidate old windows; off-sheet and invalid requests fail closed', () => {
  const f=fixture();
  for(let epoch=0;epoch<4;epoch++) {
    f.window.afterFlow(); f.rp.forEach(p=>p.fill(epoch+1)); f.host.forEach(p=>p.fill(NaN));
    assert.throws(()=>f.window.assertFresh([0,0,1,1]));
    f.window.require([0,0,2,2]); assert.equal(f.host[0][0],epoch+1);
    f.window.require([17,11,2,2]); f.window.assertFresh([0,0,19,13]);
  }
  for(const rect of [[-1,0,1,1],[0,0,20,1],[0,0,0,1],[0,0,1.5,1],[NaN,0,1,1]])
    assert.throws(()=>f.window.require(rect),RangeError);
});

test('post-overlay logical metadata exactly matches full-upload baseline, including remote stale channels and -0', () => {
  const f=fixture(), logical=[0,0,19,13];
  f.remote.D[15][f.n-1]=1;
  bits(f.remote.W)[f.n-2]=0x80000000;
  f.window.entry(logical);
  for(let epoch=0;epoch<3;epoch++) {
    const baseline=f.rp.map(p=>p.slice());
    f.window.afterFlow(); f.host.forEach(p=>bits(p).fill(0x7fc12345));
    const a=[1,1,2,2],b=[7,5,2,2]; f.window.require(a);
    f.host[2+epoch][20]=epoch+0.5;
    f.window.require(b);
    bits(f.host[2+16+epoch])[5*f.width+7]=0x80000000;
    // Baseline's full download gives the same reads, and its full upload changes
    // exactly these two cells. Candidate uploads its fully fresh union only.
    baseline[2+epoch][20]=epoch+0.5;
    bits(baseline[2+16+epoch])[5*f.width+7]=0x80000000;
    f.copy(f.rp,f.host,f.window.rect);
    f.rp.forEach((p,k)=>assert.deepEqual(bits(p),bits(baseline[k])));
    const metadata=logicalUploadMetadata(f.remote,f.width,logical,f.K);
    const view={W:baseline[0],s:baseline[1],G:baseline.slice(2,18),P:baseline.slice(18,34),D:baseline.slice(34,50)};
    assert.deepEqual(metadata,logicalUploadMetadata(view,f.width,logical,f.K));
    assert.ok(metadata.mask & (1<<15)); assert.equal(metadata.signedZero,true);
  }
});

test('metadata treats NaN as present, distinguishes negative zero, and covers all sixteen channels', () => {
  const f=fixture(),rect=[0,0,19,13];
  assert.deepEqual(logicalUploadMetadata(f.remote,19,rect,16),{mask:0,signedZero:false});
  f.remote.G.forEach((p,k)=>{ p[k]=NaN; });
  bits(f.remote.P[3])[30]=0x80000000;
  assert.deepEqual(logicalUploadMetadata(f.remote,19,rect,16),{mask:65535,signedZero:true});
  assert.deepEqual(logicalUploadMetadata(f.remote,19,[18,12,1,1],16),{mask:0,signedZero:false});
});

test('fresh window preserves Uint8 M/ever, Uint16 and Float32 offset views byte exactly',()=>{
  const types=[Uint8Array,Uint16Array,Float32Array],planes=types.map(Type=>new Type(new ArrayBuffer(256),8,16));
  const window=new CpuDemandWindow(4,4,planes,rect=>{
    for(const plane of planes)for(let y=rect[1];y<rect[1]+rect[3];y++)for(let x=rect[0];x<rect[0]+rect[2];x++)plane[y*4+x]=7;
  });
  window.require([0,0,2,2]);planes.forEach(p=>{p[0]=173;p[5]=1;});
  const expected=planes.map(p=>new Uint8Array(p.buffer,p.byteOffset,p.byteLength).slice());
  window.require([3,3,1,1]);
  planes.forEach((p,k)=>{const bytes=new Uint8Array(p.buffer,p.byteOffset,p.byteLength),n=p.BYTES_PER_ELEMENT;
    for(const i of [0,1,4,5])assert.deepEqual(bytes.subarray(i*n,(i+1)*n),expected[k].subarray(i*n,(i+1)*n));
    assert.equal(p[10],7);
  });
});
