import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import type { AnimationBackend, ClipName, PlayOptions } from "@/types/animation";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { useCompanionStore } from "@/stores/companionStore";
import { BehaviorEngine, DOZE_AFTER_S, type EngineContext } from "@/engine/behavior/BehaviorEngine";
import { LIVING_CLIPS } from "@/engine/animation/livingClips";
import { getClip } from "@/engine/animation/registry";
import "@/engine/animation/proceduralClips";
import "@/engine/animation/livingClips";
import { AI_ACTIONS, actionCommands } from "@/ai/actions";
import { parseReaction, react, localReaction, buildReactPrompt, ReactRequest, REACT_EVENTS } from "@/ai/react";
import { MockProvider, ProviderError } from "@/ai/provider";
import { reactionCommands, shouldAsk, _resetReactionCooldowns } from "@/companion/reactions";

class FakeBackend implements AnimationBackend {
  plays: ClipName[] = []; cur: ClipName = "idle"; t = 0; cb?: () => void;
  constructor(public clips: Record<string, number | "loop">) {}
  has(n: ClipName) { return n in this.clips; }
  isLoop(n: ClipName) { return this.clips[n] === "loop"; }
  play(n: ClipName, o: PlayOptions = {}) { this.plays.push(n); this.cur = n; this.t = 0; this.cb = o.onFinished; }
  current() { return this.cur; }
  setOverlay() {}
  update(dt: number) { const d = this.clips[this.cur]; this.t += dt; if (typeof d === "number" && this.t >= d && this.cb) { const c = this.cb; this.cb = undefined; c(); } }
}
const ALL = { idle: "loop", walk: "loop", talk: "loop", sleep: "loop", sitIdle: "loop", sitKnit: "loop", hop: 0.9, happy: 1.4, lookAround: 3.2, stretch: 2.6, weightShift: 2.2, sitDown: 1.1, standUp: 0.9, yawn: 2.4, wakeUp: 1.6, inspect: 2.8, startle: 1, flip: 1.5, pinNote: 1.8 } as const;
const tick = (c: CharacterControllerImpl, secs: number, step = 1 / 30) => { for (let t = 0; t < secs; t += step) c.update(step); };
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const ctxOf = (p: Partial<EngineContext> = {}): EngineContext => ({ hour: 14, daylight: 1, layout: "desk", focus: "ready", posX: 0, idleFor: 0, ...p });

let be: FakeBackend; let root: THREE.Object3D; let ctl: CharacterControllerImpl;
beforeEach(() => {
  useCompanionStore.setState({ emotion: "content", animation: "idle", posX: 0, facing: 0, tapCount: 0, speech: null, behavior: "idle", layout: "desk" });
  be = new FakeBackend({ ...ALL }); root = new THREE.Object3D();
  ctl = new CharacterControllerImpl(be, root, null);
});

describe("living clips", () => {
  it("registers every new clip with finite poses", () => {
    for (const c of LIVING_CLIPS) {
      expect(getClip(c.name)).toBe(c);
      for (const t of [0, c.duration * 0.3, c.duration * 0.7, c.duration]) for (const off of Object.values(c.sample(t, { speed: 1 }))) for (const v of [off?.p, off?.r, off?.s]) v?.forEach((n) => expect(Number.isFinite(n)).toBe(true));
    }
  });
  it("every AI action maps only to registered clips", () => {
    for (const a of AI_ACTIONS) for (const c of actionCommands(a, "sleepy")) if (c.kind === "play") expect(getClip(c.clip)).toBeTruthy();
  });
  it("a missing clip falls back through the chain, then to idle", async () => {
    const thin = new FakeBackend({ idle: "loop", walk: "loop", lookAround: 1 });
    const c = new CharacterControllerImpl(thin, new THREE.Object3D(), null);
    const p = c.run([{ kind: "play", clip: "stretch", fallback: ["lookAround"] }, { kind: "play", clip: "pinNote", hold: 0.2 }], 1, "x");
    tick(c, 2);
    expect(await p).toBe("done");
    expect(thin.plays).toContain("lookAround");
    expect(thin.plays).not.toContain("stretch");
  });
});

