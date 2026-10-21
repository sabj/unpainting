import {normalizePassageMove,passageFamily,passageMaterial} from '../techniques/passage-plan.mjs';
import {resolveStyle,profileTechnique,loadStyle} from '../styles/loader.mjs';
import {choosePassageBrush} from './passage-brush.mjs';
import {mergePlaneFragments} from '../techniques/shaped-marks.mjs';
import {planLanes} from './stroke-plan.mjs';
import {joinDomainFragments} from './wash-join.mjs';
import {smallLandmarks} from './small-marks.mjs';
import {detailField,keepByDetail,localMinShape,meanOver,segmentDetailMask} from './detail-scale.mjs';
import {layerFractions,regionCuts} from './layer-cuts.mjs';
// Target-value scheduling. Pure CPU planning; no paper mutation or bitmap painting.
import { components, closeLocal, removeSmall, erode, dilate } from '../../raster.js';
import { targetRegions } from './target-regions.mjs';
import { subjectCovers, holdSubjectLights, subjectDomain } from './subject-washes.mjs';
import { passage } from '../../crop/blockin.mjs';
import { labOf } from '../../eval/colour.mjs';
import { RECESS, STONE_WALL, STONE_BLOCK_PIGMENTS, STONE_BLOCK_SHARES, GROUND } from '../tuned/trumbull.mjs';

