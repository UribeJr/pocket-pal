export interface LlmMessage { role: "system" | "user" | "assistant"; content: string }
export interface LlmRequest { system: string; messages: LlmMessage[]; schema: object; maxTokens: number; signal: AbortSignal }
export interface LlmResult { text: string; usage: { prompt: number; completion: number }; model: string }
export interface LlmProvider { readonly name: string; generate(req: LlmRequest): Promise<LlmResult> }

export class ProviderError extends Error {
  constructor(public kind: "timeout" | "rate_limited" | "server" | "auth" | "bad_request" | "network", public status = 0, public retryAfter?: number) { super(kind); }
  get retryable() { return this.kind === "timeout" || this.kind === "rate_limited" || this.kind === "server" || this.kind === "network"; }
}

/** Groq via its OpenAI-compatible REST API (no SDK). Key is read server-side only. */
export class GroqProvider implements LlmProvider {
  readonly name = "groq";
  constructor(private apiKey: string, private model: string) {}
  async generate(req: LlmRequest): Promise<LlmResult> {
    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: req.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_completion_tokens: req.maxTokens,
          temperature: 0.8,
          ...(this.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_schema", json_schema: { name: "tuck_reply", strict: true, schema: req.schema } },
        }),
      });
    } catch (e) {
      throw new ProviderError((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? "timeout" : "network");
    }
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      if (res.status === 429) throw new ProviderError("rate_limited", 429, Number.isFinite(ra) ? ra : undefined);
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", res.status);
      if (res.status >= 500) throw new ProviderError("server", res.status);
      throw new ProviderError("bad_request", res.status);
    }
    const data = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content ?? "",
      usage: { prompt: data?.usage?.prompt_tokens ?? 0, completion: data?.usage?.completion_tokens ?? 0 },
      model: data?.model ?? this.model,
    };
  }
}

/** Deterministic provider for tests/dev. `script` returns text or throws per call. */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  calls = 0;
  constructor(private script: (n: number, req: LlmRequest) => Promise<string> | string = () => JSON.stringify({ dialogue: "mock tuck says hi.", emotion: "playful", action: "none", memory_candidate: null })) {}
  async generate(req: LlmRequest): Promise<LlmResult> {
    const n = this.calls++;
    const text = await this.script(n, req);
    return { text, usage: { prompt: 10, completion: 5 }, model: "mock" };
  }
}
