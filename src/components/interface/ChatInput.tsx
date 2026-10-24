"use client";
import { useState } from "react";
import { sendMessage, useChatStore } from "@/companion/conversation";

export function ChatInput({ autoFocus, compact, onActivity }: { autoFocus?: boolean; compact?: boolean; onActivity?: () => void }) {
  const [text, setText] = useState("");
  const pending = useChatStore((s) => s.pending);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || pending) return;
    void sendMessage(text); setText(""); onActivity?.();
  };
  return (
    <form onSubmit={submit} className={`flex items-center rounded-full bg-cream font-ui text-ink shadow ${compact ? "h-10 pl-4 pr-1 text-[14px]" : "mb-2 py-1.5 pl-5 pr-1.5 text-[15px]"}`}>
      <input
        aria-label="Message Tuck" data-testid="chat-input" value={text} maxLength={500} autoFocus={autoFocus}
        onChange={(e) => { setText(e.target.value); onActivity?.(); }}
        placeholder={pending ? "Tuck is thinking…" : "Say something to Tuck"}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink/40"
      />
      <button type="submit" aria-label="Send" disabled={pending || !text.trim()}
        className={`grid shrink-0 place-items-center rounded-full bg-clay text-cream disabled:opacity-40 ${compact ? "h-8 w-8" : "h-9 w-9"}`}>
        {pending ? "…" : "↑"}
      </button>
    </form>
  );
}
