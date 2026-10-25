import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import type { AnimationBackend, ClipName, PlayOptions } from "@/types/animation";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { EmotionController, faceFor } from "@/engine/emotion/EmotionController";
import { useCompanionStore } from "@/stores/companionStore";
import { tuckPersonality } from "@/companion/personality";

/** Deterministic backend: one-shots finish after `durations[clip]` seconds of update(). */
class FakeBackend implements AnimationBackend {
  plays: ClipName[] = []; cur: ClipName = "idle"; t = 0; cb?: () => void; speeds: Record<string, number> = {};
  constructor(public clips: Record<string, number | "loop">) {}
  has(n: ClipName) { return n in this.clips; }
  isLoop(n: ClipName) { return this.clips[n] === "loop"; }
  play(n: ClipName, o: PlayOptions = {}) { this.plays.push(n); this.cur = n; this.t = 0; this.cb = o.onFinished; }
  current() { return this.cur; }
  setOverlay() {}
  setSpeed(n: ClipName, r: number) { this.speeds[n] = r; }
  update(dt: number) {
    const d = this.clips[this.cur]; this.t += dt;
    if (typeof d === "number" && this.t >= d && this.cb) { const c = this.cb; this.cb = undefined; c(); }
  }
}
const CLIPS = { idle: "loop", walk: "loop", talk: "loop", sleep: "loop", hop: 0.9, happy: 1.4, lookAround: 3.2 } as const;
const tick = (c: CharacterControllerImpl, secs: number, step = 1 / 60) => { for (let t = 0; t < secs; t += step) c.update(step); };

let be: FakeBackend; let ctl: CharacterControllerImpl;
beforeEach(() => {
  useCompanionStore.setState({ emotion: "content", animation: "idle", posX: 0, facing: 0, tapCount: 0, speech: null, behavior: "idle", layout: "desk" });
  be = new FakeBackend({ ...CLIPS });
  ctl = new CharacterControllerImpl(be, new THREE.Object3D(), null);
});

describe("arbitration", () => {
  it("higher priority interrupts lower", async () => {
    const a = ctl.run([{ kind: "play", clip: "lookAround" }], 1, "look");
    tick(ctl, 0.5);
    ctl.react("tap");
    expect(await a).toBe("interrupted");
    expect(ctl.activeLabel).toBe("tap");
    expect(be.cur).toBe("hop");
  });
  it("lower priority is rejected while user job runs", async () => {
    ctl.react("tap");
    expect(await ctl.run([{ kind: "play", clip: "lookAround" }], 1)).toBe("rejected");
    expect(be.cur).toBe("hop");
  });
  it("equal priority replaces (repeat taps restart the reaction)", () => {
    ctl.react("tap"); tick(ctl, 0.5); ctl.react("tap");
    expect(useCompanionStore.getState().tapCount).toBe(2);
    expect(be.plays.filter((p) => p === "hop").length).toBe(2);
  });
  it("tap sequence: hop -> happy -> idle, priority released, speech expires", async () => {
    ctl.react("tap");
    expect(useCompanionStore.getState().speech).toBeTruthy();
    tick(ctl, 0.95); expect(be.cur).toBe("happy");
    tick(ctl, 1.5); expect(be.cur).toBe("idle");
    expect(ctl.activePriority).toBe(0);
    tick(ctl, 1); expect(useCompanionStore.getState().speech).toBeNull();
  });
  it("moveTo walks then settles; interrupted by tap", async () => {
    const p = ctl.moveTo({ x: 0.45, y: 0, z: 0 });
    expect(be.cur).toBe("walk");
    tick(ctl, 1.2);
    expect(await p).toBe("done");
    expect(be.cur).toBe("idle");
    const q = ctl.moveTo({ x: -1, y: 0, z: 0 }); tick(ctl, 0.2); ctl.react("tap");
    expect(await q).toBe("interrupted");
  });
});

describe("fallbacks", () => {
  it("missing clip uses fallback chain, then idle, warns once, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ctl.playAnimation("stretch", { fallback: ["nope", "lookAround"] })).toBe("lookAround");
    expect(ctl.playAnimation("stretch")).toBe("idle");
    expect(warn).toHaveBeenCalledTimes(1);
    const r = ctl.run([{ kind: "play", clip: "danceParty" }, { kind: "play", clip: "hop" }], 1);
    expect(be.cur).toBe("hop"); // idle fallback held 0s, then continues
    tick(ctl, 1);
    expect(await r).toBe("done");
    warn.mockRestore();
  });
});

describe("emotion", () => {
  it("maps 7 emotions to 4 faces", () => {
    expect(["content", "curious", "focused", "surprised", "playful", "excited", "sleepy"].map(faceFor))
      .toEqual(["neutral", "curious", "neutral", "curious", "happy", "happy", "sleepy"]); // focused is calm (Phase 6)
  });
  it("transient emotion holds, blocks lower priority, then decays to baseline", () => {
    const seen: string[] = []; const e = new EmotionController("content", (x) => seen.push(x));
    e.request("excited", 2);
    expect(e.request("curious", 1)).toBe(false);
    e.update(tuckPersonality.emotionalTendencies.transientHold.excited + 0.01);
    expect(e.emotion).toBe("content");
    expect(e.request("curious", 1)).toBe(true);
    expect(seen).toEqual(["excited", "content", "curious"]);
  });
  it("tap sets excited (happy face) without the emotion playing clips; blink rate follows", () => {
    const before = be.plays.length;
    ctl.setEmotion("sleepy", 1, Infinity);
    expect(be.plays.length).toBe(before);
    expect(be.speeds.blink).toBe(0.5);
    ctl.react("tap");
    expect(useCompanionStore.getState().emotion).toBe("excited");
    tick(ctl, 3); expect(useCompanionStore.getState().emotion).toBe("content");
  });
  it("personality is JSON-serialisable", () => {
    expect(JSON.parse(JSON.stringify(tuckPersonality))).toEqual(tuckPersonality);
  });
});

describe("conversation performance", () => {
  it("reply runs at user priority, maps action via adapter, returns to idle", async () => {
    const { performReply } = await import("@/companion/conversation");
    const p = performReply(ctl, { ok: true, reply: { dialogue: "same. and i did less.", emotion: "sleepy", action: "nap", memory_candidate: null } });
    expect(ctl.activePriority).toBe(2);
    expect(useCompanionStore.getState().speech).toBe("same. and i did less.");
    expect(await ctl.run([{ kind: "play", clip: "lookAround" }], 1)).toBe("rejected");
    tick(ctl, 12);
    expect(await p).toBe("done");
    expect(ctl.activePriority).toBe(0);
    expect(be.plays).toContain("sleep");
    expect(be.plays).toContain("talk");
  });
});
