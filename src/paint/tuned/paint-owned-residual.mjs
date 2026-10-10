// Moves detail-plan residual into the wash plan inside authored support polygons (doc.supports, 0..1 coordinates).
// Reallocates fitted residual only; never paper film or delivered pigment.
export function legacySkinCell(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx-mn<1e-3)return false;const sat=(mx-mn)/(1-Math.abs(2*l-1)),hue=mx===r?(60*((g-b)/(mx-mn))+360)%360:mx===g?60*((b-r)/(mx-mn))+120:60*((r-g)/(mx-mn))+240;return hue<45&&sat>.12&&sat<.55&&l>.35&&r>g&&g>b;}
const inside=(p,x,y)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
export function transferPaintOwnedResidual({Aw,Ad,K,w,h,eligible,lights,doc}){
 const n=w*h;if(!Number.isInteger(K)||K<1||!Number.isInteger(w)||w<1||!Number.isInteger(h)||h<1||Aw.length!==n*K||Ad.length!==n*K||eligible.length!==n||lights.length!==n)throw Error('paint-owned residual dimensions invalid');
 if(doc?.version!==1||!['transfer-excluded-detail-residual-to-wash','transfer-authored-plane-detail-residual-to-wash'].includes(doc.operation)||!Array.isArray(doc.supports)||!doc.supports.length)throw Error('paint-owned residual explicit operation/supports required');
 if(doc.operation==='transfer-authored-plane-detail-residual-to-wash'&&doc.techniqueIntent!=='connected-painted-plane-wash')throw Error('paint-owned authored plane wash intent required');
 const ids=new Set();for(const s of doc.supports){if(typeof s.id!=='string'||!s.id.trim()||ids.has(s.id)||typeof s.reason!=='string'||!s.reason.trim()||!Array.isArray(s.polygon)||s.polygon.length<3||s.polygon.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('paint-owned support invalid');ids.add(s.id);let area=0;for(let i=0;i<s.polygon.length;i++){const a=s.polygon[i],b=s.polygon[(i+1)%s.polygon.length];area+=a[0]*b[1]-b[0]*a[1];}if(Math.abs(area)<1e-12)throw Error('paint-owned support empty');}
 for(let i=0;i<n*K;i++)if(!Number.isFinite(Aw[i])||!Number.isFinite(Ad[i])||Aw[i]<0||Ad[i]<0||!Number.isFinite(Aw[i]+Ad[i]))throw Error('paint-owned fitted residual invalid');
 const selected=new Uint8Array(n),massByPigment=new Array(K).fill(0);let cells=0;for(let i=0;i<n;i++){if(!eligible[i]||lights[i])continue;const x=(i%w+.5)/w,y=((i/w|0)+.5)/h;if(!doc.supports.some(s=>inside(s.polygon,x,y)))continue;let mass=0;for(let j=0;j<K;j++)mass+=Ad[i*K+j];if(!(mass>0))continue;selected[i]=1;cells++;for(let j=0;j<K;j++){const q=i*K+j;massByPigment[j]+=Ad[q];Aw[q]+=Ad[q];Ad[q]=0;}}
 return {selected,cells,massByPigment,kind:'fitted residual allocation; not observed pigment delivery',supportIds:[...ids]};
}
// Load factor for a single-pan stroke: 1 + selected residual / base demand. Paths, pressure and reload points are
// unchanged; the factor is an assumed concentration, not measured delivery.
export function paintOwnedLoadFactor({cells,mix,K,geometryAw,residual,selected}){
 const channels=mix.map((v,j)=>v>0?j:-1).filter(j=>j>=0);if(channels.length!==1)throw Error('paint-owned residual load requires original single-pan recipe; mixed-puddle mapping unsupported');
 const j=channels[0];let base=0,extra=0,supportCells=0;for(const i of new Set(cells)){if(!Number.isInteger(i)||i<0||i>=selected.length)throw Error('paint-owned load cell invalid');base+=geometryAw[i*K+j];if(selected[i]){extra+=residual[i*K+j];supportCells++;}}
 if(!Number.isFinite(base)||!Number.isFinite(extra)||base<0||extra<0)throw Error('paint-owned load funding invalid');
 return {factor:base>0?1+extra/base:1,component:j,baseFittedDemand:base,selectedResidualDemand:extra,supportCells,allocationStatus:base>0?'existing supported concentration hypothesis; no delivered credit':'unfunded residual retained as debt'};
}
