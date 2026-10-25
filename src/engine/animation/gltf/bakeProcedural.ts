import * as THREE from "three";
import type { BoneName, Pose, ProceduralClip, Vec3 } from "@/types/animation";

/** The GLB body mesh hangs from `head`, so head turns past this make the shoulders gap; the excess goes to `body`. */
export const HEAD_LIMIT = { pitch: 0.25, yaw: 0.3, roll: 0.3 };

/**
 * Rig-safety split for the GLB: keep the head within HEAD_LIMIT and give the rest of the rotation to
 * `body`, which carries arms and head together. Mutates and returns the pose offsets.
 */
export function limitHead(pose: Pose): Pose {
  const r = pose.head?.r;
  if (!r) return pose;
  const lim = [HEAD_LIMIT.pitch, HEAD_LIMIT.yaw, HEAD_LIMIT.roll];
  const head = r.map((v, i) => THREE.MathUtils.clamp(v, -lim[i], lim[i])) as Vec3;
  const extra = r.map((v, i) => v - head[i]) as Vec3;
  pose.head = { ...pose.head, r: head };
  if (extra.some((v) => v !== 0)) {
    const b = pose.body?.r ?? [0, 0, 0];
    pose.body = { ...pose.body, r: [b[0] + extra[0], b[1] + extra[1], b[2] + extra[2]] };
  }
  return pose;
}

/**
 * Bake a legacy procedural clip into a THREE.AnimationClip on the GLB's bone nodes. The GLB rig was
 * built so Pocket Pal's offsets apply 1:1 to its nodes (position = rest + p, rotation = rest Euler + r,
 * scale = rest * (1 + s)), exactly as ProceduralBackend applies them to the stand-in groups.
 * Every bone is keyed (so the look-at overlay always has a fresh base); `eyes` scale is dropped
 * because the face belongs to morph targets.
 */
export function bakeProcedural(clip: ProceduralClip, bones: Partial<Record<BoneName, THREE.Object3D>>, fps = 30): THREE.AnimationClip {
  const n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(n);
  const entries = Object.entries(bones).filter(([, o]) => !!o) as [BoneName, THREE.Object3D][];
  const rest = entries.map(([, o]) => ({ p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }));
  const pos = entries.map(() => new Float32Array(n * 3));
  const quat = entries.map(() => new Float32Array(n * 4));
  const scl = entries.map(() => new Float32Array(n * 3));
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, (i / (n - 1)) * clip.duration);
    times[i] = t;
    const pose = limitHead(structuredClone(clip.sample(t, { speed: 1 })));
    entries.forEach(([name], k) => {
      const off = pose[name] ?? {};
      const R = rest[k];
      const p = off.p ?? [0, 0, 0];
      const r = off.r ?? [0, 0, 0];
      const s = name === "eyes" ? [0, 0, 0] : off.s ?? [0, 0, 0];
      pos[k].set([R.p.x + p[0], R.p.y + p[1], R.p.z + p[2]], i * 3);
      q.setFromEuler(e.set(R.r.x + r[0], R.r.y + r[1], R.r.z + r[2], R.r.order));
      quat[k].set([q.x, q.y, q.z, q.w], i * 4);
      scl[k].set([R.s.x * (1 + s[0]), R.s.y * (1 + s[1]), R.s.z * (1 + s[2])], i * 3);
    });
  }
  const tracks: THREE.KeyframeTrack[] = [];
  entries.forEach(([, obj], k) => {
    tracks.push(new THREE.VectorKeyframeTrack(`${obj.name}.position`, times, pos[k]));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${obj.name}.quaternion`, times, quat[k]));
    tracks.push(new THREE.VectorKeyframeTrack(`${obj.name}.scale`, times, scl[k]));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
