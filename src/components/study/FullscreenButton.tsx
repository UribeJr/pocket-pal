"use client";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";

type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const supported = () => { const d = document as FsDoc; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled); };
const isFull = () => { const d = document as FsDoc; return !!(d.fullscreenElement || d.webkitFullscreenElement); };
/** installed to the home screen (or another standalone window): the browser's bars are already gone */
const standalone = () => window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Full screen where the browser allows it (Android, iPad, desktop). iPhone Safari doesn't let a page
 * hide its own toolbars, so there the button explains the one way that works: Add to Home Screen,
 * which opens Tuck as a standalone app with no browser bars (see the manifest).
 */
export function FullscreenButton() {
  const [mode, setMode] = useState<"api" | "hint" | null>(null);
  const [full, setFull] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (standalone()) return;
    setMode(supported() ? "api" : /iPhone|iPod/.test(navigator.userAgent) ? "hint" : null);
    const on = () => setFull(isFull());
    document.addEventListener("fullscreenchange", on); document.addEventListener("webkitfullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); };
  }, []);
  useEffect(() => { if (!hint) return; const t = setTimeout(() => setHint(false), 6000); return () => clearTimeout(t); }, [hint]);
  if (!mode) return null;

  const toggle = async () => {
    if (mode === "hint") { setHint((h) => !h); return; }
    const d = document as FsDoc; const el = document.documentElement as FsEl;
    try {
      if (isFull()) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      else await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
    } catch { /* the browser said no (e.g. not from a tap): nothing to do */ }
  };
  const label = full ? copy.fullscreen.exit : copy.fullscreen.enter;
  return (
    <>
      <button type="button" className="icon-btn" aria-label={label} title={label} aria-expanded={mode === "hint" ? hint : undefined} onClick={() => void toggle()} data-testid="fullscreen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
        </svg>
      </button>
      {hint && <p role="status" className="fs-hint fade-in" data-testid="fullscreen-hint">{copy.fullscreen.iosHint}</p>}
    </>
  );
}