describe("controller: face, signal, rest clip", () => {
  it("faces the target yaw on arrival and returns to camera after", async () => {
    const p = ctl.run([{ kind: "moveTo", x: 0.4 }, { kind: "face", yaw: 1.2 }, { kind: "wait", seconds: 1.5 }], 1, "go");
    tick(ctl, 1.0); tick(ctl, 1.4);
    expect(root.rotation.y).toBeGreaterThan(0.8);
    expect(await p).toBe("done");
    tick(ctl, 2);
    expect(Math.abs(root.rotation.y)).toBeLessThan(0.1);
  });
  it("signals reach listeners in order with the job", async () => {
    const got: string[] = []; ctl.onSignal((n) => got.push(n));
    const p = ctl.run([{ kind: "play", clip: "flip" }, { kind: "signal", name: "test:ping" }, { kind: "wait", seconds: 0.4 }], 3, "flip");
    tick(ctl, 4);
    expect(await p).toBe("done");
    expect(got).toEqual(["test:ping"]);
    expect(be.plays).toContain("flip");
  });
  it("settles into restClip (focus) instead of idle", async () => {
    ctl.restClip = "sitKnit"; ctl.refreshRest();
    expect(be.cur).toBe("sitKnit");
    const p = ctl.run([{ kind: "wait", seconds: 0.1 }], 1); tick(ctl, 0.3); expect(await p).toBe("done");
    expect(be.cur).toBe("sitKnit");
  });
});

describe("BehaviorEngine", () => {
  it("cycles through varied activities with quiet dominant (ready), and plays more on breaks", () => {
    const count = (phase: EngineContext["focus"]) => {
      const eng = new BehaviorEngine(ctl, Math.random);
      for (let i = 0; i < 400; i++) { eng.decide(ctxOf({ focus: phase })); ctl.returnToIdle(); eng["t"] += 120; }
      return eng.history.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
    };
    const ready = count("ready");
    expect(Object.keys(ready).length).toBeGreaterThanOrEqual(4);
    expect(Object.entries(ready).sort((a, b) => b[1] - a[1])[0][0]).toBe("quiet");
    expect(ready.hop ?? 0).toBe(0); // hops belong to breaks
    const brk = count("break");
    expect((brk.hop ?? 0) + (brk.happy ?? 0) + (brk.stretch ?? 0)).toBeGreaterThan(brk.quiet ?? 0);
  });
  it("respects cooldowns and recency", () => {
    const eng = new BehaviorEngine(ctl, () => 0.5);
    const a = eng.activities.find((x) => x.id === "lookAround")!;
    eng.decide(ctxOf(), "lookAround");
    expect(eng.weightOf(a, ctxOf())).toBe(0);
    eng["t"] += a.cooldown + 1;
    expect(eng.weightOf(a, ctxOf())).toBeGreaterThan(0);
    expect(eng.weightOf(a, ctxOf())).toBeLessThan(a.base); // recency penalty
  });
  it("focus and pause allow only seated activities; nothing ever walks him off his spot", () => {
    const eng = new BehaviorEngine(ctl, Math.random);
    for (const a of eng.activities) {
      for (const focus of ["focus", "paused"] as const) {
        if (eng.weightOf(a, ctxOf({ focus })) > 0) expect(["quiet", "glanceClock", "glanceUser"]).toContain(a.id);
      }
      for (const focus of ["ready", "focus", "paused", "break"] as const) expect(a.build(ctxOf({ focus })).some((c) => c.kind === "moveTo")).toBe(false);
    }
  });
  it("focus decisions are far apart; dozing only happens in the ready state", () => {
    const eng = new BehaviorEngine(ctl, () => 0.01, 0.2);
    eng.tick(30, ctxOf({ focus: "focus", idleFor: DOZE_AFTER_S * 3, daylight: 0 }));
    expect(eng.history).not.toContain("fallAsleep");
    expect(eng.next).toBeGreaterThanOrEqual(20);
    ctl.returnToIdle(); // the focus engine's quiet job would otherwise (rightly) hold the second engine back
    const ready = new BehaviorEngine(ctl, () => 0.01, 0.2);
    ready.tick(30, ctxOf({ focus: "ready", idleFor: DOZE_AFTER_S + 1 }));
    expect(ready.history).toContain("fallAsleep");
  });
  it("a running session wakes a sleepy Tuck", () => {
    ctl.setEmotion("sleepy", 1, Infinity);
    const eng = new BehaviorEngine(ctl, () => 0.5);
    eng.tick(30, ctxOf({ focus: "focus" }));
    expect(eng.history).toContain("wakeUp");
    expect(ctl.emotions.emotion).toBe("content");
  });
  it("energy drops with activity and a tired Tuck moves less", () => {
    const eng = new BehaviorEngine(ctl, Math.random, 1);
    eng.decide(ctxOf({ focus: "break" }), "hop");
    expect(eng.energy).toBeLessThan(1);
    const look = eng.activities.find((x) => x.id === "lookAround")!;
    eng.energy = 0.9; const hi = eng.weightOf(look, ctxOf());
    eng.energy = 0.2; const lo = eng.weightOf(look, ctxOf());
    expect(lo).toBeLessThan(hi);
  });
  it("tick only acts at ambient priority, through controller.run", async () => {
    const eng = new BehaviorEngine(ctl, seq([0.9, 0.9, 0.1]));
    ctl.react("tap");
    eng.tick(10, ctxOf());
    expect(ctl.activeLabel).toBe("tap");
    tick(ctl, 4);
    eng.tick(10, ctxOf());
    expect(eng.history.length).toBe(1);
    expect(ctl.activePriority).toBe(1);
  });
  it("every activity only plays registered clips", () => {
    const eng = new BehaviorEngine(ctl, Math.random);
    for (const a of eng.activities) for (const c of a.build(ctxOf())) if (c.kind === "play") expect(getClip(c.clip), `${a.id}: ${c.clip}`).toBeTruthy();
  });
});

