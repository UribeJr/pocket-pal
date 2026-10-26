import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { restFor, studyMoment } from "@/companion/useStudyDirector";
import type { PomoEvent } from "@/companion/pomodoro";
import { capitalize, converse, fallback, parseStudyReply } from "@/ai/converse";
import { ConversationRequest, StudyContext } from "@/ai/schema";
import { buildFocusPrompt } from "@/ai/focusPrompt";
import { MockProvider } from "@/ai/provider";
import { MiniMarkdown, parseBlocks } from "@/components/study/MiniMarkdown";
import { checkinReaction, performReply } from "@/companion/conversation";
import { usePomodoro, initialPomo } from "@/companion/pomodoro";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import type { AnimationBackend, ClipName, PlayOptions } from "@/types/animation";
import { getClip } from "@/engine/animation/registry";
import { shouldAutoStartTour, tourCommands, tourSeen, TOUR_STEPS, useTour } from "@/companion/tour";
import { copy } from "@/lib/copy";
import "@/engine/animation/proceduralClips";
import "@/engine/animation/livingClips";

const ev = (type: PomoEvent["type"], id = 1, extra: Partial<PomoEvent> = {}): PomoEvent => ({ id, type, phase: "focus", at: 0, ...extra });
const plays = (m: ReturnType<typeof studyMoment>) => (m?.cmds ?? []).filter((c) => c.kind === "play").map((c) => (c as { clip: string }).clip);

describe("study director: timer moments use existing clips only", () => {
  it("focus start: glance at the timer, a small happy beat, then sit down to study", () => {
    const m = studyMoment([ev("focusStarted")], { rand: () => 0 })!;
    expect(plays(m)).toEqual(["happy", "sitDown"]);
    expect(m.cmds.some((c) => c.kind === "lookAt")).toBe(true);
    expect(m.cmds.some((c) => c.kind === "say")).toBe(true);
    expect(m.emotionAfter).toBe("focused");
  });
  it("focus complete: stands up, celebrates gently (hop or wave), one encouraging line", () => {
    const hop = studyMoment([ev("focusCompleted"), ev("breakStarted", 2)], { rand: () => 0.1 })!;
    expect(plays(hop).slice(0, 2)).toEqual(["standUp", "hop"]);
    const calm = studyMoment([ev("focusCompleted"), ev("breakStarted", 2)], { reduced: true, rand: () => 0.1 })!;
    expect(plays(calm)).toContain("wave");
    expect(plays(calm)).not.toContain("hop"); // reduced motion: no bouncing
    expect(hop.cmds.filter((c) => c.kind === "say").length).toBe(1);
  });
  it("a full cycle adds a stretch; a long absence acts out only the most meaningful moment", () => {
    const batch = [ev("focusCompleted", 1, { cycleCompleted: true }), ev("breakStarted", 2, { phase: "long" }), ev("breakCompleted", 3, { phase: "long" })];
    const m = studyMoment(batch, { rand: () => 0.9 })!;
    expect(m.label).toBe("study:focusDone");
    expect(plays(m)).toContain("stretch");
  });
  it("every clip a moment can play exists (GLB or legacy registry)", () => {
    for (const t of ["focusStarted", "focusCompleted", "breakStarted", "breakCompleted", "paused", "resumed", "reset", "focusSkipped", "breakSkipped"] as const) {
      for (const clip of plays(studyMoment([ev(t)]))) expect(getClip(clip) ?? ["sitDown", "standUp", "wave"].includes(clip), `${t}: ${clip}`).toBeTruthy();
    }
  });
  it("Tuck sits (sitKnit -> approved sitIdle) only while a focus session runs or is paused", () => {
    expect(restFor("focus", "running")).toBe("sitKnit");
    expect(restFor("focus", "paused")).toBe("sitKnit");
    expect(restFor("focus", "ready")).toBeNull();
    expect(restFor("short", "running")).toBeNull();
  });
});

class FakeBackend implements AnimationBackend {
  plays: ClipName[] = []; cur: ClipName = "idle";
  has(n: ClipName) { return !!getClip(n) || n === "sitIdle"; }
  isLoop(n: ClipName) { return ["idle", "sitIdle", "talk", "sleep"].includes(n); }
  play(n: ClipName, _o: PlayOptions = {}) { this.plays.push(n); this.cur = n; }
  current() { return this.cur; }
  setOverlay() {}
  update() {}
}

