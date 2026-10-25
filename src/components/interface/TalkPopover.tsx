"use client";
import { useEffect, useRef } from "react";
import { closeConversation, useChatStore } from "@/companion/conversation";
import { ChatInput } from "./ChatInput";
import { MemoryChip } from "./MemoryChip";

/** Optional talk, opened only by long-pressing Tuck. Replies appear in Tuck's speech bubble. Auto-closes after 45 s idle. */
export function TalkPopover({ className = "" }: { className?: string }) {
  const open = useChatStore((s) => s.open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(closeConversation, 45_000); };
  useEffect(() => { if (open) bump(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [open]);
  if (!open) return null;
  return (
    <div className={`flex w-[min(340px,86vw)] items-center gap-1.5 ${className}`} data-testid="talk-popover">
      <div className="flex-1"><ChatInput compact autoFocus onActivity={bump} /></div>
      <button aria-label="Close talk" onClick={closeConversation} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 font-ui text-cream/70">✕</button>
    </div>
  );
}

/** Memory confirmation chip, shown wherever Tuck has a pending "should I remember…" (only ever from talk). */
export function FloatingMemoryChip({ className = "" }: { className?: string }) {
  const c = useChatStore((s) => s.candidate);
  if (!c) return null;
  return <div className={className}><MemoryChip /></div>;
}
