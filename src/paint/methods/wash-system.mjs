// Planning helpers for an experimental connected-wash process. No target data is read at paint time.
import { labOfColour, paperLightTest, lightTolerance } from './paper-colour.mjs';

export function lightReference(rgb, w, h, sheet) {
  if (sheet.detected) return sheet.rgb;
  const n = w * h;
  const indices = Array.from({length:n}, (_,i)=>i).sort((a,b)=>
    rgb[3*b]+rgb[3*b+1]+rgb[3*b+2]-rgb[3*a]-rgb[3*a+1]-rgb[3*a+2]);
  const count = Math.max(1, Math.floor(n / 10));
  const reference = [0,1,2].map(c=>indices.slice(0,count).reduce((s,i)=>s+rgb[3*i+c],0)/count);
  const [L,a,b] = labOfColour(reference);
  // A visible sheet is stronger evidence than a bright material. Dark or saturated
  // highlights cannot turn a photograph's sky into reserved white paper.
  return L >= 85 && Math.hypot(a,b) <= 24 ? reference : sheet.rgb;
}

export function connectedLightTest(reference) {
  return paperLightTest(reference, lightTolerance(reference, {toleranceC:5}));
}

export function normalizeWashWeights(weights) {
  for(let i=0;i<weights[0].length;i++) {
    const sum=weights.reduce((s,a)=>s+a[i],0);
    if(sum>1) for(const a of weights) a[i]/=sum;
    weights[1][i]+=weights[2][i];
    weights[2][i]=0;
  }
}

export function mixedCharge(list,demand,k,weight) {
  const mix=new Array(k).fill(0);
  for(const i of list) for(let j=0;j<k;j++) mix[j]+=demand[i*k+j]*weight[i]/list.length;
  return mix;
}

// Compare across a millimetre, not an upsampled pixel. A sharp source edge can
// look locally gradual after enlargement. Glazes and detail keep their dry cut.
export function softWashBoundary(i,out,{values,w,h,cellMm,phase}) {
  if(phase==='shadow') return false;
  const r=Math.max(1,Math.round(1/cellMm)),x=i%w,y=Math.floor(i/w);
  return out.every(j=>{
    const dx=j%w-x,dy=Math.floor(j/w)-y;
    const at=(xx,yy)=>values[Math.max(0,Math.min(h-1,yy))*w+Math.max(0,Math.min(w-1,xx))];
    return Math.abs(at(x+dx*r,y+dy*r)-at(x-dx*r,y-dy*r))<.14;
  });
}

export function shapeMix(shape) {
  const total=shape.mix.reduce((s,v)=>s+v,0);
  return shape.mix.map(v=>total>0?v/total:0);
}
