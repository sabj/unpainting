import {edgeHalfWidth} from '../../media/brush.mjs';
export function scriptStrokePaths(strokes, {scale:SC,cellsPerMm:CELLS_PER_MM,splay:WASH_FLAT_SPLAY}) {
 const brushFor=half=>{let r=half+1;for(let it=0;it<6;it++)r+=half-edgeHalfWidth(r,{pressure:1,splay:WASH_FLAT_SPLAY});return Math.max(SC,r);};
 return strokes.map(st => { const round = st.kind !== 'lane' && !st.flat, r = round || st.flat ? Math.max(SC, st.radiusMm * CELLS_PER_MM) : brushFor(st.radiusMm * CELLS_PER_MM); const path = st.points.map(q => ({ x: q[0] * CELLS_PER_MM, y: q[1] * CELLS_PER_MM, r: q[4] != null ? Math.max(0.5, r * q[4]) : r, p: q[2] ?? 1, round, ...(q[3] > 0 ? { v: q[3] } : {}), ...(st.angle != null ? { blade: st.held === 'fixed' ? st.angle - 90 : st.angle } : {}) })); return path; });
}