const VALUE_CAPS = Object.freeze([.16, .32, .50, .75, 1]);
// The q quantile of G over a passage's cells.
function quantileOf(list,G,q){const v=Float32Array.from(list,i=>G[i]).sort();return v[Math.min(v.length-1,Math.max(0,Math.floor(q*(v.length-1))))];}
const neighbors = (i,w,n) => [i%w?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i+w<n?i+w:-1].filter(j=>j>=0);
function targetValueMap(density) {
  if (!density.length || density.some(v=>!Number.isFinite(v)||v<0)) throw Error('finite nonnegative target density required');
  const a=Array.from(density).filter(v=>v>0).sort((a,b)=>a-b);
  const peak=a[Math.min(a.length-1,Math.floor(a.length*.97))]||1;
  const values=Float32Array.from(density,v=>Math.min(1,v/peak));
  const bands=Uint8Array.from(values,v=>v<=0?0:VALUE_CAPS.findIndex(t=>v<=t)+1||5);
  return {peak,values,bands};
}
export function planLightToDark({smallLightMax=120,detailScale=0,detailSegments=null,layerLocal=false,smallMarks=false,smallIsolationMm=0,washJoin=false,bandRound=false,valueFloor=null,demand,k,density,w,h,hold=null,families=[],reserves=[],sheetWidthMm=280,rgb=null,shaped=false,subject=null,recesses=false,pigments=[],brushChoice=false,midDomains=true,nested=false,layers:washLayers=0,recessLayers=1,recessShare=.5,recessClean=false,layerHue=false,edgeFadeMm=0,edgeWobbleMm=0,strokePlan=false,laneMm=6,laneAdapt=false,strokeMm=30,washReachMm=0,litLift=0,litWarm=false,litL=86,litReserveL=95,layerTexture=false,skySplit=false,darkGain=1,styleSelection=null,styleGain=1,layerSmoothMm=2,accentShare=0,accentMin=.55,paperLights=false,paperDelta=10,paperRel=false,coolGain=1,shadowThresh=.38,midGain=1,shadowWater=0,groundGlaze=0,groundFrom=GROUND.from,stoneBlocks=0,stoneBlockMm=2.6,stoneBlockAmt=.18,deepAccent=0,deepAccentIn=null,cellFamilies=false,minShapeCells=0,stoneIrregular=false,deepGrow=0,recessMax=0,stoneCourses=false,recessAccent=false,skyOneLayer=false,stoneClusters=0,eyeRing=0,layerIncrement=false,nestedBands=false,pigShare=0,hueChroma=0,hueChromaLab=false,shadowFamilies=false,passCap=0,carryMm=0,holeFill=0,keepMask=false,maskMm=0,paleLights=0,lightFamilies=false,laneMax=0,subjects=null}) {
  let coolGroup=null;setRecessMax(recessMax);
  // A plan with a styleSelection reads its decisions from the profile. precise-watercolor is the identity profile
  // (the shaped planner's own weights and water); every other style replaces them from its JSON.
  const profile=styleSelection?resolveStyle(subject,null,styleSelection):null;
  const n=w*h;if(demand.length!==n*k||density.length!==n||k<1)throw Error('target/demand grid mismatch');
  if(demand.some(v=>!Number.isFinite(v)||v<0))throw Error('invalid pigment demand');
  // paperLights: a cream target sheet is paper, not paint. Estimate it from the brightest large connected region,
  // measure values against it, and reserve near-paper cells as bare paper.
  const paper=paperLights&&rgb?estimatePaper(rgb,w,h,density):null;
  const value=targetValueMap(paper?Float32Array.from(density,v=>Math.max(0,v-paper.density)):density),region=subjects??targetRegions({w,h,rgb,demand,k,density,families}),protectedCells=Uint8Array.from({length:n},(_,i)=>hold?.[i]?1:0);
  for(const r of reserves){if(!r.reason||!Array.isArray(r.bounds)||r.bounds.length!==4||r.bounds.some(v=>!Number.isFinite(v)||v<0||v>1)||r.bounds[0]>=r.bounds[2]||r.bounds[1]>=r.bounds[3])throw Error('invalid explicit light reserve');const b=r.bounds;for(let y=Math.floor(b[1]*h);y<Math.ceil(b[3]*h);y++)for(let x=Math.floor(b[0]*w);x<Math.ceil(b[2]*w);x++)if(x<w&&y<h)protectedCells[y*w+x]=1;}
  // Broad target lights, simplified before any paint. Explicit glints survive the
  // area filter; inferred isolated white pixels are not a painting instruction.
  // minShapeCells (whole paintings): a fixed shape floor in cells. The automatic floor grows with sheet area and drops
  // small face shadow shapes.
  const minShape=minShapeCells>0?minShapeCells:Math.max(shaped?144:4,Math.round(w*h*.00015));
  if(shaped)region.labels=mergePlaneFragments(region.labels,w,h,rgb,minShape);
  // --paperrel: the paper colour is the mean of the lightest 10% of cells, and every
  // cell within 9/9/12 below it per channel is a light. With --paperbase source the sheet takes that colour too.
  let PAP=null;if(paperRel&&rgb){const L=Float32Array.from({length:n},(_,i)=>rgb[3*i]+rgb[3*i+1]+rgb[3*i+2]),idx=Array.from(L.keys()).sort((a,b)=>L[b]-L[a]).slice(0,Math.max(1,Math.floor(n*.1)));PAP=[0,1,2].map(c=>idx.reduce((a,i)=>a+rgb[3*i+c],0)/idx.length);}
  const tonedPap=Boolean(PAP&&PAP[0]-PAP[2]>=18&&252-PAP[2]>=20),papTol=tonedPap?[14,14,18]:[9,9,12];
  const inferred=Uint8Array.from({length:n},(_,i)=>PAP?(rgb[3*i]>=PAP[0]-papTol[0]&&rgb[3*i+1]>=PAP[1]-papTol[1]&&rgb[3*i+2]>=PAP[2]-papTol[2]?1:0):rgb ? (Math.min(rgb[3*i],rgb[3*i+1],rgb[3*i+2])>=245 && Math.max(rgb[3*i],rgb[3*i+1],rgb[3*i+2])-Math.min(rgb[3*i],rgb[3*i+1],rgb[3*i+2])<=8 ? 1:0) : (hold?.[i]||value.values[i]<.055?1:0));
  if(paper)for(let i=0;i<n;i++){let d=0;for(let q=0;q<3;q++)d=Math.max(d,Math.abs(rgb[3*i+q]-paper.rgb[q]));if(d<=paperDelta)inferred[i]=1;}
  // detailScale k (detail-scale.mjs): the minimum shape shrinks with the target's mid-scale detail, down to share 1-k.
  const DETAIL0=detailScale>0?detailField(value.values,w,h,sheetWidthMm/w):null;
  const DETAIL=DETAIL0&&detailSegments?detailField(value.values,w,h,sheetWidthMm/w,segmentDetailMask(detailSegments,rgb,DETAIL0,w,h)):DETAIL0;
  const lights=DETAIL?keepByDetail(closeLocal(inferred,w,h,1),w,h,minShape,DETAIL,detailScale):removeSmall(closeLocal(inferred,w,h,1),w,h,minShape);
  protectedCells.fill(0);for(let i=0;i<n;i++)protectedCells[i]=lights[i];
  for(const r of reserves){const b=r.bounds;for(let y=Math.floor(b[1]*h);y<Math.ceil(b[3]*h);y++)for(let x=Math.floor(b[0]*w);x<Math.ceil(b[2]*w);x++)if(x<w&&y<h)protectedCells[y*w+x]=1;}
  // A single coherent shadow support, shared by both last glazes. Smooth strength
  // within it, rather than five nested isodensity silhouettes. Filter tiny dark
  // flecks out of the glaze list; their demand stays in the dry middle passage.
  const colorEdge=(i,j)=>{let a=0,b=0;for(let q=0;q<k;q++){a+=demand[i*k+q];b+=demand[j*k+q];}let d=0;for(let q=0;q<k;q++)d+=Math.abs(demand[i*k+q]/Math.max(1e-9,a)-demand[j*k+q]/Math.max(1e-9,b));return d;};
  const smooth=Float32Array.from(value.values,(v,i)=>{let sum=v,weight=1;for(const j of neighbors(i,w,n))if(Math.abs(v-value.values[j])<.14&&colorEdge(i,j)<.45){sum+=value.values[j];weight++;}return sum/weight;});
  let shadowMask=DETAIL?keepByDetail(closeLocal(Uint8Array.from(smooth,v=>v>shadowThresh?1:0),w,h,1),w,h,minShape*2,DETAIL,detailScale):removeSmall(closeLocal(Uint8Array.from(smooth,v=>v>shadowThresh?1:0),w,h,1),w,h,minShape*2);
  if(shaped){const body=dilate(erode(shadowMask,w,h,1),w,h,1);shadowMask=Uint8Array.from(shadowMask,(v,i)=>v&&body[i]?1:0);}
  // smallMarks (small-marks.mjs): catchlights and lit gaps under the minimum shape are reserved paper; small darks the
  // shadow support leaves out (nostrils, mouth corners, pupils) become one late mark on dry paint, not dropped.
  let SMALL_DARK=null,SMALL_MIN=12;
  if(smallMarks){const sm=smallLandmarks({values:value.values,smooth,shadowMask,protect:protectedCells,w,h,cellMm:sheetWidthMm/w,maxCells:minShape*2,isolationMm:smallIsolationMm,maxLights:smallLightMax});for(let i=0;i<n;i++)if(sm.lights[i])protectedCells[i]=1;SMALL_DARK=sm.darks;SMALL_MIN=Math.min(12,sm.darkMin);console.log(`small marks: ${sm.lightCount} small lights reserved, ${sm.darkCount} small darks laid once, last`);}
  // edgeFade: a dark mass against light paper or pale skin (hair against forehead) is lighter
  // and broken at its contour, darkest inside. Shadow weight ramps up over edgeFadeMm from the
  // nearest light cell; masses that meet mid values keep their full edge.
  let fade=null;
  if(edgeFadeMm>0){const R=Math.max(1,Math.round(edgeFadeMm/(sheetWidthMm/w))),dist=new Float32Array(n).fill(1e9),q=[];
    for(let i=0;i<n;i++)if(value.values[i]<.12){dist[i]=0;q.push(i);}
    for(let p=0;p<q.length;p++){const i=q[p];if(dist[i]>=R)continue;for(const j of neighbors(i,w,n))if(dist[j]>dist[i]+1){dist[j]=dist[i]+1;q.push(j);}}
    fade=Float32Array.from(dist,d=>d>=R?1:.35+.65*d/R);}
  const weights=Array.from({length:5},()=>new Float32Array(n));
  // deepGrow r: the deep-accent set grows by r cells into neighbours that are nearly as dark (max channel under
  // deepAccent+45), so a brow is restated as a full tapered mass rather than its darkest core only.
  let deepMask=null;
  if(deepAccent>0&&rgb){deepMask=Uint8Array.from({length:n},(_,i)=>Math.max(rgb[i*3],rgb[i*3+1],rgb[i*3+2])<deepAccent?1:0);
    for(let g=0;g<deepGrow;g++){const nx=deepMask.slice();for(let i=0;i<n;i++)if(!deepMask[i]&&Math.max(rgb[i*3],rgb[i*3+1],rgb[i*3+2])<deepAccent+45&&neighbors(i,w,n).some(j=>deepMask[j]))nx[i]=1;deepMask=nx;}}
  // deepAccentIn: only cells inside the bounds of these named families take deep accents, so a cat nose and eye
  // rims are restated while a portrait's irises, which the same threshold turns black, are left alone.
  if(deepMask&&deepAccentIn?.length){const boxes=families.filter(f=>deepAccentIn.includes(f.id)&&f.bounds).map(f=>f.bounds);
    deepMask=Uint8Array.from(deepMask,(v,i)=>{if(!v)return 0;const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;return boxes.some(b=>x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3])?1:0;});}
  const accentCells=new Uint8Array(n),groundCells=new Uint8Array(n);
  // eyeRing r (share of sheet width): an eye is a lighter iris ring with a dark pupil and limbal edge, not one dark almond.
  // Around each catchlight reserve the iris centre is the centroid of dark cells within 1.5r. Deep accents stay on the
  // pupil (under .38r) and the limbal edge (over .78r); the iris body between keeps its middle planes.
  const irisBody=new Uint8Array(n);
  if(eyeRing>0&&deepMask&&rgb){const R=eyeRing*w;for(const res of reserves.filter(r=>/catchlight/.test(r.reason))){const cx0=(res.bounds[0]+res.bounds[2])/2*w,cy0=(res.bounds[1]+res.bounds[3])/2*h;let sx=0,sy=0,c=0;
    for(let y=Math.max(0,Math.floor(cy0-1.5*R));y<Math.min(h,Math.ceil(cy0+1.5*R));y++)for(let x=Math.max(0,Math.floor(cx0-1.5*R));x<Math.min(w,Math.ceil(cx0+1.5*R));x++){const i=y*w+x;if((x-cx0)**2+(y-cy0)**2<2.25*R*R&&Math.max(rgb[i*3],rgb[i*3+1],rgb[i*3+2])<110){sx+=x;sy+=y;c++;}}
    if(!c)continue;const cx=sx/c,cy=sy/c;
    for(let y=Math.max(0,Math.floor(cy-R));y<Math.min(h,Math.ceil(cy+R));y++)for(let x=Math.max(0,Math.floor(cx-R));x<Math.min(w,Math.ceil(cx+R));x++){const d=Math.hypot(x-cx,y-cy)/R;if(d>.38&&d<.78)irisBody[y*w+x]=1;}
    console.log(`eye ring: catchlight ${cx0.toFixed(0)},${cy0.toFixed(0)} iris centre ${cx.toFixed(0)},${cy.toFixed(0)} r ${R.toFixed(1)} cells`);}}
  for(let i=0;i<n;i++){
    const v=value.values[i],t=Math.max(0,Math.min(1,(smooth[i]-shadowThresh)/(.70-shadowThresh)));
    const shadowFull=shadowMask[i]? .72*t*t*(3-2*t):0,shadow=shadowFull*(fade?fade[i]:1);
    const light=Math.min(.28,.085/Math.max(.085,v));
    const middle=1-light-shadowFull;
    weights[0][i]=light;weights[1][i]=middle*.6;weights[2][i]=middle*.4;weights[3][i]=shadow*.65;weights[4][i]=shadow*.35;
    if(shaped){weights[1][i]=middle*.88;weights[2][i]=middle*.12;
      // nested: a painter lays the lighter middle plane over the whole form, lets it dry, then
      // a smaller darker plane only where the target is darker. Each plane holds a narrow value
      // range, so its single wash value matches the target.
      if(nested){const share=Math.min(1,.32/Math.max(1e-6,v));weights[1][i]=middle*share;weights[2][i]=middle*(1-share);}
      // --recesses 1 (the architecture preset): hard dark architectural recesses are last paint accents on the dried wall (fitted on Y1; docs/techniques.md, Tuned settings).
      if(recesses&&rgb&&isRecess(rgb,i)){weights[1][i]=weights[2][i]=weights[3][i]=0;weights[4][i]=1-light;if(recessAccent)accentCells[i]=1;
        // Darks build in two dried layers, as a painter restates a window: band 4 then band 5.
        if(recessLayers>1){const keep=recessClean?1:1-light;if(recessClean)weights[0][i]=0;weights[3][i]=keep*recessShare;weights[4][i]=keep*recessShare;}}
      // accentShare: small dark features (brows, lids, iris rims, nostrils, lip line) are too small for the shadow
      // glaze support. Their share of middle demand above value accentMin moves to band 5, as last accents on dry paint.
      if(accentShare>0&&!shadowMask[i]&&v>accentMin){const a=middle*accentShare*Math.min(1,(v-accentMin)/.2);weights[1][i]-=a*weights[1][i]/Math.max(1e-6,middle);weights[2][i]-=a*weights[2][i]/Math.max(1e-6,middle);weights[4][i]+=a;accentCells[i]=1;}
      // deepAccent m: cells with max channel below m (pupils, iris rims, nostrils, brow cores, lip corners) are
      // restated last in two dried layers, band 4 then band 5, as a painter darkens an eye last.
      if(deepMask&&!recesses&&!protectedCells[i]&&deepMask[i]&&!irisBody[i]){const keep=1-light;weights[1][i]=weights[2][i]=0;weights[3][i]=keep*.75;weights[4][i]=keep*.75;accentCells[i]=1;}
      if(SMALL_DARK&&SMALL_DARK[i]&&!protectedCells[i]&&!accentCells[i]){const keep=1-light;weights[1][i]=weights[2][i]=weights[3][i]=0;weights[4][i]=keep;accentCells[i]=1;}
      // groundGlaze: a cool-neutral ground (road, pavement shadow side) is one blue-violet glaze across
      // the whole ground on dry paint, not separate light washes; share g of its middle demand moves to band 4.
      if(groundGlaze>0&&rgb&&!protectedCells[i]&&Math.floor(i/w)/h>groundFrom&&!isRecess(rgb,i)){const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],L=.2126*r+.7152*g+.0722*b;
        if(b>=r-GROUND.blueUnderRed&&Math.max(r,g,b)-Math.min(r,g,b)<GROUND.maxChroma&&L>GROUND.minL&&L<GROUND.maxL){const m=weights[1][i]+weights[2][i],a=m*groundGlaze;weights[1][i]-=a*weights[1][i]/Math.max(1e-6,m);weights[2][i]-=a*weights[2][i]/Math.max(1e-6,m);weights[3][i]+=a;shadowMask[i]=1;groundCells[i]=1;}}}

  }
  // litLift (luminous stone): warm stone whose squinted (1 mm) target L* is at least litL is a lit face. It keeps its
  // pale foundation, loses share litLift of the middle layers and every shadow glaze, and stays a thin warm glaze.
  // Lit cells at litReserveL or more are reserved as paper (sun-struck edges). One squinted threshold, cleaned to shapes.
  const hasSunlitStone=layerLocal&&litLift===0&&families.some(f=>/stone/i.test(f.id??'')&&/sunlit/i.test(f.referenceCue??''));
  const effLitLift=litLift>0?litLift:hasSunlitStone?.45:0,effLitWarm=litWarm||hasSunlitStone,effLitL=litLift>0?litL:hasSunlitStone?80:86,effLitReserveL=litLift>0?litReserveL:95;
  let litStoneMask=null;
  if(shaped&&(effLitLift>0||effLitWarm)&&rgb){
    const Lst=Float32Array.from({length:n},(_,i)=>lstarOf(rgb,i)),sm=boxMeanValue(Lst,w,h,Math.max(1,Math.round(1/(sheetWidthMm/w))));
    const smBroadL=hasSunlitStone?boxMeanValue(Lst,w,h,Math.max(2,Math.round(3.5/(sheetWidthMm/w)))):null;
    const warmStone=i=>rgb[i*3]-rgb[i*3+2]>14&&rgb[i*3+1]-rgb[i*3+2]>6;
    const lit=removeSmall(closeLocal(Uint8Array.from({length:n},(_,i)=>!protectedCells[i]&&warmStone(i)&&sm[i]>=effLitL&&!isRecess(rgb,i)?1:0),w,h,1),w,h,Math.max(12,minShape>>2));
    if(hasSunlitStone)litStoneMask=lit;
    const ridge=hasSunlitStone?removeSmall(Uint8Array.from({length:n},(_,i)=>lit[i]&&(sm[i]>=87||(smBroadL&&Lst[i]>=82&&Lst[i]-smBroadL[i]>=1.2))?1:0),w,h,8):null;
    const glint=removeSmall(Uint8Array.from({length:n},(_,i)=>lit[i]&&sm[i]>=effLitReserveL?1:0),w,h,8);
    // litWarm: on a lit face the cool and neutral demand (ultramarine, cerulean, sepia, Payne's grey) goes to warm
    // earth (yellow ochre or raw sienna, or 82% hansa yellow + 18% quinacridone rose when ochre is absent).
    const och=pigments.findIndex(p=>/yellow ochre|raw sienna/i.test(p?.name??'')),sienna=pigments.findIndex(p=>/raw sienna|burnt sienna/i.test(p?.name??'')),hansa=pigments.findIndex(p=>/hansa yellow|cadmium yellow/i.test(p?.name??'')),rose=pigments.findIndex(p=>/quinacridone rose|cadmium red/i.test(p?.name??''));
    const cool=pigments.map((p,j)=>/ultramarine|cerulean|sepia|payne/i.test(p?.name??'')?j:-1).filter(j=>j>=0);
    if(effLitWarm&&(och>=0||sienna>=0||hansa>=0)){demand=demand.slice();}
    let a=0,g=0;for(let i=0;i<n;i++){if(!lit[i])continue;if(effLitWarm&&(och>=0||sienna>=0||hansa>=0)){let m=0;for(const j of cool){m+=demand[i*k+j];demand[i*k+j]=0;}if(och>=0){demand[i*k+och]=demand[i*k+och]+m;}else if(sienna>=0&&hansa>=0){demand[i*k+sienna]+=m*.72;demand[i*k+hansa]+=m*.28;}else if(hansa>=0&&rose>=0){const tot=demand[i*k+hansa]+demand[i*k+rose]+m;demand[i*k+hansa]=tot*.82;demand[i*k+rose]=tot*.18;}else if(hansa>=0){demand[i*k+hansa]+=m;}else if(sienna>=0){demand[i*k+sienna]+=m;}}a++;
      if(ridge?.[i]){weights[0][i]=Math.max(weights[0][i],.82);weights[1][i]=0;weights[2][i]=0;}else{if(hasSunlitStone)weights[0][i]=Math.max(weights[0][i],.62);weights[1][i]*=1-effLitLift;weights[2][i]*=1-effLitLift;}
      weights[3][i]=weights[4][i]=0;if(glint[i]){protectedCells[i]=1;g++;}}
    console.log(`lit stone: ${a} cells lit (squinted L* >= ${effLitL}), ${g} reserved as paper glints (>= ${effLitReserveL})`);
  }
  const regionProfiles=profile?region.regions.map(r=>resolveStyle(subject,r.descriptiveFamily,styleSelection)):[];
  // cellFamilies (whole paintings): colour regions can span the whole sheet, so no region wins a small family box.
  // A dark, low-chroma cell inside the box of a family whose style is not the subject's default takes that style.
  let cellProf=null;const styleByName={};
  if(profile&&cellFamilies&&rgb){const fams=families.filter(f=>f.bounds).map(f=>({f,st:resolveStyle(subject,f.id,styleSelection)})).filter(q=>q.st.name!==profile.name);
    if(fams.length){cellProf=new Array(n);for(let i=0;i<n;i++){let st=regionProfiles[region.labels[i]-1]??profile;const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h,r=rgb[3*i],g=rgb[3*i+1],b=rgb[3*i+2];
      if(st.name===profile.name&&value.values[i]>.3&&Math.max(r,g,b)-Math.min(r,g,b)<45)for(const q of fams){const bd=q.f.bounds;if(x>=bd[0]&&x<bd[2]&&y>=bd[1]&&y<bd[3]){st=q.st;break;}}
      cellProf[i]=st;styleByName[st.name]=st;}}}
  const cellStyle=i=>cellProf?cellProf[i]:regionProfiles[region.labels[i]-1]??profile;
  const floor=valueFloor?loadStyle(valueFloor):null;
  if(profile)for(let i=0;i<n;i++){
    const chosen=cellStyle(i);if(chosen.name==='precise-watercolor')continue;
    // A connected sepia silhouette may span paper-light limbs and deep folds.
    // Giving it one mean charge erases those forms. Build nested value masses,
    // each with its own wash charge, before sealing the target. Their weights
    // sum to one; no target sampling is needed while the brush paints.
    if(chosen.name==='ink-and-wash'){
      const v=value.values[i];
      for(let band=0;band<5;band++){
        const lo=band?VALUE_CAPS[band-1]:0;
        // bandRound: a cell joins a band only when it reaches halfway up that band's step. Each passage is laid with
        // one mean charge, so a cell barely inside a band otherwise takes the whole step and its lights go dark.
        if(bandRound&&v<lo+.5*(VALUE_CAPS[band]-lo)){weights[band][i]=0;continue;}
        weights[band][i]=v>0?Math.max(0,Math.min(v,VALUE_CAPS[band])-lo)/v*chosen.paintStrength*styleGain:0;
      }
      continue;
    }
    // valueFloor (a style name, such as ink-and-wash): urban-sketch cells paint at least that style's value depth
    // per band. urban-sketch alone is one 25% band, a near-blank sheet.
    for(let band=0;band<5;band++){const own=chosen.weights[band]*chosen.paintStrength;weights[band][i]=(floor&&chosen.name==='urban-sketch'?Math.max(own,floor.weights[band]*floor.paintStrength):own)*styleGain;}
    // Dry glazes need coherent support; move their share into the base/mid plane outside shadows.
    // Wet atmospheric charges share the entire open passage.
    if(chosen.name==='atmospheric-wet')shadowMask[i]=1;
    else if(!shadowMask[i]){weights[chosen.structure==='ink'?0:1][i]+=weights[3][i]+weights[4][i];weights[3][i]=weights[4][i]=0;}
  }
  // nestedBands: every cell's demand is split into the five value bands as flat value steps, the nested masses the
  // ink-and-wash style uses, whatever the style. Band k covers the cells darker than the band below it and carries the
  // step from that band's cap to its own, so each passage's one mean charge fits all of its cells. Without it a light
  // cell and a dark neighbour share a band in different proportions and the mean charge muddies the light one.
  if(nestedBands)for(let i=0;i<n;i++){if(profile&&cellStyle(i).name==='ink-and-wash')continue;const v=value.values[i];
    for(let band=0;band<5;band++){const lo=band?VALUE_CAPS[band-1]:0;weights[band][i]=v>0?Math.max(0,Math.min(v,VALUE_CAPS[band])-lo)/v*styleGain:0;}}
  // paleLights v: pale planes (smoothed value at most v, at least a minimum shape) are pale local colour, one clean
  // wash: their whole demand goes to band 1 and no middle layer or glaze crosses them.
  if(paleLights>0&&shaped){const sv=boxMeanValue(value.values,w,h,Math.max(1,Math.round(layerSmoothMm/(sheetWidthMm/w)))),pale=removeSmall(closeLocal(Uint8Array.from(sv,(v,i)=>v<=paleLights&&!protectedCells[i]?1:0),w,h,1),w,h,minShape);
    for(let i=0;i<n;i++)if(pale[i]&&!litStoneMask?.[i]){let t=0;for(let b=0;b<5;b++){t+=weights[b][i];weights[b][i]=0;}weights[0][i]=t;}}
  const styleNames=profile?(cellProf?Object.keys(styleByName):[...new Set(regionProfiles.map(p=>p.name))]):[];
  const layers=[],instructions=[];let omittedDemand=0;
  for(let i=0;i<n;i++)if(protectedCells[i]||(!rgb&&value.values[i]===0))for(let j=0;j<k;j++)omittedDemand+=demand[i*k+j];
  // layers>0: the middle values are built as several wide connected wash layers, each dried
  // before the next. Layer 0 covers the whole middle form; each later layer covers only the
  // darker part of the smoothed value field, so value builds gradually.
  const steps=[1,2,3,4,5].map(band=>({band,wt:weights[band-1],tag:''}));
  if(shaped&&washLayers>0&&profile?.name!=='ink-and-wash'&&!nestedBands){
    const r=Math.max(1,Math.round(layerSmoothMm/(sheetWidthMm/w))),sm=boxMeanValue(value.values,w,h,r);
    const rBroad=Math.max(r,Math.round(2/(sheetWidthMm/w))),smBroad=rBroad>r?boxMeanValue(value.values,w,h,rBroad):sm;
    const live=[];for(let i=0;i<n;i++)if(!protectedCells[i]&&weights[1][i]>0)live.push(smBroad[i]);live.sort((a,b)=>a-b);
    const QF=layerFractions(washLayers);
    const q=QF.map(f=>live[Math.floor(f*(live.length-1))]??0);
    // skyOneLayer: a large open cool plane (sky over 1.5% of the sheet) is one graded wet passage in layer 0. Later
    // layers, cut at a whole-sheet value quantile, would lay hard-edged dark patches over it.
    let skyCells=null;
    if(skyOneLayer&&rgb){const cool=Uint8Array.from({length:n},(_,i)=>!protectedCells[i]&&rgb[i*3+2]>rgb[i*3]+10&&rgb[i*3+2]>=135&&!isRecess(rgb,i)?1:0),cc=components(cool,w,h),sz=new Int32Array(cc.count+1);
      for(let i=0;i<n;i++)sz[cc.labels[i]]++;skyCells=Uint8Array.from({length:n},(_,i)=>cc.labels[i]&&sz[cc.labels[i]]>n*.015?1:0);}
    // layerLocal: the cut levels are the same quantiles of each colour region's own smoothed values (compact, detailed
    // subject regions of at least minShape*6 cells and at most 14% of the sheet), so a form whose values sit inside one
    // whole-sheet step (a sunlit face in a dark scene) gets its own light, half and shadow planes while broad skies,
    // walls and grounds keep the 4 smooth sheet-wide layers.
    const localQ=layerLocal?regionCuts(region.labels,sm,i=>!protectedCells[i]&&weights[1][i]>0&&!skyCells?.[i],QF,minShape*6):null;
    const broadStride=washLayers>4?Math.max(1,Math.round(washLayers/4)):1;
    // subjects: each subject's layers are cut at its own value quantiles of the value smoothed inside it (subject-washes.mjs)
    const cover=subjects?subjectCovers({subjects,values:value.values,weights:weights[1],protectedCells,skyCells,count:q.length,w,h,mmPerCell:sheetWidthMm/w,minShape,smoothMm:layerSmoothMm}):q.map((t,j)=>{if(j===0)return Uint8Array.from(sm,(v,i)=>weights[1][i]>0?1:0);const mask=Uint8Array.from(sm,(v,i)=>{if(skyCells?.[i])return 0;const lq=localQ?.get(region.labels[i]);if(lq)return v>lq[j]?1:0;if(j%broadStride!==0)return 0;return smBroad[i]>t?1:0;});return removeSmall(closeLocal(mask,w,h,layerSmoothMm<2?1:2),w,h,layerSmoothMm<2?minShape:minShape*4);});
    const count=new Uint8Array(n);for(const c of cover)for(let i=0;i<n;i++)count[i]+=c[i];
    // The layers carry all middle demand; no separate per-region band-3 patchwork.
    // layerIncrement: each layer carries the value step between its threshold and the next layer's, as a painter lays
    // one flat value over the whole form and then only darker steps where the form is darker. An equal split (the
    // default) gives a light cell all its middle demand in layer 0 while a dark neighbour puts only a quarter there, so
    // the shape's one mean charge is too dark for the light cells and too light for the dark ones.
    const share=layerIncrement?layerShares(cover,q,sm,n):null;
    const layerSteps=cover.map((c,j)=>({band:2,tag:'L'+j,wt:Float32Array.from(c,(v,i)=>v&&count[i]?(weights[1][i]+(layerTexture?0:weights[2][i]))*(share?share[j][i]:1/count[i]):0)}));
    // layerTexture: band 3 stays a sparse dry-brush texture pass over the dried layers (rough stone).
    steps.splice(1,layerTexture?1:2,...layerSteps);
  }
  // stoneBlocks c: sparse irregular ashlar hints on dry warm wall, courses of blocks stoneBlockMm tall, share c kept.
  // Each is a pale single-pigment glaze at stoneBlockAmt of the cell's demand, not marks or dry brush. They are laid
  // wet on dry between the middle layers and the shadow glazes.
  const effStoneBlocks=stoneBlocks;
  if(shaped&&effStoneBlocks>0&&rgb){const B=makeStoneBlocks({rgb,w,h,protectedCells,sheetWidthMm,cover:effStoneBlocks,mm:stoneBlocks>0?stoneBlockMm:3.6,pigments,irregular:stoneIrregular||hasSunlitStone,courses:stoneCourses||hasSunlitStone,clusters:stoneClusters||(hasSunlitStone?14:0)});
    if(B){const at=steps.findIndex(s=>s.band>=4);steps.splice(at<0?steps.length:at,0,{band:3,tag:'B',wt:Float32Array.from(B,(v,i)=>v>=0?stoneBlockAmt:0),pig:B});}}
  // subjects: a subject's lit planes take its first washes only; the later middle layers go round them
  if(subjects)steps.splice(0,steps.length,...holdSubjectLights(steps,subjects.lights));
  // passCap q: each passage is charged at the q quantile of its cells' demand, not the mean, so one charge does not
  // overshoot its paler cells; what a cell still needs (or got too much of) is carried into that pigment's next band.
  const carry=passCap>0?Array.from({length:k},()=>new Float32Array(n)):null;
  for(const step of steps){const band=step.band;
    const phase=band===1?'light':band<=3?'mid':'shadow',lo=band===1?0:VALUE_CAPS[band-2],hi=VALUE_CAPS[band-1];
    for(let pigment=0;pigment<k;pigment++){
      const G=new Float32Array(n),mask=new Uint8Array(n),placed=carry&&!step.pig?new Float32Array(n):null,elig=placed&&maskMm>0&&shaped&&phase!=='light'?new Uint8Array(n):null;
      for(let i=0;i<n;i++){const v=value.values[i];if(protectedCells[i]||(!rgb&&v===0))continue;let fitted=demand[i*k+pigment];if(step.pig){if(step.pig[i]!==pigment)continue;let mass=0;for(let q=0;q<k;q++)mass+=demand[i*k+q];fitted=mass;}
        const effCool=coolGain;G[i]=fitted*step.wt[i]*(phase==='shadow'?darkGain:phase==='mid'?midGain:1)*(effCool!==1&&rgb&&rgb[i*3+2]>rgb[i*3]+10&&!isRecess(rgb,i)?effCool:1);if(placed){const g=G[i]+carry[pigment][i];G[i]=keepMask&&G[i]>1e-8?Math.max(1e-6,g):Math.max(0,g);carry[pigment][i]=Math.min(0,g-(keepMask&&G[i]===1e-6?1e-6:0));}const recess=shaped&&recesses&&rgb&&isRecess(rgb,i);mask[i]=cellStyle(i)?.name==='ink-and-wash'?(step.wt[i]>0?1:0):phase==='shadow'?((shadowMask[i]||recess||accentCells[i])&&step.wt[i]>0?1:0):1;if(elig)elig[i]=mask[i]&&step.wt[i]>0?1:0;if(shaped&&G[i]<=1e-8)mask[i]=0;if(pigShare>0&&!step.pig&&mask[i]){let mass=0;for(let q=0;q<k;q++)mass+=demand[i*k+q];if(!(demand[i*k+pigment]>=pigShare*mass&&mass>0))mask[i]=0;}}
      // With carried demand a cell over-charged earlier drops out of the next mask. Holes under the minimum shape are
      // filled again, so a passage skips only light shapes a painter would reserve, not single cells.
      // maskMm: where a carried glaze goes is judged over a brush-sized area, not cell by cell: the mask is the
      // signed demand left (what is still needed less what was over-laid) averaged over maskMm.
      if(elig){const g=Float32Array.from(G,(v,i)=>v+carry[pigment][i]),sm=boxMeanValue(g,w,h,Math.max(1,Math.round(maskMm/(sheetWidthMm/w))));for(let i=0;i<n;i++)mask[i]=elig[i]&&sm[i]>1e-8?1:0;}
      if(placed&&shaped&&phase!=='light'&&holeFill){const hole=Uint8Array.from(mask,(v,i)=>!v&&!protectedCells[i]&&(phase!=='shadow'||shadowMask[i])&&step.wt[i]>0?1:0),big=removeSmall(hole,w,h,Math.round(minShape*holeFill));for(let i=0;i<n;i++)if(hole[i]&&!big[i])mask[i]=1;}
      // Middle local colors belong to regions. Shadow connectivity ignores ownership boundaries.
      // midDomains=false: a middle plane follows the target value, not the colour-cluster boundary,
      // so smooth skin is not split into flat posterized patches along invisible cluster lines.
      // layerHue: wash layers keep colour families apart, so a sky or window wash is not averaged
      // with the stone wall it touches.
      // shadowFamilies: a shadow glaze keeps the colour families apart too, so the grey shirt shadow
      // does not pool its blue charge across the saturated orange cat it touches.
      const groupMode=layerHue&&(step.tag||((skySplit||lightFamilies)&&phase==='light')||(shadowFamilies&&phase==='shadow'));
      if(groupMode&&!coolGroup){coolGroup=new Uint8Array(region.regions.length+1);const sr=new Float64Array(region.regions.length+1),sb=new Float64Array(region.regions.length+1),cnt=new Float64Array(region.regions.length+1);for(let q=0;q<n;q++){const L=region.labels[q];sr[L]+=rgb[q*3];sb[L]+=rgb[q*3+2];cnt[L]++;}const sg=new Float64Array(region.regions.length+1);for(let q=0;q<n;q++)sg[region.labels[q]]+=rgb[q*3+1];
        // Three families: cool (sky, glass), yellow-green foliage (hue >= 50 deg), warm stone.
        for(let L=1;L<=region.regions.length;L++){const r=sr[L]/Math.max(1,cnt[L]),g=sg[L]/Math.max(1,cnt[L]),b=sb[L]/Math.max(1,cnt[L]),hue=Math.atan2(Math.sqrt(3)*(g-b),2*r-g-b)*180/Math.PI;
          // hueChromaLab: RGB range confuses a dark muted brown with a saturated orange. Perceptual
          // chroma keeps their shared warm hue from pooling one charge (layered washes only).
          const sat=hueChromaLab?Math.hypot(...labOf([r,g,b],0,[255,255,255]).slice(1)):Math.max(r,g,b)-Math.min(r,g,b);
          coolGroup[L]=(b>r?2:hue>=50&&hue<170?3:1)+(b<=r&&hueChroma>0&&sat>=hueChroma?3:0);}}
      // Group domains use a real region id of that group so downstream ordering sees a valid region.
      const litDom=phase==='light'&&litStoneMask?region.regions.findIndex(r=>/stone/i.test(r.descriptiveFamily??''))+1:0;
      const groupIds=groupMode?[1,2,3,4,5,6].map(g=>coolGroup.findIndex((v,L)=>L>0&&v===g)).filter(L=>L>0).concat(litDom>0?[-litDom]:[]):[];
      const domains=subjects?[0]:groupMode?groupIds:phase==='mid'&&midDomains&&!step.tag?region.regions.map((_,i)=>i+1):styleNames.length>1?styleNames:[0];
      // washJoin (wash-join.mjs): a domain piece under the minimum shape joins the neighbouring domain's passage
      // instead of being dropped as a bare-paper shard.
      const keyOfDomain=d=>d<0?7:groupMode?coolGroup[d]:typeof d==='string'?domains.indexOf(d)+1:d;
      const cellGroup=i=>litDom>0&&litStoneMask?.[i]?7:groupMode?coolGroup[region.labels[i]]:typeof domains[0]==='string'?domains.indexOf(cellStyle(i).name)+1:region.labels[i];
      const joined=washJoin&&!subjects&&domains.length>1?joinDomainFragments(mask,w,h,cellGroup,minShape):null;
      for(const domain of domains){
        const M0=subjects?mask:joined?Uint8Array.from(mask,(v,i)=>v&&joined[i]===keyOfDomain(domain)?1:0):groupMode?Uint8Array.from(mask,(v,i)=>v&&cellGroup(i)===keyOfDomain(domain)?1:0):typeof domain==='string'?Uint8Array.from(mask,(v,i)=>v&&cellStyle(i).name===domain?1:0):domain?Uint8Array.from(mask,(v,i)=>v&&region.labels[i]===domain?1:0):mask;
        const M=edgeWobbleMm>0&&M0.reduce((a,v)=>a+v,0)>n*.004?wobbleMask(M0,w,h,edgeWobbleMm/(sheetWidthMm/w),protectedCells,sheetWidthMm/w):M0;
        // subjects: a passage stays inside its wash group (its shadow group for a glaze)
        const c=subjects?subjectDomain(M,subjects,phase,w,h):components(M,w,h),cells=Array.from({length:c.count+1},()=>[]);
        for(let i=0;i<n;i++)if(c.labels[i])cells[c.labels[i]].push(i);
        const shapes=[];
        for(let id=1;id<=c.count;id++){
          const list=cells[id];if(!list.length)continue;if(n>100&&list.length<(DETAIL?localMinShape(minShape,meanOver(list,DETAIL),detailScale):minShape)&&!(phase==='shadow'&&list.length>=SMALL_MIN&&list.some(i=>accentCells[i]))){omittedDemand+=list.reduce((sum,i)=>sum+G[i],0);continue;}
          const touched=[...new Set(list.map(i=>region.labels[i]))].map(i=>region.regions[i-1]);
          const box={x0:w,y0:h,x1:-1,y1:-1},soft=[],hard=[];let total=0;
          for(const i of list){const x=i%w,y=Math.floor(i/w);box.x0=Math.min(box.x0,x);box.x1=Math.max(box.x1,x);box.y0=Math.min(box.y0,y);box.y1=Math.max(box.y1,y);total+=G[i];
            const out=neighbors(i,w,n).filter(j=>c.labels[j]!==id);if(out.length){const contrast=Math.max(...out.map(j=>Math.abs(value.values[i]-value.values[j])));(contrast<.14&&out.every(j=>colorEdge(i,j)<.45)?soft:hard).push(i);}}
          if(shaped&&phase==='mid'&&2*list.length/Math.max(1,hard.length+soft.length)<(DETAIL?Math.max(1.1,4*(1-detailScale*meanOver(list,DETAIL))):4)){omittedDemand+=total;continue;}
          if(total<=1e-8)continue;const amount=placed?quantileOf(list,G,passCap):total/list.length;if(placed)for(const i of list)placed[i]=amount;const sh=passage(c.labels,id,box,amount,list.length,w);
          sh.mix=Array.from({length:k},(_,j)=>j===pigment?amount:0);sh.graded=G;sh._follow=true;
          const key=`${phase}/b${band}${step.tag}/p${pigment}/r${domain<0?'lit'+(-domain):domain}/s${id}`;
          const cue=touched.map(r=>r.referenceCue).join(' ');
          const family=profile&&touched.map(r=>r.descriptiveFamily).find(id=>id&&resolveStyle(subject,id,styleSelection).name!==profile.name),
            chosen=typeof domain==='string'&&styleByName[domain]&&domain!==profile?.name?styleByName[domain]:family?resolveStyle(subject,family,styleSelection):profile,identity=!chosen||chosen.name==='precise-watercolor';
          // Light washes may use wet-in-wet where the reference plan explicitly requests it.
          const familyMatch=passageFamily(list,w,h,families),wet=phase==='light'&&(familyMatch?normalizePassageMove(familyMatch.baseMove)==='wet on wet':touched.every(r=>normalizePassageMove(r.baseMove)==='wet on wet'));
          const intent={id:key,phase,valueBand:band,valueRange:[lo*value.peak,hi*value.peak],regions:touched.map(r=>r.id),crossesRegions:touched.length>1,referenceCue:cue,
            intendedResult:phase==='shadow'?'Connected target shadow over dry local colors; retain lit planes.':phase==='light'?'Large pale local-color foundation.':'Target middle values within the named region.',
            shaped,subject,move:wet?'wet on wet':'wet on dry',paperBefore:wet?'moist, not glossy':'fully dry; own same-passage wet overlap allowed',baseBefore:'fully dry',
            brush:{kind:shaped?'flat physical brush; one directional gesture per connected plane':'existing physical wash brush',contact:'side/belly; point for narrow shape',width:'target-fitted physical paths'},
            resolution:{question:'wash',minimumWashBodyCells:4,estimatedSupportWidthCells:2*list.length/Math.max(1,hard.length+soft.length),estimateMethod:'twice area over boundary length; not a measured lid or mullion width',mmPerCell:sheetWidthMm/w,detail:'sub-four-cell lines belong to the existing ink layer'},layer:band,break:wet?'reference requests a connected soft first wet passage':null,load:{water:wet?.88:phase==='shadow'?(shadowWater>0?shadowWater:.45):.62,pigment:'fitted target band demand; calibrated delivery',reload:'existing finite instrument route'},
            edges:{hardCells:hard,softCells:soft,policy:'dry placement; clean damp brush only on selected soft boundaries'},
            protectedLights:reserves.map(r=>r.reason).concat('held target paper whites'),failureSigns:'Lost lights, disconnected value shapes, uniform blur, pale unpainted interiors.',stop:'after band'};
          if(chosen){
            intent.styleName=chosen.name;intent.styleReason=chosen.reason;
            intent.regionStyleDecisions=touched.map(r=>{const q=resolveStyle(subject,r.descriptiveFamily,styleSelection);return {region:r.id,family:r.descriptiveFamily,style:q.name,reason:q.reason};});
            if(!identity){
              const technique=profileTechnique(chosen,phase,band);
              Object.assign(intent,technique,{referenceCue:cue+' '+chosen.reason,styleReason:chosen.reason,break:chosen.name==='atmospheric-wet'?'Reference soft gradients require dark charge in an open wet passage.':null});
              intent.load={...intent.load,water:technique.water};
              intent.brush={...intent.brush,kind:chosen.brushes.join(', ')};
              intent.edges.policy=chosen.edge;
              intent.resolution.minimumWashBodyCells=chosen.detailThresholdCells;
            }
          }
          if(brushChoice&&identity){intent.brush=choosePassageBrush(sh.mask,w,h,{mmPerCell:sheetWidthMm/w,referenceCue:intent.referenceCue,phase});sh.mask.passageBrush=intent.brush;intent.resolution.brushRadiusCells=intent.brush.sizeMm/(2*sheetWidthMm/w);intent.resolution.supportToBrushRadiusRatio=intent.resolution.estimatedSupportWidthCells/intent.resolution.brushRadiusCells;}
          // strokePlan: the passage is laid as lanes of strokes, each charged by the plan under its own footprint
          // (stroke-plan.mjs). Large cool skies and stone hints keep their own marks. Only passages at
          // least one lane wide and three minimum shapes big are laned, so windows, recesses, mullions and figures keep
          // one fitted gesture and an exact edge.
          const supportMm=2*list.length/Math.max(1,hard.length+soft.length)*(sheetWidthMm/w),laneHere=laneMax>0?Math.min(laneMax,Math.max(laneMm,supportMm*.5)):Math.min(laneMm,Math.max(2,supportMm*.9));
          if(strokePlan&&shaped&&!step.pig&&supportMm>=(laneAdapt?2:laneMm)&&list.length>=minShape*(laneAdapt?2:3)&&!(rgb&&list.length>n*.015&&list.filter(i=>rgb[i*3+2]>rgb[i*3]+10).length>list.length*.6)){
            const sp=planLanes(list,w,h,G,amount,{cellMm:sheetWidthMm/w,laneMm:laneAdapt?laneHere:laneMm,strokeMm,reachMm:washReachMm,seed:(id*7919+band*131+pigment*17+1)>>>0});
            if(sp){sh._strokePlan=sp;intent.strokes={count:sp.paths.length,laneMm:laneAdapt?+laneHere.toFixed(2):laneMm,strokeMm,reachMm:washReachMm,factorRange:[+Math.min(...sp.factors).toFixed(2),+Math.max(...sp.factors).toFixed(2)]};}}
          if(familyMatch||wet){
            const decision=passageMaterial({phase,family:familyMatch,fallbackMove:wet?'wet on wet':'wet on dry'});
            intent.passageMaterial=decision;intent.move=decision.move;intent.load.water=decision.water;if(decision.move==='wet on wet'){intent.wetMix=.85;intent.bridge=.98;intent.bridgeSoft=3;}intent.paperBefore=decision.move==='wet on wet'?'moist across contact and neighbors; clean preparation if needed':'fully dry underlayer; own connected wet overlap allowed';
            if(familyMatch)intent.referenceCue=familyMatch.referenceCue??intent.referenceCue;
          }
          sh._valuePlan=intent;sh.firstWash=phase==='light';sh._opening=1;shapes.push(sh);instructions.push({...intent,area:list.length,plannedPigmentMass:total});
        }
        if(shapes.length)layers.push({value:band,pigment,shapes,mix:Array.from({length:k},(_,j)=>j===pigment?1:0),amount:shapes.reduce((s,q)=>s+q.amount*q.area,0)/shapes.reduce((s,q)=>s+q.area,0),area:shapes.reduce((s,q)=>s+q.area,0),_order:{phase:phase==='light'?'ground':phase==='shadow'?'dark':'mid',region:typeof domain==='string'?(regionProfiles.findIndex(p=>p.name===domain)+1||0):Math.abs(domain),shoot:true},_valuePhase:phase});
      }
      if(placed){for(let i=0;i<n;i++)carry[pigment][i]+=G[i]-placed[i];if(carryMm>0){const r=Math.max(1,Math.round(carryMm/(sheetWidthMm/w))),c=boxMeanValue(carry[pigment],w,h,r);for(let i=0;i<n;i++)carry[pigment][i]=protectedCells[i]?0:c[i];}}
    }
  }
  const lightComponents=components(protectedCells,w,h),lightShapes=Array.from({length:lightComponents.count},(_,j)=>({id:j+1,category:'bare paper',reason:'simplified connected target light plane, sheen or glint',toneAt:'retain paper; pale painted planes outside this mask receive band 1',cells:0}));for(const id of lightComponents.labels)if(id)lightShapes[id-1].cells++;
  return {paper,style:profile,layers,instructions,protectedCells,value,regions:region,omittedDemand,lightShapes,geometry:'Target-derived color/value regions, never crop rectangles; continuous pale bases and dry middle planes; two final glazes share simplified connected shadow support across region boundaries.'};
}
export function valueTechnique(intent) {
  if(intent.style){const wetMove=['wet on wet','dry on wet'].includes(intent.move);return {name:wetMove?intent.move:intent.phase==='shadow'?'glazed':'wet on dry',water:intent.load.water,wetMix:intent.wetMix,bridge:intent.bridge,bridgeSoft:intent.bridgeSoft,intoWet:wetMove,dryAfter:!wetMove,passes:1,valuePlan:intent};}
  const wet=intent.move==='wet on wet';return {name:wet?'wet on wet':intent.phase==='shadow'?'glazed':'wet on dry',water:intent.load.water,wetMix:wet?.85:.3,bridge:wet?.98:.82,bridgeSoft:wet?3:2.4,intoWet:wet,dryAfter:!wet,passes:1,valuePlan:intent};
}
export function selectValueInk(paths,{first,w,h,density,reserves=null,subject=null,shaped=false,styleSelection=null,sourceInk=false}){
  const profile=styleSelection?resolveStyle(subject,null,styleSelection):null;
  // Pen contours naturally border paper lights. A wash reserve is not a reason
  // to delete the entire source line, and short marks carry faces and capitals.
  if(sourceInk)return paths.filter(g=>g.points?.length>=2);
  if(profile&&profile.name!=='precise-watercolor'&&(first?profile.ink+profile.graphite:profile.ink)===0)return [];
  return paths.filter(g=>{const pts=g.points;if(!pts?.length)return false;let length=0,contrast=0,count=0,protectedCount=0;for(let j=0;j<pts.length;j++){const p=pts[j],x=Math.max(0,Math.min(w-1,Math.round(p.x))),y=Math.max(0,Math.min(h-1,Math.round(p.y))),i=y*w+x;if(j)length+=Math.hypot(p.x-pts[j-1].x,p.y-pts[j-1].y);if(reserves?.[i])protectedCount++;for(const q of neighbors(i,w,w*h))contrast+=Math.abs(density[i]-density[q]);count+=neighbors(i,w,w*h).length;}return !protectedCount&&(first?(g.outline||g.tier==='outline'||length/w>=.035):contrast/Math.max(1,count)>=.06);});
}

