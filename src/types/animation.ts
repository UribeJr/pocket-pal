/** Bones of the Tuck rig. A real GLB rig should expose nodes with these names (or map them). */
export type BoneName =
  | "root" | "body" | "head" | "cap" | "leaf" | "eyes"
  | "armL" | "armR" | "footL" | "footR";

export type Vec3 = [number, number, number];

/** Additive offset from a bone's rest transform. `s` is a delta from 1. */
export interface BoneOffset { p?: Vec3; r?: Vec3; s?: Vec3 }
export type Pose = Partial<Record<BoneName, BoneOffset>>;

/** Built-in clip names. Any string is allowed so new clips can be registered later. */
export type CoreClipName = "idle" | "breathe" | "blink" | "lookAround" | "walk" | "hop" | "happy" | "talk" | "sleep";
export type ClipName = CoreClipName | (string & {});

export interface ClipContext { speed: number }

export interface ProceduralClip {
  name: ClipName;
  /** base clips crossfade with each other; additive clips are layered on top (breathing, blinking). */
  layer: "base" | "additive";
  loop: boolean;
  /** seconds; used for one-shots to know when they end */
  duration: number;
  sample(t: number, ctx: ClipContext): Pose;
}

export interface PlayOptions {
  fade?: number;
  onFinished?: () => void;
  /** priority of the job asking (PRIORITY.*); lets a backend favour responsiveness for user taps */
  priority?: number;
}

/**
 * What the controller talks to. ProceduralBackend drives the primitive stand-in;
 * GltfBackend drives a rigged GLB's named AnimationClips. The controller never knows which.
 */
export interface AnimationBackend {
  has(name: ClipName): boolean;
  /** loops never fire onFinished */
  isLoop(name: ClipName): boolean;
  play(name: ClipName, opts?: PlayOptions): void;
  current(): ClipName | null;
  /** extra pose applied after clips (head look-at etc). */
  setOverlay(pose: Pose): void;
  update(dt: number): void;
  /** optional per-clip playback rate (e.g. blink frequency from emotion) */
  setSpeed?(name: ClipName, rate: number): void;
  /** optional root yaw while walking (radians, ± by direction); the controller defaults to 0.9 */
  readonly walkYaw?: number;
}
