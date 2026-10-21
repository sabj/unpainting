// --inkhue source: the pen's ink takes the colour of the target's own pen lines. Over the cells the separator reads
// as ink (crop/inkwash.mjs), the optical density of each channel against the paper, in linear light, gives the ink's
// absorption direction. The profile's absorption is turned to that direction, keeping its sum, so how dark the ink is
// stays with the load (--inkdarkmatch) and only its hue changes. A walnut or bistre line absorbs more blue than red.
//
// Pure: arrays in, numbers out. Planning only.

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/**
 * Absorption [r, g, b] for the ink, from the target's line cells.
 * @param rgb   the target, RGB 0..255, length n*3
 * @param mask  1 where the target shows pen line
 * @param paper the paper colour [r, g, b] 0..255
 * @param baseK the profile's absorption; its sum is kept
 * gain: each channel's density is raised to this power before the sum is shared out (1 keeps the source's direction)
 * @returns { K, density, cells } or null when fewer than `minCells` line cells carry density
 */
export function inkKFromSource(rgb, mask, paper, baseK, { minCells = 50, gain = 1 } = {}) {
  const P = paper.map(lin), sum = [0, 0, 0];
  let cells = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const d = [0, 1, 2].map(c => Math.max(0, -Math.log(Math.max(1e-4, lin(rgb[i * 3 + c])) / Math.max(1e-4, P[c]))));
    if (d[0] + d[1] + d[2] < 0.05) continue;
    for (let c = 0; c < 3; c++) sum[c] += d[c];
    cells++;
  }
  if (cells < minCells) return null;
  // gain > 1 pushes the absorption further along the source's direction: dense ink renders less coloured than its
  // direction, as the strongest channel saturates first
  const pow = sum.map(v => v ** gain), total = pow[0] + pow[1] + pow[2], baseSum = baseK[0] + baseK[1] + baseK[2];
  const K = pow.map(v => Math.round(1000 * baseSum * v / total) / 1000);
  return { K, density: sum.map(v => v / cells), cells };
}
