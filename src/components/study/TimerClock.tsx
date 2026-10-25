"use client";
import { copy } from "@/lib/copy";
import { endsAt, fmtClock, remainingMs, usePomodoro } from "@/companion/pomodoro";
import { useSecondTicker } from "@/companion/useTicker";

/**
 * The large countdown (the mockup's left column). Only this component re-renders each second.
 * Screen readers get the phase via the label and announcements at phase changes, not every tick.
 */
export function TimerClock() {
  const phase = usePomodoro((s) => s.phase);
  const status = usePomodoro((s) => s.status);
  const focusDone = usePomodoro((s) => s.focusDone);
  const longEvery = usePomodoro((s) => s.settings.longEvery);
  const p = usePomodoro.getState();
  const now = useSecondTicker(status === "running", endsAt(p));
  const text = fmtClock(remainingMs(p, now));
  const label = phase === "focus" ? `${copy.phase.focus} · ${copy.cycle(Math.min(focusDone + 1, longEvery), longEvery)}` : copy.phase[phase];
  return (
    <div className="study-clock" data-testid="focus-readout" data-phase={status === "ready" ? (phase === "focus" ? "idle" : "break") : phase === "focus" ? "focus" : "break"} data-status={status}>
      <p className="clock-phase fade-in" key={`${phase}-${status}`}>
        {label}{status === "paused" ? ` · ${copy.status.paused}` : ""}
      </p>
      <div role="timer" aria-label={`${copy.phase[phase]}: ${text} remaining`} className="clock-digits" data-testid="focus-remaining">
        {text}
      </div>
    </div>
  );
}
