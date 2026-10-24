import type { ClipName, PlayOptions } from "./animation";

/** Emotional states (Living Companion Phase 1). Mapped onto the 4 existing faces by EmotionController. */
export type Emotion = "content" | "curious" | "playful" | "sleepy" | "excited" | "surprised" | "focused";
/** The 4 faces the stand-in (and later the GLB) can actually show. */
export type Face = "neutral" | "happy" | "sleepy" | "curious";
export type LayoutMode = "desk" | "pocket";
export interface Vec3Like { x: number; y: number; z: number }

/** 0 ambient · 1 autonomous activity · 2 user interaction · 3 system (wake / return). */
export type Priority = 0 | 1 | 2 | 3;
export const PRIORITY = { ambient: 0, activity: 1, user: 2, system: 3 } as const;

export type BehaviorCommand =
  /** one-shots wait for the clip to finish; loops hold for `hold` seconds (default 0) */
  | { kind: "play"; clip: ClipName; fallback?: ClipName[]; hold?: number; fade?: number }
  | { kind: "moveTo"; x: number }
  | { kind: "lookAt"; target: Vec3Like | null }
  | { kind: "wait"; seconds: number }
  | { kind: "say"; text: string; seconds?: number }
  | { kind: "emote"; emotion: Emotion; hold?: number };

export type RunResult = "done" | "interrupted" | "rejected";

/** Stable contract for whatever drives Tuck (procedural stand-in today, rigged GLB later). */
export interface CharacterController {
  /** Arbitrated entry point: accepted if priority >= the running activity's priority. */
  run(commands: BehaviorCommand[], priority: Priority, label?: string): Promise<RunResult>;
  playAnimation(name: ClipName, opts?: PlayOptions & { fallback?: ClipName[] }): ClipName;
  setEmotion(e: Emotion, priority?: Priority, hold?: number): boolean;
  lookAt(target: Vec3Like | null): void;
  moveTo(pos: Vec3Like): Promise<RunResult>;
  startConversation(): void;
  returnToIdle(): void;
  react(kind: "tap"): void;
  update(dt: number): void;
}