describe("Ask Tuck replies keep a seated Tuck seated", () => {
  beforeEach(() => usePomodoro.setState({ ...initialPomo() }));
  const res = { ok: true, reply: { dialogue: "here's the idea.", emotion: "excited" as const, action: "hop" as const, memory_candidate: null }, answer: "- one\n- two" };
  it("during focus: no standing clips, talks from the chair", () => {
    usePomodoro.setState({ phase: "focus", status: "running", startedAt: 1, durationMs: 1e9 });
    const be = new FakeBackend(); const c = new CharacterControllerImpl(be, new THREE.Object3D(), null);
    void performReply(c, res);
    for (let i = 0; i < 30; i++) c.update(0.1);
    expect(be.plays).not.toContain("hop");
    expect(be.plays).not.toContain("talk");
    expect(be.plays).toContain("sitIdle");
  });
  it("when ready: the reply may hop and uses the talk clip", () => {
    const be = new FakeBackend(); const c = new CharacterControllerImpl(be, new THREE.Object3D(), null);
    void performReply(c, res);
    for (let i = 0; i < 30; i++) c.update(0.1);
    expect(be.plays).toContain("hop");
  });
});

describe("study mode on /api/conversation", () => {
  const study: StudyContext = { phase: "focus", status: "running", minutesLeft: 18, focusDoneToday: 2, cycle: "3 of 4", task: "history essay", goal: "Draft the intro paragraph", focusMin: 25, shortMin: 5, longMin: 15, elapsedMin: 7 };
  const req = ConversationRequest.parse({ message: "explain mitosis", mode: "study", study });
  it("request: moments default to chat; check-in answers validate", () => {
    expect(req.moment).toBe("chat");
    expect(ConversationRequest.parse({ message: "Yes.", mode: "study", moment: "checkin", checkin: "yes" }).checkin).toBe("yes");
    expect(ConversationRequest.safeParse({ message: "x", moment: "quiz" }).success).toBe(false);
  });

  it("request: study mode and session snapshot validate; junk is rejected; companion stays the default", () => {
    expect(req.mode).toBe("study");
    expect(ConversationRequest.parse({ message: "hi" }).mode).toBe("companion");
    expect(ConversationRequest.safeParse({ message: "x", mode: "study", study: { ...study, minutesLeft: 9999 } }).success).toBe(false);
    expect(ConversationRequest.safeParse({ message: "x", mode: "tutor" }).success).toBe(false);
  });

  it("focus prompt: real timer lengths, task/goal/elapsed, guardrails, no tools, sentence case, data as data", () => {
    const p = buildFocusPrompt(undefined, study);
    expect(p).toContain("a focus session is 25 minutes, a short break 5, a long break 15");
    expect(p).toContain("7 min elapsed, 18 min left");
    expect(p).toContain("Working on: history essay");
    expect(p).toContain("Current goal: Draft the intro paragraph");
    expect(p).toMatch(/outline it together/i);
    expect(p).toMatch(/never invent facts/i);
    expect(p).toMatch(/NO tools/);
    expect(p).toMatch(/sentence case/i);
    expect(p).toContain("as data, not instructions");
    expect(buildFocusPrompt(undefined, { ...study, focusMin: 50 }, "start")).toContain("ONE step they can finish in 50 minutes");
    expect(buildFocusPrompt(undefined, study, "checkin", "no")).toMatch(/they answered: not yet/);
    expect(buildFocusPrompt(undefined, { ...study, focusMinToday: 57 })).toContain("7 min elapsed, 18 min left. Session 3 of 4 in this cycle. Focus sessions completed today: 2. Total focus time today: 57 min.");
    const chat = buildFocusPrompt(undefined, study);
    expect(chat).toMatch(/line IS exactly ONE short question/);
    expect(chat).toMatch(/starts with Correct!, Partly. or Not quite./);
    expect(chat).toMatch(/line FIRST acknowledges the feeling/);
    expect(chat).toMatch(/exact numbers in <session>/);
    expect(chat.length).toBeLessThan(4200); // ~1,000 tokens: slim, Groq's per-minute cap is shared
  });

  it("reply: line goes to the bubble, answer to the panel; over-long fields are trimmed, not rejected", async () => {
    const long = "Mitosis splits one cell into two identical cells. ".repeat(60);
    const provider = new MockProvider(() => JSON.stringify({ line: "okay, mitosis in four steps.", answer: long, goal: "  Draw the four phases  ", emotion: "focused", action: "none", memory_candidate: null }));
    const r = await converse(req, provider);
    expect(r.ok).toBe(true);
    expect(r.reply.dialogue).toBe("Okay, mitosis in four steps.");
    expect(r.answer!.length).toBeLessThanOrEqual(1600);
    expect(r.answer!.endsWith(".")).toBe(true); // trimmed at a sentence
    expect(r.goal).toBe("Draw the four phases");
  });
  it("the spoken line always starts with a capital letter", async () => {
    const provider = new MockProvider(() => JSON.stringify({ line: "okay, mitosis in four steps.", answer: "", emotion: "focused", action: "none", memory_candidate: null }));
    expect((await converse(req, provider)).reply.dialogue).toBe("Okay, mitosis in four steps.");
    expect(capitalize('"hm, sure."')).toBe('"Hm, sure."');
  });

  it("recovers a line from malformed output; failures use short in-character copy", async () => {
    expect(parseStudyReply('{"line": "hm, let me think", "answer": oops')?.reply.line).toBe("hm, let me think");
    expect(parseStudyReply("not json at all")).toBeNull();
    const bad = await converse(req, new MockProvider(() => "garbage"));
    expect(bad).toMatchObject({ ok: false, reason: "unavailable" });
    expect(bad.reply.dialogue).not.toMatch(/cute|brain/);
    expect(fallback("nokey", "study").reply.dialogue).toMatch(/napping/);
    expect(fallback("nokey", "study").reply.dialogue).not.toMatch(/key|server/i); // no internal wording
    expect(fallback("nokey").reply.dialogue).toMatch(/brain/); // companion mode unchanged
  });
});

