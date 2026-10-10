// Read-only physical measurements. Declared bounds are conservative instrument
// support, NOT actual contact admission. Supplied neighbors remain separate.
function paperReading(sheet, cells) {
  let waterMin=Infinity,waterMax=0,poreMin=Infinity,poreMax=0,pigmentMass=0,layerPigmentMass=0,count=0;
  for(const i of cells){if(!Number.isSafeInteger(i)||i<0||i>=sheet.w*sheet.h)throw Error('Invalid contact audit cell');const water=sheet.W[i],pore=sheet.s[i]/sheet.paper.capacity[i];if(!Number.isFinite(water)||!Number.isFinite(pore))throw Error('Nonfinite actual contact state');waterMin=Math.min(waterMin,water);waterMax=Math.max(waterMax,water);poreMin=Math.min(poreMin,pore);poreMax=Math.max(poreMax,pore);for(let k=0;k<sheet.K;k++)pigmentMass+=sheet.G[k][i]+sheet.P[k][i]+sheet.D[k][i];for(const layer of sheet.layers)for(let k=0;k<sheet.K;k++)layerPigmentMass+=layer[k][i];count++;}
  return{cells:count,waterMin:count?waterMin:null,waterMax:count?waterMax:null,saturationMin:count?poreMin:null,saturationMax:count?poreMax:null,pigmentMass,layerPigmentMass};
}
export function contactAudit(sheet, brush, rect, neighborCells=[]) {
  const [x,y,w,h]=rect;if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>sheet.w||y+h>sheet.h)throw Error('Invalid contact audit region');
  const cells=[];for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)cells.push(yy*sheet.w+xx);const region=new Set(cells),neighbors=[...new Set(neighborCells)].filter(i=>!region.has(i));
  const hairPigment=brush?Array.from({length:sheet.K},(_,k)=>brush.hairs.reduce((s,h)=>s+h.pig[k],0)):null;
  const load=brush?{reservoirWater:brush.resW,hairWater:brush.hairs.reduce((s,h)=>s+h.water,0),reservoirPigment:brush.resP.slice(),hairPigment,pigmentMass:brush.resP.reduce((s,v)=>s+v,0)+hairPigment.reduce((s,v)=>s+v,0),carry:brush.carry,travel:brush.travel}:null;
  return{kind:'conservative support region and separate neighbors; not actual contact admission',rect,cells:cells.length,paper:paperReading(sheet,cells),neighbors:paperReading(sheet,neighbors),brush:load};
}
