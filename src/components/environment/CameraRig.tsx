"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useCompanionStore } from "@/stores/companionStore";
import { clamp, damp } from "@/lib/math";

/**
 * Fixed camera with gentle drag-to-peek (clamped yaw/pitch, eased).
 * Frames the whole diorama in Desk Mode, and Tuck in Pocket Mode.
 */
export function CameraRig() {
  const { camera, gl, size } = useThree();
  const layout = useCompanionStore((s) => s.layout);
  const peek = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const look = useRef(new THREE.Vector3(0, 0.55, 0));
  const pos = useRef(new THREE.Vector3(0, 1, 5.2));
  const first = useRef(true);

  useEffect(() => {
    const el = gl.domElement; let down: { x: number; y: number; px: number; py: number } | null = null;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, px: peek.current.tx, py: peek.current.ty }; };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      peek.current.tx = clamp(down.px + (e.clientX - down.x) / 400, -0.35, 0.35);
      peek.current.ty = clamp(down.py + (e.clientY - down.y) / 600, -0.15, 0.2);
    };
    const pu = () => { down = null; };
    const dbl = () => { peek.current.tx = 0; peek.current.ty = 0; };
    el.addEventListener("pointerdown", pd); window.addEventListener("pointermove", pm); window.addEventListener("pointerup", pu);
    el.addEventListener("dblclick", dbl);
    return () => { el.removeEventListener("pointerdown", pd); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu); el.removeEventListener("dblclick", dbl); };
  }, [gl]);

  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const p = peek.current;
    p.x = damp(p.x, p.tx, 5, dt); p.y = damp(p.y, p.ty, 5, dt);
    let target: THREE.Vector3, dist: number, height: number;
    if (layout === "desk") {
      // fit ~4.6 world units of width, never closer than needed for height
      dist = Math.max(4.3, 2.35 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / aspect);
      target = new THREE.Vector3(0, 0.6, 0); height = 0.55;
    } else {
      const x = useCompanionStore.getState().posX;
      dist = 3.9 / Math.min(1, aspect + 0.15);
      target = new THREE.Vector3(x * 0.75, 0.5, 0); height = 0.5;
    }
    const want = new THREE.Vector3(
      target.x + Math.sin(p.x) * dist,
      target.y + height + p.y * dist,
      Math.cos(p.x) * dist,
    );
    const k = first.current ? 1e3 : 4;
    first.current = false;
    pos.current.set(damp(pos.current.x, want.x, k, dt), damp(pos.current.y, want.y, k, dt), damp(pos.current.z, want.z, k, dt));
    look.current.set(damp(look.current.x, target.x, k, dt), damp(look.current.y, target.y, k, dt), 0);
    cam.position.copy(pos.current); cam.lookAt(look.current);
  });
  return null;
}
