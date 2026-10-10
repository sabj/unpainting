// A graphite pencil, after Sousa and Buchanan, "Observational models of graphite pencil materials" (CGF 19, 2000),
// with the directional bite of github.com/kylemcdonald/pencil-rendering. G holds graphite per cell (0..1 of full
// cover) and G.loose its loose dust share, which a wash can pick up (wetGraphite). DOM free.

export function createPencil({ point = 0.8, hardness = 0.5, wear = 0.0015, dustiness = 0.08 } = {}) { return { point, hardness, wear, dustiness, facet: 0, dust: 0 }; }

/** Sharpen: the cone back to a point. */
export function sharpen(pencil) { pencil.facet = 0; pencil.dust = 0; }

/** Draw along {x, y, p} into a graphite field G (per cell 0..1). */
export function pencilStroke(pencil, paper, G, path, { spacing = 0.5 } = {}) {
  const { w, h, height, tooth } = paper, soft = 1 - pencil.hardness;
  if (!G.loose || G.loose.length !== G.length) { G.loose = new Float32Array(G.length); G.crush = new Float32Array(G.length); }
  const loose = G.loose, crush = G.crush, cells = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], L = Math.hypot(b.x - a.x, b.y - a.y), m = Math.max(1, Math.ceil(L / spacing));
    for (let q = 0; q < m; q++) {
      const u = q / m, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, p = (a.p ?? 0.5) + ((b.p ?? 0.5) - (a.p ?? 0.5)) * u, step = L / m, tx = (b.x - a.x) / (L || 1), ty = (b.y - a.y) / (L || 1);
      // the cone under pressure plus the worn facet
      const r = pencil.point * (0.55 + 0.5 * p) + Math.sqrt(pencil.facet), R = Math.ceil(r + 1);
      cells.length = 0; let top = -Infinity;
      for (let yy = Math.floor(y - R); yy <= Math.ceil(y + R); yy++) for (let xx = Math.floor(x - R); xx <= Math.ceil(x + R); xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const dd = Math.hypot(xx + 0.5 - x, yy + 0.5 - y), cover = Math.min(1, r + 0.5 - dd); if (cover <= 0) continue;
        const i = yy * w + xx, ground = 0.8 * height[i] + 0.2 * tooth[i] - crush[i]; cells.push([i, cover, ground]);
        if (ground > top) top = ground;
      }
      if (!cells.length) continue;
      // the face rests on the highest fibre and sinks with pressure; a sharp point is narrow enough to follow the ground
      const sink = p * (0.12 + 0.3 * soft) + 0.2 / (1 + 3 * Math.sqrt(pencil.facet)), face = top - sink;
      let shaved = 0, hollow = 0;
      for (const [i, cover, ground] of cells) {
        const proud = ground - face;
        if (proud <= 0) { hollow += cover; continue; }
        const room = Math.max(0, 1 - G[i] / (0.45 + 0.55 * soft)); // graphite on graphite slides: the deposit saturates
        const ux = Math.min(w - 1, Math.max(0, Math.round(i % w - tx))), uy = Math.min(h - 1, Math.max(0, Math.round((i - (i % w)) / w - ty))), rise = height[i] - height[uy * w + ux];
        const bite = (1 + 4 * Math.max(0, rise)) * Math.max(0.2, 1 - 3 * Math.max(0, -rise));
        const add = 0.25 * Math.min(1, proud * 4) * (0.25 + p) * (0.3 + soft) * step * cover * room * bite;
        G[i] += add; loose[i] += add * (0.35 - 0.25 * p); shaved += add;
        crush[i] = Math.min(0.3, crush[i] + 0.012 * p * p * p * step * cover);
      }
      // dust dragged on the face settles into the hollows under it
      pencil.dust += shaved * pencil.dustiness;
      if (hollow > 0 && pencil.dust > 0) {
        const drop = pencil.dust * 0.12 * Math.min(1, hollow / 3);
        let dropped = 0;
        // a full hollow takes no more dust, so the loose share never exceeds the cell's graphite
        for (const [i, cover, ground] of cells) if (ground <= face) { const q = Math.min(drop * cover / hollow, Math.max(0, 1.5 - G[i])); G[i] += q; loose[i] += q; dropped += q; }
        pencil.dust -= dropped;
      }
      pencil.facet += shaved * pencil.wear * (0.4 + soft);
    }
  }
}

/** Water standing on the sheet picks up loose graphite dust into pigment k of the sheet (a grey, heavy, granulating
 *  pigment), where it moves and settles with the wash. Call between sheet steps. */
export function wetGraphite(sheet, G, k, { rate = 0.03, dt = 0.1 } = {}) {
  const loose = G.loose; if (!loose) return;
  if (sheet._gpu) sheet._gpu.syncAll(sheet);
  for (let i = 0; i < sheet.n; i++) {
    if (!sheet.M[i] || loose[i] <= 0 || sheet.W[i] < 0.02) continue;
    const q = Math.min(loose[i], G[i]) * Math.min(1, rate * dt * 10); // only graphite that is there can be picked up
    loose[i] -= q; G[i] -= q; sheet.G[k][i] += q;
  }
  if (sheet._gpu) sheet._gpu.cpuWroteAll();
}
