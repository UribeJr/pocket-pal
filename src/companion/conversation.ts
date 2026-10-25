"use client";
import { create } from "zustand";
import type { CharacterController } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { actionCommands } from "@/ai/actions";
import { fallback } from "@/ai/converse";
import type { ChatTurn, ContextSnapshot, ConversationResponse } from "@/ai/schema";
import { useCompanionStore } from "@/stores/companionStore";
import { getActiveController } from "@/engine/activeController";
import { nowWithOverride } from "@/engine/simulation/timeOfDay";
import { browserKV } from "./persist";
import { LocalMemoryStore, type Fact, type MemoryStore } from "./memory/MemoryStore";
import { familiarityText, loadSession, saveSession } from "./session";

const CAMERA = { x: 0, y: 1.2, z: 6 };
const DEVICE_DAILY_CAP = 80;

export interface ChatMessage extends ChatTurn { id: number }
type Candidate = NonNullable<ConversationResponse["reply"]["memory_candidate"]>;
interface ChatState {
  messages: ChatMessage[]; pending: boolean; open: boolean; setOpen(o: boolean): void;
  candidate: Candidate | null; facts: Fact[]; memoryOn: boolean; sheet: boolean;
}
export const useChatStore = create<ChatState>((set) => ({ messages: [], pending: false, open: false, setOpen: (open) => set({ open }), candidate: null, facts: [], memoryOn: true, sheet: false }));

// ---- long-term memory (user-confirmed facts only) ----
let store: MemoryStore | null = null;
export function memory(): MemoryStore { if (!store) { store = new LocalMemoryStore(browserKV()); syncMemory(); } return store; }
const syncMemory = () => useChatStore.setState({ facts: store!.list(), memoryOn: store!.enabled() });
export function acceptCandidate() { const c = useChatStore.getState().candidate; if (c) memory().add(c.kind, c.value); useChatStore.setState({ candidate: null }); syncMemory(); }
export function rejectCandidate() { useChatStore.setState({ candidate: null }); }
export function forgetFact(id: string) { memory().remove(id); syncMemory(); }
export function forgetAll() { memory().clear(); syncMemory(); }
export function setMemoryOn(on: boolean) { memory().setEnabled(on); if (!on) useChatStore.setState({ candidate: null }); syncMemory(); }
/** test seam */
export function _setMemoryStore(s: MemoryStore) { store = s; syncMemory(); }

/** Short-term window: last 12 turns, trimmed to ~1,500 tokens (chars/4), dropping oldest first. */
export function windowHistory(msgs: ChatTurn[], maxTurns = 12, maxChars = 6000): ChatTurn[] {
  const out: ChatTurn[] = []; let chars = 0;
  for (let i = msgs.length - 1; i >= 0 && out.length < maxTurns; i--) { chars += msgs[i].text.length; if (chars > maxChars) break; out.unshift(msgs[i]); }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
let seq = 0;

function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem("pocketpal:v1:device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("pocketpal:v1:device", id); }
    return id;
  } catch { return undefined; }
}
/** client-side per-device daily cap (server enforces its own limits too) */
function takeDeviceQuota(): boolean {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem("pocketpal:v1:quota") ?? "{}");
    const n = raw.day === day ? raw.n : 0;
    if (n >= DEVICE_DAILY_CAP) return false;
    localStorage.setItem("pocketpal:v1:quota", JSON.stringify({ day, n: n + 1 }));
    return true;
  } catch { return true; }
}

export function buildContext(message?: string): ContextSnapshot {
  const now = nowWithOverride(); const s = useCompanionStore.getState(); const h = now.getHours();
  const timeOfDay = h < 5 || h >= 22 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const activity = (["idle", "wandering", "sleeping", "reacting", "conversing"] as const).find((a) => a === s.behavior) ?? "idle";
  const kv = browserKV(); const sess = kv ? loadSession(kv, Date.now()) : null;
  return { memories: message ? memory().relevant(message) : undefined, familiarity: sess ? familiarityText(sess, Date.now()) : undefined, localTime: `${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, timeOfDay, layout: s.layout, mood: s.emotion, activity, recentTaps: Math.min(99, s.tapCount) };
}

/** Express a reply through the controller at user priority; the job ends by settling to idle. */
export function performReply(ctl: CharacterController, res: ConversationResponse) {
  const { dialogue, emotion, action } = res.reply;
  const secs = Math.min(8, Math.max(3, 1.5 + dialogue.length * 0.06));
  return ctl.run([
    { kind: "emote", emotion, hold: secs + 2 },
    { kind: "lookAt", target: CAMERA },
    { kind: "say", text: dialogue, seconds: secs },
    ...actionCommands(action, emotion),
    { kind: "play", clip: "talk", hold: Math.max(1.5, secs - 1.5) },
  ], PRIORITY.user, "reply");
}

export async function sendMessage(text: string, fetcher: typeof fetch = fetch): Promise<ConversationResponse> {
  const message = text.trim().slice(0, 500);
  const chat = useChatStore.getState();
  if (!message || chat.pending) return fallback("invalid_request");
  const history = windowHistory(chat.messages.map(({ role, text }) => ({ role, text })));
  useChatStore.setState({ pending: true, messages: [...chat.messages, { id: ++seq, role: "user" as const, text: message }] });
  const ctl = getActiveController();
  // thinking: focused face, look at user, hold still — at user priority so routines pause
  void ctl?.run([{ kind: "emote", emotion: "focused", hold: 15 }, { kind: "lookAt", target: CAMERA }, { kind: "play", clip: "idle", hold: 15 }], PRIORITY.user, "thinking");
  let res: ConversationResponse;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) res = fallback("offline");
    else if (!takeDeviceQuota()) res = fallback("rate_limited");
    else {
      const r = await fetcher("/api/conversation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, context: buildContext(message), deviceId: deviceId() }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await r.json().catch(() => null)) as ConversationResponse | null;
      res = body?.reply?.dialogue ? body : fallback("unavailable");
    }
  } catch {
    res = fallback(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unavailable");
  }
  useChatStore.setState((s) => ({ pending: false, messages: [...s.messages, { id: ++seq, role: "tuck" as const, text: res.reply.dialogue }].slice(-30) }));
  const c = res.ok ? res.reply.memory_candidate : null;
  if (c && memory().enabled() && !memory().has(c.kind, c.value)) useChatStore.setState({ candidate: c });
  if (res.ok) { const kv = browserKV(); if (kv) { const s = loadSession(kv, Date.now()); saveSession(kv, { ...s, conversations: s.conversations + 1, lastConversationAt: Date.now() }); } }
  const live = getActiveController();
  if (live) void performReply(live, res);
  return res;
}

/** Leaving chat always hands Tuck back to his routine. */
export function closeConversation() {
  useChatStore.getState().setOpen(false);
  const ctl = getActiveController();
  if (ctl && ctl.activePriority === PRIORITY.user && (ctl.activeLabel === "thinking")) ctl.returnToIdle();
}
