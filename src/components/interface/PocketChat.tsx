"use client";
import { useEffect, useRef } from "react";
import { useCompanionStore } from "@/stores/companionStore";
import { useChatStore } from "@/companion/conversation";
import { ChatInput } from "./ChatInput";
import { MemoryChip } from "./MemoryChip";
import { MemorySheet } from "./MemorySheet";

/** Pocket: recent exchanges + input. Sibling of the placeholder chips (which stay untouched). */
export function PocketChat() {
  const tapCount = useCompanionStore((s) => s.tapCount);
  const messages = useChatStore((s) => s.messages);
  const pending = useChatStore((s) => s.pending);
  const sheet = useChatStore((s) => s.sheet);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending]);
  return (
    <>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto" data-testid="pocket-chat">
        {messages.length === 0 && (
          <>
            <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-cream px-4 py-3 font-ui text-[15px] text-ink shadow">
              Hi! I&apos;m Tuck. Say something, I&apos;m right here.
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-cream/90 px-4 py-3 font-ui text-[14px] text-ink/80 shadow">
              {tapCount > 0 ? `You've said hi ${tapCount} time${tapCount === 1 ? "" : "s"}. Hehe.` : "Tap me up there — I like that."}
            </div>
          </>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user"
            ? "ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-clay px-4 py-2.5 font-ui text-[15px] text-cream shadow"
            : "max-w-[78%] rounded-2xl rounded-bl-md bg-cream px-4 py-2.5 font-ui text-[15px] text-ink shadow"}>{m.text}</div>
        ))}
        {pending && <div className="max-w-[40%] rounded-2xl rounded-bl-md bg-cream/80 px-4 py-2.5 font-ui text-[15px] text-ink/60" data-testid="thinking">…</div>}
        <div ref={end} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <MemoryChip className="min-w-0" />
        <button data-testid="memory-open" onClick={() => useChatStore.setState({ sheet: true })} className="ml-auto shrink-0 font-ui text-[12px] text-cream/50 hover:text-cream">🧠 memories</button>
      </div>
      <ChatInput />
      {sheet && <MemorySheet />}
    </>
  );
}
