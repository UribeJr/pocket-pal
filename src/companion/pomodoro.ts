"use client";
import { create } from "zustand";
import { z } from "zod";
import { browserKV, load, save, PREFIX } from "./persist";
import { clock } from "@/engine/simulation/clock";
import { DEFAULT_SETTINGS, type StudySettings } from "./settings";

/**
 * Pomodoro engine. Pure timestamps: the remaining time is always derived from (now - startedAt - paused),
 * never from a decrementing counter, so background tabs, reloads, rotation and system sleep cannot drift it.
 * `resolve()` rolls forward through every boundary that passed while nobody was looking and emits each
 * transition exactly once (monotonic event ids); `acted` records what Tuck already performed.
 */
export type PomoPhase = "focus" | "short" | "long";
export type PomoStatus = "ready" | "running" | "paused";
export type PomoEventType = "focusStarted" | "focusCompleted" | "focusSkipped" | "breakStarted" | "breakCompleted" | "breakSkipped" | "paused" | "resumed" | "reset";
export interface PomoEvent { id: number; type: PomoEventType; phase: PomoPhase; at: number; cycleCompleted?: boolean }

const PomoData = z.object({
  phase: z.enum(["focus", "short", "long"]),
  status: z.enum(["ready", "running", "paused"]),
  startedAt: z.number().nullable(),
  pausedAt: z.number().nullable(),
  pausedMs: z.number(),
  durationMs: z.number().positive(),
  /** focus sessions completed in the current cycle (a long break resets it) */
  focusDone: z.number().int().min(0),
  completedToday: z.number().int().min(0),
  day: z.string(),
  /** last event id issued / last event id Tuck performed */
  seq: z.number().int().min(0),
  acted: z.number().int().min(0),
});
export type PomoData = z.infer<typeof PomoData>;

export const minutesOf = (phase: PomoPhase, s: StudySettings) => (phase === "focus" ? s.focusMin : phase === "short" ? s.shortMin : s.longMin);
const durationOf = (phase: PomoPhase, s: StudySettings) => Math.round(minutesOf(phase, s) * 60_000);
/** local calendar day (YYYY-MM-DD) */
export const localDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export const initialPomo = (s: StudySettings = DEFAULT_SETTINGS): PomoData => ({
  phase: "focus", status: "ready", startedAt: null, pausedAt: null, pausedMs: 0, durationMs: durationOf("focus", s),
  focusDone: 0, completedToday: 0, day: "", seq: 0, acted: 0,
});

/** milliseconds left in the current phase */
export function remainingMs(p: PomoData, now: number): number {
  if (p.status === "ready" || p.startedAt === null) return p.durationMs;
  const until = p.status === "paused" && p.pausedAt !== null ? p.pausedAt : now;
  return Math.max(0, p.startedAt + p.durationMs + p.pausedMs - until);
}
/** when the running phase ends (null unless running) */
export const endsAt = (p: PomoData) => (p.status === "running" && p.startedAt !== null ? p.startedAt + p.durationMs + p.pausedMs : null);

type Out = { state: PomoData; events: PomoEvent[] };
const ev = (p: PomoData, type: PomoEventType, phase: PomoPhase, at: number, extra: Partial<PomoEvent> = {}): [PomoData, PomoEvent] => {
  const seq = p.seq + 1;
  return [{ ...p, seq }, { id: seq, type, phase, at, ...extra }];
};

function enter(p: PomoData, phase: PomoPhase, at: number, run: boolean, s: StudySettings): Out {
  let state: PomoData = { ...p, phase, status: run ? "running" : "ready", startedAt: run ? at : null, pausedAt: null, pausedMs: 0, durationMs: durationOf(phase, s) };
  if (!run) return { state, events: [] };
  const [next, e] = ev(state, phase === "focus" ? "focusStarted" : "breakStarted", phase, at);
  state = next;
  return { state, events: [e] };
}

export function start(p: PomoData, now: number, s: StudySettings): Out {
  if (p.status !== "ready") return { state: p, events: [] };
  return enter(p, p.phase, now, true, s);
}
export function pause(p: PomoData, now: number): Out {
  if (p.status !== "running") return { state: p, events: [] };
  const [state, e] = ev({ ...p, status: "paused", pausedAt: now }, "paused", p.phase, now);
  return { state, events: [e] };
}
export function resume(p: PomoData, now: number): Out {
  if (p.status !== "paused" || p.pausedAt === null) return { state: p, events: [] };
  const [state, e] = ev({ ...p, status: "running", pausedMs: p.pausedMs + Math.max(0, now - p.pausedAt), pausedAt: null }, "resumed", p.phase, now);
  return { state, events: [e] };
}
/** back to a ready focus at full length (the cycle position is kept) */
export function reset(p: PomoData, now: number, s: StudySettings): Out {
  const base = enter(p, "focus", now, false, s).state;
  const [state, e] = ev(base, "reset", "focus", now);
  return { state, events: [e] };
}
/** end the current phase now: a skipped focus is not counted; a skipped break leads to a ready focus */
export function skip(p: PomoData, now: number, s: StudySettings): Out {
  if (p.phase === "focus") {
    const [skipped, e] = ev(p, "focusSkipped", "focus", now);
    const next = enter(skipped, "short", now, s.autoStartBreaks && p.status !== "ready", s);
    return { state: next.state, events: [e, ...next.events] };
  }
  const [skipped, e] = ev(p, "breakSkipped", p.phase, now);
  const next = enter(skipped, "focus", now, false, s);
  return { state: next.state, events: [e, ...next.events] };
}

