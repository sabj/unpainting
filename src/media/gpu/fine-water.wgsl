struct Params { dims: vec4u, grid: vec4u, slope: vec4f }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> state: array<vec4f>; // film, pore, mask, unused
@group(0) @binding(2) var<storage, read> coarse: array<vec2f>; // height, capacity
@group(0) @binding(3) var<storage, read> paper: array<vec2f>; // height, capacity
@group(0) @binding(4) var<storage, read> enabled: array<u32>;
@group(0) @binding(5) var<storage, read_write> result: array<f32>; // planar film, pore
@group(0) @binding(6) var<storage, read> fineMask: array<u32>;
// Keep the low part of the free surface and block sums. Replaying several
// passes must not amplify a rounded reconstruction into a spurious velocity
// as the last film thins. Inputs/outputs retain the CPU's f32 storage; only
// intermediate sums/products use compensated pairs, matching its f64 work.
fn add(a: vec2f,b: vec2f)->vec2f {
  let s=a.x+b.x;let v=s-a.x;
  let e=(a.x-(s-v))+(b.x-v)+a.y+b.y;
  let h=s+e;return vec2f(h,e-(h-s));
}
fn mul(a: vec2f,b: vec2f)->vec2f {
  let h=a.x*b.x;let e=fma(a.x,b.x,-h)+a.x*b.y+a.y*b.x;
  let s=h+e;return vec2f(s,e-(s-h));
}
fn div(a: vec2f,b: vec2f)->vec2f {
  let q=a.x/b.x;let r=add(a,-mul(b,vec2f(q,0.)));
  return add(vec2f(q,0.),vec2f((r.x+r.y)/b.x,0.));
}
var<workgroup> depth: array<vec2f,64>;
var<workgroup> pores: array<vec2f,64>;
var<workgroup> maskBits: array<u32,64>;
var<workgroup> maskCount: u32;
var<workgroup> sumDepth: vec2f;
var<workgroup> sumPores: vec2f;
@compute @workgroup_size(64)
fn reconstruct(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) at: u32) {
  let c=group.x+group.y*p.grid.y;let N=p.dims.z;let nn=N*N;let cw=p.dims.w;let ch=p.grid.x;
  if(c>=cw*ch||enabled[c]==0u){return;}
  let cx=c%cw;let cy=c/cw;let a=at%N;let b=at/N;
  let f=(cy*N+b)*p.dims.x+cx*N+a;let wet=state[c].z!=0.&&state[c].x>0.;
  if(at<nn){
    maskBits[at]=select(0u,1u,((fineMask[f>>2u]>>((f&3u)*8u))&0xffu)!=0u);
  }
  workgroupBarrier();
  if(at==0u){var cnt=0u;for(var i=0u;i<nn;i++){cnt+=maskBits[i];}maskCount=cnt;}
  workgroupBarrier();
  let partial=maskCount>0u&&maskCount<nn;
  let cellWet=wet&&(!partial||maskBits[at]!=0u);
  if(at<nn){
    var d=vec2f(0.);
    if(cellWet){
      let u=f32(cx)+(f32(a)+.5)/f32(N)-.5;let v=f32(cy)+(f32(b)+.5)/f32(N)-.5;
      let ux=i32(floor(u));let vy=i32(floor(v));let tx=u-f32(ux);let ty=v-f32(vy);
      var surface=vec2f(0.);var weight=0.;
      for(var q=0u;q<4u;q++){
        let xx=ux+i32(q&1u);let yy=vy+i32(q>>1u);
        if(xx<0||yy<0||xx>=i32(cw)||yy>=i32(ch)){continue;}
        let j=u32(yy)*cw+u32(xx);if(state[j].z==0.||state[j].x<=0.){continue;}
        let w=select(1.-tx,tx,(q&1u)!=0u)*select(1.-ty,ty,(q>>1u)!=0u);
        surface=add(surface,mul(vec2f(w,0.),add(vec2f(state[j].x,0.),mul(p.slope.xy,vec2f(coarse[j].x,0.)))));weight+=w;
      }
      if(weight>0.){surface=div(surface,vec2f(weight,0.));}else{surface=add(vec2f(state[c].x,0.),mul(p.slope.xy,vec2f(coarse[c].x,0.)));}
      d=add(surface,-mul(p.slope.xy,vec2f(paper[f].x,0.)));if(d.x<0.){d=vec2f(0.);}
    }
    depth[at]=d;pores[at]=div(mul(vec2f(state[c].y,0.),vec2f(paper[f].y,0.)),vec2f(coarse[c].y,0.));
  }
  workgroupBarrier();
  if(at==0u){var dw=vec2f(0.);var ds=vec2f(0.);for(var i=0u;i<nn;i++){dw=add(dw,depth[i]);ds=add(ds,pores[i]);}sumDepth=dw;sumPores=ds;}
  workgroupBarrier();
  if(at<nn){
    var w=0.;var s=0.;
    let wetCells=select(nn,maskCount,partial);
    if(cellWet){w=state[c].x;if(sumDepth.x>0.){w=mul(vec2f(depth[at].x,0.),div(mul(vec2f(state[c].x,0.),vec2f(f32(wetCells),0.)),sumDepth)).x;}}
    if(sumPores.x>0.){s=mul(vec2f(pores[at].x,0.),div(mul(vec2f(state[c].y,0.),vec2f(f32(nn),0.)),sumPores)).x;}
    result[p.grid.z*p.dims.y+f]=w;
    if(p.grid.w==0u){result[p.dims.y+f]=s;}
  }
}
