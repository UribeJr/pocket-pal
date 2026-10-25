"use client";
import { useEffect, useRef } from "react";

/** Minimal modal behaviour: focus moves in on open, Tab stays inside, Escape closes, focus returns on close. */
export function useDialog<T extends HTMLElement>(onClose: () => void, initial?: () => HTMLElement | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current;
    (initial?.() ?? root?.querySelector<HTMLElement>("input, button, textarea, [tabindex]"))?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("a, button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", on);
    return () => { document.removeEventListener("keydown", on); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
