"use client";
import { useEffect } from "react";
import { copy } from "@/lib/copy";
import { clock } from "@/engine/simulation/clock";
import { remainingMs, usePomodoro } from "@/companion/pomodoro";
import { startFocus } from "@/companion/conversation";
import { FocusIntent } from "./FocusIntent";

/** one primary action (Start / Pause / Resume) and two quiet ones (Reset, Skip) beneath the clock */
export function TimerControls() {
  const status = usePomodoro((s) => s.status);
  const phase = usePomodoro((s) => s.phase);
  const completedToday = usePomodoro((s) => s.completedToday);
  const pomo = usePomodoro.getState;

  const primary = () => {
    const p = pomo();
    if (p.status === "ready") { if (p.phase === "focus") void startFocus(); else p.start(); } else if (p.status === "running") p.pause(); else p.resume();
  };
  const reset = () => {
    const p = pomo();
    const elapsed = p.durationMs - remainingMs(p, clock.now());
    if (p.status !== "ready" && elapsed > 60_000 && !window.confirm(copy.controls.resetConfirm)) return;
    p.reset();
  };

  // keyboard: Space toggles, R resets, S skips (never while typing)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable))) return;
      if (e.key === " ") { e.preventDefault(); primary(); }
      else if (e.key === "r" || e.key === "R") reset();
      else if (e.key === "s" || e.key === "S") pomo().skip();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const label = status === "ready" ? (phase === "focus" ? copy.controls.start : copy.controls.startBreak) : status === "running" ? copy.controls.pause : copy.controls.resume;
  const aria = status === "ready" ? copy.controls.startLabel : status === "running" ? copy.controls.pauseLabel : copy.controls.resumeLabel;
  return (
    <div className="study-controls">
      <div className="flex items-center gap-1.5">
        <button type="button" className="btn btn-quiet" onClick={reset} aria-label={copy.controls.resetLabel} data-testid="focus-cancel" disabled={status === "ready" && phase === "focus"}>
          {copy.controls.reset}
        </button>
        <button type="button" className="btn btn-primary" onClick={primary} aria-label={aria} data-testid="focus-start">
          {label}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => pomo().skip()} aria-label={copy.controls.skipLabel} data-testid="focus-skip">
          {copy.controls.skip}
        </button>
      </div>
      <FocusIntent />
      <p className="sessions-line h-4 text-[12px] text-mute" aria-live="off">{completedToday > 0 ? copy.doneToday(completedToday) : ""}</p>
    </div>
  );
}
