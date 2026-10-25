import { describe, it, expect } from "vitest";
import { applySettings, endsAt, fmtClock, initialPomo, localDay, migrateV1, pause, remainingMs, reset, resolve, resume, skip, start, type PomoData, type PomoEvent } from "@/companion/pomodoro";
import { DEFAULT_SETTINGS as S, type StudySettings } from "@/companion/settings";

const MIN = 60_000;
const T0 = new Date(2026, 9, 26, 9, 0, 0).getTime(); // a local 9:00 am
const types = (e: PomoEvent[]) => e.map((x) => x.type);

describe("pomodoro engine (timestamps only)", () => {
  it("starts at 25:00 and counts down from timestamps, without drift", () => {
    const p0 = initialPomo(S);
    expect(fmtClock(remainingMs(p0, T0))).toBe("25:00");
    const { state, events } = start(p0, T0, S);
    expect(types(events)).toEqual(["focusStarted"]);
    expect(remainingMs(state, T0 + 1)).toBe(25 * MIN - 1);
    expect(fmtClock(remainingMs(state, T0 + 12 * MIN + 28_000))).toBe("12:32");
    // a million irregular "ticks" can't accumulate error: remaining depends only on now
    expect(remainingMs(state, T0 + 24 * MIN + 59_999)).toBe(1);
  });

  it("pause holds the remaining time; resume continues from it", () => {
    let p = start(initialPomo(S), T0, S).state;
    p = pause(p, T0 + 10 * MIN).state;
    expect(remainingMs(p, T0 + 50 * MIN)).toBe(15 * MIN);
    expect(resolve(p, T0 + 50 * MIN, S).events).toEqual([]); // paused never completes
    p = resume(p, T0 + 50 * MIN).state;
    expect(remainingMs(p, T0 + 50 * MIN)).toBe(15 * MIN);
    expect(endsAt(p)).toBe(T0 + 65 * MIN);
  });

  it("focus completes once, counts, and auto-starts a short break at the exact boundary", () => {
    let p = start(initialPomo(S), T0, S).state;
    const r = resolve(p, T0 + 25 * MIN + 3000, S);
    expect(types(r.events)).toEqual(["focusCompleted", "breakStarted"]);
    expect(r.events[1].at).toBe(T0 + 25 * MIN);
    p = r.state;
    expect(p).toMatchObject({ phase: "short", status: "running", completedToday: 1, focusDone: 1 });
    expect(remainingMs(p, T0 + 25 * MIN + 3000)).toBe(5 * MIN - 3000);
    expect(resolve(p, T0 + 25 * MIN + 3000, S).events).toEqual([]); // no duplicate on the next look
  });

  it("after a break the next focus waits for Start (auto-start focus off)", () => {
    let p = start(initialPomo(S), T0, S).state;
    p = resolve(p, T0 + 31 * MIN, S).state;
    expect(p).toMatchObject({ phase: "focus", status: "ready" });
    expect(remainingMs(p, T0 + 99 * MIN)).toBe(25 * MIN);
  });

  it("the 4th focus is followed by a long break and the cycle restarts", () => {
    let p = initialPomo(S); let t = T0;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      p = start(p, t, S).state;
      t += 25 * MIN;
      p = resolve(p, t, S).state;                 // focus ends -> a break starts by itself
      seen.push(p.phase);
      t += (p.phase === "long" ? 15 : 5) * MIN;
      p = resolve(p, t, S).state;                 // break ends -> focus waits for Start
    }
    expect(seen).toEqual(["short", "short", "short", "long"]);
    expect(p).toMatchObject({ phase: "focus", status: "ready", focusDone: 0, completedToday: 4 });
  });

  it("a long absence crossing several boundaries resolves in one pass with every completion counted", () => {
    const s: StudySettings = { ...S, autoStartFocus: true };
    let p = start(initialPomo(s), T0, s).state;
    const r = resolve(p, T0 + 3 * 60 * MIN, s); // 3 hours away (system sleep, closed lid ...)
    p = r.state;
    expect(r.events.filter((e) => e.type === "focusCompleted").length).toBe(p.completedToday);
    expect(p.completedToday).toBeGreaterThanOrEqual(5);
    const ids = r.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(resolve(p, T0 + 3 * 60 * MIN, s).events).toEqual([]);
  });

  it("the old single-session timer's bug is gone: a session that ended while closed still counts", () => {
    const p = start(initialPomo(S), T0, S).state;
    const r = resolve(p, T0 + 8 * 60 * MIN, S); // focus + break ended long ago
    expect(r.state.completedToday).toBe(1);
    expect(r.state).toMatchObject({ phase: "focus", status: "ready" });
  });

  it("a reload mid-phase continues from the same timestamps", () => {
    const p = start(initialPomo(S), T0, S).state;
    const reloaded: PomoData = JSON.parse(JSON.stringify(p));
    expect(remainingMs(reloaded, T0 + 7 * MIN)).toBe(18 * MIN);
  });

  it("skip: a skipped focus is not counted and goes to a break; a skipped break goes to a ready focus", () => {
    let p = start(initialPomo(S), T0, S).state;
    const a = skip(p, T0 + 3 * MIN, S);
    expect(types(a.events)).toEqual(["focusSkipped", "breakStarted"]);
    expect(a.state).toMatchObject({ phase: "short", status: "running", completedToday: 0, focusDone: 0 });
    const b = skip(a.state, T0 + 4 * MIN, S);
    expect(types(b.events)).toEqual(["breakSkipped"]);
    expect(b.state).toMatchObject({ phase: "focus", status: "ready" });
    p = b.state;
    expect(remainingMs(p, T0 + 50 * MIN)).toBe(25 * MIN);
  });

  it("reset returns to a ready full-length focus and keeps the cycle position", () => {
    let p = start(initialPomo(S), T0, S).state;
    p = resolve(p, T0 + 25 * MIN, S).state; // in a break, 1 done
    const r = reset(p, T0 + 26 * MIN, S);
    expect(r.state).toMatchObject({ phase: "focus", status: "ready", focusDone: 1, durationMs: 25 * MIN });
    expect(types(r.events)).toEqual(["reset"]);
  });

  it("event ids are monotonic across actions, so a consumer can de-duplicate with one number", () => {
    let p = initialPomo(S); const all: PomoEvent[] = [];
    for (const step of [(q: PomoData) => start(q, T0, S), (q: PomoData) => pause(q, T0 + MIN), (q: PomoData) => resume(q, T0 + 2 * MIN), (q: PomoData) => resolve(q, T0 + 30 * MIN, S)]) {
      const o = step(p); p = o.state; all.push(...o.events);
    }
    expect(all.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(p.seq).toBe(5);
  });

  it("settings change the next phase, never the running one", () => {
    const s2 = { ...S, focusMin: 50 };
    const ready = applySettings(initialPomo(S), s2);
    expect(ready.durationMs).toBe(50 * MIN);
    const running = start(initialPomo(S), T0, S).state;
    expect(applySettings(running, s2).durationMs).toBe(25 * MIN);
  });

  it("the daily count resets on a new local day", () => {
    let p = start(initialPomo(S), T0, S).state;
    p = resolve(p, T0 + 26 * MIN, S).state;
    expect(p.completedToday).toBe(1);
    const tomorrow = T0 + 24 * 60 * MIN;
    expect(resolve(p, tomorrow, S).state).toMatchObject({ completedToday: 0, day: localDay(tomorrow) });
  });

  it("migrates a running v1 focus session once", () => {
    const v1 = { session: { minutes: 25, startedAt: T0, focusMs: 25 * MIN, breakMs: 5 * MIN }, seen: "focus", day: localDay(T0), completedToday: 2 };
    const m = migrateV1(v1, T0 + 5 * MIN, S)!;
    expect(m).toMatchObject({ phase: "focus", status: "running", startedAt: T0, completedToday: 2 });
    expect(remainingMs(m, T0 + 5 * MIN)).toBe(20 * MIN);
    expect(migrateV1({ nope: 1 }, T0, S)).toBeNull();
  });
});
