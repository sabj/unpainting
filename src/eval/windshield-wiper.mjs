// Windshield-wiper detector for stroke statistics (tools/stroke-composition.mjs, tools/stroke-gate.mjs).
// Finds broad wash interiors filled by a brush far narrower than the passage, swept back and forth: many aligned
// passes, or one zigzag, with heavy overlap. It reads no painter flags; the gate limit is maxBroadAreaWiperShare
// in tools/stroke-gate.mjs (warn by default). footprint(mark,sheet,w,h,mask) is the contact rasterizer of the caller.

export function strokeDirection(m) {
  let c=0,s=0,length=0,runs=0,last=null;
  for(let j=1;j<m.points.length;j++) {
    const a=m.points[j-1],b=m.points[j],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);
    if(!l)continue;const t=Math.atan2(dy,dx);c+=l*Math.cos(2*t);s+=l*Math.sin(2*t);length+=l;
    const sign=Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):Math.sign(dy);if(last!==sign){runs++;last=sign;}
  }
  return {c,s,length,runs,coherence:length?Math.hypot(c,s)/length:0,angle:Math.atan2(s,c)/2};
}
// A candidate needs region/brush width above 4, at least six aligned passes, overlap of at least 1.8 and 20% of the interior.
export function detectWipers(area,records,{sheet,w,h,footprint}) {
  const mask=area.mask,cellMm=sheet.widthMm/w;let perimeter=0,cells=0;
  for(let i=0;i<w*h;i++)if(mask[i]){cells++;const x=i%w,y=Math.floor(i/w);perimeter+=+(x===0||!mask[i-1])+ +(x===w-1||!mask[i+1])+ +(y===0||!mask[i-w])+ +(y===h-1||!mask[i+w]);}
  const width=area.widthMm??2*cells*cellMm/Math.max(1,perimeter),groups=new Map();
  for(const r of records){
    if(r.mark.widthMm<=0||width/r.mark.widthMm<=4||r.mark.lengthMm<3)continue;
    const dir=r.dir;if(dir.coherence<.7)continue;
    const inside=r.cells.filter(i=>mask[i]);if(inside.length<r.cells.length*.2)continue;
    const g=groups.get(r.group)??[];g.push({...r,inside,dir});groups.set(r.group,g);
  }
  const result=new Uint8Array(w*h),sweeps=[];
  for(const [group,rows]of groups){
    const c=rows.reduce((s,r)=>s+r.dir.c,0),s=rows.reduce((s,r)=>s+r.dir.s,0),length=rows.reduce((s,r)=>s+r.dir.length,0);
    if(!length||Math.hypot(c,s)/length<.7)continue;
    const angle=Math.atan2(s,c)/2,aligned=rows.filter(r=>Math.cos(2*(r.dir.angle-angle))>=Math.cos(Math.PI/4));
    let passes=0;const hits=new Uint32Array(w*h);
    for(const r of aligned){
      passes+=r.dir.runs>=6?Math.min(r.dir.runs,Math.floor(r.mark.lengthMm/Math.max(width,.1))):1;
      if(r.dir.runs>=6){
        for(let j=1;j<r.mark.points.length;j++){
          const segment={...r.mark,points:r.mark.points.slice(j-1,j+1),widths:r.mark.widths.slice(j-1,j+1),pressures:r.mark.pressures?.slice(j-1,j+1)};
          for(const i of footprint(segment,sheet,w,h,mask))hits[i]++;
        }
      }else for(const i of r.inside)hits[i]++;
    }
    if(passes<6)continue;
    let unique=0,total=0;for(const v of hits){if(v)unique++;total+=v;}
    const overlap=unique?total/unique:0,share=cells?unique/cells:0;
    if(overlap<1.8||share<.2)continue;
    for(let i=0;i<w*h;i++)if(hits[i])result[i]=1;
    const sorted=aligned.map(r=>r.mark.widthMm).sort((a,b)=>a-b);
    sweeps.push({group,marks:aligned.length,passes,overlapRatio:overlap,areaShare:share,regionWidthMm:width,regionToBrushRatio:width/sorted[Math.floor(sorted.length/2)]});
  }
  return {share:cells?result.reduce((s,v)=>s+v,0)/cells:0,sweeps};
}
