"use client";
import { useCompanionStore } from "@/stores/companionStore";
import { useChatStore } from "@/companion/conversation";
import { useNow } from "@/lib/hooks";
import { nowWithOverride, daylightAt } from "@/engine/simulation/timeOfDay";
import { DeskFocusControl } from "./FocusControl";
import { FloatingMemoryChip, TalkPopover } from "./TalkPopover";
import { MemorySheet } from "./MemorySheet";

/** Calm, minimal caption row; all padding respects safe areas. No chat bar: talk is long-press on Tuck. */
export function DeskOverlay() {
  const now = useNow(15000, nowWithOverride);
  const emotion = useCompanionStore((s) => s.emotion);
  const talking = useChatStore((s) => s.open);
  const sheet = useChatStore((s) => s.sheet);
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const day = now.toLocaleDateString([], { weekday: "long" });
  const light = daylightAt(now) > 0.5 ? "day light" : "night light";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between safe-px safe-pb">
        <p className="font-display text-[13px] text-cream/60">{time} · {day} · {light}</p>
        <p className="font-ui text-[12px] text-lamp/70">{emotion === "sleepy" ? "tap to wake Tuck" : "tap Tuck · hold to talk"}</p>
      </div>
      <div className="absolute bottom-0 left-1/2 mb-[max(env(safe-area-inset-bottom),0.4rem)] flex -translate-x-1/2 flex-col items-center gap-1.5">
        <FloatingMemoryChip />
        {talking ? <TalkPopover /> : <DeskFocusControl />}
      </div>
      <button data-testid="memory-open" aria-label="Memories" onClick={() => useChatStore.setState({ sheet: true })}
        className="absolute right-0 top-0 mr-[max(env(safe-area-inset-right),0.75rem)] mt-[max(env(safe-area-inset-top),0.5rem)] font-ui text-[12px] text-cream/35 hover:text-cream">🧠</button>
      {sheet && <MemorySheet />}
    </>
  );
}
