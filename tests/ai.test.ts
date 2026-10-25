import { describe, it, expect } from "vitest";
import { converse, parseReply, FALLBACK_LINES } from "@/ai/converse";
import { GroqProvider, MockProvider, ProviderError } from "@/ai/provider";
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
  it("timeout: fails fast (no retry) with the unavailable line", async () => {
    const p = new MockProvider(() => { throw new ProviderError("timeout"); });
    const r = await converse(req, p, { sleep: noSleep });
    expect(p.calls).toBe(1); expect(r.reason).toBe("unavailable");
  });
  it("Groq tool_use_failed is resampled cooler as a forced tuck_reply call; never reported as a missing key", async () => {
    const seen: { temperature?: number; format?: string }[] = [];
    const p = new MockProvider((n, rq) => { seen.push({ temperature: rq.temperature, format: rq.format }); if (n < 2) throw new ProviderError("bad_output", 400, undefined, "tool_use_failed"); return good; });
    expect((await converse(req, p, { sleep: noSleep })).ok).toBe(true);
    expect(seen).toEqual([{ temperature: 0.8, format: "schema" }, { temperature: 0.4, format: "tool" }, { temperature: 0.4, format: "tool" }]);
    const always = new MockProvider(() => { throw new ProviderError("bad_output", 400, undefined, "tool_use_failed"); });
    const r = await converse(req, always, { sleep: noSleep });
    expect(always.calls).toBe(3); expect(r.reason).toBe("unavailable");
    const other = new MockProvider(() => { throw new ProviderError("bad_request", 400, undefined, "context_length_exceeded"); });
    expect((await converse(req, other, { sleep: noSleep })).reason).toBe("unavailable"); expect(other.calls).toBe(1);
  });
  it("real AbortSignal timeout fires", async () => {
    const p = new MockProvider((_, rq) => new Promise((_, rej) => rq.signal.addEventListener("abort", () => rej(new ProviderError("timeout")))));
    const r = await converse(req, p, { sleep: noSleep, timeoutMs: 20, retries: 0 });
    expect(r.reason).toBe("unavailable");
  });
  it("GroqProvider: tool format forces one tuck_reply call and reads its arguments; 400s keep only code + tool name", async () => {
    const real = globalThis.fetch; let sent: Record<string, unknown> = {};
    globalThis.fetch = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return Response.json({ model: "m", choices: [{ message: { content: null, tool_calls: [{ function: { name: "tuck_reply", arguments: good } }] } }] }); }) as typeof fetch;
    const g = new GroqProvider("k", "openai/gpt-oss-20b");
    const r = await g.generate({ system: "s", messages: [], schema: {}, maxTokens: 10, signal: AbortSignal.timeout(1000), format: "tool" });
    expect(r.text).toBe(good);
    expect(sent.tool_choice).toEqual({ type: "function", function: { name: "tuck_reply" } }); expect(sent.response_format).toBeUndefined();
    globalThis.fetch = (async () => Response.json({ error: { code: "tool_use_failed", message: "attempted to call tool 'json' which was not in request.tools; user text here" } }, { status: 400 })) as typeof fetch;
    const e = await g.generate({ system: "s", messages: [], schema: {}, maxTokens: 10, signal: AbortSignal.timeout(1000) }).catch((x) => x);
    expect(e).toMatchObject({ kind: "bad_output", code: "tool_use_failed", detail: { tool: "json" } });
    globalThis.fetch = real;
  });
  it("429 on the main model switches once to the fallback model (its own Groq bucket)", async () => {
    const main = new MockProvider(() => { throw new ProviderError("rate_limited", 429); });
    const spare = new MockProvider(() => good);
    expect((await converse(req, main, { sleep: noSleep, fallback: spare })).ok).toBe(true);
    expect([main.calls, spare.calls]).toEqual([1, 1]);
    const spare2 = new MockProvider(() => { throw new ProviderError("rate_limited", 429); });
    expect((await converse(req, main, { sleep: noSleep, fallback: spare2 })).reason).toBe("rate_limited"); expect(spare2.calls).toBe(1);
  });
  it("429 fails fast as rate_limited (no waiting and retrying)", async () => {
    const p2 = new MockProvider(() => { throw new ProviderError("rate_limited", 429, 5); });
    expect((await converse(req, p2, { sleep: noSleep })).reason).toBe("rate_limited"); expect(p2.calls).toBe(1);
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
  it("foreign origin -> 403; bad body -> 400; 30/min pass (a judge's burst), the 31st -> 429", async () => {
    expect((await call({ message: "hi" }, "https://evil.example")).status).toBe(403);
    expect((await call({ nope: 1 }, undefined, "2.2.2.2")).status).toBe(400);
    const codes = []; for (let i = 0; i < 31; i++) codes.push((await call({ message: "hi" }, undefined, "3.3.3.3")).status);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true); expect(codes[30]).toBe(429);
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
