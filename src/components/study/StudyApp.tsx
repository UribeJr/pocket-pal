"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useIsLandscape } from "@/lib/hooks";
import { copy } from "@/lib/copy";
import { useCompanionStore } from "@/stores/companionStore";
import type { LayoutMode } from "@/types/companion";
import { useSessionPersistence } from "@/companion/useSessionPersistence";
import { usePomodoroAlerts, usePomodoroRuntime } from "@/companion/useTicker";
import { useStudyDirector } from "@/companion/useStudyDirector";
import { useChatStore } from "@/companion/conversation";
import { MemoryChip } from "@/components/interface/MemoryChip";
import { MemorySheet } from "@/components/interface/MemorySheet";
import { TimerClock } from "./TimerClock";
import { TimerControls } from "./TimerControls";
import { AskTuck } from "./AskTuck";
import { SettingsSheet } from "./SettingsSheet";

const StudyStage = dynamic(() => import("./StudyStage"), { ssr: false });

/**
 * "Study with Tuck": the timer on the left (top on phones), Tuck on the right (middle on phones), and a
 * discreet way to ask him for help. One persistent Canvas in both layouts: rotating only moves it to
 * another grid area and refits the camera, so Tuck, the timer and all state carry on untouched.
 */
export function StudyApp({ forced }: { forced?: LayoutMode }) {
  const landscape = useIsLandscape();
  useSessionPersistence();
  useStudyDirector(); // listen before the timer hydrates, so moments resolved on load are not missed
  usePomodoroRuntime();
  const layout = useCompanionStore((s) => s.layout);
  const set = useCompanionStore((s) => s.set);
  useEffect(() => {
    if (forced) set({ layout: forced });
    else if (landscape !== null) set({ layout: landscape ? "desk" : "pocket" });
  }, [forced, landscape, set]);

  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((t: string) => setAnnouncement(t), []);
  usePomodoroAlerts(announce);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const memorySheet = useChatStore((s) => s.sheet);
  const askOpen = useChatStore((s) => s.open);
  // time-dependent UI renders only on the client (no hydration mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="study" data-layout={layout} data-ask={askOpen ? "open" : undefined}>
      <div className="study-leftbg" aria-hidden="true" />
      <div className="study-top" />
      {mounted && <TimerClock />}
      {mounted && <TimerControls />}
      <div className="study-stage"><StudyStage /></div>
      {mounted && (
        <div className="study-bottom">
          {!askOpen && <MemoryChip />}
          <AskTuck />
        </div>
      )}
      {mounted && (
        <button type="button" className="icon-btn absolute right-0 top-0 z-10 mr-[max(env(safe-area-inset-right),0.5rem)] mt-[max(env(safe-area-inset-top),0.5rem)]"
          aria-label={copy.settings.open} data-testid="settings-open" onClick={() => setSettingsOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {memorySheet && <MemorySheet />}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </main>
  );
}
