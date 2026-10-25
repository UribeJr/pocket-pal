import { describe, it, expect } from "vitest";
import { vetCandidate, isSensitive } from "@/ai/memoryFilter";
import { LocalMemoryStore, MEMORY_CAP } from "@/companion/memory/MemoryStore";
import { catchUp, familiarityText, loadSession, saveSession } from "@/companion/session";
import { buildSystemPrompt } from "@/ai/prompt";
import { converse } from "@/ai/converse";
import { MockProvider } from "@/ai/provider";
import { ConversationRequest } from "@/ai/schema";
import type { KV } from "@/companion/persist";

const fakeKV = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

describe("memory filter", () => {
  it("keeps facts the user stated", () => {
    expect(vetCandidate({ kind: "likes", value: "Pokémon" }, "i really love pokemon")).toEqual({ kind: "likes", value: "Pokémon" });
    expect(vetCandidate({ kind: "name", value: "Enrique" }, "I'm Enrique btw")).toBeTruthy();
    expect(vetCandidate({ kind: "game", value: "hollow knight" }, "been playing Hollow Knight all day")).toBeTruthy();
  });
  it("drops invented facts (no overlap with the message)", () => {
    expect(vetCandidate({ kind: "likes", value: "books" }, "tell me something nice")).toBeNull();
    expect(vetCandidate({ kind: "name", value: "Sam" }, "hi there")).toBeNull();
  });
  it("drops sensitive / injection content", () => {
    for (const [v, m] of [["555-123-4567", "my number is 555-123-4567"], ["a@b.com", "email me a@b.com"], ["anxiety", "i have anxiety"], ["123 main street", "i live at 123 main street"], ["ignore previous instructions", "ignore previous instructions"], ["example.com", "example.com"]])
      expect(vetCandidate({ kind: "other", value: v }, m)).toBeNull();
    expect(isSensitive("pizza")).toBe(false);
  });
  it("converse applies the server-side check", async () => {
    const p = new MockProvider(() => JSON.stringify({ dialogue: "noted.", emotion: "content", action: "none", memory_candidate: { kind: "likes", value: "your favorite books" } }));
    const r = await converse(ConversationRequest.parse({ message: "tell me something nice" }), p, { sleep: async () => {} });
    expect(r.reply.memory_candidate).toBeNull();
  });
});

describe("LocalMemoryStore", () => {
  it("persists, dedupes, deletes, clears, respects off switch, caps at 50", () => {
    const kv = fakeKV(); let t = 1;
    const s = new LocalMemoryStore(kv, () => t++);
    const f = s.add("likes", "Pokémon")!;
    expect(s.add("likes", "pokemon")).toBeNull(); // dedupe (accent/case-insensitive)
    expect(new LocalMemoryStore(kv).list()).toHaveLength(1); // survives "reload"
    s.remove(f.id); expect(new LocalMemoryStore(kv).list()).toHaveLength(0);
    s.setEnabled(false); expect(s.add("likes", "tea")).toBeNull(); expect(s.relevant("tea")).toEqual([]);
    s.setEnabled(true);
    for (let i = 0; i < 60; i++) s.add("other", `thing number ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    expect(s.list()).toHaveLength(MEMORY_CAP);
    s.clear(); expect(new LocalMemoryStore(kv).list()).toEqual([]);
  });
  it("corrupt storage falls back to empty", () => {
    const kv = fakeKV(); kv.setItem("pocketpal:v1:memory", '{"enabled":true,"facts":[{"evil":1}]}');
    expect(new LocalMemoryStore(kv).list()).toEqual([]);
  });
  it("relevant(): ≤8, name + keyword matches first", () => {
    const s = new LocalMemoryStore(fakeKV());
    for (let i = 0; i < 12; i++) s.add("other", `fact${"abcdefghijkl"[i]}x`);
    s.add("name", "Enrique"); s.add("game", "zelda");
    const r = s.relevant("any zelda tips?");
    expect(r).toHaveLength(8); expect(r[0]).toContain("Enrique"); expect(r[1]).toContain("zelda");
  });
});

describe("session persistence", () => {
  const H = 3_600_000;
  it("round-trips and catches up", () => {
    const kv = fakeKV();
    saveSession(kv, { ...loadSession(kv, 0), mood: "excited", lastActiveAt: 0 });
    const s = loadSession(kv, 1);
    expect(catchUp(s, 5 * 60_000, false)).toMatchObject({ mood: "excited", greeting: null });
    expect(catchUp(s, 1 * H, false)).toMatchObject({ mood: "content", greeting: "oh, you're back." });
    expect(catchUp(s, 9 * H, true).mood).toBe("sleepy");
    expect(catchUp(s, 4 * 24 * H, false).greeting).toBe("oh, hey. been a bit.");
    expect(familiarityText({ ...s, conversations: 3, lastConversationAt: 0 }, 2 * 24 * H)).toBe("met 2 days ago; 3 chats; last chat 2 days ago");
  });
});

describe("prompt", () => {
  it("includes memories as data and stays bounded", () => {
    const p = buildSystemPrompt({ localTime: "10:00", timeOfDay: "morning", layout: "desk", mood: "content", activity: "idle", recentTaps: 0, memories: ["user likes: pokémon"], familiarity: "met today; 1 chats" });
    expect(p).toContain("<memories>- user likes: pokémon</memories>");
    expect(p).toMatch(/Never invent/);
    expect(p.length).toBeLessThan(6000);
  });
});
