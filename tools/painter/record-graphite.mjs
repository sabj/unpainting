// Records the executed graphite batches and material; selection and dry graphite arithmetic stay with
// the production caller.
export function recordGraphiteBatch({sheet,strokes,pigment,options,material,source,execute,observe,record}){
 const observed=[];
 const result=execute(sheet,strokes,pigment,{...options,beforeStroke:({gesture,ordinal,cells})=>{
  const paper=observe(sheet,cells);if(!paper.dry)throw Error('recorded graphite opening requires actual dry paper: '+JSON.stringify(paper));
  observed.push({ordinal,sourceOrdinal:gesture.sourceOrdinal,role:gesture.preparationRole,instruction:gesture.instruction,paper});
 }});
 record({kind:'actual physical dry graphite batch',source,material,pigment,options,strokes,observed,result});
 return result;
}
