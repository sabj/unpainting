// Fixed mouse/finger pressure bypasses filtering. Optional motion pressure and
// measured stylus pressure are filtered once per (possibly coalesced) sample.
const finite = (x, label) => { if (!Number.isFinite(x)) throw Error(`Invalid ${label}`); return x; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function pressureFromSpeed(speed) {
  // Speed is paper mm/ms, independent of zoom and simulation resolution.
  return .7 - .06 * Math.tanh((Math.max(0, finite(speed, 'pointer speed')) - .15) / .3);
}
export function pointerSample(e, rect, width, height, fallbackPressure, {manual=false,speed,release=false}={}) {
  const p = release ? 0 : e.pointerType === 'pen' ? finite(e.pressure, 'stylus pressure') : manual ? finite(fallbackPressure, 'controlled pressure') : speed===undefined ? .7 : pressureFromSpeed(speed);
  return { x: ((finite(e.clientX, 'pointer x') - rect.left) / rect.width) * width,
    y: ((finite(e.clientY, 'pointer y') - rect.top) / rect.height) * height,
    p: clamp(p, 0, 1), tiltX: clamp(Number.isFinite(e.tiltX) ? e.tiltX : 0, -90, 90),
    tiltY: clamp(Number.isFinite(e.tiltY) ? e.tiltY : 0, -90, 90), pressureSource: e.pointerType === 'pen' ? 'stylus' : manual ? 'control' : 'speed' };
}
export function createPointerSampler() {
  let last = null, time = 0, speed = .15;
  return {
    reset() { last = null; time = 0; speed = .15; },
    sample(e, rect, width, height, pressure, {dpi=60, ...options}={}) {
      const pt = pointerSample(e, rect, width, height, pressure, options);
      const stamp = finite(e.timeStamp, 'pointer time');
      if (last && !options.release) {
        const dt = Math.max(0, stamp - time), distance = Math.hypot(pt.x-last.x, pt.y-last.y) * 25.4 / dpi;
        if (pt.pressureSource === 'stylus') {
          // A light 12 ms filter removes device jitter without flattening a taper.
          pt.p = last.p + (pt.p-last.p) * -Math.expm1(-dt / 12);
        } else if (pt.pressureSource === 'speed') {
          // Bound outlier velocity before the 80 ms low-pass filter. Equal or
          // backwards timestamps retain the prior speed rather than dividing by zero.
          if (dt > 0) speed += (Math.min(2, distance/dt)-speed) * -Math.expm1(-dt / 80);
          const change = pressureFromSpeed(speed)-last.p;
          pt.p = last.p + clamp(change, -.012*distance, .012*distance);
        }
      }
      last = pt; time = Math.max(time, stamp);
      return pt;
    }
  };
}
export function releasePath(last, endpoint = last) {
  return [last, endpoint]; // A real release sample; no fabricated extra travel.
}
