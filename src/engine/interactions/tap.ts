import type { CharacterController } from "@/types/companion";
import { useCompanionStore } from "@/stores/companionStore";

/** Tap on Tuck: wakes him if sleepy, otherwise a happy hop. */
export function handleTuckTap(ctl: CharacterController) {
  const st = useCompanionStore.getState();
  if (st.emotion === "sleepy") st.set({ emotion: "neutral" });
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
  ctl.react("tap");
}
