// CPU deposit attribution. This estimates origins of final colour; it does not replay wet transport.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { strokeDirection, detectWipers } from '../src/eval/windshield-wiper.mjs';

export const markClass = (m, sheet) => m.widthMm < 1 || m.lengthMm < 3 ? 'tiny' : m.widthMm > sheet.widthMm / 10 && m.lengthMm >= m.widthMm ? 'large' : 'mid';
const keys = ['large', 'mid', 'tiny'];
const isDetail = m => ['detail','texture','edge','small-feature'].includes(m.purpose);
const signature = ps => ps.map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join(';');
const optical = (mass, pigments) => [0,1,2].map(ch => mass.reduce((s,v,k) => s + Math.max(0,v) * (pigments?.[k]?.K?.[ch] ?? 0),0));

// Keep masks in recorded coordinates. A clip is shared by its marks, rather than copied for each stroke.
export function tapeDeposits(tape) {
  let clip = null, resist = null, clipId = 0;
  const loads = new Map(), records = new Map();
  tape.marks.forEach((m,index) => {
    if (m.k === 'c') { clipId++; clip = m.r ? {runs:m.r} : m.m ? {mask:m.m} : null; return; }
    if (m.k === 'r') { resist = m.m; return; }
    if (m.k === 'R') { resist = null; return; }
    if (m.k === 'd') {
      const b=tape.brushOpts?.[tape.brushes?.[m.b] ?? m.b];
      const water=m.w*(b?.loadWater || (b?.capacity ?? 20)*(b?.bristles ?? 22)*(1+(b?.belly ?? 1.6)));
      loads.set(m.b,{conc:m.c,remaining:m.c.map(v=>v*water),water:m.w}); return;
    }
    if (m.k !== 's' || !m.d?.length) return;
    records.set(index,{clipId,clip,resist,load:loads.get(m.b) ?? null});
  });
  return records;
}

// Pair executed command observations with recorded paths. Commands are quantized exactly as the recorder does.
export function commandDeposits(commands) {
  const byPath=new Map();
  for(const c of commands) {
    if(c.status!=='EXECUTED'||(c.commandId===undefined&&!c.pathKey&&!c.geometry?.length))continue;
    const k=c.commandId??c.pathKey??signature(c.geometry.map(p=>[p.x*10,p.y*10]));
    const a=byPath.get(k)??[];a.push(c);byPath.set(k,a);
  }
  return byPath;
}

function sampledMask(clip, tape, w, h, txOf, tyOf) {
  const mask=new Uint8Array(w*h);
  if(!clip){mask.fill(1);return mask;}
  if(clip.mask) {
    const cm=clip.mask;
    for(let y=0;y<h;y++){
      const row=y*w,tRow=tyOf[y];
      for(let x=0;x<w;x++) mask[row+x]=cm[tRow+txOf[x]]?1:0;
    }
  } else {
    // Sorted RLE indices and sorted sample indices permit a single pass through each clip.
    const runs=clip.runs,rLen=runs.length,txMax=txOf[w-1];let j=0;
    for(let y=0;y<h;y++) {
      const row=y*w,tRow=tyOf[y];
      if(y>0&&tRow===tyOf[y-1]){mask.copyWithin(row,row-w,row);continue;}
      if(j>=rLen)break;
      const iMin=tRow+txOf[0],iMax=tRow+txMax;
      while(j<rLen&&runs[j]+runs[j+1]<=iMin)j+=2;
      if(j>=rLen)break;
      if(runs[j]>iMax)continue;
      for(let x=0;x<w;x++) {
        const i=tRow+txOf[x];
        while(j<rLen&&runs[j]+runs[j+1]<=i)j+=2;
        if(j<rLen&&runs[j]<=i)mask[row+x]=1;
      }
    }
  }
  return mask;
}

