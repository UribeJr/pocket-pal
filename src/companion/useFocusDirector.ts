"use client";
import { useEffect } from "react";
import { PRIORITY } from "@/types/companion";
import { getActiveController } from "@/engine/activeController";
import { flipHourglassCommands } from "@/engine/environment/EnvironmentRegistry";
import { clock } from "@/engine/simulation/clock";
import { phaseAt, useFocusStore } from "./focus";
import { triggerReaction } from "./reactions";

/**
 * Turns focus-timer phase changes into Tuck's behaviour. Phase is derived from timestamps every 500 ms;
 * `seen` (persisted) records what Tuck already performed, so reloads/rotation never replay a flip or cheer.
 */
export function directFocus() {
  const ctl = getActiveController(); if (!ctl) return;
  const st = useFocusStore.getState();
  const { phase } = phaseAt(st.session, clock.now());
  const rest = phase === "focus" ? "sitKnit" : null;
  const restChanged = ctl.restClip !== rest;
  if (restChanged) ctl.restClip = rest;

  if (phase === st.seen) {
    // steady state (e.g. after reload / rotation remount): just make sure he is seated and focused
    if (restChanged && phase === "focus") { ctl.setEmotion("focused", PRIORITY.system, Infinity); ctl.refreshRest(); }
    return;
  }
  const mins = st.session?.minutes ?? 25;
  if (phase === "focus") {
    st.markSeen("focus");
    void ctl.run([
      { kind: "emote", emotion: "focused", hold: Infinity },
      ...flipHourglassCommands(),
      { kind: "play", clip: "sitDown", fallback: ["idle"] },
    ], PRIORITY.system, "focus:start").then(() => triggerReaction("session_start", { minutes: mins }));
  } else if (phase === "break") {
    const wasSeated = st.seen === "focus";
    st.markSeen("break");
    const n = useFocusStore.getState().completedToday;
    void ctl.run([
      ...(wasSeated ? [{ kind: "play" as const, clip: "standUp", fallback: ["idle"] }] : []),
      { kind: "emote", emotion: "excited", hold: 4 },
      { kind: "lookAt", target: { x: 0, y: 1.2, z: 6 } },
      { kind: "play", clip: "happy", fallback: ["hop"] },
      { kind: "play", clip: "hop", fallback: ["happy"] },
      { kind: "play", clip: "happy", fallback: ["hop"] },
      { kind: "emote", emotion: "content" },
      { kind: "play", clip: "stretch", fallback: ["happy"] },
    ], PRIORITY.system, "focus:finish").then(async () => {
      await triggerReaction("session_end", { minutes: mins, sessionsToday: n }, { localIfSkipped: false });
      if (n === 3) await triggerReaction("memory_moment", { sessionsToday: n });
    });
  } else if (phase === "done") {
    st.markSeen("done");
    ctl.setEmotion("content", PRIORITY.system);
    void ctl.run([{ kind: "play", clip: "weightShift", fallback: ["idle"] }, { kind: "play", clip: "lookAround" }], PRIORITY.system, "focus:breakEnd")
      .then(() => triggerReaction("break_end"));
  } else {
    const wasSeated = st.seen === "focus";
    st.markSeen("idle");
    ctl.setEmotion("content", PRIORITY.system);
    if (wasSeated) void ctl.run([{ kind: "play", clip: "standUp", fallback: ["idle"] }], PRIORITY.system, "focus:end");
  }
}

export function useFocusDirector() {
  useEffect(() => {
    useFocusStore.getState().hydrate();
    const id = setInterval(directFocus, 500);
    const unsub = useFocusStore.subscribe((s, p) => { if (s.session !== p.session) directFocus(); });
    return () => { clearInterval(id); unsub(); };
  }, []);
}
