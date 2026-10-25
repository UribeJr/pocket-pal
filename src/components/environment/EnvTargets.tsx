"use client";
import type { ThreeEvent } from "@react-three/fiber";
import { ENV, interactionsFor, type EnvId } from "@/engine/environment/EnvironmentRegistry";
import { getActiveController } from "@/engine/activeController";
import { PRIORITY } from "@/types/companion";
import { phaseAt, useFocusStore } from "@/companion/focus";
import { clock } from "@/engine/simulation/clock";
import { triggerReaction } from "@/companion/reactions";
import { useCompanionStore } from "@/stores/companionStore";

/** Tap an object on the shelf: Tuck goes over and interacts (user priority). Occasionally asks the AI for a reaction. */
export function handleEnvTap(id: EnvId) {
  const ctl = getActiveController(); if (!ctl) return;
  const focusing = phaseAt(useFocusStore.getState().session, clock.now()).phase === "focus";
  const pocket = useCompanionStore.getState().layout === "pocket";
  if (focusing || pocket) {
    // stay seated / in frame: just a look
    void ctl.run([{ kind: "lookAt", target: ENV[id].look }, { kind: "play", clip: focusing ? "sitIdle" : "inspect", fallback: ["idle"], hold: 1.6 }], PRIORITY.user, `env:${id}`);
    return;
  }
  const opts = interactionsFor(id);
  const it = opts[Math.floor(Math.random() * opts.length)];
  if (!it) return;
  void ctl.run(it.build(), PRIORITY.user, `env:${it.id}`).then((r) => { if (r === "done") void triggerReaction("env_tap", { object: id }); });
}

export function EnvTargets() {
  return (
    <group>
      {(Object.keys(ENV) as EnvId[]).map((id) => (
        <mesh key={id} name={`env-${id}`} position={ENV[id].hit.pos} visible={false}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); handleEnvTap(id); }}>
          <boxGeometry args={ENV[id].hit.size} />
          <meshBasicMaterial />
        </mesh>
      ))}
    </group>
  );
}
