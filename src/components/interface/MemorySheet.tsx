"use client";
import { forgetAll, forgetFact, setMemoryOn, useChatStore } from "@/companion/conversation";

export function MemorySheet() {
  const { facts, memoryOn } = useChatStore();
  const close = () => useChatStore.setState({ sheet: false });
  return (
    <div data-testid="memory-sheet" className="absolute inset-0 z-20 flex flex-col gap-3 bg-night px-5 safe-px safe-pb pt-3 font-ui text-cream">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-semibold">What Tuck remembers</h2>
        <button onClick={close} aria-label="Close memories" className="grid h-8 w-8 place-items-center rounded-full bg-white/10">✕</button>
      </div>
      <label className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5 text-[14px]">
        <span>Remember things I tell Tuck</span>
        <input data-testid="memory-toggle" type="checkbox" checked={memoryOn} onChange={(e) => setMemoryOn(e.target.checked)} className="h-5 w-5 accent-[#c8754a]" />
      </label>
      <p className="text-[12px] text-cream/50">Only things you say about yourself, only after you tap ✓. Stored on this device.</p>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto" data-testid="memory-list">
        {facts.length === 0 && <li className="text-[14px] text-cream/50">Nothing yet.</li>}
        {facts.map((f) => (
          <li key={f.id} className="flex items-center justify-between rounded-2xl bg-cream px-4 py-2 text-[14px] text-ink">
            <span><span className="text-ink/50">{f.kind}</span> · {f.value}</span>
            <button aria-label={`Forget ${f.value}`} data-testid="memory-delete" onClick={() => forgetFact(f.id)} className="text-ink/60">✕</button>
          </li>
        ))}
      </ul>
      {facts.length > 0 && <button onClick={forgetAll} className="mb-2 self-center rounded-full bg-white/10 px-4 py-2 text-[13px] text-cream/80">Forget everything</button>}
    </div>
  );
}
