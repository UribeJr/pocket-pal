"use client";
import { create } from "zustand";
import type { BehaviorCommand, Emotion, Vec3Like } from "@/types/companion";
import type { ClipName } from "@/types/animation";
import { PRIORITY } from "@/types/companion";
import { copy } from "@/lib/copy";
import { getActiveController } from "@/engine/activeController";
import { useCompanionStore } from "@/stores/companionStore";
import { browserKV } from "./persist";
import { usePomodoro } from "./pomodoro";
import { useChatStore } from "./conversation";

const USER: Vec3Like = { x: 0, y: 1.2, z: 6 };
const KEY = "pocketpal:v1:tour";

/** one step of "Meet Tuck": what to ring on screen, where he looks, how he moves (text lives in copy.tour) */
export interface TourStep { target?: string; look: "user" | "clock" | "bottom" | "top"; emotion: Emotion; clip?: ClipName; reducedClip?: ClipName }

export const TOUR_STEPS: readonly TourStep[] = [
  { look: "user", emotion: "playful", clip: "wave", reducedClip: "wave" },
  { target: "task", look: "clock", emotion: "curious" },
  { target: "start", look: "clock", emotion: "excited", clip: "happy" },
  { target: "clock", look: "user", emotion: "excited", clip: "hop", reducedClip: "wave" },
  { target: "ask", look: "bottom", emotion: "curious" },
  { target: "top", look: "top", emotion: "content" },
  { look: "user", emotion: "excited", clip: "happy" },
];

/**
 * Where each look points, seen from Tuck (the clock column is to his right on desktop, above him on
 * phones). Points sit well in front of him, so it reads as a glance while his face stays to camera.
 */
function lookAt(look: TourStep["look"]): Vec3Like {
  const pocket = useCompanionStore.getState().layout === "pocket";
  if (look === "clock") return pocket ? { x: 0, y: 2.4, z: 3.5 } : { x: -1.4, y: 0.9, z: 3.5 };
  if (look === "bottom") return pocket ? { x: 0, y: -0.4, z: 3.5 } : { x: -1.4, y: 0.2, z: 3.5 };
  if (look === "top") return pocket ? { x: 0.9, y: 2.4, z: 3.5 } : { x: 1.2, y: 2.2, z: 3.5 };
  return USER;
}

/** pure: the controller commands for a step (he keeps talking until the user moves on) */
export function tourCommands(i: number, reduced = false, look: Vec3Like = USER): BehaviorCommand[] {
  const s = TOUR_STEPS[i];
  const clip = reduced ? s.reducedClip ?? (s.clip === "hop" ? "wave" : s.clip) : s.clip;
  return [
    { kind: "emote", emotion: s.emotion, hold: 600 },
    { kind: "lookAt", target: look },
    { kind: "say", text: copy.tour.steps[i].say, seconds: 600 },
    ...(clip ? [{ kind: "play" as const, clip, fallback: ["happy" as ClipName] }] : []),
    { kind: "wait", seconds: 600 },
  ];
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const tourSeen = (): boolean => { try { return browserKV()?.getItem(KEY) === "done"; } catch { return true; } };
const markSeen = () => { try { browserKV()?.setItem(KEY, "done"); } catch { /* private mode: it may show again */ } };

function act(i: number) {
  const ctl = getActiveController();
  if (!ctl) return;
  if (ctl.emotions.emotion === "sleepy") ctl.setEmotion("content", PRIORITY.system, 0);
  void ctl.run(tourCommands(i, reducedMotion(), lookAt(TOUR_STEPS[i].look)), PRIORITY.system, "tour");
}

interface TourState { step: number | null; start(): void; next(): void; end(): void }

/** "Meet Tuck": a scripted walkthrough Tuck gives himself (no AI calls). */
export const useTour = create<TourState>((set, get) => ({
  step: null,
  // the tour points at the Ask pill, so an open Ask panel steps aside first
  start() { useChatStore.getState().setOpen(false); set({ step: 0 }); useCompanionStore.getState().set({ lastInteraction: Date.now() }); act(0); },
  next() {
    const s = get().step;
    if (s === null) return;
    if (s >= TOUR_STEPS.length - 1) { get().end(); return; }
    set({ step: s + 1 }); act(s + 1);
  },
  end() {
    if (get().step === null) return;
    set({ step: null }); markSeen();
    useCompanionStore.getState().set({ speech: null });
    const ctl = getActiveController();
    if (ctl && ctl.activeLabel === "tour") ctl.returnToIdle();
  },
}));

/** first visit only, never mid-session, and not under automation (test suites start it explicitly) */
export function shouldAutoStartTour(): boolean {
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  return !tourSeen() && usePomodoro.getState().status === "ready";
}
