"use client";
import { useEffect, useState } from "react";

export function useDocumentVisible() {
  const [v, setV] = useState(true);
  useEffect(() => {
    const on = () => setV(document.visibilityState !== "hidden");
    on(); document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return v;
}

export function useIsLandscape() {
  const [l, setL] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const on = () => setL(mq.matches); on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return l;
}

/** re-render on each minute boundary-ish (checks every second, cheap) */
export function useNow(intervalMs = 1000, make: () => Date = () => new Date()) {
  const [now, setNow] = useState<Date>(() => make());
  useEffect(() => { const id = setInterval(() => setNow(make()), intervalMs); return () => clearInterval(id); }, [intervalMs, make]);
  return now;
}
