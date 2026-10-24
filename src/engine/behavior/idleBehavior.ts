import type { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { useCompanionStore } from "@/stores/companionStore";
import { PRIORITY } from "@/types/companion";

/**
 * Tiny ambient-life scheduler (grows into the BehaviorEngine in Living Phase 2).
 * Issues PRIORITY.activity jobs, so any user interaction pre-empts it.
 */
export class IdleBehavior {
  private next = 4;
  constructor(private ctl: CharacterControllerImpl) {}
  tick(dt: number, daylight: number) {
    const st = useCompanionStore.getState();
    if (this.ctl.activePriority > PRIORITY.ambient || st.behavior === "conversing" || st.layout === "pocket") { this.next = Math.max(this.next, 3); return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = 5 + Math.random() * 6;
    const r = Math.random();
    const sleepy = this.ctl.emotions.emotion === "sleepy";
    if (daylight < 0.2 && r < 0.25 && !sleepy) { this.ctl.setEmotion("sleepy", PRIORITY.activity, Infinity); this.ctl.returnToIdle(); return; }
    if (sleepy) { if (r < 0.15) { this.ctl.setEmotion("content", PRIORITY.activity); this.ctl.returnToIdle(); } return; }
    if (r < 0.45) void this.ctl.run([{ kind: "play", clip: "lookAround" }], PRIORITY.activity, "lookAround");
    else if (r < 0.8) void this.ctl.moveTo({ x: 0.5 + Math.random() * 1.0, y: 0, z: 0 });
  }
}
