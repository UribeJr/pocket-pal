"use client";
import { acceptCandidate, rejectCandidate, useChatStore } from "@/companion/conversation";

const LABEL: Record<string, string> = { name: "your name is", likes: "you like", dislikes: "you dislike", hobby: "your hobby:", game: "you play", topic: "you're into", other: "" };

/** Nothing is saved until the user taps ✓. */
export function MemoryChip({ className = "" }: { className?: string }) {
  const c = useChatStore((s) => s.candidate);
  if (!c) return null;
  return (
    <div data-testid="memory-chip" className={`flex items-center gap-2 rounded-full border border-cream/20 bg-night/80 py-1 pl-3 pr-1 font-ui text-[12px] text-cream/90 backdrop-blur ${className}`}>
      <span className="min-w-0 truncate">Tuck will remember: <b>{LABEL[c.kind]} {c.value}</b></span>
      <button data-testid="memory-accept" aria-label="Remember this" onClick={acceptCandidate} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage text-ink">✓</button>
      <button aria-label="Don't remember" onClick={rejectCandidate} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10">✕</button>
    </div>
  );
}