const erosionCache=new WeakMap();
function erode(mask,w,h,r) {
  const key=`${w}/${h}/${r}`,cached=erosionCache.get(mask);if(cached?.key===key)return cached.value;
  // Approximate edge clearance, including holes and the sheet perimeter, using a two-pass chamfer distance.
  const d=new Float32Array(mask.length),diagonal=Math.SQRT2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(mask[i])d[i]=Math.min(x+.5,w-x-.5,y+.5,h-y-.5);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x;if(!mask[i])continue;
    if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-w]+1);
    if(x&&y)d[i]=Math.min(d[i],d[i-w-1]+diagonal);if(x+1<w&&y)d[i]=Math.min(d[i],d[i-w+1]+diagonal);
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--) {
    const i=y*w+x;if(!mask[i])continue;
    if(x+1<w)d[i]=Math.min(d[i],d[i+1]+1);if(y+1<h)d[i]=Math.min(d[i],d[i+w]+1);
    if(x+1<w&&y+1<h)d[i]=Math.min(d[i],d[i+w+1]+diagonal);if(x&&y+1<h)d[i]=Math.min(d[i],d[i+w-1]+diagonal);
  }
  const value=new Uint8Array(d.length);for(let i=0;i<d.length;i++)value[i]=d[i]>r?1:0;
  erosionCache.set(mask,{key,value});return value;
}

let fpRowL = new Int32Array(0), fpRowR = new Int32Array(0), fpExtra = [];
function footprint(m,sheet,w,h,allow) {
  const out=[],scale=w/sheet.widthMm;
  if(fpRowL.length<h){fpRowL=new Int32Array(h);fpRowR=new Int32Array(h).fill(-2);}
  let minY=h,maxY=-1,hasExtra=false;
  const points=m.points, widths=m.widths;
  const dab=(x,y,r,p)=>{
    if(p<=0||r<=0)return;
    const y0=Math.max(0,Math.ceil(y-r-.5)),y1=Math.min(h-1,Math.floor(y+r-.5));
    if(y0<minY)minY=y0;if(y1>maxY)maxY=y1;
    for(let yy=y0;yy<=y1;yy++) {
      const dx=Math.sqrt(Math.max(0,r*r-(yy+.5-y)**2));
      const left=Math.max(0,Math.ceil(x-dx-.5)),right=Math.min(w-1,Math.floor(x+dx-.5));
      if(left<=right) {
        const r0=fpRowR[yy];
        if(r0===-2){fpRowL[yy]=left;fpRowR[yy]=right;}
        else if(left<=r0+1&&right>=fpRowL[yy]-1){if(left<fpRowL[yy])fpRowL[yy]=left;if(right>r0)fpRowR[yy]=right;}
        else{(fpExtra[yy]??=[]).push([fpRowL[yy],r0]);fpRowL[yy]=left;fpRowR[yy]=right;hasExtra=true;}
      }
    }
  };
  for(let j=0;j<points.length;j++) {
    const b=points[j],a=points[Math.max(0,j-1)],ra=widths[Math.max(0,j-1)]/2*scale,rb=widths[j]/2*scale;
    const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*scale/.5));
    for(let k=j?1:0;k<=steps;k++) {
      const f=k/steps;dab((a[0]+(b[0]-a[0])*f)*scale,(a[1]+(b[1]-a[1])*f)*scale,ra+(rb-ra)*f,(m.pressures?.[j]??1));
    }
  }
  for(let y=minY;y<=maxY;y++) {
    const r0=fpRowR[y];if(r0===-2)continue;
    const base=y*w,l0=fpRowL[y];fpRowR[y]=-2;
    const ex=hasExtra?fpExtra[y]:null;
    if(!ex?.length) {
      for(let x=l0;x<=r0;x++)if(allow[base+x])out.push(base+x);
    } else {
      ex.push([l0,r0]);ex.sort((a,b)=>a[0]-b[0]);let end=-1;
      for(let k=0;k<ex.length;k++){const iv=ex[k],left=iv[0],right=iv[1];for(let x=Math.max(left,end+1);x<=right;x++)if(allow[base+x])out.push(base+x);if(right>end)end=right;}
      ex.length=0;
    }
  }
  return out;
}

