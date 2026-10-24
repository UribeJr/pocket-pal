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
  activity: z.enum(["idle", "wandering", "sleeping", "reacting", "conversing"]),
  recentTaps: z.number().int().min(0).max(99),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshot>;

export const ChatTurn = z.strictObject({ role: z.enum(["user", "tuck"]), text: z.string().min(1).max(500) });
export type ChatTurn = z.infer<typeof ChatTurn>;

export const ConversationRequest = z.strictObject({
  message: z.string().trim().min(1).max(500),
  history: z.array(ChatTurn).max(12).default([]),
  context: ContextSnapshot.optional(),
  deviceId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
});
export type ConversationRequest = z.infer<typeof ConversationRequest>;

export type FallbackReason = "nokey" | "unavailable" | "rate_limited" | "misconfigured" | "invalid_request" | "offline" | "forbidden";
export interface ConversationResponse { ok: boolean; reason?: FallbackReason; reply: TuckReply; recovered?: boolean }
