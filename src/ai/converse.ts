import { TuckReply, TUCK_REPLY_JSON_SCHEMA, type ConversationRequest, type ConversationResponse, type FallbackReason } from "./schema";
import { buildMessages, buildSystemPrompt } from "./prompt";
import { ProviderError, type LlmProvider } from "./provider";

export const FALLBACK_LINES: Record<FallbackReason, string> = {
  nokey: "my brain's still being installed. try me again later?",
  unavailable: "hm. lost my train of thought. try again in a bit.",
  rate_limited: "whew, that's a lot of talking. give me a minute.",
  misconfigured: "something's off upstairs. i'll just sit here and look cute.",
  invalid_request: "i didn't quite catch that.",
  offline: "can't think properly offline. i'm still here though.",
  forbidden: "sorry, i only talk to people on my shelf.",
};

export const fallback = (reason: FallbackReason): ConversationResponse => ({
  ok: false, reason, reply: { dialogue: FALLBACK_LINES[reason], emotion: reason === "rate_limited" ? "sleepy" : "content", action: "none", memory_candidate: null },
});

/** Validate model output; recover a safe dialogue string if the structure is wrong. */
export function parseReply(text: string): { reply: TuckReply; recovered: boolean } | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { raw = undefined; }
  const ok = TuckReply.safeParse(raw);
  if (ok.success) return { reply: ok.data, recovered: false };
  let d: unknown = (raw as { dialogue?: unknown } | undefined)?.dialogue;
  if (typeof d !== "string") d = /"dialogue"\s*:\s*"((?:[^"\\]|\\.){1,400})"/.exec(text)?.[1]?.replace(/\\"/g, '"');
  if (typeof d === "string") {
    const clean = d.replace(/[<>{}`]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (clean.length > 0) return { reply: { dialogue: clean, emotion: "content", action: "none", memory_candidate: null }, recovered: true };
  }
  return null;
}

export interface ConverseOptions { timeoutMs?: number; retries?: number; maxTokens?: number; sleep?: (ms: number) => Promise<void>; log?: (line: object) => void }

export async function converse(req: ConversationRequest, provider: LlmProvider, o: ConverseOptions = {}): Promise<ConversationResponse> {
  const { timeoutMs = 8000, retries = 1, maxTokens = 400, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = o;
  const system = buildSystemPrompt(req.context);
  const messages = buildMessages(req.history, req.message);
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await provider.generate({ system, messages, schema: TUCK_REPLY_JSON_SCHEMA, maxTokens, signal: AbortSignal.timeout(timeoutMs) });
      const parsed = parseReply(res.text);
      log({ ev: "ai.conversation", provider: provider.name, model: res.model, promptTokens: res.usage.prompt, completionTokens: res.usage.completion, latencyMs: Date.now() - t0, attempt, outcome: parsed ? (parsed.recovered ? "recovered" : "ok") : "invalid" });
      if (!parsed) return fallback("unavailable");
      return { ok: true, reply: parsed.reply, recovered: parsed.recovered || undefined };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError((e as Error)?.name === "TimeoutError" ? "timeout" : "network");
      if (err.retryable && attempt < retries) {
        await sleep(err.retryAfter && err.retryAfter <= 3 ? err.retryAfter * 1000 : 300 + Math.random() * 400);
        continue;
      }
      log({ ev: "ai.conversation", provider: provider.name, latencyMs: Date.now() - t0, attempt, outcome: err.kind, status: err.status });
      if (err.kind === "rate_limited") return fallback("rate_limited");
      if (err.kind === "auth" || err.kind === "bad_request") return fallback("misconfigured");
      return fallback("unavailable");
    }
  }
}
