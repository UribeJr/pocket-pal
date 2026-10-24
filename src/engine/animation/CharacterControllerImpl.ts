import * as THREE from "three";
import type { AnimationBackend, ClipName, PlayOptions } from "@/types/animation";
import type { CharacterController, Emotion, Vec3Like } from "@/types/companion";
import { useCompanionStore } from "@/stores/companionStore";
import { clamp, damp } from "@/lib/math";

const SPEECH_TAP = ["oh! hi.", "hehe, that tickles.", "i'm awake, i'm awake!", "hello, you."];

/**
 * Backend-agnostic controller. It owns intent (where to go, what to feel, what to look at)
 * and delegates pose generation to an AnimationBackend (procedural or GLB).
 */
export class CharacterControllerImpl implements CharacterController {
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0; private headPitch = 0;
  private moveTarget: number | null = null;
  private moveResolve: (() => void) | null = null;
  private busy = false;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private tmp = new THREE.Vector3();

  constructor(private backend: AnimationBackend, private root: THREE.Object3D, private head: THREE.Object3D | null) {
    const s = useCompanionStore.getState();
    root.position.x = s.posX; root.rotation.y = s.facing;
    // resume a looping state after remount, otherwise idle
    const resume = ["sleep", "talk"].includes(s.animation) ? s.animation : "idle";
    this.playAnimation(resume, { fade: 0 });
  }

  get isBusy() { return this.busy || this.moveTarget !== null; }

  playAnimation(name: ClipName, opts?: PlayOptions) {
    if (!this.backend.has(name)) { console.warn(`[Tuck] unknown clip "${name}"`); return; }
    this.backend.play(name, opts);
    useCompanionStore.getState().set({ animation: name });
  }

  setEmotion(e: Emotion) { useCompanionStore.getState().set({ emotion: e }); }

  lookAt(target: Vec3Like | null) {
    this.lookTarget = target ? new THREE.Vector3(target.x, target.y, target.z) : null;
  }

  moveTo(pos: Vec3Like) {
    this.moveResolve?.();
    this.moveTarget = clamp(pos.x, -1.6, 1.6);
    this.playAnimation("walk", { fade: 0.25 });
    useCompanionStore.getState().set({ behavior: "wandering" });
    return new Promise<void>((res) => { this.moveResolve = res; });
  }

  startConversation() {
    this.moveTarget = null;
    this.setEmotion("curious");
    this.lookAt({ x: 0, y: 1.2, z: 6 });
    this.playAnimation("talk");
    useCompanionStore.getState().set({ behavior: "conversing" });
  }

  returnToIdle() {
    this.busy = false;
    this.lookAt(null);
    const st = useCompanionStore.getState();
    if (st.emotion !== "sleepy") this.setEmotion("neutral");
    this.playAnimation(st.emotion === "sleepy" ? "sleep" : "idle", { fade: 0.4 });
    st.set({ behavior: st.emotion === "sleepy" ? "sleeping" : "idle" });
  }

  react(kind: "tap") {
    if (kind !== "tap") return;
    this.moveTarget = null; this.moveResolve?.(); this.moveResolve = null;
    this.busy = true;
    const st = useCompanionStore.getState();
    st.set({ tapCount: st.tapCount + 1, lastInteraction: Date.now(), behavior: "reacting" });
    this.setEmotion("happy");
    this.lookAt({ x: 0, y: 1.2, z: 6 });
    this.say(SPEECH_TAP[st.tapCount % SPEECH_TAP.length]);
    this.playAnimation("hop", {
      fade: 0.08,
      onFinished: () => this.playAnimation("happy", { fade: 0.15, onFinished: () => this.returnToIdle() }),
    });
  }

  say(text: string, ms = 2600) {
    useCompanionStore.getState().set({ speech: text });
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => useCompanionStore.getState().set({ speech: null }), ms);
  }

  update(dt: number) {
    const st = useCompanionStore.getState();
    // locomotion
    if (this.moveTarget !== null) {
      const dx = this.moveTarget - this.root.position.x;
      const dir = Math.sign(dx);
      this.root.rotation.y = damp(this.root.rotation.y, dir * 0.9, 8, dt);
      this.root.position.x += dir * Math.min(Math.abs(dx), 0.45 * dt);
      if (Math.abs(dx) < 0.01) {
        this.moveTarget = null;
        const r = this.moveResolve; this.moveResolve = null;
        this.returnToIdle(); r?.();
      }
    } else {
      this.root.rotation.y = damp(this.root.rotation.y, 0, 4, dt);
    }
    // head look-at (yaw/pitch relative to root), smoothed
    let yaw = 0, pitch = 0;
    if (this.lookTarget && this.head) {
      this.head.parent?.getWorldPosition(this.tmp);
      const d = this.lookTarget.clone().sub(this.tmp);
      yaw = clamp(Math.atan2(d.x, d.z) - this.root.rotation.y, -0.7, 0.7);
      pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.4, 0.3);
    }
    this.headYaw = damp(this.headYaw, yaw, 6, dt);
    this.headPitch = damp(this.headPitch, pitch, 6, dt);
    this.backend.setOverlay({ head: { r: [this.headPitch, this.headYaw, 0] } });
    this.backend.update(dt);
    if (Math.abs(st.posX - this.root.position.x) > 0.02 || Math.abs(st.facing - this.root.rotation.y) > 0.05)
      st.set({ posX: this.root.position.x, facing: this.root.rotation.y });
  }
}
