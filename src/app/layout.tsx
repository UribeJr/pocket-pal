import type { Metadata, Viewport } from "next";
import { fraunces, inter, nunito } from "@/lib/fonts";
import { copy } from "@/lib/copy";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: `${copy.app.headline} · ${copy.app.tagline}`,
  description: copy.app.description,
  appleWebApp: { capable: true, title: "Tuck", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false,
  viewportFit: "cover", themeColor: "#D5D2CB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable} ${inter.variable}`}>
      <body>{children}<Analytics /></body>
    </html>
  );
}
