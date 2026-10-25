import * as THREE from "three";
import type { AnimationBackend, BoneName, ClipName, PlayOptions, Pose } from "@/types/animation";
import { PRIORITY } from "@/types/companion";
import { getClip, listClips } from "./registry";
import "./proceduralClips";
import "./livingClips";
import { bakeProcedural, limitHead } from "./gltf/bakeProcedural";
import { FaceDriver, type FaceMeta } from "./gltf/FaceDriver";
import { PoseGraph, type ClipMeta } from "./gltf/PoseGraph";

/** The GLB walk's planted foot slides back at exactly Pocket Pal's WALK_SPEED. */
export const WALK_CLIP_SPEED = 0.45;

export interface GltfRig {
  /** GLB scene clone: the mixer root */
  scene: THREE.Object3D;
  /** the controller-owned root group (moved and turned by CharacterControllerImpl; never animated here) */
  container: THREE.Object3D;
  /** app bone names -> GLB nodes (gltf/boneMap.ts) */
  bones: Record<BoneName, THREE.Object3D>;
  clips: THREE.AnimationClip[];
  clipMeta: Record<string, ClipMeta>;
  faceMeta: FaceMeta | null;
}

export interface GltfBackendOptions {
  /** app clip -> GLB clip (e.g. sitKnit -> sitIdle) */
  aliases?: Record<string, string>;
  walkYaw?: number;
  random?: () => number;
}

interface Layer { weight: number; target: number; rate: number }
interface Step { name: string; fade: number; via: string; onFinished?: () => void }

/**
 * Drives the approved GLB Tuck for the existing controller (same AnimationBackend contract as
 * ProceduralBackend, so the behavior engine never knows which renderer it talks to).
 *  - clips: the 13 GLB clips, legacy procedural clips the GLB lacks baked onto its nodes, and aliases
 *  - per-clip loop flags from the GLB metadata (not names), per-step onFinished
 *  - pose router: sitDown / standUp / wakeUp bridges and the 0.8 s doze fade so stances never pop;
 *    user-priority requests that stand Tuck up (a tap while he sleeps) crossfade directly to stay instant
 *  - head look-at overlay limited for the rig (excess to body), applied on a fresh base every frame
 *  - walk playback rate from the container's real speed, and a stall guard against walking in place
 *  - morph face (blink, expressions, visemes) applied after the mixer
 */
export class GltfBackend implements AnimationBackend {
  readonly mixer: THREE.AnimationMixer;
  readonly face: FaceDriver | null;
  readonly graph: PoseGraph;
  readonly walkYaw?: number;
  readonly meta: Record<string, ClipMeta> = {};
  readonly baked: string[] = [];
  readonly log: { t: number; name: string; fade: number; via: string }[] = [];
  private readonly aliases: Record<string, string>;
  private readonly actions = new Map<string, THREE.AnimationAction[]>();
  private readonly layers = new Map<THREE.AnimationAction, Layer>();
  private readonly restQ = new Map<THREE.Object3D, THREE.Quaternion>();
  private inCharge: { name: string; action: THREE.AnimationAction } | null = null;
  private requested: ClipName | null = null;
  private queue: Step[] = [];
  private finishCb: (() => void) | null = null;
  private deferred: (() => void)[] = [];
  private overlay: Pose = {};
  private clock = 0;
  // walk sync
  private readonly lastPos = new THREE.Vector3();
  private hasLast = false;
  private stillFor = 0;
  private stalled = false;

  constructor(private readonly rig: GltfRig, opts: GltfBackendOptions = {}) {
    this.aliases = opts.aliases ?? {};
    this.walkYaw = opts.walkYaw;
    this.mixer = new THREE.AnimationMixer(rig.scene);
    for (const c of rig.clips)
      this.register(c, rig.clipMeta[c.name] ?? { loop: getClip(c.name)?.loop ?? false, seconds: c.duration, start_pose: "STAND", end_pose: "STAND" });
    // legacy behaviors the GLB has no clip for keep their motion until a dedicated GLB clip exists
    for (const name of listClips()) {
      const pc = getClip(name)!;
      if (pc.layer !== "base" || this.meta[name] || name in this.aliases) continue;
      this.register(bakeProcedural(pc, rig.bones), { loop: pc.loop, seconds: pc.duration, start_pose: "STAND", end_pose: "STAND", kind: "baked" });
      this.baked.push(name);
    }
    this.graph = new PoseGraph(this.meta);
    this.face = rig.faceMeta ? new FaceDriver(rig.scene, rig.faceMeta, opts.random) : null;
    for (const o of Object.values(rig.bones)) this.restQ.set(o, o.quaternion.clone());
    this.mixer.addEventListener("finished", (e) => this.onFinished(e.action as THREE.AnimationAction));
  }

