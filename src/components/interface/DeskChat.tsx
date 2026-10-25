"use client";
import { useEffect, useRef } from "react";
import { closeConversation, useChatStore } from "@/companion/conversation";
import { ChatInput } from "./ChatInput";
import { MemoryChip } from "./MemoryChip";

/** Desk: tiny bottom-centre trigger; opens a compact pill below the shelf (never over the clock). Replies use Tuck's bubble. */
export function DeskChat() {
  const open = useChatStore((s) => s.open);
  const setOpen = useChatStore((s) => s.setOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(closeConversation, 60_000); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!open)
    return (
      <button data-testid="desk-chat-open" aria-label="Talk to Tuck" onClick={() => { setOpen(true); bump(); }}
        className="absolute bottom-0 left-1/2 mb-[max(env(safe-area-inset-bottom),0.5rem)] -translate-x-1/2 rounded-full px-3 py-1 font-ui text-[12px] text-lamp/70 hover:text-lamp">
        💬 talk
      </button>
    );
  return (
    <div className="absolute bottom-0 left-1/2 mb-[max(env(safe-area-inset-bottom),0.4rem)] flex w-[min(360px,70vw)] -translate-x-1/2 items-center gap-1.5" data-testid="desk-chat">
      <MemoryChip className="absolute bottom-full left-0 right-0 mb-1.5" />
      <div className="flex-1"><ChatInput compact autoFocus onActivity={bump} /></div>
      <button aria-label="Close chat" onClick={closeConversation} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-ui text-cream/70">✕</button>
    </div>
  );
}
