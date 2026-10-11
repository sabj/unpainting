// The painter's physical paper and optical base, shared by Node and browser.
import {makePaper} from '../media/paper.js';
import {createSheet,layersOf,step,dry,DEFAULTS} from '../media/sheet.js';
import {renderLayers} from '../media/km.js';
export function tapeSheet(tape) {
 const paper=makePaper(tape.w,tape.h,tape.paper),sheet=createSheet(paper,tape.pigments);
 return sheet;
}
export function tapeBase(tape,paper) {
 const base=new Uint8Array(paper.w*paper.h*3),rgb=tape.paperRGB??[255,253,248],shade=tape.paperShade??.04;
 for(let i=0;i<paper.w*paper.h;i++)for(let c=0;c<3;c++)base[i*3+c]=Math.min(255,rgb[c]*(1-shade+shade*paper.height[i]));
 return base;
}
export function tapePixels(tape,sheet) {return renderLayers(layersOf(sheet),tape.pigments,tapeBase(tape,sheet.paper),sheet.n,1);}
// Older fixed layers cannot rewet. Accumulate them once, in double precision;
// keep the mutable top separate. A film lift invalidates this via _layerVer.
// Only Live opts in: ordinary painter sheets retain their existing arithmetic.
function prepareBed(tape,sheet){
 if(!(tape.opts?.fixedBed>0))return;
 const {layers,n}=sheet,version=sheet._layerVer||0;
 let bed=sheet._liveFixedBed;
 if(!bed||bed.layers!==layers||bed.version!==version||bed.count>layers.length)
  bed=sheet._liveFixedBed={layers,version,count:0,added:0,lower:new Float64Array(n)};
 for(;bed.added<layers.length-1;bed.added++)for(const plane of layers[bed.added])for(let i=0;i<n;i++)bed.lower[i]+=plane[i];
 bed.count=layers.length;
}
export function tapeStep(tape,sheet){prepareBed(tape,sheet);return step(sheet,{...DEFAULTS,...tape.opts});}
const opticalBases=new WeakMap();
export function tapeRenderBase(sheet,base,glaze){
 const layers=sheet.layers,version=sheet._layerVer||0;
 let memo=opticalBases.get(sheet);
 if(!memo||memo.base!==base||memo.layers!==layers||memo.first!==layers[0]||memo.version!==version||memo.K!==sheet.K||memo.added>layers.length-1){
  memo={base,layers,first:layers[0],version,K:sheet.K,added:0,rgb:Float32Array.from(base)};opticalBases.set(sheet,memo);
 }
 for(;memo.added<layers.length-1;memo.added++)glaze(memo.rgb,layers[memo.added]);
 return memo.rgb;
}
export function tapeFlow(tape,sheet,isDry,m) {
 prepareBed(tape,sheet);
 const opts={...DEFAULTS,...tape.opts};
 if(isDry)return dry(sheet,m?.m??40000,opts,{level:m?.l??60,levelMax:m?.lm??4000,levelTol:m?.lt??.02,dt:m?.dt??2,analyticTail:!!m?.at});
 return step(sheet,opts);
}
