export interface LlmMessage { role: "system" | "user" | "assistant"; content: string }
/**
 * `format: "tool"` delivers the reply as a forced call to one `tuck_reply` function instead of strict JSON
 * output: gpt-oss sometimes insists on calling a tool, so it gets exactly one, shaped like the schema.
 */
export interface LlmRequest { system: string; messages: LlmMessage[]; schema: object; maxTokens: number; signal: AbortSignal; temperature?: number; format?: "schema" | "tool" }
export interface LlmResult { text: string; usage: { prompt: number; completion: number }; model: string }
export interface LlmProvider { readonly name: string; readonly model?: string; generate(req: LlmRequest): Promise<LlmResult> }

export class ProviderError extends Error {
  /** bad_output: the model's generation was rejected (missed the schema, or tried to call a tool), so a fresh sample usually works */
  constructor(public kind: "timeout" | "rate_limited" | "server" | "bad_output" | "auth" | "bad_request" | "network", public status = 0, public retryAfter?: number, public code?: string, public detail?: Record<string, string>) { super(kind); }
  /** worth an immediate second try; rate limits and timeouts fail fast instead */
  get retryable() { return this.kind === "server" || this.kind === "bad_output" || this.kind === "network"; }
}

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Groq via its OpenAI-compatible REST API (no SDK). Key is read server-side only. Any other
 * OpenAI-compatible server (Ollama, LM Studio, vLLM) running the same open-weight model works through
 * `baseUrl`; local servers usually need no key.
 */
export class GroqProvider implements LlmProvider {
  readonly name: string;
  constructor(private apiKey: string | undefined, readonly model: string, private baseUrl = GROQ_BASE_URL) { this.name = baseUrl === GROQ_BASE_URL ? "groq" : "openai-compatible"; }
  async generate(req: LlmRequest): Promise<LlmResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        signal: req.signal,
        headers: { ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_completion_tokens: req.maxTokens,
          temperature: req.temperature ?? 0.8,
          ...(this.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          ...(req.format === "tool"
            ? { tools: [{ type: "function", function: { name: "tuck_reply", description: "Send Tuck's reply to the user.", parameters: req.schema } }], tool_choice: { type: "function", function: { name: "tuck_reply" } } }
            : { response_format: { type: "json_schema", json_schema: { name: "tuck_reply", strict: true, schema: req.schema } } }),
        }),
      });
    } catch (e) {
      throw new ProviderError((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? "timeout" : "network");
    }
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      if (res.status === 429) {
        // Groq's account limits (numbers only), so the logs show which cap was hit
        const detail: Record<string, string> = {};
        for (const h of ["limit-requests", "remaining-requests", "limit-tokens", "remaining-tokens", "reset-tokens"]) { const v = res.headers.get(`x-ratelimit-${h}`); if (v) detail[h] = v.replace(/[^\w.]/g, "").slice(0, 16); }
        throw new ProviderError("rate_limited", 429, Number.isFinite(ra) ? ra : undefined, undefined, detail);
      }
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", res.status);
      if (res.status >= 500) throw new ProviderError("server", res.status);
      // Only the provider's machine-readable error code is kept (never the message, which can echo content).
      let code: string | undefined; let tool: string | undefined;
      try {
        const err = (await res.json())?.error;
        if (typeof err?.code === "string") code = err.code.replace(/[^\w.-]/g, "").slice(0, 48);
        // only the name of the tool the model tried to call, never the generation itself
        const t = typeof err?.message === "string" ? /tool '?"?([\w.-]{1,40})/.exec(err.message)?.[1] : undefined;
        if (t) tool = t;
      } catch {}
      const detail = tool ? { tool } : undefined;
      // the model's output missed the schema, or gpt-oss tried to call a built-in tool: resample
      if (code === "json_validate_failed" || code === "tool_use_failed") throw new ProviderError("bad_output", res.status, undefined, code, detail);
      throw new ProviderError("bad_request", res.status, undefined, code, detail);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    return {
      text: (req.format === "tool" ? msg?.tool_calls?.[0]?.function?.arguments : msg?.content) ?? msg?.content ?? "",
      usage: { prompt: data?.usage?.prompt_tokens ?? 0, completion: data?.usage?.completion_tokens ?? 0 },
      model: data?.model ?? this.model,
    };
  }
}

/** Deterministic provider for tests/dev. `script` returns text or throws per call. */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock";
  calls = 0;
  constructor(private script: (n: number, req: LlmRequest) => Promise<string> | string = () => JSON.stringify({ dialogue: "mock tuck says hi.", emotion: "playful", action: "none", memory_candidate: null })) {}
  async generate(req: LlmRequest): Promise<LlmResult> {
    const n = this.calls++;
    const text = await this.script(n, req);
    return { text, usage: { prompt: 10, completion: 5 }, model: "mock" };
  }
}
