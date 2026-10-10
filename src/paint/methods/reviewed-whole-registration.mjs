// Registers a reviewed whole drawing's gestures onto the plan grid by a uniform scale. It does not calibrate a pen or paint.
export function registerReviewedWholeDrawing(gestures,{width,height},{w,h}){
 if(![width,height,w,h].every(v=>Number.isFinite(v)&&v>0))throw Error('reviewed whole frame invalid');
 const sx=w/width,sy=h/height;if(Math.abs(sx-sy)>1e-10)throw Error('reviewed whole drawing requires uniform registered frame');
 if(sx===1)return gestures;
 return gestures.map(g=>({...g,...(g.length==null?{}:{length:g.length*sx}),points:g.points.map(q=>({...q,x:q.x*sx,y:q.y*sx,...(q.nw==null?{}:{nw:q.nw*sx})}))}));
}
