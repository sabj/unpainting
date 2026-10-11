// Each invocation's scan reads only its own updated M/S cells. Cross-cell
// communication is confined to wetscan_tile's existing workgroup atomics.
// Thirteen storage bindings are needed; smaller adapters keep separate passes.
export const FINISH_WET_SCAN = `
@compute @workgroup_size(16, 16)
fn p5c_wetscan(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (u.p3 != 2u) { p5c_tile(wid, lid); wetscan_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    let at = vec3<u32>(tile, wid.y, wid.z);
    p5c_tile(at, lid);
    wetscan_tile(at, lid);
    workgroupBarrier();
  }
}
`;
