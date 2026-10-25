"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { setActiveController } from "@/engine/activeController";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useCompanionStore } from "@/stores/companionStore";
import { ProceduralBackend } from "@/engine/animation/ProceduralBackend";
import { GltfBackend } from "@/engine/animation/GltfBackend";
import { bindFaceToStore } from "@/engine/animation/gltf/faceBinding";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { BehaviorEngine, type EngineContext } from "@/engine/behavior/BehaviorEngine";
import { phaseAt, useFocusStore } from "@/companion/focus";
import { clock } from "@/engine/simulation/clock";
import { useChatStore } from "@/companion/conversation";
import { PRIORITY } from "@/types/companion";
import { handleTuckTap } from "@/engine/interactions/tap";
import { daylightAt, nowWithOverride } from "@/engine/simulation/timeOfDay";
import { characterConfig, rendererFor, type TuckRenderer } from "@/lib/characterConfig";
import type { AnimationBackend, BoneName } from "@/types/animation";
import { LegacyTuckModel } from "./LegacyTuckModel";
import { GltfTuckModel, ModelBoundary, preloadTuck, type GltfTuckParts } from "./GltfTuckModel";

/** energy survives layout remounts */
let savedEnergy: number | null = null;

function engineCtx(): EngineContext {
  const d = nowWithOverride(); const st = useCompanionStore.getState();
  return { hour: d.getHours(), daylight: daylightAt(d), layout: st.layout, focus: phaseAt(useFocusStore.getState().session, clock.now()).phase, posX: st.posX, busy: st.behavior === "conversing" || useChatStore.getState().pending || useChatStore.getState().open };
}

type Rig = { kind: "legacy" } | { kind: "glb"; parts: GltfTuckParts };

/**
 * Tuck: one shell (root group, hit target, speech bubble, controller + behavior wiring) with a
 * swappable body. The approved Blender GLB (GltfTuckModel + GltfBackend) is the default; the
 * procedural stand-in (LegacyTuckModel + ProceduralBackend) is the fallback and the revert switch
 * (see characterConfig.rendererFor). Only one of them ever mounts.
 */
export function Tuck({ onController }: { onController?: (c: CharacterControllerImpl) => void }) {
  const refs = useRef<Partial<Record<BoneName, THREE.Object3D | null>>>({});
  const bind = (n: BoneName) => (o: THREE.Object3D | null) => { refs.current[n] = o; };
  const ctl = useRef<CharacterControllerImpl | null>(null);
  const behavior = useRef<BehaviorEngine | null>(null);
  const renders = useRef(0);
  renders.current++;
  const speech = useCompanionStore((s) => s.speech);
  const get = useThree((s) => s.get);
  const [renderer, setRenderer] = useState<TuckRenderer>(() => rendererFor());
  const [rig, setRig] = useState<Rig | null>(() => (renderer === "legacy" ? { kind: "legacy" } : null));
  if (renderer === "glb") preloadTuck(characterConfig.modelUrl);
  const onGlbReady = useCallback((parts: GltfTuckParts) => setRig({ kind: "glb", parts }), []);
  const onGlbError = useCallback(() => { setRenderer("legacy"); setRig({ kind: "legacy" }); }, []);

  useEffect(() => {
    if (!rig) return;
    let backend: AnimationBackend;
    let unbindFace = () => {};
    if (rig.kind === "glb") {
      // the shell keeps controller ownership of the root group; body/head now point at the GLB nodes
      refs.current.body = rig.parts.bones.body;
      refs.current.head = rig.parts.bones.head;
      const b = new GltfBackend({ ...rig.parts, container: refs.current.root! }, { aliases: characterConfig.clipAliases, walkYaw: characterConfig.walkYaw });
      if (b.face) unbindFace = bindFaceToStore(b.face);
      backend = b;
    } else {
      backend = new ProceduralBackend(refs.current);
    }
    const c = new CharacterControllerImpl(backend, refs.current.root!, refs.current.head ?? null);
    ctl.current = c; const h = nowWithOverride().getHours();
    const eng = new BehaviorEngine(c, Math.random, savedEnergy ?? (h >= 22 || h < 6 ? 0.45 : 0.85));
    behavior.current = eng;
    onController?.(c);
    setActiveController(c);
    const w = window as unknown as Record<string, unknown>;
    w.__pocketPal = {
      store: useCompanionStore, controller: c, behavior: eng, focus: useFocusStore, clock,
      engineContext: () => engineCtx(),
      tuckScreenPos: () => {
        const v = new THREE.Vector3(); refs.current.body?.getWorldPosition(v); v.y += 0.3; v.project(get().camera);
        const rect = (document.querySelector("canvas") as HTMLCanvasElement).getBoundingClientRect();
        return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
      },
      renderer: rig.kind, backend, renders: () => renders.current, gl: () => get().gl,
    };
    return () => {
      savedEnergy = eng.energy; delete w.__pocketPal; setActiveController(null);
      unbindFace();
      if (backend instanceof GltfBackend) backend.dispose();
      ctl.current = null; behavior.current = null;
    };
  }, [get, onController, rig]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    ctl.current?.update(d);
    behavior.current?.tick(d, engineCtx());
  });

  // short press = tap reaction; hold 500 ms = open the optional talk input
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (press.current) clearTimeout(press.current);
    press.current = setTimeout(() => {
      press.current = null;
      const c = ctl.current; if (!c) return;
      if (c.emotions.emotion === "sleepy") c.setEmotion("content", PRIORITY.user, 0);
      void c.run([{ kind: "emote", emotion: "curious", hold: 4 }, { kind: "lookAt", target: { x: 0, y: 1.2, z: 6 } }, { kind: "play", clip: "idle", hold: 1.5 }], PRIORITY.user, "listen");
      useChatStore.getState().setOpen(true);
    }, 500);
    const up = () => {
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      if (press.current) { clearTimeout(press.current); press.current = null; if (ctl.current) handleTuckTap(ctl.current); }
    };
    const cancel = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); if (press.current) { clearTimeout(press.current); press.current = null; } };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
  };

  return (
    <group ref={bind("root")} position={[0.9, 0, 0.1]}>
      {/* generous invisible hit target */}
      <mesh position={[0, 0.4, 0]} onPointerDown={onDown} visible={false}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      {renderer === "legacy" ? (
        <LegacyTuckModel refs={refs} />
      ) : (
        <ModelBoundary fallback={null} onError={onGlbError}>
          <Suspense fallback={null}>
            <GltfTuckModel url={characterConfig.modelUrl} onReady={onGlbReady} />
          </Suspense>
        </ModelBoundary>
      )}
      {speech && (
        <Html position={[0, 1.15, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="tuck-bubble" data-testid="tuck-speech">{speech}</div>
        </Html>
      )}
    </group>
  );
}
