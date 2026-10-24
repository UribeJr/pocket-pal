import * as THREE from "three";
import type { AnimationBackend, ClipName, PlayOptions, Pose } from "@/types/animation";

/**
 * Backend for a real rigged GLB (Phase 1: implemented but unused until a model exists).
 * Uses THREE.AnimationMixer crossFadeTo for blended transitions between named clips.
 */
export class GltfBackend implements AnimationBackend {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private active: THREE.AnimationAction | null = null;
  private activeName: ClipName | null = null;
  private overlay: Pose = {};
  private finishCb: (() => void) | null = null;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], private bones: Record<string, THREE.Object3D> = {}, clipMap: Record<string, string> = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.actions.set(clipMap[c.name] ?? c.name, this.mixer.clipAction(c));
    this.mixer.addEventListener("finished", () => { const cb = this.finishCb; this.finishCb = null; cb?.(); });
  }
  has(name: ClipName) { return this.actions.has(name); }
  isLoop(name: ClipName) { return /idle|walk|talk|sleep/.test(name); }
  current() { return this.activeName; }
  setOverlay(pose: Pose) { this.overlay = pose; }
  play(name: ClipName, opts: PlayOptions = {}) {
    const next = this.actions.get(name);
    if (!next) return;
    const loopish = this.isLoop(name);
    next.reset().setLoop(loopish ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loopish;
    next.play();
    if (this.active && this.active !== next) this.active.crossFadeTo(next, opts.fade ?? 0.3, false);
    this.active = next; this.activeName = name; this.finishCb = opts.onFinished ?? null;
  }
  update(dt: number) {
    this.mixer.update(dt);
    // apply look-at overlay as an additive rotation on named bones (e.g. head)
    for (const [bone, off] of Object.entries(this.overlay)) {
      const obj = this.bones[bone]; if (!obj || !off?.r) continue;
      obj.rotation.x += off.r[0]; obj.rotation.y += off.r[1]; obj.rotation.z += off.r[2];
    }
  }
}
