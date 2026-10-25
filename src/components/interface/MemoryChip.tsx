"use client";
import { acceptCandidate, rejectCandidate, useChatStore } from "@/companion/conversation";

const LABEL: Record<string, string> = { name: "your name is", likes: "you like", dislikes: "you dislike", hobby: "your hobby:", game: "you play", topic: "you're into", other: "" };

/** Nothing is saved until the user taps ✓. */
export function MemoryChip({ className = "" }: { className?: string }) {
  const c = useChatStore((s) => s.candidate);
  if (!c) return null;
  return (
    <div data-testid="memory-chip" className={`fade-up flex max-w-[340px] items-center gap-2 rounded-full border border-[#CFCAC2] bg-[#F7F5F1] py-1 pl-3 pr-1 text-[13px] text-ink-soft ${className}`}>
      <span className="min-w-0 truncate">Tuck will remember: <b className="font-medium">{LABEL[c.kind]} {c.value}</b></span>
      <button data-testid="memory-accept" aria-label="Remember this" onClick={acceptCandidate} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sage text-[#1F2A1C]">✓</button>
      <button aria-label="Don't remember" onClick={rejectCandidate} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mute hover:bg-black/5">✕</button>
    </div>
  );
}
