"use client";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { useTour } from "@/companion/tour";
import { useSettings, type StudySettings } from "@/companion/settings";
import { useChatStore } from "@/companion/conversation";
import { useCompanionStore } from "@/stores/companionStore";
import { useDialog } from "./useDialog";

type NumKey = "focusMin" | "shortMin" | "longMin" | "longEvery";
const LIMITS: Record<NumKey, [number, number]> = { focusMin: [1, 120], shortMin: [1, 60], longMin: [1, 90], longEvery: [2, 8] };

function Stepper({ k, label, unit }: { k: NumKey; label: string; unit: string }) {
  const value = useSettings((s) => s.settings[k]);
  const [lo, hi] = LIMITS[k];
  const set = (v: number) => useSettings.getState().update({ [k]: Math.min(hi, Math.max(lo, Math.round(v))) } as Partial<StudySettings>);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[15px]">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="icon-btn !h-9 !w-9" aria-label={`${label}: less`} onClick={() => set(value - 1)} disabled={value <= lo}>−</button>
        <input className="field !min-h-9 w-14 !px-2 text-center tabular-nums" inputMode="numeric" aria-label={`${label} (${unit})`} data-testid={`setting-${k}`}
          value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) set(n); }} />
        <button type="button" className="icon-btn !h-9 !w-9" aria-label={`${label}: more`} onClick={() => set(value + 1)} disabled={value >= hi}>+</button>
        <span className="w-16 text-[13px] text-mute">{unit}</span>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testid }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testid?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="flex flex-col"><span className="text-[15px]">{label}</span>{hint && <span className="text-[12px] text-mute">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="h-5 w-5 accent-[#5F7759]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
    </label>
  );
}

/** Minimal settings: timer lengths, auto-start, opt-in alerts, and the existing memory controls. */
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const s = useSettings((st) => st.settings);
  const layout = useCompanionStore((st) => st.layout);
  const ref = useDialog<HTMLDivElement>(onClose);
  const [blocked, setBlocked] = useState(false);
  const toggleNotify = async (on: boolean) => {
    if (!on) { useSettings.getState().update({ notify: false }); return; }
    try {
      if (!("Notification" in window)) { setBlocked(true); return; }
      const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (perm !== "granted") { setBlocked(true); return; }
      useSettings.getState().update({ notify: true });
    } catch { setBlocked(true); }
  };
  const place = layout === "desk"
    ? "right-[max(env(safe-area-inset-right),0.75rem)] top-[calc(max(env(safe-area-inset-top),0.5rem)+48px)] w-[min(360px,92vw)] max-h-[80vh]"
    : "inset-x-0 bottom-0 rounded-b-none max-h-[78vh] pb-[max(env(safe-area-inset-bottom),1rem)]";
  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(60,55,50,0.12)] fade-in" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="settings-sheet"
        className={`panel fade-up fixed z-40 flex flex-col overflow-y-auto px-5 py-4 ${place}`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 id="settings-title" className="text-[17px] font-medium">{copy.settings.title}</h2>
          <button type="button" className="icon-btn" aria-label={copy.settings.close} onClick={onClose}>✕</button>
        </div>
        <h3 className="mt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-sage-deep">{copy.settings.timer}</h3>
        <Stepper k="focusMin" label={copy.settings.focusMin} unit={copy.settings.minutes} />
        <Stepper k="shortMin" label={copy.settings.shortMin} unit={copy.settings.minutes} />
        <Stepper k="longMin" label={copy.settings.longMin} unit={copy.settings.minutes} />
        <Stepper k="longEvery" label={copy.settings.longEvery} unit={copy.settings.sessions} />
        <Toggle label={copy.settings.autoStartBreaks} checked={s.autoStartBreaks} onChange={(v) => useSettings.getState().update({ autoStartBreaks: v })} testid="setting-autoStartBreaks" />
        <Toggle label={copy.settings.autoStartFocus} checked={s.autoStartFocus} onChange={(v) => useSettings.getState().update({ autoStartFocus: v })} testid="setting-autoStartFocus" />
        <h3 className="mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-sage-deep">{copy.settings.alerts}</h3>
        <Toggle label={copy.settings.notify} hint={blocked ? copy.settings.notifyBlocked : copy.settings.notifyHint} checked={s.notify} onChange={(v) => void toggleNotify(v)} />
        <Toggle label={copy.settings.sound} checked={s.sound} onChange={(v) => useSettings.getState().update({ sound: v })} />
        <h3 className="mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-sage-deep">{copy.settings.memory}</h3>
        <button type="button" className="btn mt-1 justify-start self-start border-line !px-4" style={{ borderColor: "#CFCAC2" }} data-testid="memory-open"
          onClick={() => { onClose(); useChatStore.setState({ sheet: true }); }}>
          {copy.settings.memoryOpen}
        </button>
        <button type="button" className="btn mt-2 justify-start self-start border-line !px-4" style={{ borderColor: "#CFCAC2" }} data-testid="tour-replay"
          onClick={() => { onClose(); setTimeout(() => useTour.getState().start(), 250); }}>
          {copy.tour.open}
        </button>
      </div>
    </>
  );
}
