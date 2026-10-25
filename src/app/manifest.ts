import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pocket Pal — Study with Tuck", short_name: "Pocket Pal", description: "Study alongside Tuck, a tiny acorn who keeps you company while you focus.",
    start_url: "/", scope: "/", display: "standalone", orientation: "any",
    background_color: "#D5D2CB", theme_color: "#D5D2CB",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