  private register(clip: THREE.AnimationClip, meta: ClipMeta) {
    this.meta[clip.name] = meta;
    // a twin lets a one-shot restart while its previous run is still fading out
    this.actions.set(clip.name, [this.mixer.clipAction(clip), this.mixer.clipAction(clip.clone())]);
  }

  private resolve(name: ClipName): string { return this.aliases[name] ?? name; }

  has(name: ClipName) { return this.actions.has(this.resolve(name)); }
  isLoop(name: ClipName) { return this.meta[this.resolve(name)]?.loop ?? getClip(name)?.loop ?? true; }
  current() { return this.requested; }
  setOverlay(pose: Pose) { this.overlay = pose; }

  setSpeed(name: ClipName, rate: number) {
    if (name === "blink") { if (this.face) this.face.blinkRate = rate; return; }
    for (const a of this.actions.get(this.resolve(name)) ?? []) a.timeScale = rate;
  }

  /** the pose Tuck is in, or is heading to with the step in charge */
  get pose(): string { return this.inCharge ? this.meta[this.inCharge.name]?.end_pose ?? "STAND" : "STAND"; }

  play(name: ClipName, opts: PlayOptions = {}) {
    const target = this.resolve(name);
    if (!this.actions.has(target)) return;
    const fade = opts.fade ?? 0.3;
    const meta = this.meta[target];
    // replaying the loop already on top is a no-op (ProceduralBackend semantics)
    if (this.requested === name && meta.loop && this.inCharge?.name === target && !this.queue.length && !this.stalled) return;
    this.requested = name;
    this.queue = [];
    this.finishCb = null;
    this.stalled = false;
    const from = this.pose;
    // already there: a stance change whose result is the current stance (standUp while standing)
    if (!meta.loop && meta.start_pose !== meta.end_pose && meta.end_pose === from) {
      if (opts.onFinished) this.deferred.push(opts.onFinished);
      this.note(name, 0, "skip");
      return;
    }
    const urgent = (opts.priority ?? 0) >= PRIORITY.user && meta.start_pose === "STAND" && from !== "STAND";
    const steps: Step[] = urgent ? [{ name: target, fade: Math.max(fade, 0.35), via: "urgent" }] : this.graph.route(from, target, fade);
    steps[steps.length - 1].onFinished = opts.onFinished;
    const [first, ...rest] = steps;
    this.queue = rest;
    this.start(first);
  }

  private start(step: Step, keepRequest = false) {
    const pair = this.actions.get(step.name)!;
    const busy = (a: THREE.AnimationAction) => (this.layers.get(a)?.weight ?? 0) > 0.001;
    const loop = this.meta[step.name].loop;
    let action = pair[0];
    let restart = true;
    if (busy(action)) {
      if (loop) restart = false; // a fading-out loop simply comes back, without jumping to t = 0
      else if (!busy(pair[1])) action = pair[1];
    }
    const rate = step.fade > 0 ? 1 / step.fade : Infinity;
    for (const [a, l] of this.layers) if (a !== action) { l.target = 0; l.rate = rate; }
    let layer = this.layers.get(action);
    if (restart) {
      action.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      action.play();
      const anyOn = [...this.layers.entries()].some(([a, l]) => a !== action && l.weight > 0.001);
      layer = { weight: anyOn ? (layer?.weight ?? 0) : 1, target: 1, rate };
      this.layers.set(action, layer);
    } else if (layer) {
      layer.target = 1;
      layer.rate = rate;
    }
    this.inCharge = { name: step.name, action };
    this.finishCb = step.onFinished ?? null;
    if (!keepRequest) this.note(step.name, step.fade, step.via);
  }

