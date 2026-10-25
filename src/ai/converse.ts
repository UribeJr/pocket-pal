import { vetCandidate } from "./memoryFilter";
import { StudyReply, STUDY_REPLY_JSON_SCHEMA, TuckReply, TUCK_REPLY_JSON_SCHEMA, type ConversationRequest, type ConversationResponse, type FallbackReason } from "./schema";
import { buildMessages, buildSystemPrompt } from "./prompt";
import { buildStudyPrompt } from "./studyPrompt";
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

/** study mode never jokes about failures: plain, honest lines (the panel shows fuller copy client-side) */
export const STUDY_FALLBACK_LINES: Record<FallbackReason, string> = {
  nokey: "ask tuck isn't connected yet.",
  unavailable: "i couldn't reach my notes just now.",
  rate_limited: "that's a lot of questions for today.",
  misconfigured: "something's not set up right on my end.",
  invalid_request: "i didn't quite catch that.",
  offline: "you're offline, so i can't look that up.",
  forbidden: "i can't answer from here.",
};

export const fallback = (reason: FallbackReason, mode: "companion" | "study" = "companion"): ConversationResponse => ({
  ok: false, reason, reply: { dialogue: (mode === "study" ? STUDY_FALLBACK_LINES : FALLBACK_LINES)[reason], emotion: reason === "rate_limited" ? "sleepy" : "content", action: "none", memory_candidate: null },
});

/** keep the end of a sentence when trimming an over-long field */
const trimTo = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return (end > n * 0.6 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…").trim();
};

/** study replies: over-long fields are trimmed (not rejected); a bad structure falls back to a recovered line */
export function parseStudyReply(text: string): { reply: StudyReply; recovered: boolean } | null {
  let raw: Record<string, unknown> | undefined;
  try { raw = JSON.parse(text); } catch { raw = undefined; }
  if (raw && typeof raw === "object") {
    const fixed = { ...raw, line: typeof raw.line === "string" ? trimTo(raw.line.trim(), 120) : raw.line, answer: typeof raw.answer === "string" ? trimTo(raw.answer.trim(), 1600) : raw.answer };
    const ok = StudyReply.safeParse(fixed);
    if (ok.success) return { reply: ok.data, recovered: false };
  }
  const line = typeof raw?.line === "string" ? raw.line : /"line"\s*:\s*"((?:[^"\\]|\\.){1,400})"/.exec(text)?.[1]?.replace(/\\"/g, '"');
  const answer = typeof raw?.answer === "string" ? raw.answer : "";
  if (typeof line === "string" && line.trim()) {
    const clean = (v: string, n: number) => trimTo(v.replace(/[<>{}`]/g, "").trim(), n);
    return { reply: { line: clean(line.replace(/\s+/g, " "), 120), answer: clean(answer, 1600), emotion: "content", action: "none", memory_candidate: null }, recovered: true };
  }
  return null;
}

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
  const study = req.mode === "study";
  const { timeoutMs = study ? 15000 : 8000, retries = 1, maxTokens = study ? 1200 : 400, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = o;
  const system = study ? buildStudyPrompt(req.context, req.study) : buildSystemPrompt(req.context);
  const messages = buildMessages(req.history, req.message);
  const t0 = Date.now();
  const fb = (r: FallbackReason) => fallback(r, req.mode);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await provider.generate({ system, messages, schema: study ? STUDY_REPLY_JSON_SCHEMA : TUCK_REPLY_JSON_SCHEMA, maxTokens, signal: AbortSignal.timeout(timeoutMs) });
      if (study) {
        const parsed = parseStudyReply(res.text);
        log({ ev: "ai.conversation", mode: "study", provider: provider.name, model: res.model, promptTokens: res.usage.prompt, completionTokens: res.usage.completion, latencyMs: Date.now() - t0, attempt, outcome: parsed ? (parsed.recovered ? "recovered" : "ok") : "invalid" });
        if (!parsed) return fb("unavailable");
        const r = parsed.reply;
        const reply = { dialogue: r.line, emotion: r.emotion, action: r.action, memory_candidate: vetCandidate(r.memory_candidate, req.message) };
        return { ok: true, reply, answer: r.answer, recovered: parsed.recovered || undefined };
      }
      const parsed = parseReply(res.text);
      log({ ev: "ai.conversation", provider: provider.name, model: res.model, promptTokens: res.usage.prompt, completionTokens: res.usage.completion, latencyMs: Date.now() - t0, attempt, outcome: parsed ? (parsed.recovered ? "recovered" : "ok") : "invalid" });
      if (!parsed) return fb("unavailable");
      // server-side provenance + sensitivity check: only facts the user literally stated survive
      const reply = { ...parsed.reply, memory_candidate: vetCandidate(parsed.reply.memory_candidate, req.message) };
      return { ok: true, reply, recovered: parsed.recovered || undefined };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError((e as Error)?.name === "TimeoutError" ? "timeout" : "network");
      if (err.retryable && attempt < retries) {
        await sleep(err.retryAfter && err.retryAfter <= 3 ? err.retryAfter * 1000 : 300 + Math.random() * 400);
        continue;
      }
      log({ ev: "ai.conversation", mode: req.mode, provider: provider.name, model: provider.model, latencyMs: Date.now() - t0, attempt, outcome: err.kind, status: err.status, code: err.code });
      if (err.kind === "rate_limited") return fb("rate_limited");
      if (err.kind === "auth" || err.kind === "bad_request") return fb("misconfigured");
      return fb("unavailable");
    }
  }
}
