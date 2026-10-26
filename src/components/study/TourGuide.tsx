"use client";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { getActiveController } from "@/engine/activeController";
import { useCompanionStore } from "@/stores/companionStore";
import { shouldAutoStartTour, TOUR_STEPS, useTour } from "@/companion/tour";

/**
 * "Meet Tuck": Tuck explains the app in his own bubble while a soft ring marks what he's talking about.
 * This card holds the controls (and repeats his line for screen readers). It starts by itself once,
 * on the first visit, when Tuck has loaded and no session is running.
 */
export function TourGuide() {
  const step = useTour((s) => s.step);
  const next = useRef<HTMLButtonElement>(null);
  /** phones: when the ring is in the bottom half, the card floats just above it (px from the bottom) */
  const [above, setAbove] = useState<number | null>(null);

  // first visit: wait for Tuck to load, then offer the tour
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      if (getActiveController() || ++tries > 60) {
        clearInterval(id);
        if (getActiveController() && shouldAutoStartTour()) setTimeout(() => { if (useTour.getState().step === null && shouldAutoStartTour()) useTour.getState().start(); }, 1200);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ring the element Tuck is talking about; keep the card clear of it
  useEffect(() => {
    if (step === null) return;
    const target = TOUR_STEPS[step].target;
    const els = target ? [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)] : [];
    els.forEach((el) => el.classList.add("tour-ring"));
    // on phones the card docks at the bottom, or just above the ring when that's where the ring is; on
    // desktop it sits under Tuck, clear of the left column, so it never moves (or covers his bubble)
    const r = els[0]?.getBoundingClientRect();
    const low = useCompanionStore.getState().layout === "pocket" && !!r && r.top + r.height / 2 > window.innerHeight * 0.55;
    setAbove(low && r ? Math.round(window.innerHeight - r.top + 14) : null);
    next.current?.focus({ preventScroll: true });
    return () => els.forEach((el) => el.classList.remove("tour-ring"));
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); useTour.getState().end(); } };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [step]);

  if (step === null) return null;
  const last = step === TOUR_STEPS.length - 1;
  const { next: go, end } = useTour.getState();
  return (
    <div role="dialog" aria-label={copy.tour.label} aria-describedby="tour-line" className="tour-card fade-in" style={above !== null ? { bottom: above } : undefined} data-testid="tour">
      <p id="tour-line" className="sr-only" aria-live="polite">{copy.tour.steps[step].say}</p>
      {step === 0 ? (
        <>
          <button type="button" className="btn btn-quiet" onClick={end} data-testid="tour-skip">{copy.tour.notNow}</button>
          <button ref={next} type="button" className="btn btn-primary" onClick={go} data-testid="tour-next">{copy.tour.start}</button>
        </>
      ) : (
        <>
          {!last && <button type="button" className="btn btn-quiet" onClick={end} data-testid="tour-skip">{copy.tour.skip}</button>}
          <span className="tour-progress" aria-hidden="true">{copy.tour.progress(step, TOUR_STEPS.length - 1)}</span>
          <button ref={next} type="button" className="btn btn-primary" onClick={go} data-testid="tour-next">{last ? copy.tour.done : copy.tour.next}</button>
        </>
      )}
    </div>
  );
}
