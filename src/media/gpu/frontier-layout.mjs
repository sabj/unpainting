// Observational decoder only. Physical shaders and queue ordering are unchanged.
export function frontierLayout(words, ntiles) {
  if(!Number.isInteger(ntiles)||ntiles<1||words.length!==5*ntiles+3)
    throw new RangeError('Invalid FLAGS2 allocation');
  const values=(start,n)=>Array.from(words.subarray(start,start+n));
  const queue=(name,start,countAt)=>{
    const count=words[countAt];if(count>ntiles)throw new RangeError(name+' count overflow');
    const valid=values(start,count);
    const invalid=valid.some(t=>t>=ntiles)||new Set(valid).size!==count;
    if(invalid&&name!=='keep')throw new RangeError(name+' invalid or duplicate tiles');
    return {count,valid,sorted:valid.slice().sort((a,b)=>a-b),trailing:values(start+count,ntiles-count),
      ...(invalid?{historicalInvalid:true,validationError:'keep invalid or duplicate tiles'}:{})};
  };
  const wet=queue('wet',ntiles,2*ntiles),dirty=queue('dirty',3*ntiles+1,5*ntiles+1),keep=queue('keep',4*ntiles+1,5*ntiles+2);
  const wetMembership=values(0,ntiles),dirtyMembership=values(2*ntiles+1,ntiles);
  for(const membership of [wetMembership,dirtyMembership])if(membership.some(v=>v!==0&&v!==1))throw new RangeError('Nonbinary frontier membership');
  const indices=membership=>membership.flatMap((v,i)=>v?[i]:[]);
  if(JSON.stringify(indices(wetMembership))!==JSON.stringify(wet.sorted)||JSON.stringify(indices(dirtyMembership))!==JSON.stringify(dirty.sorted))
    throw new Error('Quiescent frontier membership differs from its valid queue');
  return {ntiles,wetMembership,dirtyMembership,wet,dirty,keep,
    semantic:{ntiles,wetMembership,dirtyMembership,wet:{count:wet.count,tiles:wet.sorted},dirty:{count:dirty.count,tiles:dirty.sorted},
      keep:keep.historicalInvalid?{count:keep.count,historicalInvalid:true,rawPrefix:keep.valid,rawTrailing:keep.trailing}:{count:keep.count,tiles:keep.sorted}}};
}

export function observeFrontier(words,ntiles){
  const result={raw:Array.from(words)};
  try{result.layout=frontierLayout(words,ntiles);}catch(error){result.decoderError=String(error.stack??error);}
  return result;
}
