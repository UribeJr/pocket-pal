"use client";
import { useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Tuck } from "@/components/character/Tuck";
import { useDocumentVisible } from "@/lib/hooks";
import { StudioCamera } from "./StudioCamera";

/** soft image-based fill, blurred so it reads as studio bounce light rather than reflections */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.12).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
}

/**
 * The study stage: Tuck alone on an invisible floor that only catches his soft shadow, over the page's
 * warm-neutral background (transparent canvas). Lights match the Phase 4 studio rig that reproduced
 * the approved Blender renders: key front-left (shadow falls right, as in the mockup), fill, rim, bounce.
 */
export default function StudyStage() {
  const visible = useDocumentVisible();
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.75]}
      frameloop={visible ? "always" : "never"}
      camera={{ fov: 30, position: [0, 0.7, 4], near: 0.1, far: 30 }}
      gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.setClearColor(0x000000, 0); }}
      style={{ touchAction: "none" }}
    >
      <StudioCamera />
      <StudioEnvironment />
      <hemisphereLight args={["#F6F1EA", "#B39A8A", 1.25]} />
      <directionalLight
        position={[-1.4, 2.6, 2.2]} intensity={1.6} color="#FFF5E8" castShadow
        shadow-mapSize={[1024, 1024]} shadow-radius={7} shadow-bias={-0.0002} shadow-normalBias={0}
        shadow-camera-left={-1.4} shadow-camera-right={1.6} shadow-camera-top={1.4} shadow-camera-bottom={-1.4} shadow-camera-near={0.5} shadow-camera-far={8}
      />
      <directionalLight position={[2.2, 1.0, 1.4]} intensity={0.45} color="#EAF0FF" />
      <directionalLight position={[0.9, 1.7, -2.3]} intensity={0.7} color="#FFFFFF" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={0.26} color="#3B2E26" />
      </mesh>
      <Tuck />
    </Canvas>
  );
}
