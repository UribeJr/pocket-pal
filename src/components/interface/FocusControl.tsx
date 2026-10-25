"use client";
import { useEffect, useState } from "react";
import { PRESETS, fmtRemaining, phaseAt, useFocusStore } from "@/companion/focus";
import { clock } from "@/engine/simulation/clock";

function useFocusView() {
  const session = useFocusStore((s) => s.session);
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => { const id = setInterval(() => setNow(clock.now()), 500); return () => clearInterval(id); }, []);
  return { session, ...phaseAt(session, now) };
}

const LABEL = { focus: "focus", break: "break", done: "done", idle: "" } as const;

export function PresetPicker({ className = "" }: { className?: string }) {
  const start = useFocusStore((s) => s.start);
  const setPicker = useFocusStore((s) => s.setPicker);
  return (
    <div className={`flex items-center gap-1.5 ${className}`} data-testid="focus-presets">
      {PRESETS.map((m) => (
        <button key={m} data-testid={`focus-start-${m}`} onClick={() => start(m)}
          className="rounded-full bg-cream px-3 py-1.5 font-ui text-[13px] font-bold text-ink shadow">{m} min</button>
      ))}
      <button aria-label="Close timer presets" onClick={() => setPicker(false)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 font-ui text-[12px] text-cream/70">✕</button>
    </div>
  );
}

/** running readout: phase · m:ss · ✕ */
export function FocusReadout({ big }: { big?: boolean }) {
  const v = useFocusView();
  const cancel = useFocusStore((s) => s.cancel);
  if (v.phase === "idle") return null;
  return (
    <div data-testid="focus-readout" data-phase={v.phase} className={`flex items-center gap-2 rounded-full bg-night/70 font-ui text-cream backdrop-blur ${big ? "px-4 py-2 text-[15px]" : "px-3 py-1 text-[12px]"}`}>
      <span className="text-lamp/90">{v.phase === "focus" ? "⏳" : v.phase === "break" ? "☕" : "✓"} {LABEL[v.phase]}</span>
      {v.phase !== "done" && <span data-testid="focus-remaining" className="tabular-nums">{fmtRemaining(v.remainingMs)}</span>}
      {v.session && <span className="text-cream/40">· {v.session.minutes}m</span>}
      <button data-testid="focus-cancel" aria-label={v.phase === "done" ? "Dismiss timer" : "Stop focus session"} onClick={cancel} className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[11px] text-cream/70">✕</button>
    </div>
  );
}

/** Desk: one quiet control at bottom-centre. */
export function DeskFocusControl() {
  const v = useFocusView();
  const picker = useFocusStore((s) => s.picker);
  const setPicker = useFocusStore((s) => s.setPicker);
  if (v.phase !== "idle") return <FocusReadout />;
  if (picker) return <PresetPicker />;
  return (
    <button data-testid="focus-chip" onClick={() => setPicker(true)} className="rounded-full px-3 py-1 font-ui text-[12px] text-lamp/70 hover:text-lamp">⏲ Tea timer</button>
  );
}
