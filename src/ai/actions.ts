import type { BehaviorCommand, Emotion } from "@/types/companion";

/** Semantic actions the model may request. Each maps ONLY to registered controller clips (with fallbacks). */
export const AI_ACTIONS = ["none", "hop", "cheer", "look_around", "nap", "stretch", "yawn", "inspect", "startle", "shift", "wake_up"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];
/** actions that keep Tuck in place / are safe while seated in a focus session */
export const QUIET_ACTIONS: readonly AiAction[] = ["none", "look_around", "yawn", "shift"];

/** Allowlisted adapter: action -> controller commands. Unknown/unsafe -> []. */
export function actionCommands(action: string, emotion: Emotion): BehaviorCommand[] {
  switch (action) {
    case "hop": return [{ kind: "play", clip: "hop", fallback: ["happy"] }];
    case "cheer": return [{ kind: "play", clip: "happy", fallback: ["hop"] }];
    case "look_around": return [{ kind: "play", clip: "lookAround" }];
    case "nap": return emotion === "sleepy" ? [{ kind: "play", clip: "sleep", hold: 2.5 }] : [];
    case "stretch": return [{ kind: "play", clip: "stretch", fallback: ["happy"] }];
    case "yawn": return [{ kind: "play", clip: "yawn", fallback: ["lookAround"] }];
    case "inspect": return [{ kind: "play", clip: "inspect", fallback: ["lookAround"] }];
    case "startle": return [{ kind: "play", clip: "startle", fallback: ["hop"] }];
    case "shift": return [{ kind: "play", clip: "weightShift", fallback: ["idle"], hold: 1 }];
    case "wake_up": return [{ kind: "play", clip: "wakeUp", fallback: ["lookAround"] }];
    default: return [];
  }
}
