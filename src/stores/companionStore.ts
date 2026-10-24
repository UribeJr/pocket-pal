"use client";
import { create } from "zustand";
import type { Emotion, LayoutMode } from "@/types/companion";
import type { BehaviorState } from "@/types/behavior";
import type { ClipName } from "@/types/animation";

/**
 * Single source of truth that survives orientation / layout switches.
 * The 3D scene reads its initial state from here when (re)mounted.
 */
interface CompanionState {
  emotion: Emotion;
  animation: ClipName;
  behavior: BehaviorState;
  /** Tuck's x position on the shelf (world units) and facing */
  posX: number;
  facing: number;
  tapCount: number;
  lastInteraction: number;
  speech: string | null;
  layout: LayoutMode;
  set: (p: Partial<Omit<CompanionState, "set">>) => void;
}

export const useCompanionStore = create<CompanionState>((set) => ({
  emotion: "content",
  animation: "idle",
  behavior: "idle",
  posX: 0.9,
  facing: 0,
  tapCount: 0,
  lastInteraction: 0,
  speech: null,
  layout: "desk",
  set: (p) => set(p),
}));