function polygonMask(poly,w,h) {
  if(!Array.isArray(poly)||poly.length<3||poly.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('broad area polygon must have at least three normalized points');
  return Uint8Array.from({length:w*h},(_,i)=>{
    const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;let inside=false;
    for(let j=0,k=poly.length-1;j<poly.length;k=j++) {
      const a=poly[j],b=poly[k];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside?1:0;
  });
}

export function composition(normalized,{tape,commands=[],plan,finalRGB,inkRGB,paperRGB,analysisWidth=512,regionProfiles=[]}={}) {
  const {sheet,marks}=normalized,w=analysisWidth,h=Math.max(1,Math.round(w*sheet.heightMm/sheet.widthMm)),n=w*h;
  const fields=Object.fromEntries(keys.map(k=>[k,[new Float64Array(n),new Float64Array(n),new Float64Array(n)]]));
  const records=tape?tapeDeposits(tape):new Map(),byPath=commandDeposits(commands),maskCache=new Map(),passMasks=new Map();
  const txOf=tape?new Int32Array(w):null,tyOf=tape?new Int32Array(h):null;
  if(tape){
    for(let x=0;x<w;x++)txOf[x]=Math.min(tape.w-1,Math.floor((x+.5)*tape.w/w));
    for(let y=0;y<h;y++)tyOf[y]=Math.min(tape.h-1,Math.floor((y+.5)*tape.h/h))*tape.w;
  }
  const strokeRecords=[],all=new Uint8Array(n).fill(1),remaining=new Map();let observed=0,estimated=0,zeroDeposit=0,matched=0;
  const maskFor=c=>{if(!c)return all;if(!maskCache.has(c))maskCache.set(c,sampledMask(c,tape,w,h,txOf,tyOf));return maskCache.get(c);};
  for(const m of marks) {
    const rec=records.get(m.tapeIndex),raw=tape?.marks[m.tapeIndex];
    const queue=raw?.k==='s'?byPath.get(raw.cid??signature(raw.d)):null,command=queue?.shift();if(command)matched++;
    if(m.kind!=='paint')continue;
    const mask=maskFor(rec?.clip);
    if(command&&!passMasks.has(command.intent))passMasks.set(command.intent,mask);
    const resist=rec?.resist;
    const cells=resist?footprint(m,sheet,w,h,mask).filter(i=>{const y=(i/w)|0,x=i-y*w;return !resist[tyOf[y]+txOf[x]];}):footprint(m,sheet,w,h,mask);
    if(!cells.length)continue;
    let density;
    if(rec?.load&&!remaining.has(rec.load))remaining.set(rec.load,[...rec.load.remaining]);
    if(command?.brushBefore?.pigmentMass&&command?.brushAfter?.pigmentMass) {
      const mass=command.brushBefore.pigmentMass.map((v,k)=>Math.max(0,v-(command.brushAfter.pigmentMass[k]??0)));
      density=optical(mass,tape.pigments);observed++;
      if(rec?.load)remaining.set(rec.load,remaining.get(rec.load).map((v,k)=>Math.max(0,v-(mass[k]??0))));
    }else if(rec?.load) {
      const b=tape.brushOpts[tape.brushes[raw.b]??raw.b],conc=rec.load.conc;
      // Estimate reservoir depletion between recorded dips; never charge a mark more pigment than its remaining load.
      let left=remaining.get(rec.load);
      const cellArea=(tape.w/w)*(tape.h/h),p=(m.pressures??[1]).reduce((s,v)=>s+v,0)/(m.pressures?.length||1);
      const mass=conc.map((v,k)=>Math.min(left[k]??0,cells.length*cellArea*(b.film??.25)*p*v));
      left=left.map((v,k)=>Math.max(0,v-mass[k]));remaining.set(rec.load,left);
      density=optical(mass,tape.pigments);estimated++;
    }else if(m.depositRGB) {density=m.depositRGB;estimated++;}
    else continue;
    if(!density.some(v=>v>0)){zeroDeposit++;continue;}
    const f=fields[markClass(m,sheet)];
    // Wash strokes that may fill a broad area: planned detail, texture and edge marks are exempt.
    if(!isDetail(m)&&!plan?.passes?.find(p=>p.id===command?.intent)?.texture)strokeRecords.push({mark:m,cells,dir:strokeDirection(m),group:command?.intent??m.group??`frame-${m.time}/clip-${rec?.clipId??0}`});
    const f0=f[0],f1=f[1],f2=f[2],cLen=cells.length,d0=density[0]/cLen,d1=density[1]/cLen,d2=density[2]/cLen;
    for(let c=0;c<cLen;c++){const i=cells[c];f0[i]+=d0;f1[i]+=d1;f2[i]+=d2;}
  }
  const explicit=normalized.broadAreas!==undefined?normalized.broadAreas:plan?.broadAreas;
  const areas=[],areaMasks=new Map();
  if(explicit!==undefined){
    if(!Array.isArray(explicit))throw Error('broadAreas must be an array');
    const ids=new Set();
    for(const a of explicit) {
      if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id))throw Error('broad areas need unique nonempty IDs');
      ids.add(a.id);
      if(a.edgeClearanceMm!=null&&(!Number.isFinite(a.edgeClearanceMm)||a.edgeClearanceMm<0))throw Error('edgeClearanceMm must be finite and nonnegative');
      if(a.widthMm!=null&&(!Number.isFinite(a.widthMm)||a.widthMm<=0))throw Error('broad area widthMm must be positive');
      if(a.detailPolygons!==undefined&&!Array.isArray(a.detailPolygons))throw Error('detailPolygons must be an array');
      let mask=erode(polygonMask(a.polygon,w,h),w,h,(a.edgeClearanceMm??1)*w/sheet.widthMm);
      for(const detail of a.detailPolygons??[]) {const d=polygonMask(detail,w,h);mask=mask.map((v,i)=>v&&!d[i]?1:0);}
      areas.push({id:a.id,label:a.label??a.id,widthMm:a.widthMm,mask,source:'authored broad low-detail polygon'});
    }
  }else if(plan?.passes) {
    // Measure each large planned value shape, including later glazes. Overlapping passage reports are not additive.
    const exclude=new Uint8Array(n);
    for(const q of plan.passes) {
      const detailMask=q.texture?passMasks.get(q.id):null;
      if(detailMask)for(let i=0;i<n;i++)if(detailMask[i])exclude[i]=1;
      const qm=q.resolution?.mmPerCell;if(!(qm>0))continue;
      const qw=Math.round(sheet.widthMm/qm);
      // Hard edges hold features and accents. Soft edges are where washes melt into each other: excluding them too left
      // detailed plans (hundreds of shapes) with no measurable interior, so the gate could neither pass nor flag them.
      for(const i of q.edges?.hardCells??[]) {
        const x=Math.floor((i%qw+.5)*w/qw),y=Math.floor((Math.floor(i/qw)+.5)*w/qw);
        if(x>=0&&x<w&&y>=0&&y<h)exclude[y*w+x]=1;
      }
    }
    const allowed=new Uint8Array(n);for(let i=0;i<n;i++)allowed[i]=exclude[i]?0:1;
    const smoothInterior=erode(allowed,w,h,w/sheet.widthMm);
    for(const p of plan.passes) {
      const mm=p.resolution?.mmPerCell,mask=passMasks.get(p.id);
      if(!mask||p.texture||!(mm>0)||p.area*mm*mm<sheet.widthMm*sheet.heightMm*.01||p.resolution.estimatedSupportWidthCells*mm<3)continue;
      let interior=erode(mask,w,h,w/sheet.widthMm);
      // All later planned boundaries describe small features, texture or value changes: keep those accents exempt.
      const combined=new Uint8Array(n);let interiorCells=0;
      for(let i=0;i<n;i++){combined[i]=interior[i]&&smoothInterior[i]?1:0;interiorCells+=combined[i];}interior=combined;
      if(interiorCells<n*.001)continue;
      const key=createHash('sha256').update(interior).digest('hex');
      if(areaMasks.has(key)){areaMasks.get(key).planIds.push(p.id);continue;}
      const a={id:p.id,planIds:[p.id],widthMm:p.resolution.estimatedSupportWidthCells*mm,label:`${[...new Set((p.regions??[]).map(id=>regionProfiles.find(r=>r.id===id)?.descriptiveFamily??id))].join(', ')} (${p.phase}, band ${p.valueBand}, ${p.id.split('/').at(-1)})`,mask:interior,source:'planned broad value-shape clip, >=1% sheet and >=3 mm support; excludes 1 mm around hard planned boundaries'};
      areas.push(a);areaMasks.set(key,a);
    }
  }
  const visible=Object.fromEntries(keys.map(k=>[k,0])),coverage=Object.fromEntries(keys.map(k=>[k,0]));
  const regionResults=areas.map(a=>({...a,cells:0,covered:0,tinyCovered:0,tinyOnly:0,tinyCarried:0,visible:0,attributedVisible:0,tinyVisible:0}));
  let totalVisible=0,attributedVisible=0,covered=0,tinyOnly=0,paperDifference=0;
  const byCell=Array.from({length:n},()=>[]);regionResults.forEach((a,j)=>{for(let i=0;i<n;i++)if(a.mask[i])byCell[i].push(j);});
  for(let i=0;i<n;i++) {
    const sums=keys.map(k=>fields[k].reduce((s,a)=>s+a[i],0)),total=sums.reduce((s,v)=>s+v,0),tinyFraction=total?sums[2]/total:0;
    const only=total>0&&sums[0]+sums[1]===0;
    if(total>0){covered++;if(only)tinyOnly++;keys.forEach((k,j)=>{if(sums[j]>0)coverage[k]++;});}
    let v=0,av=0,tv=0;
    for(let ch=0;ch<3;ch++) {
      const den=keys.reduce((s,k)=>s+fields[k][ch][i],0);
      const paper=paperRGB?.[ch]??255,final=finalRGB?.[i*3+ch],ink=inkRGB?.[i*3+ch]??paper;
      // Optical distance retains tone and chromatic differences. An ink-first snapshot removes the drawing's share.
      const diff=finalRGB?Math.abs(Math.log(Math.max(1,paper)/Math.max(1,final))):den;
      const paintDiff=finalRGB?Math.max(0,diff-Math.abs(Math.log(Math.max(1,paper)/Math.max(1,ink)))):den;
      paperDifference+=diff;totalVisible+=paintDiff;v+=paintDiff;
      if(den>0){av+=paintDiff;attributedVisible+=paintDiff;keys.forEach(k=>{const share=paintDiff*fields[k][ch][i]/den;visible[k]+=share;if(k==='tiny')tv+=share;});}
    }
    for(const j of byCell[i]) {const a=regionResults[j];a.cells++;if(total>0)a.covered++;if(sums[2]>0)a.tinyCovered++;if(only)a.tinyOnly++;a.tinyCarried+=tinyFraction;a.visible+=v;a.attributedVisible+=av;a.tinyVisible+=tv;}
  }
  const fraction=(v,t)=>t?v/t:null;
  const wipers=regionResults.map(a=>detectWipers(a,strokeRecords,{sheet,w,h,footprint}));
  return {method:'clipped CPU contact raster; observed brush pigment loss where matched, finite-load film estimate otherwise; per-channel pigment absorption apportions final optical distance from paper after subtracting ink-first distance; no wet-transport replay',
    finalImageMeasured:!!finalRGB,depositMeasured:attributedVisible>0,grid:{width:w,height:h,cellMm:sheet.widthMm/w},observations:{matchedCommands:matched,observedDepositMarks:observed,estimatedDepositMarks:estimated,zeroDepositMarks:zeroDeposit},
    classes:keys.map(k=>({kind:k,coveredSheetShare:coverage[k]/n,visibleShare:fraction(visible[k],totalVisible)})),
    coveredSheetShare:covered/n,tinyCoveredSheetShare:coverage.tiny/n,tinyOnlySheetShare:tinyOnly/n,tinyVisibleShare:fraction(visible.tiny,totalVisible),tinyFinalPaperDifferenceShare:fraction(visible.tiny,paperDifference),attributedVisibleShare:fraction(attributedVisible,totalVisible),
    broadAreasMeasured:explicit!==undefined||areas.length>0,broadAreaSource:explicit?'authored broadAreas':'saved value-plan broad value shapes and command clips',
    broadAreas:regionResults.map((a,j)=>({windshieldWiperShare:wipers[j].share,sweeps:wipers[j].sweeps,id:a.id,planIds:a.planIds??[a.id],label:a.label,source:a.source,areaMm2:a.cells*(sheet.widthMm/w)**2,coveredShare:fraction(a.covered,a.cells),tinyCoveredShare:fraction(a.tinyCovered,a.cells),tinyOnlyShare:fraction(a.tinyOnly,a.cells),tinyCarriedAreaShare:fraction(a.tinyCarried,a.cells),tinyVisibleShare:fraction(a.tinyVisible,a.visible),attributedVisibleShare:fraction(a.attributedVisible,a.visible)})),
    limitations:'Spatial attribution is an estimate: contact discs and uniform per-mark deposits omit bristle gaps, pigment pickup, wet spreading and later lifting. Final image supplies visible weights, not measured pigment ancestry. Overlaps share one cell; repeated coats do not inflate sheet coverage. Edge/feature exclusions come from the plan, never from noisy final pixels.'};
}

