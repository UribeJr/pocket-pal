"use client";
import { useEffect } from "react";
import type { BehaviorCommand, Vec3Like } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import type { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { getActiveController } from "@/engine/activeController";
import { useCompanionStore } from "@/stores/companionStore";
import { copy, pickLine } from "@/lib/copy";
import { onPomodoroEvents, usePomodoro, type PomoEvent, type PomoEventType } from "./pomodoro";
import { useChatStore } from "./conversation";

const USER: Vec3Like = { x: 0, y: 1.2, z: 6 };
/** where the clock is, seen from Tuck: to his right in the two-column layout, above him on phones */
export const clockTarget = (): Vec3Like => (useCompanionStore.getState().layout === "pocket" ? { x: 0, y: 1.9, z: 2.2 } : { x: -1.7, y: 0.75, z: 0.9 });
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** most meaningful first: after a long absence only one moment is acted out */
const RANK: PomoEventType[] = ["focusCompleted", "breakCompleted", "focusStarted", "breakStarted", "focusSkipped", "breakSkipped", "reset", "resumed", "paused"];

/** pure: the controller jobs for a batch of timer events (exported for tests) */
export function studyMoment(events: PomoEvent[], opts: { reduced?: boolean; rand?: () => number; clock?: Vec3Like } = {}): { label: string; cmds: BehaviorCommand[]; emotionAfter?: "focused" } | null {
  const rand = opts.rand ?? Math.random;
  const clock = opts.clock ?? { x: -1.7, y: 0.75, z: 0.9 };
  const top = RANK.find((t) => events.some((e) => e.type === t));
  if (!top) return null;
  const cycle = events.some((e) => e.type === "focusCompleted" && e.cycleCompleted);
  switch (top) {
    case "focusStarted":
      // a small "let's go": glance at the timer, a little happy wiggle, then sit down to study
      return { label: "study:focusStart", emotionAfter: "focused", cmds: [
        { kind: "emote", emotion: "curious", hold: 3 },
        { kind: "lookAt", target: clock },
        { kind: "say", text: pickLine(copy.tuck.focusStart, rand), seconds: 2.6 },
        { kind: "play", clip: "happy", fallback: ["idle"] },
        { kind: "emote", emotion: "focused", hold: Infinity },
        { kind: "play", clip: "sitDown", fallback: ["idle"] },
      ] };
    case "focusCompleted":
      // gentle celebration, then the break's playfulness takes over (behavior engine "break" set)
      return { label: "study:focusDone", cmds: [
        { kind: "play", clip: "standUp", fallback: ["idle"] },
        { kind: "emote", emotion: "excited", hold: 4 },
        { kind: "lookAt", target: USER },
        { kind: "say", text: pickLine(cycle ? copy.tuck.cycleDone : copy.tuck.focusDone, rand), seconds: 3 },
        { kind: "play", clip: opts.reduced ? "wave" : rand() < 0.5 ? "hop" : "wave", fallback: ["happy"] },
        { kind: "emote", emotion: "playful", hold: 10 },
        ...(cycle ? [{ kind: "play" as const, clip: "stretch", fallback: ["happy"] }] : []),
      ] };
    case "breakStarted":
      return { label: "study:break", cmds: [
        { kind: "play", clip: "standUp", fallback: ["idle"] },
        { kind: "emote", emotion: "playful", hold: 8 },
        { kind: "play", clip: "stretch", fallback: ["happy"] },
      ] };
    case "breakCompleted":
      return { label: "study:breakOver", cmds: [
        { kind: "emote", emotion: "content" },
        { kind: "lookAt", target: clock },
        { kind: "say", text: pickLine(copy.tuck.breakOver, rand), seconds: 2.4 },
        { kind: "play", clip: "weightShift", fallback: ["idle"] },
      ] };
    case "paused":
      return { label: "study:paused", cmds: [{ kind: "emote", emotion: "content" }, { kind: "lookAt", target: USER }, { kind: "wait", seconds: 1.5 }] };
    case "resumed":
      return { label: "study:resumed", emotionAfter: "focused", cmds: [{ kind: "emote", emotion: "focused", hold: Infinity }, { kind: "lookAt", target: clock }, { kind: "wait", seconds: 1 }] };
    default: // skips and resets: back to a calm, standing Tuck (the pose router stands him up if seated)
      return { label: "study:reset", cmds: [{ kind: "emote", emotion: "content" }, { kind: "play", clip: "standUp", fallback: ["idle"] }] };
  }
}

/** Tuck sits to study while a focus session runs or is paused; otherwise his resting loop is idle */
export function restFor(phase: string, status: string): string | null {
  return phase === "focus" && status !== "ready" ? "sitKnit" : null;
}

let pending: PomoEvent[] = [];

function syncRest(ctl: CharacterControllerImpl) {
  const p = usePomodoro.getState();
  const rest = restFor(p.phase, p.status);
  if (ctl.restClip === rest) return;
  ctl.restClip = rest;
  // e.g. reload mid-session: no event to act out, just settle him back into his seat
  if (rest && ctl.activePriority === PRIORITY.ambient) { ctl.setEmotion("focused", PRIORITY.system, Infinity); ctl.refreshRest(); }
}

/** perform waiting timer moments (called on events and polled until the controller exists) */
export function directStudy() {
  const ctl = getActiveController() as CharacterControllerImpl | null;
  if (!ctl) return;
  const fresh = pending;
  pending = [];
  // rest first, so a job's settle lands in the right loop (seated during focus)
  syncRest(ctl);
  if (!fresh.length) return;
  const st = usePomodoro.getState();
  const unseen = fresh.filter((e) => e.id > st.acted);
  if (!unseen.length) return;
  useCompanionStore.getState().set({ lastInteraction: Date.now() });
  const m = studyMoment(unseen, { reduced: reducedMotion(), clock: clockTarget() });
  st.markActed(Math.max(...unseen.map((e) => e.id)));
  if (!m) return;
  const chat = useChatStore.getState();
  // with a task, Tuck's own goal line follows from the AI: skip the generic "let's focus" line
  if (m.label === "study:focusStart" && chat.task.trim()) m.cmds = m.cmds.filter((c) => c.kind !== "say");
  // a finished focus session with a goal: ask "did you finish?"
  if (unseen.some((e) => e.type === "focusCompleted") && chat.goal) useChatStore.setState({ checkinOpen: true });
  if (unseen.some((e) => e.type === "focusStarted" || e.type === "reset")) useChatStore.setState({ checkinOpen: false });
  if (ctl.emotions.emotion === "sleepy") ctl.setEmotion("content", PRIORITY.system, 0);
  void ctl.run(m.cmds, PRIORITY.system, m.label).then(() => {
    if (m.emotionAfter) ctl.setEmotion(m.emotionAfter, PRIORITY.system, Infinity);
  });
}

/** Tuck follows the study session: events drive moments, the session phase sets his resting loop. */
export function useStudyDirector() {
  useEffect(() => {
    useCompanionStore.getState().set({ lastInteraction: Date.now() }); // opening the app counts as being here
    const off = onPomodoroEvents((events) => { pending.push(...events); directStudy(); });
    const id = setInterval(directStudy, 500);
    return () => { off(); clearInterval(id); };
  }, []);
}
