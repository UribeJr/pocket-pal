import * as THREE from "three";
import type { AnimationBackend, BoneName, ClipName, PlayOptions, Pose, ProceduralClip } from "@/types/animation";
import { getClip, hasClip } from "./registry";
import "./proceduralClips";
import "./livingClips";

interface Layer { clip: ProceduralClip; time: number; rate?: number; weight: number; target: number; fade: number; onFinished?: () => void; done?: boolean }
interface Rest { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }

/**
 * Drives named Object3D "bones" with procedural clips.
 * Base clips crossfade (weighted blend of offsets); additive clips stack on top.
 */
export class ProceduralBackend implements AnimationBackend {
  private bones = new Map<BoneName, THREE.Object3D>();
  private rest = new Map<BoneName, Rest>();
  private rootApplied = { px: 0, pz: 0, ry: 0 };
  private base: Layer[] = [];
  private additive: Layer[] = [];
  private overlay: Pose = {};
  private acc = new Map<BoneName, { p: number[]; r: number[]; s: number[] }>();

  constructor(bones: Partial<Record<BoneName, THREE.Object3D | null>>, additive: ClipName[] = ["breathe", "blink"]) {
    for (const [name, obj] of Object.entries(bones) as [BoneName, THREE.Object3D | null][]) {
      if (!obj) continue;
      this.bones.set(name, obj);
      this.rest.set(name, { p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() });
    }
    for (const n of additive) { const c = getClip(n); if (c) this.additive.push({ clip: c, time: Math.random() * 2, weight: 1, target: 1, fade: 0 }); }
  }

  has(name: ClipName) { return hasClip(name); }
  isLoop(name: ClipName) { return getClip(name)?.loop ?? true; }
  current() { const top = this.base[this.base.length - 1]; return top ? top.clip.name : null; }
  setOverlay(pose: Pose) { this.overlay = pose; }
  setSpeed(name: ClipName, rate: number) { for (const l of [...this.base, ...this.additive]) if (l.clip.name === name) l.rate = rate; }

  play(name: ClipName, opts: PlayOptions = {}) {
    const clip = getClip(name);
    if (!clip || clip.layer !== "base") return;
    const fade = opts.fade ?? 0.3;
    const top = this.base[this.base.length - 1];
    if (top && top.clip.name === name && clip.loop && !top.done) return;
    for (const l of this.base) { l.target = 0; l.fade = fade; }
    this.base.push({ clip, time: 0, weight: this.base.length ? 0 : 1, target: 1, fade, onFinished: opts.onFinished });
  }

  update(dt: number) {
    this.acc.clear();
    const step = (l: Layer) => {
      l.time += dt * (l.rate ?? 1);
      if (l.fade <= 0) l.weight = l.target; else {
        const d = dt / l.fade;
        l.weight = l.target > l.weight ? Math.min(l.target, l.weight + d) : Math.max(l.target, l.weight - d);
      }
      if (!l.clip.loop && !l.done && l.time >= l.clip.duration) {
        l.done = true; l.time = l.clip.duration;
        l.onFinished?.();
      }
    };
    this.base.forEach(step);
    this.additive.forEach(step);
    this.base = this.base.filter((l, i) => l.weight > 0.001 || l.target > 0 || i === this.base.length - 1);

    const ctx = { speed: 1 };
    const add = (pose: Pose, w: number) => {
      for (const [bone, off] of Object.entries(pose) as [BoneName, NonNullable<Pose[BoneName]>][]) {
        let a = this.acc.get(bone);
        if (!a) { a = { p: [0, 0, 0], r: [0, 0, 0], s: [0, 0, 0] }; this.acc.set(bone, a); }
        for (let i = 0; i < 3; i++) {
          if (off.p) a.p[i] += off.p[i] * w;
          if (off.r) a.r[i] += off.r[i] * w;
          if (off.s) a.s[i] += off.s[i] * w;
        }
      }
    };
    // normalise base weights so crossfades blend rather than sum
    const total = this.base.reduce((n, l) => n + l.weight, 0) || 1;
    for (const l of this.base) add(l.clip.sample(l.time, ctx), l.weight / total);
    for (const l of this.additive) add(l.clip.sample(l.time % (l.clip.loop ? 1e9 : l.clip.duration), ctx), l.weight);
    add(this.overlay, 1);

    for (const [name, obj] of this.bones) {
      const r = this.rest.get(name)!; const a = this.acc.get(name);
      if (name === "root") {
        // the controller owns root x/z position and yaw (locomotion, facing): keep them, layer clip offsets on top
        const prev = this.rootApplied; const o = a ?? { p: [0, 0, 0], r: [0, 0, 0], s: [0, 0, 0] };
        obj.position.set(obj.position.x - prev.px + o.p[0], r.p.y + o.p[1], obj.position.z - prev.pz + o.p[2]);
        obj.rotation.set(r.r.x + o.r[0], obj.rotation.y - prev.ry + o.r[1], r.r.z + o.r[2]);
        obj.scale.set(r.s.x * (1 + o.s[0]), r.s.y * (1 + o.s[1]), r.s.z * (1 + o.s[2]));
        this.rootApplied = { px: o.p[0], pz: o.p[2], ry: o.r[1] };
        continue;
      }
      if (!a) { obj.position.copy(r.p); obj.rotation.copy(r.r); obj.scale.copy(r.s); continue; }
      obj.position.set(r.p.x + a.p[0], r.p.y + a.p[1], r.p.z + a.p[2]);
      obj.rotation.set(r.r.x + a.r[0], r.r.y + a.r[1], r.r.z + a.r[2]);
      obj.scale.set(r.s.x * (1 + a.s[0]), r.s.y * (1 + a.s[1]), r.s.z * (1 + a.s[2]));
    }
  }
}
