"use client";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { closeConversation, retryMessage, sendMessage, useChatStore, type ChatMessage } from "@/companion/conversation";
import { getActiveController } from "@/engine/activeController";
import { useCompanionStore } from "@/stores/companionStore";
import { PRIORITY } from "@/types/companion";
import { MiniMarkdown } from "./MiniMarkdown";
import { MemoryChip } from "@/components/interface/MemoryChip";

/** open Ask Tuck (also what long-pressing Tuck does): wakes him if he was dozing */
export function openAsk() {
  useCompanionStore.getState().set({ lastInteraction: Date.now() });
  const ctl = getActiveController();
  if (ctl && ctl.emotions.emotion === "sleepy") ctl.setEmotion("content", PRIORITY.user, 0);
  useChatStore.getState().setOpen(true);
}

const failureText = (reason: ChatMessage["failed"]) =>
  reason === "nokey" || reason === "misconfigured" ? copy.ask.notConnected
    : reason === "offline" ? copy.ask.offline
    : reason === "rate_limited" ? copy.ask.rateLimited
    : copy.ask.failure;

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#E9E5DE] px-3.5 py-2 text-[14px] leading-snug">{m.text}</div>;
  }
  if (m.failed) {
    return (
      <div className="flex max-w-[92%] items-center gap-2 rounded-2xl rounded-bl-md border border-dashed border-[#CFCAC2] px-3.5 py-2 text-[14px] leading-snug text-mute" data-testid="ask-failure">
        <span className="flex-1">{failureText(m.failed)}</span>
        {m.failed !== "invalid_request" && <button type="button" className="chip shrink-0" onClick={() => void retryMessage(m.id)} data-testid="ask-retry">{copy.ask.retry}</button>}
      </div>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_1px_2px_rgba(60,50,40,0.06)]" data-testid="ask-answer">
      {m.answer ? <MiniMarkdown text={m.answer} /> : <p>{m.text}</p>}
    </div>
  );
}

/** The minimal study assistant: a pill that opens a compact panel (this visit only, nothing stored). */
export function AskTuck() {
  const open = useChatStore((s) => s.open);
  const pill = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => { if (wasOpen.current && !open) pill.current?.focus(); wasOpen.current = open; }, [open]);
  if (!open) {
    return (
      <button ref={pill} type="button" className="ask-pill fade-in" onClick={openAsk} aria-label={copy.ask.entryLabel} data-testid="ask-open">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        <span>{copy.ask.entry}</span>
      </button>
    );
  }
  return <AskTuckPanel />;
}

function AskTuckPanel() {
  const messages = useChatStore((s) => s.messages);
  const pending = useChatStore((s) => s.pending);
  const subject = useChatStore((s) => s.subject);
  const layout = useCompanionStore((s) => s.layout);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages.length, pending]);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || pending) return;
    void sendMessage(text); setText("");
  };
  const desk = layout === "desk";
  return (
    <div className={desk ? "relative w-full max-w-[400px]" : "w-full"}>
      <section
        role="region" aria-label={copy.ask.title} data-testid="talk-popover"
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeConversation(); } }}
        className={`panel fade-up flex flex-col overflow-hidden ${desk ? "ask-panel-desk absolute inset-x-0 bottom-0 max-h-[min(60vh,560px)]" : "max-h-[50dvh]"}`}
      >
        <header className="flex items-center gap-2 border-b border-[#E5E1DA] px-4 py-2">
          <h2 className="text-[15px] font-medium">{copy.ask.title}</h2>
          <input
            className="ml-1 min-w-0 flex-1 rounded-full bg-transparent px-2 py-1 text-[13px] text-mute outline-none placeholder:text-[#6F6B63] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#B9B4AC]"
            value={subject} maxLength={80} placeholder={copy.ask.subjectPlaceholder} aria-label={copy.ask.subject} data-testid="ask-subject"
            onChange={(e) => useChatStore.setState({ subject: e.target.value })}
          />
          <button type="button" className="icon-btn !h-9 !w-9 shrink-0" aria-label={copy.ask.close} onClick={closeConversation}>✕</button>
        </header>
        <div ref={log} role="log" aria-live="polite" aria-relevant="additions" className="flex min-h-[96px] flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" data-testid="ask-log">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[14px] text-mute">{copy.ask.empty}</p>
              <div className="flex flex-wrap gap-2">
                {copy.ask.chips.map((c) => (
                  <button key={c.label} type="button" className="chip" onClick={() => { setText(c.prompt); input.current?.focus(); }}>{c.label}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => <Message key={m.id} m={m} />)}
          {pending && <p className="text-[13px] text-mute" data-testid="ask-pending">{copy.ask.thinking}</p>}
        </div>
        {/* "Tuck will remember…" lives inside the panel while it is open, so nothing can cover it */}
        <div className="flex justify-center px-3 empty:hidden"><MemoryChip /></div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-[#E5E1DA] px-3 py-2">
          <input
            ref={input} className="field !min-h-10 flex-1 !rounded-full !py-2" value={text} maxLength={500}
            placeholder={pending ? copy.ask.thinking : copy.ask.placeholder} aria-label={copy.ask.placeholder} data-testid="chat-input"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary !min-h-10 !px-4" disabled={pending || !text.trim()} aria-label={copy.ask.send}>↑</button>
        </form>
        <p className="px-4 pb-2 text-[11px] text-[#6F6B63]">{copy.ask.visitOnly}</p>
      </section>
    </div>
  );
}
