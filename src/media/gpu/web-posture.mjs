// Explicit contact studies, shared by material admission and the cursor.
// These shapes are opt-in.
export const POSTURES = ['auto', 'point', 'side', 'belly'];
export function postureContact(mode, { radius, p, flat = false, tx = 1, ty = 0, tiltX = 0, tiltY = 0, lengths }) {
  if (!POSTURES.includes(mode)) throw Error('Invalid brush posture');
  if (![radius, p, tx, ty, tiltX, tiltY].every(Number.isFinite) || radius < 0 || p < 0 || p > 1 || Math.abs(tiltX) > 90 || Math.abs(tiltY) > 90) throw Error('Invalid finite posture geometry');
  if (!lengths?.length || !lengths.every(Number.isFinite)) throw Error('Invalid posture hairs');
  if (mode === 'auto') return null;
  // Tilt is measured only for a stylus; zero tilt retains the stroke heading.
  if (mode === 'side' && Math.hypot(tiltX, tiltY) > 1e-6) { const m = Math.hypot(tiltX, tiltY); tx = tiltX / m; ty = tiltY / m; }
  const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
  // A point uses a compact transverse tuft; side lays the shorter hairs along
  // the shaft; belly uses the pressed-tuft envelope, without extra load.
  const t = Math.max(0, Math.min(1, (p - .1) / .4)), tipShare = mode === 'point' ? 1 : 1 - t * t * (3 - 2 * t);
  const pointHalf = radius * .15 * Math.sqrt(p);
  const postureHalf = mode === 'point' ? pointHalf : mode === 'side' ? radius * .55 * (.4 + .6 * p)
    : flat ? radius * (.9 + .1 * p) * Math.sqrt(Math.min(1, p / .5)) * (1 + .1 * p) : radius * (.2 + .65 * p + .2 * p * p);
  const half = tipShare * pointHalf + (1 - tipShare) * postureHalf;
  const reach = mode === 'point' ? 0 : radius * .9 * (.15 + .85 * p);
  const offsets = lengths.map((len, j) => (1 - tipShare) * (flat ? -radius * .35 * p * (2 * j / Math.max(1, lengths.length - 1) - 1) ** 2 : reach * (1 - len)));
  const nx = -ty, ny = tx;
  const tips = lengths.map((len, j) => { const across = (2 * j / Math.max(1, lengths.length - 1) - 1) * half, along = offsets[j]; return [tx * along + nx * across, ty * along + ny * across]; });
  return { half, tipShare, offsets, reachOff: Math.max(...offsets.map(Math.abs)), tx, ty, nx, ny, tips };
}
