import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pocket Pal", short_name: "Pocket Pal", description: "A tiny life happening alongside yours.",
    start_url: "/", scope: "/", display: "standalone", orientation: "any",
    background_color: "#1E2433", theme_color: "#1E2433",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
