import * as THREE from "three";
import type { AnimationBackend, ClipName, PlayOptions } from "@/types/animation";
import type { BehaviorCommand, CharacterController, Emotion, Priority, RunResult, Vec3Like } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { useCompanionStore } from "@/stores/companionStore";
import { EmotionController, EMOTION_STYLE } from "@/engine/emotion/EmotionController";
import { clamp, damp } from "@/lib/math";

const SPEECH_TAP = ["oh! hi.", "hehe, that tickles.", "i'm awake, i'm awake!", "hello, you."];
const CAMERA = { x: 0, y: 1.2, z: 6 };
const WALK_SPEED = 0.45;

interface Job {
  id: number; label: string; priority: Priority; cmds: BehaviorCommand[]; i: number;
  resolve: (r: RunResult) => void;
  /** seconds left for the current step; null = waiting on an event (clip end / arrival) */
  wait: number | null;
}

/**
 * Backend-agnostic controller and the ONLY thing that plays clips.
 * All behaviour goes through run(commands, priority): a request is accepted when its priority is
 * >= the running job's, which is then interrupted. Lower priority requests are rejected.
 */
export class CharacterControllerImpl implements CharacterController {
  readonly emotions: EmotionController;
  private job: Job | null = null;
  private jobSeq = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0; private headPitch = 0;
  private moveTarget: number | null = null;
  private speechLeft = 0;
  private warned = new Set<string>();
  private tmp = new THREE.Vector3();
  private faceYaw = 0;
  private listeners = new Set<(name: string) => void>();
  /** resting loop override (e.g. "sitIdle" during a focus session); null = idle/sleep by emotion */
  restClip: ClipName | null = null;
  onSignal(fn: (name: string) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  constructor(private backend: AnimationBackend, private root: THREE.Object3D, private head: THREE.Object3D | null) {
    const s = useCompanionStore.getState();
    root.position.x = s.posX; root.rotation.y = s.facing;
    this.emotions = new EmotionController(s.emotion, (e) => this.applyEmotion(e));
    this.applyEmotion(s.emotion);
    this.settle(0);
  }

  /** priority of the running job (0 when idle) */
  get activePriority(): Priority { return this.job?.priority ?? 0; }
  get activeLabel() { return this.job?.label ?? null; }

  // ---------------- arbitration ----------------
  run(commands: BehaviorCommand[], priority: Priority, label = "job"): Promise<RunResult> {
    if (this.job && priority < this.job.priority) return Promise.resolve("rejected");
    if (this.job) this.endJob("interrupted", false);
    return new Promise<RunResult>((resolve) => {
      this.job = { id: ++this.jobSeq, label, priority, cmds: commands, i: -1, resolve, wait: 0 };
      useCompanionStore.getState().set({ behavior: priority >= PRIORITY.user ? "reacting" : "wandering" });
      this.next(this.job.id);
    });
  }

  private next(id: number) {
    const job = this.job;
    if (!job || job.id !== id) return; // stale callback from an interrupted job
    job.i++;
    const cmd = job.cmds[job.i];
    if (!cmd) { this.endJob("done", true); return; }
    job.wait = 0;
    switch (cmd.kind) {
      case "play": {
        const played = this.playAnimation(cmd.clip, { fallback: cmd.fallback, fade: cmd.fade, priority: job.priority, onFinished: () => this.next(id) });
        // loops (incl. fallback to idle) never finish on their own: hold for `hold` seconds
        job.wait = this.backend.isLoop(played) ? (cmd.hold ?? 0) : null;
        break;
      }
      case "moveTo":
        this.moveTarget = clamp(cmd.x, -1.6, 1.6);
        this.playAnimation("walk", { fade: 0.25, priority: job.priority });
        job.wait = null;
        break;
      case "lookAt": this.lookAt(cmd.target); break;
      case "say": this.say(cmd.text, cmd.seconds); break;
      case "emote": this.emotions.request(cmd.emotion, job.priority, cmd.hold); break;
      case "wait": job.wait = cmd.seconds; break;
      case "face": this.faceYaw = clamp(cmd.yaw, -1.4, 1.4); break;
      case "signal": this.listeners.forEach((l) => l(cmd.name)); break;
    }
    if (job.wait === 0 && this.job === job) this.next(id);
  }

  private endJob(result: RunResult, settle: boolean) {
    const job = this.job; if (!job) return;
    this.job = null;
    this.moveTarget = null;
    job.resolve(result);
    if (settle) this.settle(0.4);
  }

  /** back to the emotion-appropriate resting loop */
  private settle(fade: number) {
    this.lookAt(null);
    this.faceYaw = 0;
    const sleepy = this.emotions.emotion === "sleepy";
    this.playAnimation(sleepy ? "sleep" : this.restClip ?? "idle", { fade });
    useCompanionStore.getState().set({ behavior: sleepy ? "sleeping" : "idle" });
  }

  // ---------------- primitives ----------------
  /** Plays `name`, else the first available fallback, else "idle". Returns the clip actually played. */
  playAnimation(name: ClipName, opts: PlayOptions & { fallback?: ClipName[] } = {}): ClipName {
    const chain = [name, ...(opts.fallback ?? []), "idle"];
    const clip = chain.find((c) => this.backend.has(c));
    if (clip !== name && !this.warned.has(name)) { this.warned.add(name); console.warn(`[Tuck] clip "${name}" unavailable, using "${clip ?? "none"}"`); }
    if (!clip) return "idle";
    this.backend.play(clip, { fade: opts.fade, onFinished: opts.onFinished, priority: opts.priority });
    useCompanionStore.getState().set({ animation: clip });
    return clip;
  }

  setEmotion(e: Emotion, priority: Priority = PRIORITY.activity, hold?: number) {
    return this.emotions.request(e, priority, hold);
  }

  private applyEmotion(e: Emotion) {
    useCompanionStore.getState().set({ emotion: e });
    this.backend.setSpeed?.("blink", EMOTION_STYLE[e].blinkRate);
  }

  lookAt(target: Vec3Like | null) {
    this.lookTarget = target ? new THREE.Vector3(target.x, target.y, target.z) : null;
  }

  moveTo(pos: Vec3Like) { return this.run([{ kind: "moveTo", x: pos.x }], PRIORITY.activity, "moveTo"); }

  startConversation() {
    void this.run([
      { kind: "emote", emotion: "curious", hold: Infinity },
      { kind: "lookAt", target: CAMERA },
      { kind: "play", clip: "talk", hold: Infinity },
    ], PRIORITY.user, "conversation");
    useCompanionStore.getState().set({ behavior: "conversing" });
  }

  /** re-settle into the current resting loop if nothing is running (e.g. after restClip changes) */
  refreshRest() { if (!this.job) this.settle(0.5); }

  returnToIdle() {
    if (this.job) this.endJob("interrupted", false);
    this.settle(0.4);
  }

  react(kind: "tap") {
    if (kind !== "tap") return;
    const st = useCompanionStore.getState();
    st.set({ tapCount: st.tapCount + 1, lastInteraction: Date.now() });
    void this.run([
      { kind: "emote", emotion: "excited" },
      { kind: "lookAt", target: CAMERA },
      { kind: "say", text: SPEECH_TAP[st.tapCount % SPEECH_TAP.length] },
      { kind: "play", clip: "hop", fade: 0.08 },
      { kind: "play", clip: "happy", fade: 0.15 },
    ], PRIORITY.user, "tap");
  }

  say(text: string, seconds = 2.6) {
    this.speechLeft = seconds;
    useCompanionStore.getState().set({ speech: text });
  }

  // ---------------- frame tick ----------------
  update(dt: number) {
    const st = useCompanionStore.getState();
    this.emotions.update(dt);

    if (this.speechLeft > 0 && (this.speechLeft -= dt) <= 0) st.set({ speech: null });

    const job = this.job;
    if (job && job.wait !== null && job.wait > 0 && (job.wait -= dt) <= 0) this.next(job.id);

    // locomotion
    if (this.moveTarget !== null) {
      const dx = this.moveTarget - this.root.position.x;
      const dir = Math.sign(dx);
      this.root.rotation.y = damp(this.root.rotation.y, dir * (this.backend.walkYaw ?? 0.9), 8, dt);
      this.root.position.x += dir * Math.min(Math.abs(dx), WALK_SPEED * Math.max(0.35, this.emotions.style.speed || 0) * dt);
      if (Math.abs(dx) < 0.01) { this.moveTarget = null; if (this.job) this.next(this.job.id); }
    } else {
      this.root.rotation.y = damp(this.root.rotation.y, this.faceYaw, 4, dt);
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
