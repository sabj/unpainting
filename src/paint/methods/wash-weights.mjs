// Shares of a wash: how a cell's demand is split across the value bands, and how one passage's charge is split
// across its pans. No target data is read at paint time.

// The value bands of one cell never ask for more than the whole of its demand.
export function normalizeWashWeights(weights) {
  for(let i=0;i<weights[0].length;i++) {
    const sum=weights.reduce((s,a)=>s+a[i],0);
    if(sum>1) for(const a of weights) a[i]/=sum;
  }
}

// Each pan's share of a passage's charge.
export function shapeMix(shape) {
  const total=shape.mix.reduce((s,v)=>s+v,0);
  return shape.mix.map(v=>total>0?v/total:0);
}
