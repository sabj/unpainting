import { waitForDamp } from './wash-state.mjs';

/** The same physical card on a CLI GPU sheet or the CPU reference in tests. */
export function paintBloom(proof, mm) {
  const { S, sheet, O, w, h, raw, timed, capture, dry } = proof;
  raw(() => {
    for (let y = Math.round(5 / mm); y < Math.round(45 / mm); y++) for (let x = Math.round(5 / mm); x < Math.round(45 / mm); x++) S.deposit(sheet, y * w + x, 0.2, [0.25]);
  });
  const indices = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + 0.5) * mm - 25, (y + 0.5) * mm - 25) < 6) indices.push(y * w + x);
  const r0 = Math.floor(19 / mm), r1 = Math.ceil(31 / mm), box = [r0, r0, r1 - r0, r1 - r0];
  const preparation = timed(() => waitForDamp(sheet, indices, O, (s, o) => { S.step(s, o); s._gpu?.ensureFresh(s, box); }, 300, { dampFraction: 0.95, wetFraction: 0.99 }));
  capture('shine-off');
  raw(() => { for (const i of indices) S.deposit(sheet, i, 0.25, [0]); });
  capture('clean-drop');
  dry('painting');
  return preparation;
}
