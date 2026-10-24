"use client";
import { useCompanionStore } from "@/stores/companionStore";

/** Phase 1 placeholder for Pocket Mode chat / profile (real chat lands in Phase 2). */
export function PocketPanel() {
  const tapCount = useCompanionStore((s) => s.tapCount);
  return (
    <section className="absolute inset-x-0 bottom-0 top-[46%] flex flex-col gap-4 px-5 safe-px safe-pb pt-3">
      <div className="flex justify-center gap-2">
        {["⏲ Tea timer", "📝 Note", "🧶 Wardrobe"].map((c) => (
          <span key={c} className="rounded-full border border-cream/15 bg-white/5 px-3 py-1.5 font-ui text-[12px] font-bold text-cream/50">{c}</span>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-cream px-4 py-3 font-ui text-[15px] text-ink shadow">
          Hi! I&apos;m Tuck. I can&apos;t chat just yet, but I&apos;m right here.
        </div>
        <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-cream/90 px-4 py-3 font-ui text-[14px] text-ink/80 shadow">
          {tapCount > 0 ? `You've said hi ${tapCount} time${tapCount === 1 ? "" : "s"}. Hehe.` : "Tap me up there — I like that."}
        </div>
      </div>
      <div className="mb-2 flex items-center rounded-full bg-cream px-5 py-2.5 font-ui text-[15px] text-ink/40">
        <span className="flex-1">Chat arrives in Phase 2…</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-clay/50 text-cream">↑</span>
      </div>
    </section>
  );
}
