// Preserve every physical sample while limiting worker/render messages to display cadence.
export function createMoveQueue(send, schedule, cancel) {
  let samples = [], firstTime = null, frame = null;
  const flush = () => {
    if (frame !== null) { cancel(frame); frame = null; }
    if (!samples.length) return;
    const pts = samples; samples = []; const t = firstTime; firstTime = null;
    send({ type: 'move', pts, t });
  };
  return {
    push(pt, t) { if (!samples.length) firstTime = t; samples.push(pt); if (frame === null) frame = schedule(() => { frame = null; flush(); }); },
    flush,
    discard() { if (frame !== null) cancel(frame); frame = null; samples = []; firstTime = null; },
  };
}
