"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useIsLandscape } from "@/lib/hooks";
import { useCompanionStore } from "@/stores/companionStore";
import type { LayoutMode } from "@/types/companion";
import { useSessionPersistence } from "@/companion/useSessionPersistence";
import { DeskOverlay } from "./DeskOverlay";
import { PocketPanel } from "./PocketPanel";

const Scene = dynamic(() => import("@/components/environment/Scene"), { ssr: false });

/**
 * One persistent Canvas for both layouts: switching orientation only changes the
 * container + camera framing, so the 3D scene and Zustand state never reset.
 */
export function PocketPalApp({ forced }: { forced?: LayoutMode }) {
  const landscape = useIsLandscape();
  useSessionPersistence();
  const layout = useCompanionStore((s) => s.layout);
  const set = useCompanionStore((s) => s.set);
  useEffect(() => {
    if (forced) set({ layout: forced });
    else if (landscape !== null) set({ layout: landscape ? "desk" : "pocket" });
  }, [forced, landscape, set]);

  // render time-dependent UI only on the client to avoid hydration mismatches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const desk = layout === "desk";
  return (
    <main className="fixed inset-0 overflow-hidden bg-night text-cream" data-layout={layout}>
      {!desk && (
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-center safe-pt pt-2">
          <h1 className="font-display text-[17px] font-semibold text-cream">Tuck</h1>
        </header>
      )}
      <div className={desk ? "absolute inset-0" : "absolute inset-x-0 top-0 h-[46%]"} style={{ transition: "height .35s ease" }}>
        <Scene />
      </div>
      {mounted && (desk ? <DeskOverlay /> : <PocketPanel />)}
    </main>
  );
}
