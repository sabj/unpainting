// Registered skin and fur regions (--modanatomy) that set each cell's material for the modulation sampler; not a clip.
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function modulationSkinPixel(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx-mn<1e-3)return false;const sat=(mx-mn)/(1-Math.abs(2*l-1)),hue=mx===r?(60*((g-b)/(mx-mn))+360)%360:mx===g?60*((b-r)/(mx-mn))+120:60*((r-g)/(mx-mn))+240;return hue<45&&sat>.12&&sat<.55&&l>.35&&r>g&&g>b;}
export function registeredHumanSkin(doc,{sha256,width,height,w,h,px}){
 if(doc.version!==1||doc.coordinateSpace!=='normalized-target'||doc.target?.sha256!==sha256||doc.target.width!==width||doc.target.height!==height||!Array.isArray(doc.humanSkinRegions)||!doc.humanSkinRegions.length)throw Error('modulation anatomy target/registration mismatch');
 for(const r of doc.humanSkinRegions)if(!r.id||!r.referenceCue||!Array.isArray(r.polygon)||r.polygon.length<3||r.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('invalid human skin anatomy');
 return Uint8Array.from({length:w*h},(_,i)=>doc.humanSkinRegions.some(r=>inside((i%w+.5)/w,(Math.floor(i/w)+.5)/h,r.polygon))&&modulationSkinPixel(px[3*i]/255,px[3*i+1]/255,px[3*i+2]/255)?1:0);
}
export function returnExcludedSkinToWash({Aw,Ad,K,skin,lights}){let transferred=0,cells=0;for(let i=0;i<skin.length;i++)if(skin[i]&&!lights?.[i]){let local=0;for(let j=0;j<K;j++){const q=i*K+j,a=Ad[q];Aw[q]+=a;Ad[q]=0;local+=a;}transferred+=local;if(local>0)cells++;}return {transferred,cells,role:'existing excluded human-skin deferred demand returned once to existing fitted wash; no added pigment'};}
// Higher-priority regions win before value slicing; cat regions receive the film lights.
export function registeredFurPlan(doc,w,h){
 if(!doc.materialRegions)return null;
 const regions=doc.materialRegions;if(!regions.length||regions.some(r=>!r.id||!Number.isFinite(r.priority)||!['fur','body'].includes(r.material)||!['point','side','belly','none'].includes(r.contact)||!Array.isArray(r.polygon)||r.polygon.length<3||r.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))||(r.material==='fur'&&(!Array.isArray(r.flow)||r.flow.length<2||r.flow.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))))))throw Error('invalid registered fur material regions');
 const cores=doc.essentialLights??[];if(cores.some(r=>!r.id||!['physical-film','negativepaint'].includes(r.operation)||!Array.isArray(r.polygon)||r.polygon.length<3||r.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))))throw Error('invalid registered essential light roles');
 const owner=new Int16Array(w*h).fill(-1),cat=new Uint8Array(w*h),fur=new Uint8Array(w*h),film=new Uint8Array(w*h),negative=new Uint8Array(w*h),dx=new Float32Array(w*h),dy=new Float32Array(w*h);
 for(let i=0;i<owner.length;i++){const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;let best=-Infinity;for(let j=0;j<regions.length;j++){const r=regions[j];if(r.priority>best&&inside(x,y,r.polygon)){owner[i]=j;best=r.priority;}}
 const r=regions[owner[i]];if(!r)continue;cat[i]=r.id.startsWith('subject-c.production.cat-')||r.id.startsWith('subject-c.cat.')?1:0;fur[i]=r.material==='fur'?1:0;
 if(fur[i]){let nearest=Infinity;for(let k=1;k<r.flow.length;k++){const a=r.flow[k-1],b=r.flow[k],vx=(b[0]-a[0])*w,vy=(b[1]-a[1])*h,px=(x-a[0])*w,py=(y-a[1])*h,n=vx*vx+vy*vy,t=n?Math.max(0,Math.min(1,(px*vx+py*vy)/n)):0,d=(px-t*vx)**2+(py-t*vy)**2;if(d<nearest){nearest=d;const len=Math.hypot(vx,vy)||1;dx[i]=vx/len;dy[i]=vy/len;}}}
 if(cat[i])for(const c of cores)if(inside(x,y,c.polygon))(c.operation==='physical-film'?film:negative)[i]=1;
 }
 return {owner,cat,fur,film,negative,dx,dy,regions,cores};
}
