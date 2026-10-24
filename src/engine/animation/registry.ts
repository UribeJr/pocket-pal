import type { ClipName, ProceduralClip } from "@/types/animation";

/** Clip registry: add clips anywhere with registerClip() — the controller/backends look them up by name. */
const clips = new Map<ClipName, ProceduralClip>();
export const registerClip = (clip: ProceduralClip) => { clips.set(clip.name, clip); };
export const getClip = (name: ClipName) => clips.get(name);
export const hasClip = (name: ClipName) => clips.has(name);
export const listClips = () => [...clips.keys()];
