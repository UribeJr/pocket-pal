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

const CAMERA = { x: 0, y: 1.2, z: 6 };
const DEVICE_DAILY_CAP = 80;

export interface ChatMessage extends ChatTurn { id: number }
interface ChatState { messages: ChatMessage[]; pending: boolean; open: boolean; setOpen(o: boolean): void }
export const useChatStore = create<ChatState>((set) => ({ messages: [], pending: false, open: false, setOpen: (open) => set({ open }) }));
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

export function buildContext(): ContextSnapshot {
  const now = nowWithOverride(); const s = useCompanionStore.getState(); const h = now.getHours();
  const timeOfDay = h < 5 || h >= 22 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const activity = (["idle", "wandering", "sleeping", "reacting", "conversing"] as const).find((a) => a === s.behavior) ?? "idle";
  return { localTime: `${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, timeOfDay, layout: s.layout, mood: s.emotion, activity, recentTaps: Math.min(99, s.tapCount) };
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
  const history: ChatTurn[] = chat.messages.slice(-12).map(({ role, text }) => ({ role, text }));
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
        body: JSON.stringify({ message, history, context: buildContext(), deviceId: deviceId() }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await r.json().catch(() => null)) as ConversationResponse | null;
      res = body?.reply?.dialogue ? body : fallback("unavailable");
    }
  } catch {
    res = fallback(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unavailable");
  }
  useChatStore.setState((s) => ({ pending: false, messages: [...s.messages, { id: ++seq, role: "tuck" as const, text: res.reply.dialogue }].slice(-30) }));
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
