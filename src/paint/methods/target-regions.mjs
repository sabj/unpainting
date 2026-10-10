// CPU color/value clustering. Crop boxes supply descriptions only, never boundaries.
export function targetRegions({w,h,rgb,demand,k,density,families=[]}) {
  const n=w*h,features=new Float32Array(n*3);
  for(let i=0;i<n;i++) {
    if(rgb){const r=rgb[3*i]/255,g=rgb[3*i+1]/255,b=rgb[3*i+2]/255;features[3*i]=(r-b)*2;features[3*i+1]=(g-b)*2;features[3*i+2]=(r+g+b)/3*.35;}
    else {let sum=0;for(let j=0;j<k;j++)sum+=demand[i*k+j];features[3*i]=(demand[i*k]||0)/Math.max(sum,1e-9);features[3*i+1]=(k>1?demand[i*k+1]:0)/Math.max(sum,1e-9);features[3*i+2]=density[i]*.35;}
  }
  const distance=(i,c)=>{let d=0;for(let q=0;q<3;q++)d+=(features[3*i+q]-c[q])**2;return d;};
  // Deterministic farthest-color seeds; no spatial coordinate or tile in clustering.
  const centers=[[...features.subarray(0,3)]];
  for(let s=1;s<6;s++){let best=-1,index=0;for(let i=0;i<n;i++){const d=Math.min(...centers.map(c=>distance(i,c)));if(d>best){best=d;index=i;}}if(best<.0025)break;centers.push([...features.subarray(index*3,index*3+3)]);}
  let labels=new Uint16Array(n);
  for(let pass=0;pass<8;pass++){const sums=centers.map(()=>[0,0,0,0]);for(let i=0;i<n;i++){let best=Infinity,id=0;for(let c=0;c<centers.length;c++){const d=distance(i,centers[c]);if(d<best){best=d;id=c;}}labels[i]=id+1;const a=sums[id];for(let q=0;q<3;q++)a[q]+=features[3*i+q];a[3]++;}for(let c=0;c<centers.length;c++)if(sums[c][3])for(let q=0;q<3;q++)centers[c][q]=sums[c][q]/sums[c][3];}
  // Local edge-aware cleanup removes isolated color flecks without bridging target edges.
  for(let pass=0;pass<2;pass++){const next=labels.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,votes=new Uint8Array(centers.length+1);for(const j of [i-1,i+1,i-w,i+w]){let d=0;for(let q=0;q<3;q++)d+=(features[i*3+q]-features[j*3+q])**2;if(d<.008)votes[labels[j]]++;}for(let c=1;c<votes.length;c++)if(votes[c]>=3)next[i]=c;}labels=next;}
  const regions=centers.map((_,c)=>{
    let area=0;for(const label of labels)if(label===c+1)area++;
    const scores=families.map(()=>0);for(let i=0;i<n;i++)if(labels[i]===c+1)for(let j=0;j<families.length;j++){const b=families[j].bounds;if(!b)continue;const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;if(x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3])scores[j]++;}
    const overlap=scores.map((v,j)=>{const b=families[j].bounds;return b?v/Math.max(1,area+(b[2]-b[0])*(b[3]-b[1])*n-v):0;});
    const best=overlap.indexOf(Math.max(...overlap)),f=families[best];
    return {id:`target-color-${c+1}`,referenceCue:`Target-derived connected color/value shape. ${f?.referenceCue??'Local color and target silhouette.'}`,baseMove:f?.baseMove??'wet on dry',descriptiveFamily:f?.id??null};
  });
  return {regions,labels,source:'target color/value clustering with local edge-aware cleanup; crop bounds descriptive only'};
}

// Long internal straight boundaries must be supported by the target, within 2 cells.
// Inspect each passage, not just their union: a union conceals adjacent tile seams.
export function unsupportedAxisEdges(mask,w,h,rgb,{minimum=Math.max(12,Math.round(Math.min(w,h)*.08)),contrast=12}={}) {
  const supported=(x,y,vertical)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy,ax=xx-(vertical?1:0),ay=yy-(vertical?0:1);if(ax<0||ay<0||xx>=w||yy>=h)continue;let d=0;for(let q=0;q<3;q++)d=Math.max(d,Math.abs(rgb[(yy*w+xx)*3+q]-rgb[(ay*w+ax)*3+q]));if(d>=contrast)return true;}return false;};
  const failures=[];
  for(const vertical of [true,false]){const across=vertical?w:h,along=vertical?h:w;for(let a=1;a<across;a++){let start=-1;for(let b=0;b<=along;b++){const x=vertical?a:b,y=vertical?b:a,i=y*w+x,j=i-(vertical?1:w);const edge=b<along&&mask[i]!==mask[j]&&!supported(x,y,vertical);if(edge&&start<0)start=b;if(!edge&&start>=0){if(b-start>=minimum)failures.push({axis:vertical?'vertical':'horizontal',at:a,start,length:b-start});start=-1;}}}}
  return failures;
}
