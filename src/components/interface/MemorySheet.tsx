"use client";
import { forgetAll, forgetFact, setMemoryOn, useChatStore } from "@/companion/conversation";
import { useDialog } from "@/components/study/useDialog";

/** What Tuck remembers (user-confirmed facts only), restyled for the study palette. */
export function MemorySheet() {
  const { facts, memoryOn } = useChatStore();
  const close = () => useChatStore.setState({ sheet: false });
  const ref = useDialog<HTMLDivElement>(close);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="memory-title" data-testid="memory-sheet"
      className="fade-in fixed inset-0 z-40 flex flex-col gap-3 bg-[#F7F5F1] px-5 safe-px safe-pb pt-[max(env(safe-area-inset-top),0.75rem)] text-ink-soft">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="memory-title" className="text-[17px] font-medium">What Tuck remembers</h2>
          <button onClick={close} aria-label="Close memories" className="icon-btn">✕</button>
        </div>
        <label className="flex items-center justify-between rounded-2xl border border-[#CFCAC2] bg-white px-4 py-2.5 text-[15px]">
          <span>Remember things I tell Tuck</span>
          <input data-testid="memory-toggle" type="checkbox" checked={memoryOn} onChange={(e) => setMemoryOn(e.target.checked)} className="h-5 w-5 accent-[#5F7759]" />
        </label>
        <p className="text-[13px] text-mute">Only things you say about yourself, only after you tap ✓. Stored on this device.</p>
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto" data-testid="memory-list">
          {facts.length === 0 && <li className="text-[14px] text-mute">Nothing yet.</li>}
          {facts.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-2xl border border-[#E2DED7] bg-white px-4 py-2 text-[14px]">
              <span><span className="text-mute">{f.kind}</span> · {f.value}</span>
              <button aria-label={`Forget ${f.value}`} data-testid="memory-delete" onClick={() => forgetFact(f.id)} className="icon-btn !h-9 !w-9">✕</button>
            </li>
          ))}
        </ul>
        {facts.length > 0 && <button onClick={forgetAll} className="btn mb-2 self-center border-[#CFCAC2]">Forget everything</button>}
      </div>
    </div>
  );
}
