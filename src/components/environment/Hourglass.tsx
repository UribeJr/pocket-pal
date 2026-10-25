"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { palette } from "@/lib/palette";
import { getActiveController } from "@/engine/activeController";
import { HOURGLASS_POS } from "@/engine/environment/EnvironmentRegistry";
import { phaseAt, useFocusStore } from "@/companion/focus";
import { clock } from "@/engine/simulation/clock";
import { damp } from "@/lib/math";

/** Small walnut hourglass on the shelf. Sand follows the focus session; Tuck flips it on start ("hourglass:flip"). */
export function Hourglass() {
  const spin = useRef<THREE.Group>(null);
  const top = useRef<THREE.Mesh>(null);
  const bottom = useRef<THREE.Mesh>(null);
  const stream = useRef<THREE.Mesh>(null);
  const flip = useRef({ angle: 0, target: 0, ctl: null as unknown, off: null as null | (() => void) });
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#F4EBDD", roughness: 0.1, transmission: 0.6, transparent: true, opacity: 0.35, thickness: 0.05 }), []);
  const sand = useMemo(() => new THREE.MeshStandardMaterial({ color: "#E2B15A", roughness: 1 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: palette.walnut, roughness: 0.7 }), []);

  useFrame((_, dt) => {
    const f = flip.current;
    const ctl = getActiveController();
    if (ctl && f.ctl !== ctl) { f.off?.(); f.ctl = ctl; f.off = ctl.onSignal((n) => { if (n === "hourglass:flip") f.target += Math.PI; }); }
    f.angle = damp(f.angle, f.target, 5, dt);
    if (spin.current) spin.current.rotation.z = f.angle;
    const st = useFocusStore.getState();
    const { phase, progress } = phaseAt(st.session, clock.now());
    // sand appears in the "upper" bulb only while focusing; the flip animation is purely visual
    const flipping = Math.abs(f.target - f.angle) > 0.05;
    const p = phase === "focus" && !flipping ? progress : 1;
    const up = phase === "focus" ? (flipping ? 1 : 1 - p) : 0;
    const down = 1 - up;
    if (top.current) { top.current.scale.setScalar(Math.max(0.001, Math.cbrt(up))); top.current.visible = up > 0.01; }
    if (bottom.current) { bottom.current.scale.setScalar(Math.max(0.001, Math.cbrt(down))); bottom.current.visible = down > 0.01; }
    if (stream.current) stream.current.visible = phase === "focus" && !flipping && up > 0.01;
    // keep the visual "up" bulb on top after any number of flips
    if (spin.current) { const k = Math.round(f.target / Math.PI) % 2; spin.current.userData.k = k; }
  });

  return (
    <group position={[HOURGLASS_POS.x, 0, HOURGLASS_POS.z]} data-testid="hourglass">
      <group position={[0, 0.17, 0]}>
        <group ref={spin}>
          {[-0.15, 0.15].map((y) => <mesh key={y} castShadow position={[0, y, 0]} material={wood}><cylinderGeometry args={[0.09, 0.09, 0.025, 20]} /></mesh>)}
          {[[-0.07, -0.05], [0.07, 0.05], [0.07, -0.05], [-0.07, 0.05]].map(([x, z]) => <mesh key={`${x}${z}`} castShadow position={[x, 0, z]} material={wood}><cylinderGeometry args={[0.009, 0.009, 0.3, 6]} /></mesh>)}
          <mesh position={[0, 0.065, 0]} material={glass}><coneGeometry args={[0.065, 0.13, 20, 1, true]} /></mesh>
          <mesh position={[0, -0.065, 0]} rotation={[Math.PI, 0, 0]} material={glass}><coneGeometry args={[0.065, 0.13, 20, 1, true]} /></mesh>
        </group>
        {/* sand is not parented to the spinning frame: it always reads top -> bottom */}
        <group position={[0, 0.02, 0]}><mesh ref={top} position={[0, 0.05, 0]} rotation={[Math.PI, 0, 0]} material={sand}><coneGeometry args={[0.05, 0.08, 18]} /></mesh></group>
        <mesh ref={stream} position={[0, -0.03, 0]} material={sand}><cylinderGeometry args={[0.004, 0.004, 0.09, 6]} /></mesh>
        <group position={[0, -0.135, 0]}><mesh ref={bottom} position={[0, 0.03, 0]} material={sand}><coneGeometry args={[0.055, 0.06, 18]} /></mesh></group>
      </group>
    </group>
  );
}
