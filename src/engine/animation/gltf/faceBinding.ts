import { faceFor } from "@/engine/emotion/EmotionController";
import { useCompanionStore } from "@/stores/companionStore";
import type { FaceDriver } from "./FaceDriver";

/**
 * Wire the GLB face to the existing state without React renders: emotion -> face preset
 * (EMOTION_STYLE's 4 faces map 1:1 to the GLB presets), speech text -> talk visemes.
 * Blink rate already arrives through the controller's setSpeed("blink", rate).
 */
export function bindFaceToStore(face: FaceDriver): () => void {
  const s0 = useCompanionStore.getState();
  face.setFace(faceFor(s0.emotion));
  if (s0.speech) face.speak(s0.speech);
  return useCompanionStore.subscribe((s, prev) => {
    if (s.emotion !== prev.emotion) face.setFace(faceFor(s.emotion));
    if (s.speech !== prev.speech) {
      if (s.speech) face.speak(s.speech);
      else face.stopSpeaking();
    }
  });
}
