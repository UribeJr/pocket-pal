"use client";
import { PocketChat } from "./PocketChat";

/** Pocket Mode panel: placeholder chips (inert, untouched) + AI chat. */
export function PocketPanel() {
  return (
    <section className="absolute inset-x-0 bottom-0 top-[46%] flex flex-col gap-4 px-5 safe-px safe-pb pt-3">
      <div className="flex justify-center gap-2">
        {["⏲ Tea timer", "📝 Note", "🧶 Wardrobe"].map((c) => (
          <span key={c} className="rounded-full border border-cream/15 bg-white/5 px-3 py-1.5 font-ui text-[12px] font-bold text-cream/50">{c}</span>
        ))}
      </div>
      <PocketChat />
    </section>
  );
}
