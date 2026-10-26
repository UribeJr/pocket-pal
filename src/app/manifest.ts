import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tuck — your focus partner", short_name: "Tuck", description: "Meet Tuck, a tiny acorn who turns your task into one small goal and checks in when the timer ends.",
    start_url: "/", scope: "/", display: "standalone", orientation: "any",
    background_color: "#D5D2CB", theme_color: "#D5D2CB",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
