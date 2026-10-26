import { vetCandidate } from "./memoryFilter";
import { StudyReply, STUDY_REPLY_JSON_SCHEMA, TuckReply, TUCK_REPLY_JSON_SCHEMA, type ConversationRequest, type ConversationResponse, type FallbackReason } from "./schema";
import { buildMessages, buildSystemPrompt } from "./prompt";
import { buildFocusPrompt } from "./focusPrompt";
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

/** study mode: short in-character lines (error details stay in the server logs) */
export const STUDY_FALLBACK_LINES: Record<FallbackReason, string> = {
  nokey: "My brain is napping. Try again in a minute?",
  unavailable: "Oops, lost my train of thought. Try again?",
  rate_limited: "Phew, I need a quick breather. One minute?",
  misconfigured: "My brain is napping. Try again in a minute?",
  invalid_request: "Hmm, I didn't quite catch that.",
  offline: "You're offline, so I can't think that through yet.",
  forbidden: "I can't answer from here, sorry.",
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
    const fixed = { ...raw, line: typeof raw.line === "string" ? trimTo(raw.line.trim(), 120) : raw.line, answer: typeof raw.answer === "string" ? trimTo(raw.answer.trim(), 1600) : raw.answer, goal: typeof raw.goal === "string" ? trimTo(raw.goal.trim(), 120) : "" };
    const ok = StudyReply.safeParse(fixed);
    if (ok.success) return { reply: ok.data, recovered: false };
  }
  const line = typeof raw?.line === "string" ? raw.line : /"line"\s*:\s*"((?:[^"\\]|\\.){1,400})"/.exec(text)?.[1]?.replace(/\\"/g, '"');
  const answer = typeof raw?.answer === "string" ? raw.answer : "";
  if (typeof line === "string" && line.trim()) {
    const clean = (v: string, n: number) => trimTo(v.replace(/[<>{}`]/g, "").trim(), n);
    return { reply: { line: clean(line.replace(/\s+/g, " "), 120), answer: clean(answer, 1600), goal: "", emotion: "content", action: "none", memory_candidate: null }, recovered: true };
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

/** `fallback`: a second model with its own Groq rate-limit bucket, used once when the first one is rate limited */
export interface ConverseOptions { timeoutMs?: number; budgetMs?: number; retries?: number; maxTokens?: number; fallback?: LlmProvider; sleep?: (ms: number) => Promise<void>; log?: (line: object) => void }

/**
 * Fail fast: rate limits and timeouts are not retried. A rejected generation (missed schema, or gpt-oss
 * trying to call a built-in tool: Groq 400 tool_use_failed) is resampled at once, cooler and as a forced
 * call to a single `tuck_reply` function, all inside one overall time budget.
 */
export async function converse(req: ConversationRequest, provider: LlmProvider, o: ConverseOptions = {}): Promise<ConversationResponse> {
  const study = req.mode === "study";
  const { timeoutMs = 8000, budgetMs = study ? 9000 : 7000, retries = 2, maxTokens = study ? 450 : 400, fallback: spare, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = o;
  const system = study ? buildFocusPrompt(req.context, req.study, req.moment, req.checkin) : buildSystemPrompt(req.context);
  const messages = buildMessages(req.history, req.message);
  const t0 = Date.now();
  const fb = (r: FallbackReason) => fallback(r, req.mode);
  const codes: string[] = [];
  let p = provider;
  for (let attempt = 0; ; attempt++) {
    const format = attempt >= 1 ? "tool" as const : "schema" as const;
    try {
      const left = Math.max(1000, Math.min(timeoutMs, t0 + budgetMs - Date.now()));
      const res = await p.generate({ system, messages, schema: study ? STUDY_REPLY_JSON_SCHEMA : TUCK_REPLY_JSON_SCHEMA, maxTokens, signal: AbortSignal.timeout(left), temperature: attempt === 0 ? 0.8 : 0.4, format });
      const base = { ev: "ai.conversation", mode: req.mode, provider: p.name, model: res.model, promptTokens: res.usage.prompt, completionTokens: res.usage.completion, latencyMs: Date.now() - t0, attempt, format, ...(codes.length ? { retriedAfter: codes } : {}) };
      if (study) {
        const parsed = parseStudyReply(res.text);
        log({ ...base, outcome: parsed ? (parsed.recovered ? "recovered" : "ok") : "invalid" });
        if (!parsed) return fb("unavailable");
        const r = parsed.reply;
        const reply = { dialogue: capitalize(r.line), emotion: r.emotion, action: r.action, memory_candidate: vetCandidate(r.memory_candidate, req.message) };
        return { ok: true, reply, answer: r.answer, goal: r.goal.trim() || undefined, recovered: parsed.recovered || undefined };
      }
      const parsed = parseReply(res.text);
      log({ ...base, outcome: parsed ? (parsed.recovered ? "recovered" : "ok") : "invalid" });
      if (!parsed) return fb("unavailable");
      // server-side provenance + sensitivity check: only facts the user literally stated survive
      const reply = { ...parsed.reply, memory_candidate: vetCandidate(parsed.reply.memory_candidate, req.message) };
      return { ok: true, reply, recovered: parsed.recovered || undefined };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError((e as Error)?.name === "TimeoutError" ? "timeout" : "network");
      codes.push([err.code ?? err.kind, err.detail?.tool].filter(Boolean).join(":"));
      if (err.kind === "rate_limited" && spare && p !== spare && Date.now() - t0 < budgetMs - 1500) { p = spare; attempt = -1; continue; }
      if (err.retryable && attempt < retries && Date.now() - t0 < budgetMs - 1500) {
        if (err.kind !== "bad_output") await sleep(150);
        continue;
      }
      log({ ev: "ai.conversation", mode: req.mode, provider: p.name, model: p.model, latencyMs: Date.now() - t0, attempt, format, outcome: err.kind, status: err.status, code: err.code, codes, ...(err.detail ?? {}) });
      if (err.kind === "rate_limited") return fb("rate_limited");
      if (err.kind === "auth") return fb("misconfigured");
      return fb("unavailable");
    }
  }
}

/** Tuck's spoken line starts with a capital letter, whatever the model did */
export const capitalize = (s: string) => s.replace(/^(\s*["'(]?)(\p{Ll})/u, (_, pre: string, c: string) => pre + c.toUpperCase());
