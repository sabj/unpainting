// Opt-in whole-module scheduling: with lateTrees, the treelayers module runs in the 'after-broad' phase.
// Each module's internal wet chains and paint geometry are kept.
function passagePhase(name,declared,{lateTrees=false}={}){
 if(typeof lateTrees!=='boolean')throw Error('lateTrees must be boolean');
 if(lateTrees&&name==='treelayers'&&declared!=='washes')throw Error('unexpected treelayers source phase '+declared);
 return lateTrees&&name==='treelayers'?'after-broad':declared;
}
export function passageSchedule(modules,{lateTrees=false}={}){
 if(lateTrees&&modules.some(p=>p.name==='treelayers'&&typeof p.paint!=='function'))throw Error('late tree module requires callable paint');
 if(lateTrees&&modules.filter(p=>p.name==='treelayers').length!==1)throw Error('late tree schedule requires exactly one treelayers module');
 return modules.map(p=>({...p,sourceWhen:p.when,when:passagePhase(p.name,p.when,{lateTrees})}));
}
