import { describe, it, expect } from "vitest";
import { converse, parseReply, FALLBACK_LINES } from "@/ai/converse";
import { MockProvider, ProviderError } from "@/ai/provider";
import { RateLimiter } from "@/ai/rateLimit";
import { ConversationRequest, EMOTIONS, TUCK_REPLY_JSON_SCHEMA } from "@/ai/schema";
import { actionCommands, AI_ACTIONS } from "@/ai/actions";
import { EMOTION_STYLE } from "@/engine/emotion/EmotionController";
import { getClip } from "@/engine/animation/registry";
import "@/engine/animation/proceduralClips";
import "@/engine/animation/livingClips";

const req = ConversationRequest.parse({ message: "hi" });
const noSleep = async () => {};
const good = JSON.stringify({ dialogue: "oh, hi.", emotion: "playful", action: "hop", memory_candidate: null });

describe("schema & adapter", () => {
  it("emotions derive from EmotionController", () => {
    expect(EMOTIONS.sort()).toEqual(Object.keys(EMOTION_STYLE).sort());
    expect(TUCK_REPLY_JSON_SCHEMA.properties.emotion.enum).toHaveLength(7);
  });
  it("every allowlisted action maps only to registered clips; unknown -> none", () => {
    for (const a of AI_ACTIONS) for (const c of actionCommands(a, "sleepy")) if (c.kind === "play") expect(getClip(c.clip)).toBeTruthy();
    expect(actionCommands("rm -rf", "content")).toEqual([]);
    expect(actionCommands("nap", "content")).toEqual([]);
  });
  it("request validation rejects extras and oversize", () => {
    expect(ConversationRequest.safeParse({ message: "x".repeat(501) }).success).toBe(false);
    expect(ConversationRequest.safeParse({ message: "hi", evil: 1 }).success).toBe(false);
  });
});

describe("converse with mock provider", () => {
  it("valid reply", async () => {
    const logs: object[] = [];
    const r = await converse(req, new MockProvider(() => good), { sleep: noSleep, log: (l) => logs.push(l) });
    expect(r).toMatchObject({ ok: true, reply: { dialogue: "oh, hi.", emotion: "playful", action: "hop" } });
    expect(JSON.stringify(logs)).not.toContain("oh, hi."); // usage log has no content
    expect(logs[0]).toMatchObject({ promptTokens: 10, completionTokens: 5, outcome: "ok" });
  });
  it("invalid JSON with recoverable dialogue -> content/none", async () => {
    const r = await converse(req, new MockProvider(() => '{"dialogue":"sure thing","emotion":"angry","action":"fly"}'), { sleep: noSleep });
    expect(r).toMatchObject({ ok: true, recovered: true, reply: { dialogue: "sure thing", emotion: "content", action: "none" } });
    expect(parseReply('{"dialogue": "half')?.reply).toBeUndefined();
  });
  it("garbage -> in-character fallback", async () => {
    const r = await converse(req, new MockProvider(() => "not json at all"), { sleep: noSleep });
    expect(r).toMatchObject({ ok: false, reason: "unavailable", reply: { dialogue: FALLBACK_LINES.unavailable } });
  });
  it("timeout: retries once then falls back", async () => {
    const p = new MockProvider(() => { throw new ProviderError("timeout"); });
    const r = await converse(req, p, { sleep: noSleep });
    expect(p.calls).toBe(2); expect(r.reason).toBe("unavailable");
  });
  it("real AbortSignal timeout fires", async () => {
    const p = new MockProvider((_, rq) => new Promise((_, rej) => rq.signal.addEventListener("abort", () => rej(new ProviderError("timeout")))));
    const r = await converse(req, p, { sleep: noSleep, timeoutMs: 20, retries: 0 });
    expect(r.reason).toBe("unavailable");
  });
  it("429 once then success; 429 twice -> rate_limited", async () => {
    const p1 = new MockProvider((n) => { if (n === 0) throw new ProviderError("rate_limited", 429, 1); return good; });
    expect((await converse(req, p1, { sleep: noSleep })).ok).toBe(true);
    const p2 = new MockProvider(() => { throw new ProviderError("rate_limited", 429); });
    expect((await converse(req, p2, { sleep: noSleep })).reason).toBe("rate_limited");
  });
  it("5xx retried; auth not retried", async () => {
    const p = new MockProvider((n) => { if (n === 0) throw new ProviderError("server", 503); return good; });
    expect((await converse(req, p, { sleep: noSleep })).ok).toBe(true);
    const a = new MockProvider(() => { throw new ProviderError("auth", 401); });
    expect((await converse(req, a, { sleep: noSleep })).reason).toBe("misconfigured"); expect(a.calls).toBe(1);
  });
});

describe("route", () => {
  const call = async (body: unknown, origin = "https://pocket-pal-teal.vercel.app", ip = "1.1.1.1") => {
    const { POST } = await import("@/app/api/conversation/route");
    return POST(new Request("http://x/api/conversation", { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
  };
  it("nokey -> 200 in-character fallback", async () => {
    delete process.env.GROQ_API_KEY;
    const r = await call({ message: "hi" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: false, reason: "nokey", reply: { emotion: "content", action: "none" } });
  });
  it("foreign origin -> 403; bad body -> 400; 7th/min -> 429", async () => {
    expect((await call({ message: "hi" }, "https://evil.example")).status).toBe(403);
    expect((await call({ nope: 1 }, undefined, "2.2.2.2")).status).toBe(400);
    const codes = []; for (let i = 0; i < 7; i++) codes.push((await call({ message: "hi" }, undefined, "3.3.3.3")).status);
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true); expect(codes[6]).toBe(429);
  });
});

describe("rate limiter", () => {
  it("6/min and 60/day with fake clock", () => {
    let t = 0; const l = new RateLimiter(6, 60, () => t);
    for (let i = 0; i < 6; i++) expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
    t += 61_000; expect(l.take("a")).toBe(true);
    for (let m = 0; m < 20; m++) { t += 61_000; for (let i = 0; i < 6; i++) l.take("a"); }
    t += 61_000; expect(l.take("a")).toBe(false); // day cap
    t += 86_400_000; expect(l.take("a")).toBe(true);
  });
});

describe("short-term window", () => {
  it("keeps ≤12 turns, ≤~1500 tokens, starts on a user turn", async () => {
    const { windowHistory } = await import("@/companion/conversation");
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "tuck" : "user") as "user" | "tuck", text: `m${i}` }));
    const w = windowHistory(turns); expect(w).toHaveLength(12); expect(w[0].role).toBe("user"); expect(w.at(-1)!.text).toBe("m29");
    const big = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "tuck" : "user") as "user" | "tuck", text: "x".repeat(490) + i }));
    expect(windowHistory(big).reduce((n, t) => n + t.text.length, 0)).toBeLessThanOrEqual(6000);
  });
});
