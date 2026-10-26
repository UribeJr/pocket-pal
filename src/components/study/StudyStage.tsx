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
 * A photo-studio "infinity cove": the floor curves up into the back wall, so the room reads as one
 * continuous space behind both the timer and Tuck. Flat, unlit vertex colours (warm neutrals from the
 * mockup) keep the tones exact and the timer's contrast predictable; the bend is a touch darker, like
 * soft ambient occlusion. Tuck's shadow comes from the ShadowMaterial floor above it.
 */
function StudioRoom() {
  const geo = useMemo(() => {
    const D = 4.5, R = 2.6, FRONT = 9, TOP = 12, W = 60; // wall distance, bend radius, extents (m)
    // profile in (z, y) from the front of the floor, round a wide soft bend, up the wall; colours blend
    // so gently that the bend never draws a line behind the clock
    const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
    const prof: { z: number; y: number; c: string }[] = [{ z: FRONT, y: 0, c: "#C3BEB6" }, { z: 1.5, y: 0, c: "#CDC9C1" }, { z: -(D - R), y: 0, c: "#D2CEC7" }];
    for (let i = 1; i <= 16; i++) { const t = i / 16; const a = t * (Math.PI / 2); prof.push({ z: -(D - R) - Math.sin(a) * R, y: R - Math.cos(a) * R, c: mix("#D3CFC8", "#D8D4CD", t) }); }
    prof.push({ z: -D, y: 4, c: "#DDDAD3" }, { z: -D, y: TOP, c: "#E4E1DB" });
    const pos: number[] = []; const col: number[] = []; const idx: number[] = []; const tmp = new THREE.Color();
    prof.forEach((p, i) => {
      tmp.set(p.c); // hex is sRGB; three converts it to the linear working space
      for (const x of [-W / 2, W / 2]) { pos.push(x, p.y, p.z); col.push(tmp.r, tmp.g, tmp.b); }
      if (i > 0) { const a = (i - 1) * 2, b = i * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[0, -0.002, 0]}>
      <meshBasicMaterial vertexColors toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * The stage: Tuck in his studio room, on a floor that catches his soft shadow. Lights match the Phase 4 studio rig that reproduced
 * the approved Blender renders: key front-left (shadow falls right, as in the mockup), fill, rim, bounce.
 */
export default function StudyStage() {
  const visible = useDocumentVisible();
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.5]}
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
      <StudioRoom />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={0.26} color="#3B2E26" />
      </mesh>
      <Tuck />
    </Canvas>
  );
}
