"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { faceFor } from "@/engine/emotion/EmotionController";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { palette } from "@/lib/palette";
import { useCompanionStore } from "@/stores/companionStore";
import { ProceduralBackend } from "@/engine/animation/ProceduralBackend";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { IdleBehavior } from "@/engine/behavior/idleBehavior";
import { handleTuckTap } from "@/engine/interactions/tap";
import { daylightAt, nowWithOverride } from "@/engine/simulation/timeOfDay";
import type { BoneName } from "@/types/animation";

const mat = (color: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

/**
 * STAND-IN Tuck built from primitives. Groups are named like the bones a real rig
 * should expose (root/body/head/cap/leaf/eyes/armL/armR/footL/footR).
 */
export function Tuck({ onController }: { onController?: (c: CharacterControllerImpl) => void }) {
  const refs = useRef<Partial<Record<BoneName, THREE.Object3D | null>>>({});
  const bind = (n: BoneName) => (o: THREE.Object3D | null) => { refs.current[n] = o; };
  const ctl = useRef<CharacterControllerImpl | null>(null);
  const behavior = useRef<IdleBehavior | null>(null);
  const emotion = faceFor(useCompanionStore((s) => s.emotion));
  const speech = useCompanionStore((s) => s.speech);
  const get = useThree((s) => s.get);

  const m = useMemo(() => ({
    clay: mat(palette.clay, 0.8), sage: mat(palette.sage, 1), stem: mat(palette.walnut, 0.9),
    leaf: mat("#A9C08F", 0.9), ink: mat(palette.ink, 0.5), blush: new THREE.MeshStandardMaterial({ color: palette.blush, roughness: 1, transparent: true, opacity: 0.75 }),
    sageDark: mat("#7C9478", 1),
  }), []);

  useEffect(() => {
    const backend = new ProceduralBackend(refs.current);
    const c = new CharacterControllerImpl(backend, refs.current.root!, refs.current.head ?? null);
    ctl.current = c; behavior.current = new IdleBehavior(c);
    onController?.(c);
    const w = window as unknown as Record<string, unknown>;
    w.__pocketPal = {
      store: useCompanionStore, controller: c,
      tuckScreenPos: () => {
        const v = new THREE.Vector3(); refs.current.body?.getWorldPosition(v); v.y += 0.3; v.project(get().camera);
        const rect = (document.querySelector("canvas") as HTMLCanvasElement).getBoundingClientRect();
        return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
      },
    };
    return () => { delete w.__pocketPal; };
  }, [get, onController]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    ctl.current?.update(d);
    behavior.current?.tick(d, daylightAt(nowWithOverride()));
  });

  const onTap = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (ctl.current) handleTuckTap(ctl.current); };

  return (
    <group ref={bind("root")} position={[0.9, 0, 0.1]}>
      {/* generous invisible hit target */}
      <mesh position={[0, 0.4, 0]} onPointerDown={onTap} visible={false}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      <group ref={bind("footL")} position={[-0.14, 0.05, 0.08]}>
        <mesh castShadow scale={[1, 0.6, 1.3]} material={m.clay}><sphereGeometry args={[0.09, 20, 16]} /></mesh>
      </group>
      <group ref={bind("footR")} position={[0.14, 0.05, 0.08]}>
        <mesh castShadow scale={[1, 0.6, 1.3]} material={m.clay}><sphereGeometry args={[0.09, 20, 16]} /></mesh>
      </group>
      <group ref={bind("body")} position={[0, 0.04, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.32, 0]} scale={[1.05, 0.95, 0.95]} material={m.clay}>
          <sphereGeometry args={[0.33, 48, 36]} />
        </mesh>
        <group ref={bind("armL")} position={[-0.33, 0.26, 0.02]}>
          <mesh castShadow position={[-0.02, -0.04, 0]} scale={[0.8, 1.2, 0.9]} material={m.clay}><sphereGeometry args={[0.075, 16, 12]} /></mesh>
        </group>
        <group ref={bind("armR")} position={[0.33, 0.26, 0.02]}>
          <mesh castShadow position={[0.02, -0.04, 0]} scale={[0.8, 1.2, 0.9]} material={m.clay}><sphereGeometry args={[0.075, 16, 12]} /></mesh>
        </group>
        <group ref={bind("head")} position={[0, 0.32, 0]}>
          {/* face */}
          <group ref={bind("eyes")} position={[0, 0.0, 0.305]}>
            <Eyes emotion={emotion} ink={m.ink} />
          </group>
          <mesh position={[-0.17, -0.07, 0.27]} rotation={[0, -0.5, 0]} scale={[1, 0.6, 0.3]} material={m.blush}><sphereGeometry args={[0.055, 16, 12]} /></mesh>
          <mesh position={[0.17, -0.07, 0.27]} rotation={[0, 0.5, 0]} scale={[1, 0.6, 0.3]} material={m.blush}><sphereGeometry args={[0.055, 16, 12]} /></mesh>
          <Mouth emotion={emotion} ink={m.ink} />
          {/* acorn felt cap */}
          <group ref={bind("cap")} position={[0, 0.13, 0]} rotation={[-0.08, 0, 0.05]}>
            <mesh castShadow position={[0, 0.02, 0]} scale={[1, 0.62, 1]} material={m.sage}>
              <sphereGeometry args={[0.37, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh castShadow position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.sageDark}>
              <torusGeometry args={[0.36, 0.035, 12, 48]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.sageDark}>
              <circleGeometry args={[0.36, 32]} />
            </mesh>
            <mesh castShadow position={[0.0, 0.29, 0]} rotation={[0, 0, -0.25]} material={m.stem}>
              <cylinderGeometry args={[0.018, 0.026, 0.13, 10]} />
            </mesh>
            <group ref={bind("leaf")} position={[0.03, 0.34, 0]}>
              <mesh castShadow position={[0.08, 0.02, 0]} rotation={[0.3, 0, 0.35]} scale={[1, 0.18, 0.55]} material={m.leaf}>
                <sphereGeometry args={[0.08, 16, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      {speech && (
        <Html position={[0, 1.15, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="tuck-bubble" data-testid="tuck-speech">{speech}</div>
        </Html>
      )}
    </group>
  );
}

function Eyes({ emotion, ink }: { emotion: string; ink: THREE.Material }) {
  const xs = [-0.1, 0.1];
  if (emotion === "happy")
    return <>{xs.map((x) => (
      <mesh key={x} position={[x, 0.02, 0]} rotation={[0, x * 1.5, 0]} material={ink}><torusGeometry args={[0.035, 0.011, 8, 16, Math.PI]} /></mesh>
    ))}</>;
  if (emotion === "sleepy")
    return <>{xs.map((x) => (
      <mesh key={x} position={[x, 0.02, 0]} rotation={[0, x * 1.5, Math.PI]} material={ink}><torusGeometry args={[0.032, 0.01, 8, 16, Math.PI]} /></mesh>
    ))}</>;
  return <>{xs.map((x) => (
    <mesh key={x} position={[x, 0.01, 0]} rotation={[0, x * 1.5, 0]} scale={[0.8, emotion === "curious" ? 1.35 : 1.1, 0.5]} material={ink}><sphereGeometry args={[0.035, 16, 12]} /></mesh>
  ))}</>;
}

function Mouth({ emotion, ink }: { emotion: string; ink: THREE.Material }) {
  if (emotion === "curious")
    return <mesh position={[0, -0.09, 0.3]} scale={[1, 1, 0.4]} material={ink}><sphereGeometry args={[0.022, 12, 10]} /></mesh>;
  const big = emotion === "happy";
  return (
    <mesh position={[0, -0.07, 0.31]} rotation={[0, 0, Math.PI]} material={ink}>
      <torusGeometry args={[big ? 0.035 : 0.022, 0.009, 8, 16, Math.PI]} />
    </mesh>
  );
}
