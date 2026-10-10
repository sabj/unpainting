// Whether a stroke uses demand-window transport. mode: '0' off, '1' forced on, 'fast' any periodic brush,
// 'auto' (default) only large periodic brush strokes with plan overflow and a flow cadence in the validated range (steps).
const NATIVE_DEMAND_MIN_CELLS=241607;
const NATIVE_DEMAND_MIN_CADENCE=76;
const NATIVE_DEMAND_MAX_CADENCE=296;
export function demandPolicy({mode,tracked=false,instrument,periodic=false,planOverflow=false,flowEvery=0,rect=[]}={}){
 if(mode==='0')return false;
 if(!tracked)return false;
 if(mode==='fast')return instrument==='brush'&&periodic===true&&rect.length===4&&rect.every(Number.isInteger)&&rect[2]>0&&rect[3]>0;
 if(mode==='1')return true; // explicit override for fixtures
 if(mode!==undefined&&mode!==''&&mode!=='auto')return false;
 return instrument==='brush'&&planOverflow===true&&periodic===true&&Number.isInteger(flowEvery)&&flowEvery>=NATIVE_DEMAND_MIN_CADENCE&&flowEvery<=NATIVE_DEMAND_MAX_CADENCE&&rect.length===4&&
 rect.every(Number.isInteger)&&rect[2]>0&&rect[3]>0&&rect[2]*rect[3]>=NATIVE_DEMAND_MIN_CELLS;
}
