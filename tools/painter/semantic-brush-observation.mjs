// Actual per-tip inventory observation only; never a material gate or reservoir-ratio proxy.
export function semanticBrushObservation(b){
 const tips=(b.hairs??[]).map(h=>({capacity:b.capacity*h.len,water:h.water})),values=tips.filter(t=>Number.isFinite(t.capacity)&&t.capacity>0&&Number.isFinite(t.water)).map(t=>t.water/t.capacity);
 return {model:b.model??'row',bridge:b.bridge,depositDepth:b.depositDepth??0,radiusCells:b.radius,freeThreshold:b.free,tipCount:tips.length,observedTipCount:values.length,invalidTipCount:tips.length-values.length,tipSaturationMin:values.length?Math.min(...values):null,tipSaturationMax:values.length?Math.max(...values):null,tipSaturationMean:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,freeLiquidTipCount:values.filter(v=>v>b.free).length};
}
