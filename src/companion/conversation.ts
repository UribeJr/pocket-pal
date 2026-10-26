"use client";
import { create } from "zustand";
import type { BehaviorCommand, CharacterController } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { actionCommands } from "@/ai/actions";
import { fallback } from "@/ai/converse";
import type { ChatTurn, ContextSnapshot, ConversationResponse, StudyContext } from "@/ai/schema";
import { useCompanionStore } from "@/stores/companionStore";
import { getActiveController } from "@/engine/activeController";
import { nowWithOverride } from "@/engine/simulation/timeOfDay";
import { browserKV } from "./persist";
import { LocalMemoryStore, type Fact, type MemoryStore } from "./memory/MemoryStore";
import { familiarityText, loadSession, saveSession } from "./session";
import { usePomodoro, remainingMs } from "./pomodoro";
import { clock } from "@/engine/simulation/clock";

const CAMERA = { x: 0, y: 1.2, z: 6 };
const DEVICE_DAILY_CAP = 500;

/** a chat line; Tuck's study replies carry the short spoken `text` plus the fuller `answer` */
export interface ChatMessage extends ChatTurn { id: number; answer?: string; failed?: ConversationResponse["reason"] }
type Candidate = NonNullable<ConversationResponse["reply"]["memory_candidate"]>;
interface ChatState {
  messages: ChatMessage[]; pending: boolean; open: boolean; setOpen(o: boolean): void;
  candidate: Candidate | null; facts: Fact[]; memoryOn: boolean; sheet: boolean;
  /** what the user says they're working on, and the one goal Tuck set for this session (this visit only) */
  task: string; goal: string;
  /** the goal `goal` was set for (a changed task asks Tuck for a fresh goal) */
  goalFor: string;
  /** "did you finish?" card after a focus session; `checking` while Tuck answers it */
  checkinOpen: boolean; checking: boolean;
}
/** Ask Tuck lives for this visit only: messages, task and goal are kept in memory, never persisted. */
export const useChatStore = create<ChatState>((set) => ({ messages: [], pending: false, open: false, setOpen: (open) => set({ open }), candidate: null, facts: [], memoryOn: true, sheet: false, task: "", goal: "", goalFor: "", checkinOpen: false, checking: false }));

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

