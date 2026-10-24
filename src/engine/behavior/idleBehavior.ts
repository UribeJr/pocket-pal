import type { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { useCompanionStore } from "@/stores/companionStore";

/**
 * Tiny ambient-life scheduler (Phase 3 grows this into the real behaviour engine).
 * Every few seconds while idle: look around, wander along the shelf, or doze at night.
 */
export class IdleBehavior {
  private next = 4;
  constructor(private ctl: CharacterControllerImpl) {}
  tick(dt: number, daylight: number) {
    const st = useCompanionStore.getState();
    if (this.ctl.isBusy || st.behavior === "conversing" || st.layout === "pocket") { this.next = Math.max(this.next, 3); return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = 5 + Math.random() * 6;
    const r = Math.random();
    if (daylight < 0.2 && r < 0.25 && st.emotion !== "sleepy") { this.ctl.setEmotion("sleepy"); this.ctl.returnToIdle(); return; }
    if (st.emotion === "sleepy") { if (r < 0.15) { this.ctl.setEmotion("neutral"); this.ctl.returnToIdle(); } return; }
    if (r < 0.45) this.ctl.playAnimation("lookAround", { onFinished: () => this.ctl.returnToIdle() });
    else if (r < 0.8) void this.ctl.moveTo({ x: 0.5 + Math.random() * 1.0, y: 0, z: 0 });
  }
}
