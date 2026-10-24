"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, ContactShadows } from "@react-three/drei";
import { palette } from "@/lib/palette";
import { FlipClock } from "./FlipClock";
import { daylightAt, nowWithOverride } from "@/engine/simulation/timeOfDay";
import { lerp } from "@/lib/math";

const c = (h: string) => new THREE.Color(h);
const NIGHT = { sky: c("#2B3A72"), skyLow: c("#3A4C8A"), wall: c("#3A2F35"), amb: c("#5A6390"), ambI: 0.9 };
const DAY = { sky: c("#9CC7E8"), skyLow: c("#F3D9B5"), wall: c("#B79A82"), amb: c("#FFF1DE"), ambI: 1.1 };

function archShape(w: number, h: number) {
  const s = new THREE.Shape(); const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}

/** Lamp-lit shelf diorama. Day/night is expressed purely via lighting + window sky. */
export function Diorama() {
  const amb = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const shadeMat = useRef<THREE.MeshStandardMaterial>(null);
  const skyMat = useRef<THREE.MeshBasicMaterial>(null);
  const wallMat = useRef<THREE.MeshStandardMaterial>(null);
  const moon = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);

  const frameShape = useMemo(() => { const o = archShape(1.5, 1.7); o.holes.push(archShape(1.3, 1.6) as unknown as THREE.Path); return o; }, []);
  const glassShape = useMemo(() => archShape(1.3, 1.6), []);
  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry(); const pts: number[] = [];
    for (let i = 0; i < 40; i++) { const x = (Math.random() - 0.5) * 1.2; const y = Math.random() * 1.5; if (y > 1.6 - 0.65 && Math.hypot(x, y - 0.95) > 0.62) continue; pts.push(x, y, 0.01); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); return g;
  }, []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const d = daylightAt(nowWithOverride());
    if (amb.current) { amb.current.intensity = lerp(NIGHT.ambI, DAY.ambI, d); amb.current.color.copy(NIGHT.amb).lerp(DAY.amb, d); }
    if (sun.current) sun.current.intensity = d * 1.6;
    if (fill.current) fill.current.intensity = lerp(1.1, 0.25, d);
    if (lamp.current) lamp.current.intensity = lerp(5.5, 1.2, d);
    if (shadeMat.current) shadeMat.current.emissiveIntensity = lerp(1.4, 0.35, d);
    if (skyMat.current) skyMat.current.color.copy(tmp.copy(NIGHT.sky).lerp(DAY.sky, d));
    if (wallMat.current) wallMat.current.color.copy(tmp.copy(NIGHT.wall).lerp(DAY.wall, d));
    if (moon.current) (moon.current.material as THREE.MeshBasicMaterial).color.set(d > 0.5 ? "#FFF6D8" : "#F6E7B0");
    if (stars.current) (stars.current.material as THREE.PointsMaterial).opacity = 1 - d;
  });

  const walnut = palette.walnut;
  return (
    <group>
      <hemisphereLight ref={amb} args={["#5A6390", "#2A1E18", 0.35]} />
      <directionalLight ref={sun} position={[-3, 4, 3]} intensity={0} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
        shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />

      {/* warm front fill = lamp bounce, keeps Tuck's face readable at night */}
      <directionalLight ref={fill} position={[1.5, 1.6, 4]} color="#FFB877" intensity={1.1} />

      {/* back wall */}
      <mesh position={[0, 1.4, -0.75]} receiveShadow>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial ref={wallMat} color={NIGHT.wall} roughness={1} />
      </mesh>

      {/* arched window */}
      <group position={[-1.75, 0.3, -0.72]} scale={0.9}>
        <mesh><shapeGeometry args={[glassShape, 24]} /><meshBasicMaterial ref={skyMat} color={NIGHT.sky} toneMapped={false} /></mesh>
        <points ref={stars} geometry={starGeo}><pointsMaterial color="#FFFFFF" size={0.022} transparent opacity={1} /></points>
        <mesh ref={moon} position={[0.28, 1.15, 0.02]}><circleGeometry args={[0.11, 24]} /><meshBasicMaterial color="#F6E7B0" toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.03]} castShadow>
          <extrudeGeometry args={[frameShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 24 }]} />
          <meshStandardMaterial color="#6B4A35" roughness={0.9} />
        </mesh>
      </group>

      {/* shelf */}
      <RoundedBox args={[6, 0.22, 1.5]} radius={0.03} smoothness={3} position={[0, -0.11, 0]} receiveShadow>
        <meshStandardMaterial color="#8A6046" roughness={0.85} />
      </RoundedBox>
      <mesh position={[0, -0.6, 0.6]}><boxGeometry args={[6, 0.8, 0.3]} /><meshStandardMaterial color={walnut} roughness={0.9} /></mesh>

      {/* plant */}
      <group position={[-1.3, 0, 0.05]}>
        <mesh castShadow receiveShadow position={[0, 0.12, 0]}><cylinderGeometry args={[0.17, 0.14, 0.24, 28]} /><meshStandardMaterial color={palette.clay} roughness={0.9} /></mesh>
        <mesh castShadow position={[0, 0.25, 0]}><cylinderGeometry args={[0.18, 0.18, 0.04, 28]} /><meshStandardMaterial color="#B5623D" roughness={0.9} /></mesh>
        <mesh castShadow position={[0, 0.45, 0]} scale={[1, 0.85, 1]}><sphereGeometry args={[0.25, 32, 24]} /><meshStandardMaterial color={palette.sage} roughness={1} /></mesh>
        <mesh castShadow position={[0.12, 0.58, 0.08]}><sphereGeometry args={[0.12, 20, 16]} /><meshStandardMaterial color="#9DB497" roughness={1} /></mesh>
      </group>

      <FlipClock position={[-0.35, 0, 0.1]} />

      {/* lamp */}
      <group position={[1.75, 0, 0.15]}>
        <mesh castShadow position={[0, 0.02, 0]}><cylinderGeometry args={[0.16, 0.18, 0.04, 28]} /><meshStandardMaterial color={walnut} roughness={0.7} /></mesh>
        <mesh castShadow position={[0, 0.45, 0]}><cylinderGeometry args={[0.022, 0.022, 0.86, 10]} /><meshStandardMaterial color={walnut} roughness={0.7} /></mesh>
        <mesh position={[0, 0.98, 0]}>
          <cylinderGeometry args={[0.14, 0.3, 0.34, 32, 1, true]} />
          <meshStandardMaterial ref={shadeMat} color={palette.lamp} emissive={palette.lamp} emissiveIntensity={1.4} side={THREE.DoubleSide} roughness={1} />
        </mesh>
        <pointLight ref={lamp} position={[0, 0.85, 0.05]} color="#FFC77A" intensity={5.5} distance={6} decay={1.6} castShadow
          shadow-mapSize={[1024, 1024]} shadow-bias={-0.002} shadow-radius={6} />
      </group>

      <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={6} blur={2.6} far={1} resolution={512} color="#1a120d" />
    </group>
  );
}
