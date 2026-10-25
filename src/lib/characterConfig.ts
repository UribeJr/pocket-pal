/**
 * Swap point for the character. The approved Blender GLB (tuck-character-studio Phase 4 baseline,
 * md5 df90636e…) lives in /public/models; GltfTuckModel + GltfBackend drive it. The procedural
 * stand-in (LegacyTuckModel + ProceduralBackend) stays as the fallback.
 */
export type TuckRenderer = "glb" | "legacy";

export const characterConfig = {
  modelUrl: "/models/tuck.glb",
  /** app clip names played by a different GLB clip (focus "knitting" uses the approved seated loop) */
  clipAliases: { sitKnit: "sitIdle" } as Record<string, string>,
  /** GLB only: root yaw while walking (legacy keeps 0.9). Larger = feet slide less, face shows less. */
  walkYaw: 1.2,
};

const DEV_KEY = "pocketpal:dev:tuck";

/**
 * Which Tuck to render. Build-time NEXT_PUBLIC_TUCK_RENDERER ("glb" default | "legacy") is the
 * production revert switch; in development `?tuck=legacy|glb` overrides it for the tab session.
 */
export function rendererFor(): TuckRenderer {
  const built: TuckRenderer = process.env.NEXT_PUBLIC_TUCK_RENDERER === "legacy" ? "legacy" : "glb";
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return built;
  try {
    const q = new URLSearchParams(window.location.search).get("tuck");
    if (q === "legacy" || q === "glb") sessionStorage.setItem(DEV_KEY, q);
    const v = sessionStorage.getItem(DEV_KEY);
    return v === "legacy" || v === "glb" ? v : built;
  } catch {
    return built;
  }
}
