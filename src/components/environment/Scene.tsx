"use client";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Diorama } from "./Diorama";
import { CameraRig } from "./CameraRig";
import { Tuck } from "@/components/character/Tuck";
import { useDocumentVisible } from "@/lib/hooks";
import { palette } from "@/lib/palette";

export default function Scene() {
  const visible = useDocumentVisible();
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={[1, 1.5]}
      frameloop={visible ? "always" : "never"}
      camera={{ fov: 30, position: [0, 1.1, 5.2], near: 0.1, far: 50 }}
      gl={{ antialias: true, powerPreference: "low-power", alpha: false }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={[palette.night]} />
      <fog attach="fog" args={[palette.night, 9, 16]} />
      <CameraRig />
      <Diorama />
      <Tuck />
    </Canvas>
  );
}