/** Short-term window: last 12 turns, trimmed to ~3,000 tokens (chars/4), dropping oldest first. */
export function windowHistory(msgs: ChatTurn[], maxTurns = 12, maxChars = 12000): ChatTurn[] {
  const out: ChatTurn[] = []; let chars = 0;
  for (let i = msgs.length - 1; i >= 0 && out.length < maxTurns; i--) { chars += msgs[i].text.length; if (chars > maxChars) break; out.unshift(msgs[i]); }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
let seq = 0;

export function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem("pocketpal:v1:device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("pocketpal:v1:device", id); }
    return id;
  } catch { return undefined; }
}
/** client-side per-device daily cap (server enforces its own limits too) */
export function takeDeviceQuota(): boolean {
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
  const p = usePomodoro.getState();
  const activity = p.status !== "ready" ? (p.phase === "focus" ? "focusing" : "on_break")
    : (["idle", "wandering", "sleeping", "reacting", "conversing"] as const).find((a) => a === s.behavior) ?? "idle";
  const kv = browserKV(); const sess = kv ? loadSession(kv, Date.now()) : null;
  return { memories: message ? memory().relevant(message) : undefined, familiarity: sess ? familiarityText(sess, Date.now()) : undefined, localTime: `${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, timeOfDay, layout: s.layout, mood: s.emotion, activity, recentTaps: Math.min(99, s.tapCount) };
}

/** the session snapshot sent with a question: taken once at send time, never streamed */
export function buildStudyContext(): StudyContext {
  const p = usePomodoro.getState();
  const { task, goal } = useChatStore.getState();
  const n = Math.min(p.focusDone + 1, p.settings.longEvery);
  const left = remainingMs(p, clock.now());
  const mins = (v: number) => Math.min(240, Math.max(1, Math.round(v)));
  return {
    phase: p.phase === "focus" ? "focus" : p.phase === "short" ? "short_break" : "long_break",
    status: p.status,
    minutesLeft: Math.min(240, Math.round(left / 60000)),
    focusDoneToday: Math.min(99, p.completedToday),
    cycle: `${n} of ${p.settings.longEvery}`,
    focusMin: mins(p.settings.focusMin), shortMin: mins(p.settings.shortMin), longMin: mins(p.settings.longMin),
    elapsedMin: p.status === "ready" ? 0 : Math.min(240, Math.max(0, Math.round((p.durationMs - left) / 60000))),
    ...(task.trim() ? { task: task.trim().slice(0, 120) } : {}),
    ...(goal.trim() ? { goal: goal.trim().slice(0, 120) } : {}),
  };
}

/** a focus session is running or paused: Tuck is seated, so replies keep him in his seat */
const studying = () => { const p = usePomodoro.getState(); return p.phase === "focus" && p.status !== "ready"; };

/** Express a reply through the controller at user priority; the job ends by settling to his resting loop. */
export function performReply(ctl: CharacterController, res: ConversationResponse) {
  const { dialogue, emotion, action } = res.reply;
  const secs = Math.min(8, Math.max(3, 1.5 + dialogue.length * 0.06));
  const seated = studying();
  return ctl.run([
    { kind: "emote", emotion: seated && emotion !== "focused" ? "content" : emotion, hold: secs + 2 },
    { kind: "lookAt", target: CAMERA },
    { kind: "say", text: dialogue, seconds: secs },
    // standing clips would pop him out of his seat mid-session: talk from the chair instead
    ...(seated ? [] : actionCommands(action, emotion)),
    { kind: "play", clip: seated ? "sitIdle" : "talk", hold: Math.max(1.5, secs - 1.5) },
  ], PRIORITY.user, "reply");
}

/** a timer moment (system priority) may be playing: wait for it to finish (max ~10 s), then speak the reply */
async function performWhenFree(res: ConversationResponse) {
  for (let i = 0; i < 40; i++) {
    const c = getActiveController();
    if (c && c.activePriority <= PRIORITY.user) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const live = getActiveController();
  if (live) await performReply(live, res);
}

/** one request to /api/conversation in focus-partner mode (offline, quota and network failures become fallbacks) */
async function callTuck(extra: { message: string; history?: ChatTurn[]; moment?: "start" | "checkin" | "chat"; checkin?: "yes" | "almost" | "no" }, fetcher: typeof fetch = fetch): Promise<ConversationResponse> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return fallback("offline", "study");
    if (!takeDeviceQuota()) return fallback("rate_limited", "study");
    const r = await fetcher("/api/conversation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: [], ...extra, context: buildContext(extra.message), mode: "study", study: buildStudyContext(), deviceId: deviceId() }),
      signal: AbortSignal.timeout(12000),
    });
    const body = (await r.json().catch(() => null)) as ConversationResponse | null;
    return body?.reply?.dialogue ? body : fallback("unavailable", "study");
  } catch {
    return fallback(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unavailable", "study");
  }
}

/**
 * Start a focus session with an intention: the timer starts at once; Tuck turns the task into one goal
 * that fits the session (his bubble says it). A failed call quietly keeps the user's own words as the goal.
 * A goal Tuck already suggested for this same task (at the last check-in) is used as is, with no call.
 */
export async function startFocus(fetcher: typeof fetch = fetch) {
  const p = usePomodoro.getState();
  const { task, goal, goalFor } = useChatStore.getState();
  p.start();
  const t = task.trim();
  if (!t || (goal && goalFor === t)) return;
  useChatStore.setState({ goal: "", goalFor: t });
  const res = await callTuck({ message: t.slice(0, 500), moment: "start" }, fetcher);
  if (useChatStore.getState().goalFor !== t) return; // the task changed meanwhile
  useChatStore.setState({ goal: (res.ok && res.goal) || t.slice(0, 120) });
  if (res.ok) void performWhenFree(res);
}

/** the "did you finish?" answer: Tuck reacts with his body at once, then says a line and suggests the next goal */
export async function answerCheckin(answer: "yes" | "almost" | "no", fetcher: typeof fetch = fetch) {
  const { goal, checking } = useChatStore.getState();
  if (checking) return;
  useChatStore.setState({ checkinOpen: false, checking: true });
  const ctl = getActiveController();
  const reacting = ctl ? ctl.run(checkinReaction(answer, typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches), PRIORITY.user, "checkin") : Promise.resolve();
  const label = answer === "yes" ? "Yes, I finished it." : answer === "almost" ? "Almost." : "Not yet.";
  const res = await callTuck({ message: `${label}${goal ? ` (goal: ${goal})` : ""}`.slice(0, 500), moment: "checkin", checkin: answer }, fetcher);
  useChatStore.setState({ checking: false, ...(res.ok && res.goal ? { goal: res.goal, goalFor: useChatStore.getState().task.trim() } : {}) });
  await reacting; // let the hop / nod / head tilt finish before he speaks
  if (res.ok) void performWhenFree(res);
}

/** pure: Tuck's body answer to "did you finish?" (existing clips only; the model never picks these) */
export function checkinReaction(answer: "yes" | "almost" | "no", reduced = false): BehaviorCommand[] {
  if (answer === "yes") return [{ kind: "emote", emotion: "excited", hold: 4 }, { kind: "lookAt", target: CAMERA }, { kind: "play", clip: reduced ? "wave" : "hop", fallback: ["happy"] }];
  if (answer === "almost") return [{ kind: "emote", emotion: "content", hold: 4 }, { kind: "lookAt", target: CAMERA }, { kind: "play", clip: "happy", fallback: ["weightShift"] }];
  // a kind head tilt: look a little up and to the side, curious face, settle
  return [{ kind: "emote", emotion: "curious", hold: 4 }, { kind: "lookAt", target: { x: 1.4, y: 2.1, z: 4 } }, { kind: "play", clip: "weightShift", fallback: ["idle"], hold: 1.2 }];
}

/** what a Tuck turn looks like when sent back as history (spoken line + answer, within the 2,000 cap) */
const historyText = (m: ChatMessage) => (m.answer ? `${m.text}\n\n${m.answer}` : m.text).slice(0, 2000);

/** Ask Tuck (study mode). Replies: the short line goes to his speech bubble, the answer to the panel. */
export async function sendMessage(text: string, fetcher: typeof fetch = fetch): Promise<ConversationResponse> {
  const message = text.trim().slice(0, 500);
  const chat = useChatStore.getState();
  if (!message || chat.pending) return fallback("invalid_request", "study");
  // the last 8 turns (~1,500 tokens) keep each request small, so Groq's tokens-per-minute cap goes further
  const history = windowHistory(chat.messages.filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.role === "tuck" ? historyText(m) : m.text })), 8, 6000);
  useChatStore.setState({ pending: true, messages: [...chat.messages, { id: ++seq, role: "user" as const, text: message }] });
  useCompanionStore.getState().set({ lastInteraction: Date.now() });
  const ctl = getActiveController();
  if (ctl && ctl.emotions.emotion === "sleepy") ctl.setEmotion("content", PRIORITY.user, 0);
  // thinking: focused face, look at the user, hold still (seated if a session is running)
  void ctl?.run([{ kind: "emote", emotion: "focused", hold: 20 }, { kind: "lookAt", target: CAMERA }, { kind: "play", clip: studying() ? "sitIdle" : "idle", hold: 20 }], PRIORITY.user, "thinking");
  const res = await callTuck({ message, history }, fetcher);
  if (res.ok && res.goal) useChatStore.setState({ goal: res.goal, goalFor: useChatStore.getState().task.trim() });
  const reply: ChatMessage = { id: ++seq, role: "tuck", text: res.reply.dialogue, answer: res.ok ? res.answer || undefined : undefined, failed: res.ok ? undefined : res.reason ?? "unavailable" };
  useChatStore.setState((s) => ({ pending: false, messages: [...s.messages, reply].slice(-30) }));
  const c = res.ok ? res.reply.memory_candidate : null;
  if (c && memory().enabled() && !memory().has(c.kind, c.value)) useChatStore.setState({ candidate: c });
  if (res.ok) { const kv = browserKV(); if (kv) { const s = loadSession(kv, Date.now()); saveSession(kv, { ...s, conversations: s.conversations + 1, lastConversationAt: Date.now() }); } }
  void performWhenFree(res);
  return res;
}

/** Try a failed question again: its failed reply and the question itself are replaced by the new attempt. */
export function retryMessage(failedId: number) {
  const msgs = useChatStore.getState().messages;
  const i = msgs.findIndex((m) => m.id === failedId);
  const q = i > 0 ? msgs[i - 1] : undefined;
  if (!q || q.role !== "user" || useChatStore.getState().pending) return;
  useChatStore.setState({ messages: msgs.filter((_, k) => k !== i && k !== i - 1) });
  return sendMessage(q.text);
}

/** Leaving chat always hands Tuck back to his routine. */
export function closeConversation() {
  useChatStore.getState().setOpen(false);
  const ctl = getActiveController();
  if (ctl && ctl.activePriority === PRIORITY.user && (ctl.activeLabel === "thinking")) ctl.returnToIdle();
}
