import {renderCells} from '../../src/media/km.mjs';

export function createOpticalUnder(readSheet,pigments,n) {
 let memo=null;
 return (base,micro=null)=>{
  const sheet=readSheet(),link=sheet._gpu;
  if(!memo?.hasLower0||memo.layer0!==sheet.layers[0])link.flushDrys(sheet);
  const hasLower0=sheet.layers.length>1,layer0=hasLower0?sheet.layers[0]:null,layer0Ver=layer0?._cacheVersion??0;
  if(memo?.base===base&&memo.micro===micro&&memo.hasLower0===hasLower0&&memo.layer0===layer0&&memo.layer0Ver===layer0Ver)return memo.under;
  if(hasLower0)link.syncLower(sheet,1);
  const under=new Float64Array(n*3);
  if(hasLower0)renderCells([layer0],pigments.map(p=>p.K),pigments.map(p=>p.S),base,0,n,1,null,null,null,under,micro);
  else for(let i=0;i<under.length;i++)under[i]=base[i]/255;
  under._immutable=true;memo={base,micro,hasLower0,layer0,layer0Ver:layer0?._cacheVersion??0,under};return under;
 };
}