// Connected soft edge chains only; hard boundaries remain dry placement.
export function softBoundaryPaths(cells,w,n){
 const remaining=new Set(cells),paths=[];
 while(remaining.size){let i=remaining.values().next().value;const chain=[];while(remaining.has(i)){remaining.delete(i);chain.push({x:i%w+.5,y:Math.floor(i/w)+.5});const x=i%w,y=Math.floor(i/w),adj=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if((dx||dy)&&xx>=0&&xx<w&&yy>=0&&j<n&&remaining.has(j))adj.push(j);}if(!adj.length)break;i=adj[0];}if(chain.length>=3)paths.push(chain);}
 return paths;
}

function boxMeanValue(src,w,h,r){const n=w*h,row=new Float32Array(n),out=new Float32Array(n);
  for(let y=0;y<h;y++){let s=0,c=0;for(let x=-r;x<w+r;x++){const a=x+r,b=x-r-1;if(a>=0&&a<w){s+=src[y*w+a];c++;}if(b>=0&&b<w){s-=src[y*w+b];c--;}if(x>=0&&x<w)row[y*w+x]=s/c;}}
  for(let x=0;x<w;x++){let s=0,c=0;for(let y=-r;y<h+r;y++){const a=y+r,b=y-r-1;if(a>=0&&a<h){s+=row[a*w+x];c++;}if(b>=0&&b<h){s-=row[b*w+x];c--;}if(y>=0&&y<h)out[y*w+x]=s/c;}}
  return out;}