// One command per line, read as a stream: a native run's command log can outgrow the longest string V8 can hold.
export async function readJSONLines(file, project = value => value) {
  const input=fs.createReadStream(file),lines=readline.createInterface({input:file.endsWith('.gz')?input.pipe(zlib.createGunzip()):input,crlfDelay:Infinity}),out=[];
  for await(const line of lines)if(line.trim()){const value=project(JSON.parse(line));if(value!==null)out.push(value);}
  return out;
}

export async function compositionContext(file,tape,{final,ink,plan:planFile,commands:commandsFile,analysisWidth=512}={}) {
  const dir=path.dirname(file),choose=(given,name)=>given??(fs.existsSync(path.join(dir,name))?path.join(dir,name):null);
  const pf=choose(planFile,'value-plan.json'),cf=choose(commandsFile,'value-commands.jsonl')??choose(null,'value-commands.jsonl.gz');
  const plan=pf?JSON.parse(fs.readFileSync(pf,'utf8')):null;
  const adjacentProfiles=pf?path.join(path.dirname(pf),'value-region-check.json'):null;
  const rf=choose(null,'value-region-check.json')??(adjacentProfiles&&fs.existsSync(adjacentProfiles)?adjacentProfiles:null),regionProfiles=rf?JSON.parse(fs.readFileSync(rf,'utf8')).regions:[];
  const commands=cf?await readJSONLines(cf, c => {
    if(c.status!=='EXECUTED'||!c.geometry?.length)return null;
    return { status:c.status, intent:c.intent, commandId:c.commandId,
      ...(c.commandId===undefined?{pathKey:signature(c.geometry.map(p=>[p.x*10,p.y*10]))}:{}),
      brushBefore:c.brushBefore, brushAfter:c.brushAfter };
  }):[];
  const ff=choose(final,'painting.png')??choose(null,'painting.jpg'),inf=choose(ink,'ink.jpg');
  const h=Math.max(1,Math.round(analysisWidth*tape.h/tape.w));
  const read=async f=>{if(!f)return null;const {data,info}=await sharp(f).flatten({background:'#fff'}).toColourspace('srgb').resize(analysisWidth,h,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});if(info.channels!==3)throw Error('composition image must decode to RGB');return data;};
  const [finalRGB,inkRGB]=await Promise.all([read(ff),read(inf)]);
  return {tape,plan,commands,finalRGB,inkRGB,paperRGB:tape.base,analysisWidth,regionProfiles};
}
