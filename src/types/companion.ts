import type { ClipName, PlayOptions } from "./animation";

export type Emotion = "neutral" | "happy" | "sleepy" | "curious";
export type LayoutMode = "desk" | "pocket";
export interface Vec3Like { x: number; y: number; z: number }

/** Stable contract for whatever drives Tuck (procedural stand-in today, rigged GLB later). */
export interface CharacterController {
  playAnimation(name: ClipName, opts?: PlayOptions): void;
  setEmotion(e: Emotion): void;
  lookAt(target: Vec3Like | null): void;
  moveTo(pos: Vec3Like): Promise<void>;
  startConversation(): void;
  returnToIdle(): void;
  /** convenience for interactions */
  react(kind: "tap"): void;
  update(dt: number): void;
}