function lstarOf(rgb,i){const f=c=>{c/=255;return c>.04045?((c+.055)/1.055)**2.4:c/12.92;};const Y=.2126*f(rgb[i*3])+.7152*f(rgb[i*3+1])+.0722*f(rgb[i*3+2]);return Y>.008856?116*Math.cbrt(Y)-16:903.3*Y;}

// Dark architectural recess: near-black openings, or cool blue-dark window glass. Painted last
// on the dried wall with its own fitted mixture, never averaged into the wall washes.
let RECESS_DARK=RECESS.dark,RECESS_BLUE=RECESS.blue;
function setRecessMax(v){RECESS_DARK=v>0?v*RECESS.dark/RECESS.blue:RECESS.dark;RECESS_BLUE=v>0?v:RECESS.blue;}
function isRecess(rgb,i){const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],m=Math.max(r,g,b);return m<RECESS_DARK||(b>r+RECESS.blueOverRed&&m<RECESS_BLUE);}

// The target's paper: the largest connected region among the brightest 4% of cells (luminance), its mean
// colour and mean density. Returns null when that region is under 1% of the sheet (no visible paper).
export function estimatePaper(rgb,w,h,density){
  const n=w*h,lum=Float32Array.from({length:n},(_,i)=>.2126*rgb[3*i]+.7152*rgb[3*i+1]+.0722*rgb[3*i+2]);
  const sorted=Float32Array.from(lum).sort(),cut=sorted[Math.floor(n*.96)]-6;
  const m=Uint8Array.from(lum,v=>v>=cut?1:0),c=components(m,w,h),size=new Uint32Array(c.count+1);
  for(let i=0;i<n;i++)if(c.labels[i])size[c.labels[i]]++;
  let best=0;for(let k=1;k<=c.count;k++)if(size[k]>size[best])best=k;
  if(!best||size[best]<n*.01)return null;
  const sum=[0,0,0];let ds=0;for(let i=0;i<n;i++)if(c.labels[i]===best){for(let q=0;q<3;q++)sum[q]+=rgb[3*i+q];ds+=density[i];}
  let edge=false;for(let i=0;i<n&&!edge;i++)if(c.labels[i]===best){const x=i%w,y=(i/w)|0;if(x===0||y===0||x===w-1||y===h-1)edge=true;}
  return {rgb:sum.map(v=>v/size[best]),density:ds/size[best],cells:size[best],touchesBorder:edge};
}

