// Stylus pressure is measured. Mouse/finger pressure follows current motion without a smoothing delay.
const finite = (x, label) => { if (!Number.isFinite(x)) throw Error(`Invalid ${label}`); return x; };
function pressureFromSpeed(speed) {
  return Math.max(.2, Math.min(.85, .85 - .3 * Math.max(0,finite(speed,'pointer speed'))));
}
export function pointerSample(e, rect, width, height, fallbackPressure, {manual=false,speed,release=false}={}) {
  const p = e.pointerType === 'pen' ? finite(e.pressure, 'stylus pressure') : release ? 0 : manual ? finite(fallbackPressure, 'controlled pressure') : speed===undefined ? .7 : pressureFromSpeed(speed);
  return { x: ((finite(e.clientX, 'pointer x') - rect.left) / rect.width) * width,
    y: ((finite(e.clientY, 'pointer y') - rect.top) / rect.height) * height,
    p: Math.max(0, Math.min(1, p)), tiltX: Math.max(-90, Math.min(90, Number.isFinite(e.tiltX) ? e.tiltX : 0)),
    tiltY: Math.max(-90, Math.min(90, Number.isFinite(e.tiltY) ? e.tiltY : 0)), pressureSource: e.pointerType === 'pen' ? 'stylus' : manual ? 'control' : 'speed' };
}
export function releasePath(last, endpoint = last) {
  return [last, endpoint]; // A real release sample; no fabricated extra travel.
}
