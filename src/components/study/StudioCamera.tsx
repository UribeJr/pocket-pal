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

/** where Tuck's frame sits inside the full-screen canvas, in CSS pixels */
export interface FrameRect { x: number; y: number; w: number; h: number }

/**
 * The canvas fills the screen (the room continues behind the timer), but Tuck is fitted to the
 * .study-frame cell: the camera's aspect is the cell's, and a view offset widens the picture to the
 * whole canvas, so he sits exactly where the cell is.
 */
export function viewOffsetFor(canvas: { w: number; h: number }, frame: FrameRect) {
  return { fullWidth: frame.w, fullHeight: frame.h, x: -frame.x, y: -frame.y, width: canvas.w, height: canvas.h };
}

/** Frontal studio camera that refits on every resize and follows Tuck's x gently. */
export function StudioCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const first = useRef(true);
  const target = useRef(new THREE.Vector3());
  const pos = useRef(new THREE.Vector3());
  const frame = useRef<FrameRect | null>(null);
  useEffect(() => { camera.fov = FOV; camera.near = 0.1; camera.far = 40; (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true; camera.updateProjectionMatrix(); }, [camera]);
  // track the .study-frame cell relative to the canvas (layout changes, rotation, the Ask panel opening)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".study-frame");
    if (!el) return;
    const measure = () => {
      const c = gl.domElement.getBoundingClientRect(); const r = el.getBoundingClientRect();
      frame.current = r.width > 1 && r.height > 1 ? { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height } : null;
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el); ro.observe(gl.domElement);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [gl]);
  useFrame((_, dt) => {
    const f = frame.current;
    const aspect = f ? f.w / f.h : size.width / Math.max(1, size.height);
    if (f) {
      const v = viewOffsetFor({ w: size.width, h: size.height }, f);
      if (camera.aspect !== aspect || camera.view?.offsetX !== v.x || camera.view?.offsetY !== v.y || camera.view?.width !== v.width || camera.view?.height !== v.height || camera.view?.fullWidth !== v.fullWidth || camera.view?.fullHeight !== v.fullHeight) {
        camera.aspect = aspect;
        camera.setViewOffset(v.fullWidth, v.fullHeight, v.x, v.y, v.width, v.height);
      }
    } else if (camera.view) { camera.clearViewOffset(); camera.aspect = aspect; camera.updateProjectionMatrix(); }
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
