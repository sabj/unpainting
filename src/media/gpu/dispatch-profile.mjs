// Opt-in CPU telemetry. Native GPU objects remain native; no queue waits added.
// Besides the totals it counts, by kernel (the pipeline's label up to any '#' of overrides): dispatches, workgroups and
// passes, and the worker op that was being handled (`state.op`, set by worker.mjs); readbacks (map calls) by op and bytes.
const base = label => String(label || '?').split('#')[0];
export function instrumentDispatches(device) {
  if (device.dispatchProfile) return device.dispatchProfile;
  const state = { submissions: 0, commandBuffers: 0, dispatches: 0, passes: 0, waits: 0, waitMs: 0, op: 'init',
    betweenWaits: {}, waitKinds: {}, pending: { submissions: 0, commandBuffers: 0, dispatches: 0 },
    kernels: {}, readbacks: {} };
  const buffers = new WeakMap(), labels = new WeakMap();
  const kernel = name => state.kernels[name] ??= { dispatches: 0, indirect: 0, workgroups: 0, ops: {} };
  const wait = async (kind, fn) => {
    const batch = state.pending; state.pending = { submissions: 0, commandBuffers: 0, dispatches: 0 };
    const key = `${batch.submissions}/${batch.commandBuffers}/${batch.dispatches}`;
    state.betweenWaits[key] = (state.betweenWaits[key] ?? 0) + 1;
    state.waitKinds[kind] = (state.waitKinds[kind] ?? 0) + 1; state.waits++;
    const start = performance.now();
    try { return await fn(); } finally { state.waitMs += performance.now() - start; }
  };
  if (device.createComputePipeline) {
    const make = device.createComputePipeline.bind(device);
    device.createComputePipeline = desc => { const p = make(desc); labels.set(p, base(desc?.label ?? desc?.compute?.entryPoint)); return p; };
  }
  if (device.createComputePipelineAsync) {
    const make = device.createComputePipelineAsync.bind(device);
    device.createComputePipelineAsync = async desc => { const p = await make(desc); labels.set(p, base(desc?.label ?? desc?.compute?.entryPoint)); return p; };
  }
  const create = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (...args) => {
    const encoder = create(...args); let count = 0;
    const begin = encoder.beginComputePass.bind(encoder), finish = encoder.finish.bind(encoder);
    encoder.beginComputePass = (...args) => {
      const pass = begin(...args); let current = '?'; state.passes++;
      const set = pass.setPipeline.bind(pass);
      pass.setPipeline = p => { current = labels.get(p) ?? base(p?.label); return set(p); };
      const direct = pass.dispatchWorkgroups.bind(pass), indirect = pass.dispatchWorkgroupsIndirect.bind(pass);
      pass.dispatchWorkgroups = (x, y = 1, z = 1) => {
        count++; const k = kernel(current); k.dispatches++; k.workgroups += x * y * z; k.ops[state.op] = (k.ops[state.op] ?? 0) + 1;
        return direct(x, y, z);
      };
      pass.dispatchWorkgroupsIndirect = (...args) => {
        count++; const k = kernel(current); k.dispatches++; k.indirect++; k.ops[state.op] = (k.ops[state.op] ?? 0) + 1;
        return indirect(...args);
      };
      return pass;
    };
    encoder.finish = (...args) => { const buffer = finish(...args); buffers.set(buffer, count); return buffer; };
    return encoder;
  };
  const submit = device.queue.submit.bind(device.queue);
  device.queue.submit = commands => {
    const list = Array.from(commands), count = list.reduce((sum, buffer) => sum + (buffers.get(buffer) ?? 0), 0);
    for (const target of [state, state.pending]) { target.submissions++; target.commandBuffers += list.length; target.dispatches += count; }
    return submit(list);
  };
  const idle = device.queue.onSubmittedWorkDone.bind(device.queue);
  device.queue.onSubmittedWorkDone = () => wait('queue', idle);
  const createBuffer = device.createBuffer.bind(device);
  device.createBuffer = (...args) => {
    const buffer = createBuffer(...args), map = buffer.mapAsync.bind(buffer);
    buffer.mapAsync = (mode, offset = 0, size) => {
      const r = state.readbacks[state.op] ??= { n: 0, bytes: 0 };
      r.n++; r.bytes += size ?? (buffer.size - offset);
      return wait('map', () => map(mode, offset, size));
    };
    return buffer;
  };
  state.snapshot = () => ({ submissions: state.submissions, commandBuffers: state.commandBuffers,
    dispatches: state.dispatches, passes: state.passes, waits: state.waits, waitMs: state.waitMs,
    betweenWaits: { ...state.betweenWaits }, waitKinds: { ...state.waitKinds }, pending: { ...state.pending },
    kernels: structuredClone(state.kernels), readbacks: structuredClone(state.readbacks),
    scope: 'CPU map/queue await calls; histogram key submissions/commandBuffers/dispatches since preceding await began; overlapping waits may cover the same GPU work; kernels by pipeline label, ops by the worker message being handled' });
  device.dispatchProfile = state; return state;
}
