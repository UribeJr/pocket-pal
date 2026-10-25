import * as THREE from "three";
import type { BoneName } from "@/types/animation";

/** One row of the GLB's RIG_Tuck extras `tuck_bone_map` (tuck-character-studio docs/rig/pocket-pal-bone-map.json). */
export interface BoneMapEntry { blender_bone: string; gltf_node: string; three_name: string; pocket_pal: string; side: string }

/**
 * App bone names -> GLB nodes. The GLB uses anatomical names (arm_L is Tuck's own left, +X), so the
 * app's viewer-side armL/footL map to arm_R/foot_R. Never matched by name similarity: the map comes
 * from the asset, and the side is asserted so a wrong export fails loudly instead of mirroring Tuck.
 */
export function mapBones(scene: THREE.Object3D, entries: BoneMapEntry[]): Record<BoneName, THREE.Object3D> {
  const out: Partial<Record<BoneName, THREE.Object3D>> = {};
  for (const e of entries) {
    const node = scene.getObjectByName(e.three_name);
    if (!node) throw new Error(`Tuck GLB: bone node "${e.three_name}" (app "${e.pocket_pal}") missing`);
    out[e.pocket_pal as BoneName] = node;
  }
  const required: BoneName[] = ["root", "body", "head", "eyes", "cap", "leaf", "armL", "armR", "footL", "footR"];
  const missing = required.filter((b) => !out[b]);
  if (missing.length) throw new Error(`Tuck GLB: bone map lacks ${missing.join(", ")}`);
  // measured in the model's own space, so it holds wherever the model is placed
  scene.updateWorldMatrix(true, true);
  const x = (b: BoneName) => scene.worldToLocal(out[b]!.getWorldPosition(new THREE.Vector3())).x;
  if (!(x("armL") < 0 && x("footL") < 0 && x("armR") > 0 && x("footR") > 0))
    throw new Error("Tuck GLB: bone map side check failed (app armL/footL must be at -x)");
  return out as Record<BoneName, THREE.Object3D>;
}
