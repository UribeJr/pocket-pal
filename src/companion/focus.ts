"use client";
import { create } from "zustand";
import { z } from "zod";
import { browserKV, load, save } from "./persist";
import { clock } from "@/engine/simulation/clock";

/** Focus sessions are pure timestamps: phase is always derived from (now - startedAt), so reloads, rotation and sleep are free. */
export const PRESETS = [15, 25, 50] as const;
export type Preset = (typeof PRESETS)[number];
export const breakFor = (m: number) => (m >= 50 ? 10 : 5);
export type FocusPhase = "idle" | "focus" | "break" | "done";

const Session = z.object({ minutes: z.number(), startedAt: z.number(), focusMs: z.number(), breakMs: z.number() });
const FocusData = z.object({
  session: Session.nullable(),
  /** last phase Tuck has already performed for this session (prevents replaying on reload) */
  seen: z.enum(["idle", "focus", "break", "done"]),
  day: z.string(), completedToday: z.number(),
});
type FocusData = z.infer<typeof FocusData>;
const DEFAULT: FocusData = { session: null, seen: "idle", day: "", completedToday: 0 };
const DONE_LINGER_MS = 60_000;

export function phaseAt(s: FocusData["session"], now: number): { phase: FocusPhase; remainingMs: number; progress: number } {
  if (!s) return { phase: "idle", remainingMs: 0, progress: 0 };
  const t = now - s.startedAt;
  if (t < s.focusMs) return { phase: "focus", remainingMs: s.focusMs - Math.max(0, t), progress: Math.max(0, t) / s.focusMs };
  if (t < s.focusMs + s.breakMs) return { phase: "break", remainingMs: s.focusMs + s.breakMs - t, progress: (t - s.focusMs) / s.breakMs };
  if (t < s.focusMs + s.breakMs + DONE_LINGER_MS) return { phase: "done", remainingMs: 0, progress: 1 };
  return { phase: "idle", remainingMs: 0, progress: 0 };
}

interface FocusState extends FocusData {
  picker: boolean;
  setPicker(o: boolean): void;
  start(minutes: number): void;
  cancel(): void;
  markSeen(p: FocusPhase): void;
  hydrate(): void;
}
const persist = (d: FocusData) => { const kv = browserKV(); if (kv) save(kv, "focus", d); };
const today = () => new Date(clock.now()).toISOString().slice(0, 10);

export const useFocusStore = create<FocusState>((set, get) => ({
  ...DEFAULT,
  picker: false,
  setPicker: (picker) => set({ picker }),
  hydrate() { const kv = browserKV(); if (kv) set(load(kv, "focus", FocusData, DEFAULT)); },
  start(minutes) {
    const m = Math.min(120, Math.max(1, Math.round(minutes)));
    const d: FocusData = { ...pick(get()), session: { minutes: m, startedAt: clock.now(), focusMs: m * 60_000, breakMs: breakFor(m) * 60_000 }, seen: "idle" };
    set({ ...d, picker: false }); persist(d);
  },
  cancel() { const d: FocusData = { ...pick(get()), session: null, seen: "idle" }; set(d); persist(d); },
  markSeen(p) {
    const cur = pick(get());
    let { day, completedToday } = cur;
    if (p === "break" && cur.seen === "focus" || p === "break" && cur.seen === "idle") { const t = today(); completedToday = day === t ? completedToday + 1 : 1; day = t; }
    const d: FocusData = { ...cur, seen: p, day, completedToday, session: p === "idle" ? null : cur.session };
    set(d); persist(d);
  },
}));
const pick = (s: FocusState): FocusData => ({ session: s.session, seen: s.seen, day: s.day, completedToday: s.completedToday });

export const fmtRemaining = (ms: number) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
