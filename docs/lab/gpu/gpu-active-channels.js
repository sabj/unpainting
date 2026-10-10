// Conservative pigment channels for one GPU buffer allocation. Evolution moves
// mass within channels; only uploads can introduce another physical channel.
export function channelList(K, mask) {
  const list = []; for (let k = 0; k < K; k++) if ((mask >>> k) & 1) list.push(k); return list;
}
export function observeSheetChannels(mask, sheet, K) {
  const top = sheet.layers.at(-1);
  for (let k = 0; k < K; k++) {
    if ((mask >>> k) & 1) continue;
    for (const plane of [sheet.G[k], sheet.P[k], sheet.D[k], top?.[k]]) {
      if (plane?.some(v => v !== 0)) { mask |= 1 << k; break; }
    }
  }
  return mask;
}
export function observePackedChannels(mask, packed, area, K) {
  for (let k = 0; k < K; k++) {
    if ((mask >>> k) & 1) continue;
    let present = false;
    for (let i = 0; i < area; i++) {
      if (packed[(4+k)*area+i] !== 0 || packed[(4+K+k)*area+i] !== 0 || packed[(4+2*K+k)*area+i] !== 0) { present = true; break; }
    }
    if (present) mask |= 1 << k;
  }
  return mask;
}
