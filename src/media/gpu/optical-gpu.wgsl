// Double-single arithmetic keeps byte rounding stable across long layer stacks.
// Each value is an unevaluated sum (high, low); no native f64 is required.
// The uniform xor is zero at runtime, but prevents relaxed compiler algebra
// from deleting the error terms in compensated arithmetic.
fn rounded(x:f32)->f32{return bitcast<f32>(bitcast<u32>(x)^o.pad);}
fn plus(a:f32,b:f32)->f32{return rounded(a+b);}
fn minus(a:f32,b:f32)->f32{return rounded(a-b);}
fn times(a:f32,b:f32)->f32{return rounded(a*b);}
fn ds(x:f32)->vec2<f32>{return vec2<f32>(x,0);}
fn add(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=plus(a.x,b.x);let v=minus(s,a.x);let e=plus(plus(plus(minus(a.x,minus(s,v)),minus(b.x,v)),a.y),b.y);let h=plus(s,e);return vec2<f32>(h,minus(e,minus(h,s)));}
fn neg(a:vec2<f32>)->vec2<f32>{return -a;}
fn sub(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return add(a,-b);}
fn mul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=times(a.x,b.x);let e=plus(plus(plus(rounded(fma(a.x,b.x,-p)),times(a.x,b.y)),times(a.y,b.x)),times(a.y,b.y));let h=plus(p,e);return vec2<f32>(h,minus(e,minus(h,p)));}
fn divd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let q=rounded(a.x/b.x);let r=sub(a,mul(b,ds(q)));return add(ds(q),ds(rounded(plus(r.x,r.y)/b.x)));}
fn sqrtd(a:vec2<f32>)->vec2<f32>{let q=sqrt(max(0.,a.x));if(q==0.){return ds(0.);}return add(ds(q),divd(sub(a,mul(ds(q),ds(q))),ds(2.*q)));}
fn expd(a:vec2<f32>)->vec2<f32>{
 let ln2=vec2<f32>(0.6931471824645996,-1.904654323148236e-9);let k=round(a.x/ln2.x);let x=sub(a,mul(ds(k),ln2));
 var term=ds(1.);var total=term;for(var j=1u;j<=16u;j++){term=divd(mul(term,x),ds(f32(j)));total=add(total,term);}return mul(total,ds(exp2(k)));
}
struct Options{n:u32,k:u32,micro:u32,pad:u32,w:u32,ntiles:u32,sparse:u32,reserved:u32,}
@group(0) @binding(0) var<uniform> o:Options;
// pigment table: K RGB pairs, S RGB pairs, micro amplitude pair.
@group(0) @binding(1) var<storage,read> pigment:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read> texture:array<f32>;
@group(0) @binding(3) var<storage,read> layer:array<f32>;
// Four coefficients of a fractional-linear transform, per pixel and channel.
@group(0) @binding(4) var<storage,read_write> matrix:array<vec2<f32>>;
@group(0) @binding(5) var<storage,read> base:array<vec2<f32>>;
@group(0) @binding(6) var<storage,read_write> result:array<u32>;
@group(0) @binding(7) var<storage,read> deposit:array<f32>;
@group(0) @binding(8) var<storage,read> pore:array<f32>;
@group(0) @binding(9) var<storage,read_write> wet:array<f32>;
@group(0) @binding(10) var<storage,read> tiles:array<u32>;
@compute @workgroup_size(64)
fn wet_sum(@builtin(global_invocation_id) g:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){let i=g.x+g.y*groups.x*64u;if(i>=o.n*o.k){return;}wet[i]=add(add(ds(layer[i]),ds(deposit[i])),ds(pore[i])).x;}
fn rt(k:vec2<f32>,s:vec2<f32>,x:vec2<f32>)->vec4<f32>{
 if(x.x<=1e-9){return vec4<f32>(0.,0.,1.,0.);}
 if(s.x<1e-7){return vec4<f32>(ds(0.),expd(-mul(k,x)));}
 if(k.x<1e-7){let t=mul(s,x);let den=add(ds(1.),t);return vec4<f32>(divd(t,den),divd(ds(1.),den));}
 let a=add(ds(1.),divd(k,s));let b=sqrtd(sub(mul(a,a),ds(1.)));let bx=mul(mul(b,s),x);
 if(bx.x>20.){return vec4<f32>(sub(a,b),ds(0.));}
 let ep=expd(bx);let em=expd(-bx);let sh=mul(sub(ep,em),ds(.5));let ch=mul(add(ep,em),ds(.5));let den=add(mul(a,sh),mul(b,ch));
 return vec4<f32>(divd(sh,den),divd(b,den));
}
@compute @workgroup_size(64)
fn reset(@builtin(global_invocation_id) g:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){let i=g.x+g.y*groups.x*64u;if(i>=o.n*3u){return;}matrix[4u*i]=ds(1.);matrix[4u*i+1u]=ds(0.);matrix[4u*i+2u]=ds(0.);matrix[4u*i+3u]=ds(1.);}
@compute @workgroup_size(256)
fn compose(@builtin(global_invocation_id) g:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){
 let index=g.x+g.y*groups.x*256u;
 var i=index;
 if(o.sparse!=0u){let q=index/256u;if(q>=tiles[5u*o.ntiles+1u]){return;}let tile=tiles[3u*o.ntiles+1u+q];let tw=(o.w+15u)/16u;let x=(tile%tw)*16u+(index%16u);let y=(tile/tw)*16u+(index%256u)/16u;if(x>=o.w||y>=o.n/o.w){return;}i=y*o.w+x;}
 if(i>=o.n){return;}var x0=ds(0.);for(var k=0u;k<o.k;k++){x0=add(x0,ds(layer[k*o.n+i]));}if(x0.x<=1e-7){return;}
 var x=ds(0.);var values:array<vec2<f32>,16>;
 for(var k=0u;k<o.k;k++){var v=ds(layer[k*o.n+i]);if(o.micro!=0u){v=mul(v,add(ds(1.),mul(pigment[k*7u+6u],ds(texture[i]))));}values[k]=v;x=add(x,v);}
 if(x.x<=1e-9){return;}
 for(var k=0u;k<o.k;k++){values[k]=divd(values[k],x);}
 for(var c=0u;c<3u;c++){
  var kc=ds(0.);var sc=ds(0.);for(var k=0u;k<o.k;k++){kc=add(kc,mul(values[k],pigment[k*7u+c]));sc=add(sc,mul(values[k],pigment[k*7u+3u+c]));}
  let opt=rt(kc,sc,x);let r=opt.xy;let t=opt.zw;let a=sub(mul(t,t),mul(r,r));let q=(i*3u+c)*4u;
  let ma=matrix[q];let mb=matrix[q+1u];let mc=matrix[q+2u];let md=matrix[q+3u];
  let aa=add(mul(a,ma),mul(r,mc));let bb=add(mul(a,mb),mul(r,md));let cc=sub(mc,mul(r,ma));let dd=sub(md,mul(r,mb));
  // Normalize to avoid underflow in an opaque stack; the represented mapping is unchanged.
  matrix[q]=divd(aa,dd);matrix[q+1u]=divd(bb,dd);matrix[q+2u]=divd(cc,dd);matrix[q+3u]=ds(1.);
 }
}
@compute @workgroup_size(64)
fn frame(@builtin(global_invocation_id) g:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){let i=g.x+g.y*groups.x*64u;if(i>=o.n*3u){return;}let q=i*4u;let b=base[i];let value=divd(add(mul(matrix[q],b),matrix[q+1u]),add(mul(matrix[q+2u],b),matrix[q+3u]));let byte=mul(value,ds(255.));let whole=floor(byte.x);let delta=sub(byte,ds(whole+.5));let up=delta.x>0.||(delta.x==0.&&delta.y>=0.);result[i]=u32(clamp(whole+select(0.,1.,up),0.,255.));}

@compute @workgroup_size(64)
fn restore_mask(@builtin(global_invocation_id) g:vec3<u32>,@builtin(num_workgroups) groups:vec3<u32>){let i=g.x+g.y*groups.x*64u;if(i>=o.n*3u||layer[i/3u]==0.){return;}for(var c=0u;c<4u;c++){matrix[i*4u+c]=base[i*4u+c];}}