// Sparse stone block hints (see stoneBlocks). Returns Int8Array of pigment index per cell (-1 = none) or null.
function makeStoneBlocks({rgb,w,h,protectedCells,sheetWidthMm,cover,mm,pigments,irregular=false,courses=false,clusters=0}){
  const cell=sheetWidthMm/w;let hb=Math.max(6,Math.round(mm/cell));const _u=0,gap=Math.max(1,Math.round(.3/cell)),jit=Math.max(1,Math.round(.35/cell));
  const warmFallback=pigments.findIndex(p=>/ochre|sienna/i.test(p?.name??''));
  const idx=STONE_BLOCK_PIGMENTS.map(nm=>{const j=pigments.findIndex(p=>p?.name===nm);return j>=0?j:warmFallback;}),probs=STONE_BLOCK_SHARES;
  if(warmFallback<0||idx.every(j=>j<0))return null;
  let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
  const wall=i=>{const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],L=.2126*r+.7152*g+.0722*b;return !protectedCells[i]&&!isRecess(rgb,i)&&r-b>STONE_WALL.redOverBlue&&g-b>STONE_WALL.greenOverBlue&&L>STONE_WALL.minL&&L<STONE_WALL.maxL;};
  const out=new Int8Array(w*h).fill(-1);let kept=0;
  // clusters K: a painter hints a few stones in loose groups that fade out, not an even grid across the wall. K group
  // centres on wall cells, radius ~9 block heights; keep chance falls off with distance; block heights and vertical
  // offsets vary per block so courses do not line up.
  let near=null;if(clusters>0){const wl=[];for(let i=0;i<w*h;i+=7)if(wall(i))wl.push(i);const C=[];for(let q=0;q<clusters&&wl.length;q++)C.push(wl[Math.floor(rnd()*wl.length)]);const R=hb*9;
    near=(x,y)=>{let best=0;for(const c of C){const dx=x-c%w,dy=y-((c/w)|0);best=Math.max(best,Math.exp(-(dx*dx+dy*dy)/(R*R)));}return best;};}
  for(let y0=0,hb0=hb;y0<h;y0+=hb){if(courses)hb=Math.max(6,Math.round(hb0*(.7+rnd()*.7)));let x0=-Math.floor(rnd()*hb*2);
    while(x0<w){const bw=Math.round(hb*(courses?1.1+rnd()*2.2:1.6+rnd()*1.2));if(courses&&rnd()<.25){x0+=bw;continue;}
      if(rnd()<(near?Math.min(1,cover*2.2*near(x0+bw/2,y0+hb/2)):cover)){
        // irregular stones: each corner moves independently (quad, not a rectangle) when irregular is set
        const J=()=>Math.round((rnd()-.5)*2*jit*(irregular?2.2:1));const dy=near?Math.round((rnd()-.5)*hb*.5):0,sh=near?Math.round(hb*(.25*rnd())):0;const xa=x0+gap,xb=x0+bw-gap,ya=y0+gap+dy+sh,yb=y0+hb-gap+dy;
        const Q=irregular?[[xa+J(),ya+J()],[xb+J(),ya+J()],[xb+J(),yb+J()],[xa+J(),yb+J()]]:(()=>{const e=[J(),J(),J(),J()];return [[xa+e[0],ya+e[2]],[xb+e[1],ya+e[2]],[xb+e[1],yb+e[3]],[xa+e[0],yb+e[3]]];})();
        const inside=(x,y)=>{let sg=0;for(let q=0;q<4;q++){const [x1,y1]=Q[q],[x2,y2]=Q[(q+1)%4],c=(x2-x1)*(y-y1)-(y2-y1)*(x-x1);if(c<0)return false;}return true;};
        const bx0=Math.min(...Q.map(p=>p[0])),bx1=Math.max(...Q.map(p=>p[0])),by0=Math.min(...Q.map(p=>p[1])),by1=Math.max(...Q.map(p=>p[1]));
        const cells=[];let tot=0;for(let y=Math.max(0,by0);y<Math.min(h,by1);y++)for(let x=Math.max(0,bx0);x<Math.min(w,bx1);x++){if(!inside(x+.5,y+.5))continue;tot++;const i=y*w+x;if(wall(i))cells.push(i);}
        if(tot&&cells.length>=.75*tot){let u=rnd(),c=0;while(c<2&&(u-=probs[c])>0)c++;let pj=idx[c];if(pj<0)pj=idx.find(j=>j>=0);for(const i of cells)out[i]=pj;kept++;}}
      x0+=bw;}}
  console.log(`stone blocks: ${kept} kept, ${hb} cells tall`);
  return kept?out:null;
}