describe("AI reactions", () => {
  beforeEach(() => _resetReactionCooldowns());
  const req = ReactRequest.parse({ event: "session_end", detail: { minutes: 25 } });
  it("parses valid reactions and rejects unknown actions", () => {
    expect(parseReaction(JSON.stringify({ emotion: "excited", action: "cheer", line: "  done. <b>nice</b> ", memory_candidate: null }))).toEqual({ emotion: "excited", action: "cheer", line: "done. bnice/b", memory_candidate: null });
    expect(parseReaction(JSON.stringify({ emotion: "excited", action: "dance", line: null, memory_candidate: null }))).toBeNull();
    expect(parseReaction(JSON.stringify({ emotion: "excited", action: "none", line: "", memory_candidate: null }))?.line).toBeNull();
  });
  it("uses the model and falls back locally on rate limits", async () => {
    const ok = await react(req, new MockProvider(() => JSON.stringify({ emotion: "excited", action: "hop", line: null, memory_candidate: null })));
    expect(ok).toMatchObject({ ok: true, source: "ai", reaction: { action: "hop" } });
    const rl = await react(req, new MockProvider(() => { throw new ProviderError("rate_limited", 429); }), { sleep: async () => {} });
    expect(rl).toMatchObject({ ok: false, reason: "rate_limited", source: "local" });
    expect(AI_ACTIONS).toContain(rl.reaction.action);
  });
  it("prompt carries the moment, never user text", () => {
    expect(buildReactPrompt(req)).toContain("25-minute focus session");
    for (const e of REACT_EVENTS) expect(AI_ACTIONS).toContain(localReaction(e).action);
  });
  it("cooldowns: one ask per moment window; env taps only sometimes", () => {
    expect(shouldAsk("env_tap", 1e9, () => 0.9)).toBe(false);
    expect(shouldAsk("env_tap", 1e9, () => 0.1)).toBe(true);
  });
  it("seated reactions stay in the chair (no standing clips at all)", () => {
    for (const action of ["hop", "look_around", "yawn", "shift"] as const) {
      const cmds = reactionCommands({ emotion: "excited", action, line: "nice.", memory_candidate: null }, true);
      const clips = cmds.filter((c) => c.kind === "play").map((c) => (c as { clip: string }).clip);
      expect(clips, action).toEqual(["sitIdle"]);
      expect(cmds.some((c) => c.kind === "say")).toBe(true);
    }
    const standing = reactionCommands({ emotion: "excited", action: "hop", line: null, memory_candidate: null }, false);
    expect(standing.some((c) => c.kind === "play" && c.clip === "hop")).toBe(true);
  });
});

import { ProceduralBackend } from "@/engine/animation/ProceduralBackend";
describe("procedural backend keeps controller-owned root transform", () => {
  it("walks: root x / yaw survive backend updates", async () => {
    const root = new THREE.Object3D(); root.position.set(0.9, 0, 0.1);
    const body = new THREE.Object3D(); root.add(body);
    const c = new CharacterControllerImpl(new ProceduralBackend({ root, body }), root, null);
    const p = c.run([{ kind: "moveTo", x: 0 }], 1, "walk");
    for (let i = 0; i < 200; i++) c.update(1 / 30);
    expect(await p).toBe("done");
    expect(Math.abs(root.position.x)).toBeLessThan(0.05);
    expect(root.position.z).toBeCloseTo(0.1, 2);
  });
});
