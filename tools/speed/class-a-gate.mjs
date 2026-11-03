// Each Class A item must pass both frozen small fixtures and the native census set.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const out=path.resolve(process.argv[2]??`work/class-a-${new Date().toISOString().replaceAll(':','-')}`);
for(const [name,baseline,manifest] of [
 ['small','src/media/parity/baseline.json','src/media/parity/fixtures.json'],
 ['native','src/media/parity/native-baseline.json','src/media/parity/native-fixtures.json'],
]) {
 const result=spawnSync(process.execPath,['tools/speed/parity.mjs','check','.',path.join(out,name),baseline,manifest],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
console.log(`Class A frozen-output gate passed; evidence: ${out}`);