// edgeWobbleMm: a wash never ends on a ruled line. Only passages over 0.4% of the sheet move, so small figures keep
// their shape. Every mask is resampled through one smooth displacement field (sines of 2.5 to 12 mm wavelength,
// amplitude edgeWobbleMm), so neighbouring passages still meet; reserved lights stay out. No target pixels are read.
const WOB=new Map();
function wobbleField(w,h,amp,cellMm){const key=w+'x'+h+'x'+amp.toFixed(3);if(WOB.has(key))return WOB.get(key);let s=0x9e3779b9;const rnd=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const waves=[];for(const [lambda,a] of [[12,.55],[6,.3],[2.5,.15]])for(let k=0;k<2;k++){const th=rnd()*Math.PI*2;waves.push({kx:Math.cos(th)*2*Math.PI*cellMm/lambda,ky:Math.sin(th)*2*Math.PI*cellMm/lambda,p:rnd()*Math.PI*2,q:rnd()*Math.PI*2,a});}
 const u=new Float32Array(w*h),v=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=0,b=0;for(const c of waves){const ph=c.kx*x+c.ky*y;a+=c.a*Math.sin(ph+c.p);b+=c.a*Math.sin(ph*1.13+c.q);}u[y*w+x]=a*amp/1.4;v[y*w+x]=b*amp/1.4;}
 const f={u,v};WOB.set(key,f);return f;}
