/**
 * Swap point for the real character. When a rigged GLB with named clips
 * (idle, walk, hop, happy, talk, blink...) lands in /public/models, set modelUrl
 * and the GltfTuck + GltfBackend path is used instead of the primitive stand-in.
 */
export const characterConfig = {
  modelUrl: null as string | null, // e.g. "/models/tuck.glb"
  /** map GLB clip names to our clip names if they differ */
  clipMap: {} as Record<string, string>,
};
