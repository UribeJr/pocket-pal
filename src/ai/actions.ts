import type { BehaviorCommand, Emotion } from "@/types/companion";

/** Semantic actions the model may request. Each maps ONLY to existing controller clips. */
export const AI_ACTIONS = ["none", "hop", "cheer", "look_around", "nap"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Allowlisted adapter: action -> controller commands. Unknown/unsafe -> []. */
export function actionCommands(action: string, emotion: Emotion): BehaviorCommand[] {
  switch (action) {
    case "hop": return [{ kind: "play", clip: "hop", fallback: ["happy"] }];
    case "cheer": return [{ kind: "play", clip: "happy", fallback: ["hop"] }];
    case "look_around": return [{ kind: "play", clip: "lookAround" }];
    case "nap": return emotion === "sleepy" ? [{ kind: "play", clip: "sleep", hold: 2.5 }] : [];
    default: return [];
  }
}
