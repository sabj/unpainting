// Opt-in CPU telemetry. Native GPU objects remain native; no queue waits added.
export function instrumentDispatches(device) {
  if (device.dispatchProfile) return device.dispatchProfile;
  const state = { submissions: 0, commandBuffers: 0, dispatches: 0, waits: 0, waitMs: 0,
    betweenWaits: {}, waitKinds: {}, pending: { submissions: 0, commandBuffers: 0, dispatches: 0 } };
  const buffers = new WeakMap();
  const wait = async (kind, fn) => {
    const batch = state.pending; state.pending = { submissions: 0, commandBuffers: 0, dispatches: 0 };
    const key = `${batch.submissions}/${batch.commandBuffers}/${batch.dispatches}`;
    state.betweenWaits[key] = (state.betweenWaits[key] ?? 0) + 1;
    state.waitKinds[kind] = (state.waitKinds[kind] ?? 0) + 1; state.waits++;
    const start = performance.now();
    try { return await fn(); } finally { state.waitMs += performance.now() - start; }
  };
  const create = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (...args) => {
    const encoder = create(...args); let count = 0;
    const begin = encoder.beginComputePass.bind(encoder), finish = encoder.finish.bind(encoder);
    encoder.beginComputePass = (...args) => {
      const pass = begin(...args);
      for (const method of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
        const original = pass[method].bind(pass);
        pass[method] = (...args) => { count++; return original(...args); };
      }
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
    buffer.mapAsync = (...args) => wait('map', () => map(...args));
    return buffer;
  };
  state.snapshot = () => ({ submissions: state.submissions, commandBuffers: state.commandBuffers,
    dispatches: state.dispatches, waits: state.waits, waitMs: state.waitMs,
    betweenWaits: { ...state.betweenWaits }, waitKinds: { ...state.waitKinds }, pending: { ...state.pending },
    scope: 'CPU map/queue await calls; histogram key submissions/commandBuffers/dispatches since preceding await began; overlapping waits may cover the same GPU work' });
  device.dispatchProfile = state; return state;
}
