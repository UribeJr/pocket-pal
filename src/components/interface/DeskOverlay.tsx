"use client";
import { DeskChat } from "./DeskChat";
import { useCompanionStore } from "@/stores/companionStore";
import { useNow } from "@/lib/hooks";
import { nowWithOverride, daylightAt } from "@/engine/simulation/timeOfDay";

/** Calm, minimal caption row; all padding respects safe areas. */
export function DeskOverlay() {
  const now = useNow(15000, nowWithOverride);
  const emotion = useCompanionStore((s) => s.emotion);
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const day = now.toLocaleDateString([], { weekday: "long" });
  const light = daylightAt(now) > 0.5 ? "day light" : "night light";
  return (
    <>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between safe-px safe-pb">
      <p className="font-display text-[13px] text-cream/60">{time} · {day} · {light}</p>
      <p className="font-ui text-[12px] text-lamp/70">{emotion === "sleepy" ? "tap to wake Tuck" : "tap Tuck to say hi"}</p>
    </div>
    <DeskChat />
    </>
  );
}
