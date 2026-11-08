// Each invocation's scan reads only its own updated M/S cells. Cross-cell
// communication is confined to wetscan_tile's existing workgroup atomics.
// Packed scratch planes fit within Metal's ten-storage-buffer limit; apply_f1_p3a_dep needs fourteen.
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
@compute @workgroup_size(16, 16)
fn p5c_wetfrontier(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (u.p3 != 2u) { p5c_tile(wid, lid); wetfrontier_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    let at = vec3<u32>(tile, wid.y, wid.z);
    p5c_tile(at, lid);
    wetfrontier_tile(at, lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p5ab(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (u.p3 != 2u) { p5a_tile(wid, lid); p5b_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    let at = vec3<u32>(tile, wid.y, wid.z);
    p5a_tile(at, lid);
    p5b_tile(at, lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn slide_apply_cap_sp(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (u.p3 != 2u) { slide_apply_all_tile(wid, lid); cap_sp_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    let at = vec3<u32>(tile, wid.y, wid.z);
    slide_apply_all_tile(at, lid);
    cap_sp_tile(at, lid);
    workgroupBarrier();
  }
}
`;
export const FINISH_WET_SCAN_14 = `
@compute @workgroup_size(16, 16)
fn apply_f1_p3a_dep(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (u.p3 != 2u) { apply_f1_tile(wid, lid); p3a_dep_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    let at = vec3<u32>(tile, wid.y, wid.z);
    apply_f1_tile(at, lid);
    p3a_dep_tile(at, lid);
    workgroupBarrier();
  }
}
`;
