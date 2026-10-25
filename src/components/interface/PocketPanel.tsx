"use client";
import { useChatStore } from "@/companion/conversation";
import { phaseAt, useFocusStore } from "@/companion/focus";
import { clock } from "@/engine/simulation/clock";
import { FocusReadout, PresetPicker } from "./FocusControl";
import { FloatingMemoryChip, TalkPopover } from "./TalkPopover";
import { MemorySheet } from "./MemorySheet";
import { useCompanionStore } from "@/stores/companionStore";

/** Pocket Mode panel: Tea timer (focus) chip is live; Note / Wardrobe stay placeholders. No chat log: talk is long-press only. */
export function PocketPanel() {
  const sheet = useChatStore((s) => s.sheet);
  const picker = useFocusStore((s) => s.picker);
  const setPicker = useFocusStore((s) => s.setPicker);
  const session = useFocusStore((s) => s.session);
  const running = phaseAt(session, clock.now()).phase !== "idle";
  const sleepy = useCompanionStore((s) => s.emotion === "sleepy");
  return (
    <section className="absolute inset-x-0 bottom-0 top-[46%] flex flex-col items-center gap-4 px-5 safe-px safe-pb pt-3">
      <div className="flex justify-center gap-2">
        <button data-testid="focus-chip" onClick={() => setPicker(!picker)} aria-pressed={picker || running}
          className={`rounded-full border px-3 py-1.5 font-ui text-[12px] font-bold ${picker || running ? "border-lamp/50 bg-lamp/15 text-lamp" : "border-cream/25 bg-white/10 text-cream/80"}`}>⏲ Tea timer</button>
        {["📝 Note", "🧶 Wardrobe"].map((c) => (
          <span key={c} className="rounded-full border border-cream/15 bg-white/5 px-3 py-1.5 font-ui text-[12px] font-bold text-cream/50">{c}</span>
        ))}
      </div>
      {running ? <FocusReadout big /> : picker ? <PresetPicker /> : (
        <p className="max-w-[80%] text-center font-ui text-[13px] text-cream/45">{sleepy ? "Tuck is dozing. Tap to wake him." : "Start a Tea timer and Tuck will keep you company. Hold Tuck to talk."}</p>
      )}
      <div className="flex-1" />
      <FloatingMemoryChip className="max-w-full" />
      <TalkPopover />
      <button data-testid="memory-open" onClick={() => useChatStore.setState({ sheet: true })} className="mb-2 font-ui text-[12px] text-cream/50 hover:text-cream">🧠 memories</button>
      {sheet && <MemorySheet />}
    </section>
  );
}
