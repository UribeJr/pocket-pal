"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useCompanionStore } from "@/stores/companionStore";

/**
 * What must always be in frame, in world units around Tuck (origin between his feet):
 * leaf tip ~0.9 m, a speech bubble above it, feet at 0, and the key light's shadow falling right.
 */
export const FRAME = { left: -0.5, right: 0.72, bottom: -0.15, top: 1.16 };
const PITCH = THREE.MathUtils.degToRad(7); // a touch above eye level, like the mockup
const FOV = 30;
const MARGIN = 1.04;

/**
 * Distance and look-at that fit FRAME in a viewport of this aspect (a true 3D fit, never CSS scaling).
 * Tuck stays centred whenever the whole frame fits; on narrower viewports the camera slides just far
 * enough toward his shadow to keep it in view, continuously (no jumps while resizing or rotating).
 */
export function fitCamera(aspect: number, follow = 0) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  const byHeight = (FRAME.top - FRAME.bottom) / 2 / tanV;
  const byWidth = (FRAME.right - FRAME.left) / 2 / tanH;
  const dist = Math.max(byHeight, byWidth) * MARGIN;
  const halfW = (dist / MARGIN) * tanH;
  // the frame travels with Tuck; any centre in [right - halfW, left + halfW] keeps it all visible,
  // so take the one closest to Tuck himself
  const cx = THREE.MathUtils.clamp(follow, FRAME.right + follow - halfW, FRAME.left + follow + halfW);
  const cy = (FRAME.top + FRAME.bottom) / 2;
  return { dist, cx, cy };
}

/** Frontal studio camera that refits on every resize and follows Tuck's x gently. */
export function StudioCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const first = useRef(true);
  const target = useRef(new THREE.Vector3());
  const pos = useRef(new THREE.Vector3());
  useEffect(() => { camera.fov = FOV; camera.near = 0.1; camera.far = 30; camera.updateProjectionMatrix(); }, [camera]);
  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    const follow = THREE.MathUtils.clamp(useCompanionStore.getState().posX, -0.35, 0.35) * 0.85;
    const { dist, cx, cy } = fitCamera(aspect, follow);
    target.current.set(cx, cy, 0);
    pos.current.set(cx, cy + Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const k = first.current || reduce ? 1 : 1 - Math.exp(-4 * Math.min(dt, 0.1));
    first.current = false;
    camera.position.lerp(pos.current, k);
    camera.lookAt(target.current);
  });
  return null;
}
