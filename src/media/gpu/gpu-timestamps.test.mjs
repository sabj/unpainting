import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuTimestamps } from './gpu-timestamps.mjs';
test('kernel timestamps sample each pipeline independently and preserve dispatch order/state', async () => {
  const saved = Object.fromEntries(['GPU_TIMESTAMPS','GPU_TIMESTAMP_KERNELS','GPU_TIMESTAMP_STRIDE'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { GPU_TIMESTAMPS: '1', GPU_TIMESTAMP_KERNELS: '1', GPU_TIMESTAMP_STRIDE: '2' });
  try {
    const queries = [], dispatches = [];
    const d = { features: new Set(['timestamp-query']), createQuerySet(desc) { assert.equal(desc.count, 512); return { destroy() {} }; } };
    const e = { beginComputePass(desc) {
      queries.push(desc?.timestampWrites); let pipeline, group;
      return { setPipeline(p) { pipeline = p.label; }, setBindGroup(index, g) { assert.equal(index, 0); group = g; },
        dispatchWorkgroups(...args) { dispatches.push([pipeline, group, 'direct', args]); },
        dispatchWorkgroupsIndirect(...args) { dispatches.push([pipeline, group, 'indirect', args]); }, end() {} };
    } };
    const t = new GpuTimestamps(d), pass = t.begin(e, 'flow');
    pass.setPipeline({ label: 'cap_sp' }); pass.setBindGroup(0, 'cap');
    pass.dispatchWorkgroups(2); pass.dispatchWorkgroups(3);
    pass.setPipeline({ label: 'wetscan' }); pass.setBindGroup(0, 'wet'); pass.dispatchWorkgroupsIndirect('args', 12);
    pass.setPipeline({ label: 'cap_sp' }); pass.setBindGroup(0, 'cap2'); pass.dispatchWorkgroups(4); pass.end();
    assert.deepEqual(dispatches, [['cap_sp','cap','direct',[2]],['cap_sp','cap','direct',[3]],['wetscan','wet','indirect',['args',12]],['cap_sp','cap2','direct',[4]]]);
    assert.deepEqual(Object.fromEntries(t.seen), { cap_sp: 3, wetscan: 1 });
    assert.deepEqual(t.pages[0].labels, ['cap_sp','wetscan','cap_sp']);
    assert.equal(queries.filter(Boolean).length, 3); t.destroy();
  } finally { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});
test('unsupported timestamps keep original passes and report disabled', async () => {
  const t = new GpuTimestamps({ features: new Set() }), sentinel = {};
  assert.equal(t.begin({ beginComputePass: () => sentinel }, 'kernel'), sentinel);
  assert.equal((await t.result()).enabled, false);
});
