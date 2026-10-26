import { z } from "zod";
import type { Emotion } from "@/types/companion";
import { EMOTION_STYLE } from "@/engine/emotion/EmotionController";
import { AI_ACTIONS } from "./actions";

export const EMOTIONS = Object.keys(EMOTION_STYLE) as [Emotion, ...Emotion[]];
export const MEMORY_KINDS = ["name", "likes", "dislikes", "hobby", "game", "topic", "other"] as const;

export const TuckReply = z.strictObject({
  dialogue: z.string().min(1).max(220),
  emotion: z.enum(EMOTIONS),
  action: z.enum(AI_ACTIONS),
  memory_candidate: z.strictObject({ kind: z.enum(MEMORY_KINDS), value: z.string().max(80) }).nullable(),
});
export type TuckReply = z.infer<typeof TuckReply>;

/** Strict-mode compatible JSON schema for Groq structured outputs. */
export const TUCK_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dialogue", "emotion", "action", "memory_candidate"],
  properties: {
    dialogue: { type: "string", description: "What Tuck says. 1-2 short sentences." },
    emotion: { type: "string", enum: EMOTIONS },
    action: { type: "string", enum: [...AI_ACTIONS] },
    memory_candidate: {
      anyOf: [
        { type: "object", additionalProperties: false, required: ["kind", "value"], properties: { kind: { type: "string", enum: [...MEMORY_KINDS] }, value: { type: "string" } } },
        { type: "null" },
      ],
    },
  },
} as const;

export const ContextSnapshot = z.strictObject({
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  timeOfDay: z.enum(["morning", "afternoon", "evening", "night"]),
  layout: z.enum(["desk", "pocket"]),
  mood: z.enum(EMOTIONS),
  activity: z.enum(["idle", "wandering", "sleeping", "reacting", "conversing", "focusing", "on_break"]),
  recentTaps: z.number().int().min(0).max(99),
  memories: z.array(z.string().min(1).max(100)).max(8).optional(),
  familiarity: z.string().max(160).optional(),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshot>;

/** Tuck's study answers are longer than chat lines, so history turns may be too (user messages stay <= 500) */
export const ChatTurn = z.strictObject({ role: z.enum(["user", "tuck"]), text: z.string().min(1).max(2000) });
export type ChatTurn = z.infer<typeof ChatTurn>;

/** the focus session, attached once per request (never streamed per tick) */
export const StudyContext = z.strictObject({
  phase: z.enum(["focus", "short_break", "long_break"]),
  status: z.enum(["ready", "running", "paused"]),
  minutesLeft: z.number().int().min(0).max(240),
  focusDoneToday: z.number().int().min(0).max(99),
  cycle: z.string().max(12),
  subject: z.string().trim().max(80).optional(),
  /** the timer's real lengths, so plans and goals fit the session the user actually has */
  focusMin: z.number().int().min(1).max(240).optional(),
  shortMin: z.number().int().min(1).max(240).optional(),
  longMin: z.number().int().min(1).max(240).optional(),
  elapsedMin: z.number().int().min(0).max(240).optional(),
  /** what the user said they're working on, and the goal Tuck set for this session */
  task: z.string().trim().max(120).optional(),
  goal: z.string().trim().max(120).optional(),
});
export type StudyContext = z.infer<typeof StudyContext>;

export const ConversationRequest = z.strictObject({
  message: z.string().trim().min(1).max(500),
  history: z.array(ChatTurn).max(12).default([]),
  context: ContextSnapshot.optional(),
  /** "study": Ask Tuck (longer, structured help); "companion": the original one-line chat */
  mode: z.enum(["companion", "study"]).default("companion"),
  study: StudyContext.optional(),
  /** focus partner moments: "start" sets a goal for the task, "checkin" answers "did you finish?", "chat" is Ask Tuck */
  moment: z.enum(["start", "checkin", "chat"]).default("chat"),
  checkin: z.enum(["yes", "almost", "no"]).optional(),
  deviceId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
});
export type ConversationRequest = z.infer<typeof ConversationRequest>;

/** study mode: a short spoken line for the speech bubble + the actual help for the panel */
export const StudyReply = z.strictObject({
  line: z.string().min(1).max(120),
  answer: z.string().max(1600),
  /** one concrete step for the next focus session ("" when none) */
  goal: z.string().max(120).default(""),
  emotion: z.enum(EMOTIONS),
  action: z.enum(AI_ACTIONS),
  memory_candidate: z.strictObject({ kind: z.enum(MEMORY_KINDS), value: z.string().max(80) }).nullable(),
});
export type StudyReply = z.infer<typeof StudyReply>;

export const STUDY_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line", "answer", "goal", "emotion", "action", "memory_candidate"],
  properties: {
    line: { type: "string", description: "What Tuck says aloud in his speech bubble: one short, warm sentence in sentence case, under 15 words." },
    answer: { type: "string", description: "Optional extra help in simple Markdown (- bullets, 1. steps, **bold**), at most ~70 words. Empty string when not needed." },
    goal: { type: "string", description: "One concrete, finishable step for a focus session, under 10 words, starting with a verb. Empty string when not setting a goal." },
    emotion: { type: "string", enum: EMOTIONS },
    action: { type: "string", enum: [...AI_ACTIONS] },
    memory_candidate: TUCK_REPLY_JSON_SCHEMA.properties.memory_candidate,
  },
} as const;

export type FallbackReason = "nokey" | "unavailable" | "rate_limited" | "misconfigured" | "invalid_request" | "offline" | "forbidden";
/** `answer` is present in study mode (the panel shows it; the bubble shows reply.dialogue) */
export interface ConversationResponse { ok: boolean; reason?: FallbackReason; reply: TuckReply; answer?: string; goal?: string; recovered?: boolean }
