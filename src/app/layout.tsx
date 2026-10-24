import type { Metadata, Viewport } from "next";
import { fraunces, nunito } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pocket Pal",
  description: "A tiny life happening alongside yours.",
  appleWebApp: { capable: true, title: "Pocket Pal", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false,
  viewportFit: "cover", themeColor: "#1E2433",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