/** roll forward through every phase boundary up to `now`; each transition is emitted once */
export function resolve(p: PomoData, now: number, s: StudySettings): Out {
  let state = p;
  const events: PomoEvent[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const end = endsAt(state);
    if (end === null || end > now) break;
    if (state.phase === "focus") {
      const day = localDay(end);
      const completedToday = state.day === day ? state.completedToday + 1 : 1;
      const focusDone = state.focusDone + 1;
      const cycleCompleted = focusDone >= s.longEvery;
      const [done, e] = ev({ ...state, completedToday, day, focusDone: cycleCompleted ? 0 : focusDone }, "focusCompleted", "focus", end, { cycleCompleted });
      events.push(e);
      const next = enter(done, cycleCompleted ? "long" : "short", end, s.autoStartBreaks, s);
      state = next.state; events.push(...next.events);
    } else {
      const [done, e] = ev(state, "breakCompleted", state.phase, end);
      events.push(e);
      const next = enter(done, "focus", end, s.autoStartFocus, s);
      state = next.state; events.push(...next.events);
    }
  }
  // a new day resets the daily count even without a completion
  const today = localDay(now);
  if (state.day && state.day !== today) state = { ...state, day: today, completedToday: 0 };
  return { state, events };
}

/** new settings apply to a phase that has not started yet; a running phase keeps its length */
export function applySettings(p: PomoData, s: StudySettings): PomoData {
  return p.status === "ready" ? { ...p, durationMs: durationOf(p.phase, s) } : p;
}

/** one-time migration from the v1 single-session focus timer (pocketpal:v1:focus) */
const V1 = z.object({
  session: z.object({ minutes: z.number(), startedAt: z.number(), focusMs: z.number(), breakMs: z.number() }).nullable(),
  day: z.string(), completedToday: z.number(),
});
export function migrateV1(raw: unknown, now: number, s: StudySettings): PomoData | null {
  const r = V1.safeParse(raw);
  if (!r.success) return null;
  const base = { ...initialPomo(s), day: r.data.day, completedToday: r.data.completedToday };
  const ses = r.data.session;
  if (ses && now < ses.startedAt + ses.focusMs) return { ...base, status: "running", startedAt: ses.startedAt, durationMs: ses.focusMs };
  return base;
}

// ---------------------------------------------------------------------------------------------------
type Listener = (events: PomoEvent[]) => void;
const listeners = new Set<Listener>();
/** transition events (start, completion, skip ...) for the study director, notifications, title */
export const onPomodoroEvents = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

interface PomoStore extends PomoData {
  settings: StudySettings;
  hydrated: boolean;
  hydrate(settings: StudySettings): void;
  setSettings(s: StudySettings): void;
  tick(): void;
  start(): void; pause(): void; resume(): void; reset(): void; skip(): void;
  markActed(id: number): void;
}

const KEY = "pomodoro";
const pick = (s: PomoStore): PomoData => ({ phase: s.phase, status: s.status, startedAt: s.startedAt, pausedAt: s.pausedAt, pausedMs: s.pausedMs, durationMs: s.durationMs, focusDone: s.focusDone, completedToday: s.completedToday, day: s.day, seq: s.seq, acted: s.acted });

export const usePomodoro = create<PomoStore>((set, get) => {
  const commit = (out: Out) => {
    set(out.state);
    const kv = browserKV(); if (kv) save(kv, KEY, out.state);
    if (out.events.length) for (const l of listeners) l(out.events);
  };
  /** resolve elapsed boundaries first, then apply an action */
  const act = (fn: (p: PomoData, now: number, s: StudySettings) => Out) => {
    const now = clock.now(); const s = get().settings;
    const r = resolve(pick(get()), now, s);
    const o = fn(r.state, now, s);
    commit({ state: o.state, events: [...r.events, ...o.events] });
  };
  return {
    ...initialPomo(),
    settings: DEFAULT_SETTINGS,
    hydrated: false,
    hydrate(settings) {
      const kv = browserKV();
      let data = kv ? load<PomoData | null>(kv, KEY, PomoData.nullable(), null) : null;
      if (!data && kv) {
        try { const raw = kv.getItem(PREFIX + "focus"); if (raw) { data = migrateV1(JSON.parse(raw), clock.now(), settings); kv.removeItem(PREFIX + "focus"); } } catch { /* ignore */ }
      }
      set({ ...applySettings(data ?? initialPomo(settings), settings), settings, hydrated: true });
      get().tick();
    },
    setSettings(settings) { set({ settings }); const p = applySettings(pick(get()), settings); commit({ state: p, events: [] }); },
    tick() { const r = resolve(pick(get()), clock.now(), get().settings); if (r.events.length || r.state.day !== get().day) commit(r); },
    start: () => act(start),
    pause: () => act((p, now) => pause(p, now)),
    resume: () => act((p, now) => resume(p, now)),
    reset: () => act(reset),
    skip: () => act(skip),
    markActed(id) { if (id > get().acted) commit({ state: { ...pick(get()), acted: id }, events: [] }); },
  };
});

/** keep several tabs in step: another tab's save replaces ours (events are not re-emitted) */
export function syncAcrossTabs(): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: StorageEvent) => {
    if (e.key !== PREFIX + KEY || !e.newValue) return;
    try { const r = PomoData.safeParse(JSON.parse(e.newValue)); if (r.success) usePomodoro.setState(r.data); } catch { /* ignore */ }
  };
  window.addEventListener("storage", on);
  return () => window.removeEventListener("storage", on);
}

export const fmtClock = (ms: number) => { const t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
