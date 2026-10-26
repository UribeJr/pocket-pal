"use client";
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { clock } from "@/engine/simulation/clock";
import { copy } from "@/lib/copy";
import { endsAt, fmtClock, minutesOf, onPomodoroEvents, remainingMs, syncAcrossTabs, usePomodoro, type PomoEvent } from "./pomodoro";
import { useSettings } from "./settings";

/**
 * Keeps the Pomodoro honest: hydrate once, wake exactly at the next phase boundary, poll gently as a
 * safety net, and resolve again whenever the page becomes visible, is restored, or regains focus (covers
 * background throttling and system sleep). Nothing here counts time; it only asks "what time is it now".
 */
export function usePomodoroRuntime() {
  useEffect(() => {
    const settings = useSettings.getState().hydrate();
    usePomodoro.getState().hydrate(settings);
    const unsync = syncAcrossTabs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const p = usePomodoro.getState();
      const end = endsAt(p);
      const poll = p.status === "ready" ? 15_000 : 1_000;
      const wait = end === null ? poll : Math.min(poll, Math.max(20, end - clock.now() + 5));
      timer = setTimeout(() => { usePomodoro.getState().tick(); schedule(); }, wait);
    };
    schedule();
    const unsub = usePomodoro.subscribe((s, p) => { if (s.status !== p.status || s.startedAt !== p.startedAt || s.pausedMs !== p.pausedMs) schedule(); });
    const unsubSettings = useSettings.subscribe((s, p) => { if (s.settings !== p.settings) usePomodoro.getState().setSettings(s.settings); });
    const wake = () => { if (document.visibilityState !== "hidden") { usePomodoro.getState().tick(); schedule(); } };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearTimeout(timer); unsync(); unsub(); unsubSettings();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);
}

/**
 * Re-render once per second while `active`. With `alignTo` (a countdown's end time) the re-render lands
 * just after each displayed second changes, so the clock never shows a stale digit.
 */
export function useSecondTicker(active: boolean, alignTo: number | null = null): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (!active) { setNow(clock.now()); return; }
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const n = clock.now(); setNow(n);
      const phase = alignTo === null ? n % 1000 : (1000 - ((alignTo - n) % 1000 + 1000) % 1000) % 1000;
      t = setTimeout(step, 1000 - phase + 8);
    };
    step();
    return () => clearTimeout(t);
  }, [active, alignTo]);
  return now;
}

/** tab title while running, opt-in notification + chime at phase ends, and a screen-reader announcement */
export function usePomodoroAlerts(announce: (text: string) => void) {
  const status = usePomodoro((s) => s.status);
  const now = useSecondTicker(status === "running");
  const p = usePomodoro.getState();
  useEffect(() => {
    const base = `${copy.app.name} · ${copy.app.tagline}`;
    document.title = p.status === "ready" ? base : `${fmtClock(remainingMs(p, now))} · ${copy.phase[p.phase]}${p.status === "paused" ? ` (${copy.status.paused})` : ""}`;
  }, [now, p]);
  useEffect(() => onPomodoroEvents((events: PomoEvent[]) => {
    const s = useSettings.getState().settings;
    const last = events[events.length - 1];
    if (!last) return;
    if (events.some((e) => e.type === "focusStarted")) {
      // counts only, never user text
      try { track("session_started", { phase: "focus", session: usePomodoro.getState().focusDone + 1, focus_minutes: minutesOf("focus", s) }); } catch { /* analytics is best-effort */ }
    }
    const ended = events.some((e) => e.type === "focusCompleted" || e.type === "breakCompleted");
    const line = textFor(last, s);
    if (line) announce(line);
    if (ended && s.sound) chime();
    if (ended && s.notify && document.visibilityState === "hidden") {
      const focusDone = events.some((e) => e.type === "focusCompleted");
      const n = focusDone ? copy.notify.focusDone : copy.notify.breakDone;
      try { if ("Notification" in window && Notification.permission === "granted") new Notification(n.title, { body: n.body, icon: "/icons/icon-192.png", tag: "pocketpal-timer" }); } catch { /* unsupported (e.g. iOS Safari tabs) */ }
    }
  }), [announce]);
}

function textFor(e: PomoEvent, s: ReturnType<typeof useSettings.getState>["settings"]): string | null {
  switch (e.type) {
    case "focusStarted": return copy.announce.focusStarted(minutesOf("focus", s));
    case "breakStarted": return copy.announce.breakStarted(e.phase === "long", minutesOf(e.phase, s));
    case "focusCompleted": return copy.announce.focusCompleted;
    case "breakCompleted": return copy.announce.breakCompleted;
    case "paused": return copy.announce.paused;
    case "resumed": return copy.announce.resumed;
    case "reset": return copy.announce.reset;
    default: return null;
  }
}

/** a soft two-note chime (Web Audio, no asset) */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [[660, 0], [880, 0.18]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime + at);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.9);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 1);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* audio unavailable */ }
}
