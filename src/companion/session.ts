import { z } from "zod";
import type { Emotion } from "@/types/companion";
import { EMOTIONS } from "@/ai/schema";
import { load, save, type KV } from "./persist";

export const Session = z.strictObject({
  mood: z.enum(EMOTIONS), lastActiveAt: z.number(), firstMetAt: z.number(),
  conversations: z.number().int().min(0), lastConversationAt: z.number().nullable(),
});
export type Session = z.infer<typeof Session>;
export const loadSession = (kv: KV | null, now: number): Session => load(kv, "session", Session, { mood: "content", lastActiveAt: now, firstMetAt: now, conversations: 0, lastConversationAt: null });
export const saveSession = (kv: KV | null, s: Session) => save(kv, "session", s);

const MIN = 60_000, HOUR = 60 * MIN;
/** Elapsed-time catch-up: what mood to resume in and whether to greet. Never guilt. */
export function catchUp(s: Session, now: number, sleepyHour: boolean): { mood: Emotion; greeting: string | null; elapsedMs: number } {
  const elapsedMs = Math.max(0, now - s.lastActiveAt);
  const transient: Emotion[] = ["excited", "surprised", "playful", "focused"];
  const mood: Emotion = elapsedMs < 10 * MIN ? s.mood : sleepyHour ? "sleepy" : transient.includes(s.mood) ? "content" : s.mood === "sleepy" && !sleepyHour ? "content" : s.mood;
  let greeting: string | null = null;
  if (elapsedMs >= 3 * 24 * HOUR) greeting = "oh, hey. been a bit.";
  else if (elapsedMs >= 8 * HOUR) greeting = sleepyHour ? "mm. you're back. i was mid-nap." : "oh. you're back. nothing happened, promise.";
  else if (elapsedMs >= 30 * MIN) greeting = "oh, you're back.";
  return { mood, greeting, elapsedMs };
}

const ago = (ms: number) => ms < HOUR ? "minutes ago" : ms < 24 * HOUR ? `${Math.round(ms / HOUR)}h ago` : `${Math.round(ms / (24 * HOUR))} days ago`;
export function familiarityText(s: Session, now: number): string {
  const met = now - s.firstMetAt;
  return `met ${met < 24 * HOUR ? "today" : ago(met)}; ${s.conversations} chats${s.lastConversationAt != null ? `; last chat ${ago(now - s.lastConversationAt)}` : ""}`;
}
