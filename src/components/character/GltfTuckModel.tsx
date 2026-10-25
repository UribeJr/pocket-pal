"use client";
import { Component, memo, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { mapBones, type BoneMapEntry } from "@/engine/animation/gltf/boneMap";
import type { FaceMeta } from "@/engine/animation/gltf/FaceDriver";
import type { ClipMeta } from "@/engine/animation/gltf/PoseGraph";
import type { BoneName } from "@/types/animation";

export interface GltfTuckParts {
  scene: THREE.Object3D;
  bones: Record<BoneName, THREE.Object3D>;
  clips: THREE.AnimationClip[];
  clipMeta: Record<string, ClipMeta>;
  faceMeta: FaceMeta | null;
}

let preloaded = false;
/** start fetching once; uncompressed GLB, so no Draco/meshopt decoders and nothing from a CDN */
export const preloadTuck = (url: string) => {
  if (preloaded) return;
  preloaded = true;
  useGLTF.preload(url, false, false);
};

/**
 * The approved Blender Tuck. Placed at the origin of the controller's root group with scale 1:
 * the GLB was built 1:1 from the stand-in, so ground contact and placement are unchanged.
 */
export const GltfTuckModel = memo(function GltfTuckModel({ url, onReady }: { url: string; onReady: (parts: GltfTuckParts) => void }) {
  const gltf = useGLTF(url, false, false);
  const parts = useMemo<GltfTuckParts>(() => {
    // rigid parts (no skin): a plain clone gives this mount its own nodes and morph influences
    const scene = gltf.scene.clone(true);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
    const rig = scene.getObjectByName("RIG_Tuck");
    if (!rig) throw new Error("Tuck GLB: RIG_Tuck node missing");
    return {
      scene,
      bones: mapBones(scene, rig.userData.tuck_bone_map as BoneMapEntry[]),
      clips: gltf.animations,
      clipMeta: (rig.userData.tuck_clips ?? {}) as Record<string, ClipMeta>,
      faceMeta: (rig.userData.tuck_face ?? null) as FaceMeta | null,
    };
  }, [gltf]);
  useEffect(() => onReady(parts), [parts, onReady]);
  return <primitive object={parts.scene} />;
});

/** a GLB that fails to load or validate falls back to the legacy Tuck instead of an empty shelf */
export class ModelBoundary extends Component<{ fallback: ReactNode; onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { console.error("[Tuck] GLB unavailable, using the legacy Tuck:", e.message); this.props.onError(e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