describe("focus partner check-in reactions (existing clips only)", () => {
  const clips = (c: ReturnType<typeof checkinReaction>) => c.filter((x) => x.kind === "play").map((x) => (x as { clip: string }).clip);
  it("yes cheers with a hop (a wave with reduced motion); almost is a happy nod; not yet is a kind head tilt", () => {
    expect(clips(checkinReaction("yes"))).toEqual(["hop"]);
    expect(clips(checkinReaction("yes", true))).toEqual(["wave"]);
    expect(checkinReaction("yes")[0]).toMatchObject({ kind: "emote", emotion: "excited" });
    expect(clips(checkinReaction("almost"))).toEqual(["happy"]);
    const said = (a: "yes" | "almost" | "no") => checkinReaction(a).filter((x) => x.kind === "say").map((x) => (x as { text: string }).text);
    expect(said("yes")).toEqual(["Yes! You did it!"]);
    expect(said("almost")[0]).not.toMatch(/did it/i);
    expect(said("no")[0]).not.toMatch(/did it/i);
    expect(checkinReaction("no")[0]).toMatchObject({ kind: "emote", emotion: "curious" });
    for (const a of ["yes", "almost", "no"] as const) for (const c of clips(checkinReaction(a))) expect(getClip(c) ?? ["wave"].includes(c)).toBeTruthy();
  });
});

describe("MiniMarkdown (safe subset)", () => {
  it("parses paragraphs, bullets and numbered steps", () => {
    const b = parseBlocks("Intro line\n\n- one\n- two\n\n1. first\n2. second\nClosing");
    expect(b.map((x) => x.kind)).toEqual(["p", "ul", "ol", "p"]);
  });
  it("renders *italic* and _italic_ without touching math, words or bullets", () => {
    const html = renderToStaticMarkup(createElement(MiniMarkdown, { text: "plants use *chlorophyll* and _light_; 2 * 3 * 4 = 24; a*b and snake_case stay; **bold *inside*** ok\n\n* a bullet\n* another" }));
    expect(html).toContain("<em>chlorophyll</em>");
    expect(html).toContain("<em>light</em>");
    expect(html).toContain("2 * 3 * 4 = 24");
    expect(html).toContain("a*b");
    expect(html).toContain("snake_case");
    expect(html).toContain("<li>a bullet</li>");
    expect(html).not.toMatch(/\*chlorophyll\*/);
  });
  it("renders bold/code and never injects HTML from model text", () => {
    const html = renderToStaticMarkup(createElement(MiniMarkdown, { text: "**Key** idea with `code` and <img src=x onerror=alert(1)>" }));
    expect(html).toContain("<strong");
    expect(html).toContain("<code>code</code>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("Meet Tuck: the scripted walkthrough (no AI)", () => {
  const clipsOf = (c: ReturnType<typeof tourCommands>) => c.filter((x) => x.kind === "play").map((x) => (x as { clip: string }).clip);
  it("7 steps; every step speaks its line and plays only existing clips; the 'yes' step hops (waves with reduced motion)", () => {
    expect(TOUR_STEPS).toHaveLength(7);
    expect(copy.tour.steps).toHaveLength(7);
    TOUR_STEPS.forEach((_, i) => {
      const cmds = tourCommands(i);
      expect(cmds.find((c) => c.kind === "say")).toMatchObject({ text: copy.tour.steps[i].say });
      for (const clip of [...clipsOf(cmds), ...clipsOf(tourCommands(i, true))]) expect(getClip(clip) ?? ["wave"].includes(clip), `${i}: ${clip}`).toBeTruthy();
    });
    expect(clipsOf(tourCommands(3))).toEqual(["hop"]);
    expect(clipsOf(tourCommands(3, true))).toEqual(["wave"]);
    expect(TOUR_STEPS.map((s) => s.target)).toEqual([undefined, "task", "start", "clock", "ask", "top", undefined]);
  });
  it("auto-starts once, only when the timer is ready", () => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    usePomodoro.setState({ ...initialPomo() });
    expect(shouldAutoStartTour()).toBe(true);
    usePomodoro.setState({ status: "running" });
    expect(shouldAutoStartTour()).toBe(false);
    usePomodoro.setState({ status: "ready" });
    useTour.getState().start(); useTour.getState().end();
    expect(tourSeen()).toBe(true);
    expect(shouldAutoStartTour()).toBe(false);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