function wobbleMask(M,w,h,amp,protect,cellMm){const {u,v}=wobbleField(w,h,amp,cellMm),out=new Uint8Array(M.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(protect&&protect[i])continue;const sx=Math.round(x+u[i]),sy=Math.round(y+v[i]);if(sx>=0&&sy>=0&&sx<w&&sy<h)out[i]=M[sy*w+sx];}return out;}

// Per layer and cell, the share of the cell's middle demand that layer carries under layerIncrement: the cell's smoothed
// value s split at the thresholds of the layers that cover it, each layer taking the step up to the next one's threshold
// and the last taking the rest. Shares of a cell sum to 1.
export function layerShares(cover,thresholds,sm,n){
  const L=cover.length,share=Array.from({length:L},()=>new Float32Array(n));
  for(let i=0;i<n;i++){
    const on=[];for(let j=0;j<L;j++)if(cover[j][i])on.push(j);
    if(!on.length)continue;
    const s=Math.max(sm[i],1e-6);let total=0;
    for(let k=0;k<on.length;k++){const j=on[k],lo=k?thresholds[j]:0,hi=k<on.length-1?thresholds[on[k+1]]:Infinity;const v=Math.max(0,Math.min(s,hi)-lo);share[j][i]=v;total+=v;}
    if(total>0)for(const j of on)share[j][i]/=total;else share[on[0]][i]=1;
  }
  return share;
}
