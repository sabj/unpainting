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
export function tapeFlow(tape,sheet,isDry,m) {
 const opts={...DEFAULTS,...tape.opts};
 if(isDry)return dry(sheet,m?.m??40000,opts,{level:m?.l??60,levelMax:m?.lm??4000,levelTol:m?.lt??.02,dt:m?.dt??2,analyticTail:!!m?.at});
 return step(sheet,opts);
}
