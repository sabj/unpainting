// The two passes of wash.mjs's flowField, by rows, so the thread pool (sheet-par.mjs) can run them in bands with the
// same arithmetic per cell as the serial call. No imports: the workers load it.

/** Central-difference gradient of `field` on rows ya..yb (1 <= ya, yb <= h - 2). */
export function gradRows(field, w, gx, gy, ya, yb, xa = 1, xb = w - 2) {
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * w + x;
    gx[i] = (field[i + 1] - field[i - 1]) / 2; gy[i] = (field[i + w] - field[i - w]) / 2;
  }
}

/** The dominant direction of a five by five structure tensor, and its coherence, on rows ya..yb (2 <= ya, yb <= h - 3). */
export function tensorRows(gx, gy, w, fx, fy, coh, ya, yb, xa = 2, xb = w - 3) {
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    let xx = 0, xy = 0, yy = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * w + x + dx;
      xx += gx[j] * gx[j]; xy += gx[j] * gy[j]; yy += gy[j] * gy[j];
    }
    const tr = xx + yy, root = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) / 4 + xy * xy)), big = tr / 2 + root, small = tr / 2 - root;
    if (big < 1e-9) continue;
    let ex, ey;
    if (Math.abs(xy) > 1e-12) { ex = xy; ey = big - xx; } else if (xx >= yy) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
    const m = Math.hypot(ex, ey) || 1;
    const i = y * w + x;
    fx[i] = -ey / m; fy[i] = ex / m; coh[i] = (big - small) / big;
  }
}
