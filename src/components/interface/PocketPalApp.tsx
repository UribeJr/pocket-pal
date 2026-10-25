"use client";
import type { LayoutMode } from "@/types/companion";
import { StudyApp } from "@/components/study/StudyApp";

/**
 * Entry for `/`, `/desk` and `/pocket`. Phase 6: the app is "Study with Tuck" (timer + Tuck);
 * landscape = desk (two columns), portrait = pocket (stacked). `forced` pins a layout.
 */
export function PocketPalApp({ forced }: { forced?: LayoutMode }) {
  return <StudyApp forced={forced} />;
}
