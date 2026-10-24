import type { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { PRIORITY } from "@/types/companion";

/** Tap on Tuck: wakes him if sleepy, then the arbitrated tap reaction. */
export function handleTuckTap(ctl: CharacterControllerImpl) {
  if (ctl.emotions.emotion === "sleepy") ctl.setEmotion("content", PRIORITY.user, 0);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
  ctl.react("tap");
}
