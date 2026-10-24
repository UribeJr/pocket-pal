"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { palette } from "@/lib/palette";
import { fraunces } from "@/lib/fonts";
import { nowWithOverride } from "@/engine/simulation/timeOfDay";

function drawDigit(ctx: CanvasRenderingContext2D, ch: string) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#2B211C"; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(255,255,255,0.06)"); g.addColorStop(0.5, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = palette.lamp;
  ctx.font = `700 ${Math.round(h * 0.78)}px ${fraunces.style.fontFamily}, Georgia, serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ch, w / 2, h * 0.55);
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, h / 2 - 2, w, 4); // split line
}

function Tile({ ch, x, fontsReady }: { ch: string; x: number; fontsReady: boolean }) {
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 176;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { tex: t, ctx: c.getContext("2d")! };
  }, []);
  const ref = useRef<THREE.Group>(null);
  const flip = useRef(1);
  useEffect(() => { drawDigit(ctx, ch); tex.needsUpdate = true; flip.current = 0; }, [ch, ctx, tex, fontsReady]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    if (!ref.current || flip.current >= 1) return;
    flip.current = Math.min(1, flip.current + dt * 3);
    const k = flip.current; ref.current.rotation.x = (1 - k) * (1 - k) * -1.4; // falls into place
  });
  return (
    <group position={[x, 0, 0.081]}>
      <group ref={ref} position={[0, 0.11, 0]}>
        <mesh position={[0, -0.11, 0]}>
          <planeGeometry args={[0.16, 0.22]} />
          <meshStandardMaterial map={tex} roughness={0.7} emissive={palette.lamp} emissiveMap={tex} emissiveIntensity={0.25} />
        </mesh>
      </group>
    </group>
  );
}

export function FlipClock(props: ThreeElements["group"]) {
  const [now, setNow] = useState(() => nowWithOverride());
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(nowWithOverride()), 1000);
    document.fonts?.load(`700 64px ${fraunces.style.fontFamily}`).then(() => setFontsReady(true)).catch(() => setFontsReady(true));
    return () => clearInterval(id);
  }, []);
  let h = now.getHours() % 12; if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0");
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: palette.cream, roughness: 0.75 }), []);
  return (
    <group {...props}>
      <RoundedBox args={[0.92, 0.36, 0.16]} radius={0.04} smoothness={4} castShadow receiveShadow material={wood} position={[0, 0.18, 0]} />
      <group position={[0, 0.18, 0]}>
        <Tile ch={hh[0]} x={-0.33} fontsReady={fontsReady} />
        <Tile ch={hh[1]} x={-0.15} fontsReady={fontsReady} />
        <Tile ch={mm[0]} x={0.15} fontsReady={fontsReady} />
        <Tile ch={mm[1]} x={0.33} fontsReady={fontsReady} />
        {[0.035, -0.035].map((y) => (
          <mesh key={y} position={[0, y, 0.085]}><circleGeometry args={[0.014, 12]} /><meshStandardMaterial color={palette.walnut} /></mesh>
        ))}
      </group>
    </group>
  );
}