  private onFinished(action: THREE.AnimationAction) {
    if (action !== this.inCharge?.action) return; // a one-shot finishing while fading out is not news
    const cb = this.finishCb;
    const next = this.queue.shift();
    if (next) { this.start(next); return; }
    this.finishCb = null;
    cb?.();
  }

  private note(name: string, fade: number, via: string) {
    this.log.push({ t: +this.clock.toFixed(3), name, fade, via });
    if (this.log.length > 64) this.log.shift();
  }

  update(dt: number) {
    this.clock += dt;
    if (this.deferred.length) { const d = this.deferred; this.deferred = []; d.forEach((f) => f()); }
    this.syncWalk(dt);
    for (const [a, l] of this.layers) {
      const step = l.rate === Infinity ? Infinity : dt * l.rate; // instant fades must not become 0 * Infinity = NaN
      l.weight = l.target > l.weight ? Math.min(l.target, l.weight + step) : Math.max(l.target, l.weight - step);
      a.setEffectiveWeight(l.weight);
      if (l.weight <= 0 && l.target === 0) { a.stop(); this.layers.delete(a); }
    }
    // fresh base every frame: the overlay can never accumulate on a bone no clip writes
    for (const [o, q] of this.restQ) o.quaternion.copy(q);
    this.mixer.update(dt);
    this.applyOverlay();
    this.face?.update(dt);
  }

  private applyOverlay() {
    for (const [bone, off] of Object.entries(this.overlay) as [BoneName, NonNullable<Pose[BoneName]>][]) {
      if (!off.r) continue;
      if (bone === "head") {
        const split = limitHead({ head: { r: [...off.r] } });
        this.rotate("head", split.head!.r!);
        if (split.body?.r) this.rotate("body", split.body.r);
      } else this.rotate(bone, off.r);
    }
  }

  private rotate(bone: BoneName, r: readonly number[]) {
    const o = this.rig.bones[bone];
    if (!o) return;
    o.rotation.x += r[0]; o.rotation.y += r[1]; o.rotation.z += r[2];
  }

  /** walk rate follows the container's real speed along Tuck's facing; standing still swaps to idle */
  private syncWalk(dt: number) {
    const c = this.rig.container;
    const walk = this.actions.get("walk");
    if (!walk || dt <= 0) return;
    if (!this.hasLast) { this.lastPos.copy(c.position); this.hasLast = true; return; }
    const vx = (c.position.x - this.lastPos.x) / dt;
    const vz = (c.position.z - this.lastPos.z) / dt;
    this.lastPos.copy(c.position);
    const walking = this.requested !== null && this.resolve(this.requested) === "walk" && (this.inCharge?.name === "walk" || this.stalled);
    if (!walking) { for (const a of walk) a.timeScale = 1; this.stillFor = 0; return; }
    const speed = Math.hypot(vx, vz);
    if (speed < 0.02) {
      this.stillFor += dt;
      if (!this.stalled && this.stillFor > 0.15) {
        this.stalled = true;
        this.start({ name: this.graph.restLoop("STAND") ?? "idle", fade: 0.25, via: "stall" }, true);
      }
      return;
    }
    this.stillFor = 0;
    if (this.stalled) { this.stalled = false; this.start({ name: "walk", fade: 0.2, via: "resume" }, true); }
    const forward = vx * Math.sin(c.rotation.y) + vz * Math.cos(c.rotation.y);
    for (const a of walk) a.timeScale = THREE.MathUtils.clamp(forward / WALK_CLIP_SPEED, 0.3, 1.6);
  }

  /** for the e2e scripts and the dev overlay */
  debug() {
    return {
      requested: this.requested, inCharge: this.inCharge?.name ?? null, time: this.inCharge?.action.time ?? 0, pose: this.pose, queue: this.queue.map((s) => s.name),
      stalled: this.stalled, walkTimeScale: this.actions.get("walk")?.[0].timeScale ?? null,
      layers: [...this.layers.entries()].map(([a, l]) => ({ clip: a.getClip().name, weight: +l.weight.toFixed(3) })),
      baked: this.baked, log: this.log.slice(-12), face: this.face ? { face: this.face.face, speaking: this.face.speaking, influences: this.face.influences() } : null,
    };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig.scene);
    this.layers.clear();
    this.queue = [];
    this.finishCb = null;
  }
}
