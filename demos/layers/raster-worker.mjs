// Saved sheet deltas, prepared off the UI thread. Each bank contains every
// timeline position for one subject/stage selection; gestures only copy bitmaps.
let W,H,N,frames,labels,stages,subjectCount,loading,serial=0;
const yieldTask=()=>new Promise(r=>setTimeout(r,0));
async function image(src){return createImageBitmap(await (await fetch(src)).blob());}
function pixels(img,gray=false){const c=new OffscreenCanvas(W,H),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,W,H);const d=g.getImageData(0,0,W,H).data;img.close();return gray?Uint8Array.from({length:N},(_,i)=>d[i*4]):d;}
function apply(C,j,selected){const A=frames[j-1],B=frames[j];for(let p=0,q=0;p<N;p++,q+=4){if(!selected.has(labels[p]))continue;for(let c=0;c<3;c++){const a=A[q+c],b=B[q+c];if(a!==b)C[q+c]=Math.max(0,Math.min(255,C[q+c]*Math.min(1.6,(b+1)/(a+1))));}}}
function bitmap(C,{layer=false,ink=false,gain=1,outline=false,colors=[]}={}){const c=new OffscreenCanvas(W,H),g=c.getContext('2d'),im=g.createImageData(W,H),d=im.data;
 for(let p=0,q=0;p<N;p++,q+=4){if(layer){let a=(255-Math.min(C[q],C[q+1],C[q+2]))/255;if(ink)a=Math.min(1,a*gain);if(a<.02)continue;const k=1/Math.max(a,.001);for(let ch=0;ch<3;ch++)d[q+ch]=Math.max(0,Math.min(255,255-(255-C[q+ch])*k));d[q+3]=Math.round(Math.min(1,a*1.15)*255);}else{d[q]=C[q];d[q+1]=C[q+1];d[q+2]=C[q+2];d[q+3]=255;}}
 if(outline)for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x,v=labels[p];if(v&&(labels[p+1]!==v||labels[p+W]!==v)){const col=colors[v]??'#999999';const rgb=col.match(/\w\w/g).map(h=>parseInt(h,16));d.set(rgb,p*4);}}
 g.putImageData(im,0,0);return c.transferToImageBitmap();}
self.onmessage=async({data:d})=>{try{
 if(d.kind==='init'){({w:W,h:H,stages}=d.meta);N=W*H;subjectCount=d.meta.subjects.length;loading=(async()=>{frames=await Promise.all(d.meta.frames.map(async src=>pixels(await image(src))));labels=pixels(await image(d.meta.labels),true);})();await loading;self.postMessage({kind:'loaded'});return;}
 await loading;const job=++serial,selected=new Set(d.fams),chosen=new Set(d.stages),composites=[],layers={},transfer=[];
 const exact=selected.size===subjectCount&&chosen.size===stages.length;
 const C=new Float32Array(frames[0]);let stageC=null,prev=null;
 const save=(key,b)=>{layers[key]=b;transfer.push(b);};
 for(let j=0;j<frames.length;j++){
  if(job!==serial){for(const b of transfer)b.close();for(const b of composites)b.close();return;}
  const s=stages.find(s=>j>=s.frames[0]&&j<=s.frames[1]);
  if(s!==prev){stageC=new Float32Array(N*4).fill(255);prev=s;}
  if(j&&s){apply(stageC,j,selected);if(chosen.has(s.key))apply(C,j,selected);save(`${s.key}:${j}`,bitmap(stageC,{layer:true,ink:s.ink,gain:d.gain}));}
  composites.push(bitmap(exact?frames[j]:C,{outline:d.outline,colors:d.colors}));await yieldTask();
 }
 const blank=bitmap(new Float32Array(N*4).fill(255),{layer:true});save('blank',blank);
 self.postMessage({kind:'bank',key:d.key,composites,layers},[...transfer,...composites]);
}catch(error){self.postMessage({kind:'error',message:error.stack});}};
