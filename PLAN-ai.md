# PLAN — Phase 2: Tuck's AI Brain (plan only, no code changed)

Baseline: `main` @ `0891ed8`. Groq docs checked 2026-10-24 (console.groq.com/docs/structured-outputs).

## 0. Audit: what exists vs what doesn't

| System | Status | File |
|---|---|---|
| Controller with `run(cmds, priority)`, priorities 0–3, interrupt/reject, clip fallback → idle | **Built** (living P1) | `src/engine/animation/CharacterControllerImpl.ts`, `src/types/companion.ts` |
| EmotionController (7 emotions → 4 faces, blink rate, speed, hold/decay) | **Built** | `src/engine/emotion/EmotionController.ts` |
| PersonalityProfile (JSON) | **Built** | `src/companion/personality.ts` |
| Speech bubble (drei `<Html>`, `store.speech`, frame-timed expiry) | **Built** | `Tuck.tsx`, controller `say()` |
| Zustand store, layouts, Pocket panel, Desk overlay | **Built** | `src/stores`, `src/components/interface` |
| Tea timer / Note / Wardrobe | **Placeholders only** (inert spans, `PocketPanel.tsx` l.10) — untouched | |
| Backend | Only `src/app/api/health`. Vercel serverless (Fluid), project `pocket-pal`, no env vars set | |
| Supabase | **Not configured** (no client, no env, no deps; only mentioned as future in `PLAN.md`) | |
| BehaviorEngine, new clips (yawn, stretch…), EnvironmentRegistry, InteractionMemory, DialogueManager, SessionPersistence | **NOT built** (living P2–P5) | |

Available clips today (the only legal AI actions): `idle, lookAround, walk, hop, happy, talk, sleep` (+ additive `breathe, blink`).

## 1. Reuse vs new, dependencies, ordering

**Reuse as-is:** controller `run()`/priorities (conversation = `PRIORITY.user`), EmotionController (`request(e, 2, hold)`), personality JSON (embedded in system prompt), speech bubble, store, PocketPanel shell, DeskOverlay.

**New (this phase):** `src/ai/` (provider, schema, prompt, adapter), `src/app/api/conversation/route.ts`, `src/companion/conversation.ts` (client ConversationSession), `src/companion/memory/` (store, extraction filter), chat UI pieces, `src/companion/context.ts` (snapshot builder).

**Dependencies on unbuilt living phases**
| AI feature | Needs | Without it |
|---|---|---|
| Rich actions ("yawn", "stretch") | living P2 clips | allowlist limited to current 7 clips; adapter is data-driven so it grows automatically |
| `activity` in context, AI-suggested activities (D) | living P2 BehaviorEngine | context reports coarse `store.behavior`; suggestions limited to emotion + gesture |
| `nearbyObjects` (D) | living P3 EnvironmentRegistry | omit field (do not fake it) |
| Local quick-tap lines that stay non-AI | living P4 DialogueManager | current 4 SPEECH_TAP lines remain |
| Persistence of memories/familiarity | living P5 SessionPersistence | AI-C introduces a minimal `persist` layer that P5 later extends (same localStorage key namespace) |

**Recommended ordering — interleave, not "finish all living first":**
1. **AI-A + AI-B now** (only need living P1, which exists).
2. **Living P5-lite (SessionPersistence core) folded into AI-C** — one versioned localStorage module used by both memory and session.
3. **Living P2 + P3** (behaviour engine, new clips, environment) — these give the AI something real to express.
4. **AI-D** (context + suggestions) after P2/P3, since it consumes their outputs.
5. **Living P4** (DialogueManager) can merge with AI-D: DialogueManager becomes the single gate deciding local line vs AI line.
6. **AI-E** polish.
Rationale: conversation is the user-visible win and is unblocked; context/suggestions built before P2/P3 would be built on placeholders and redone.

## 2. Groq provider

**Model choice:** `openai/gpt-oss-20b` (default). It is on Groq's list for **strict** structured outputs (constrained decoding, guaranteed schema). Fallback/upgrade via config: `openai/gpt-oss-120b` (also strict). Other strict-capable listed models: `qwen/qwen3.8-27b`, `meta-models/muse-spark-open`. Re-verify the models page at implementation time. gpt-oss is a reasoning model → set `reasoning_effort: "low"` and a small `max_completion_tokens` (~300) for latency.

**Abstraction (small, no orchestration):**
```ts
interface LlmProvider { generate(req: {system: string; messages: Msg[]; schema: JsonSchema; maxTokens: number; signal: AbortSignal}): Promise<{json: unknown; usage: {prompt: number; completion: number}; latencyMs: number; model: string}> }
```
`GroqProvider` = plain `fetch` to `https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible; no SDK needed, keeps bundle/server deps tiny). `MockProvider` for tests/offline dev. Selected in `src/ai/provider.ts` by env.

**Route:** `src/app/api/conversation/route.ts` (Node runtime, `POST`, `dynamic = "force-dynamic"`).
- Env: `GROQ_API_KEY` (user sets it in Vercel himself — we never read, print or set it), `GROQ_MODEL` (default `openai/gpt-oss-20b`), `AI_ENABLED` (kill switch).
- **Streaming:** Groq states *streaming is not supported with Structured Outputs*. Decision: **no token streaming in MVP** — replies are ≤2 short sentences, Groq latency is low; UX covers it with a "thinking" state. (Option later: stream plain text + a second tiny structured call; not worth it now.)
- **Timeout:** `AbortSignal.timeout(8000)` per attempt; overall budget 12 s.
- **Retry:** 1 retry with jitter on 429/5xx/network/timeout, honour `retry-after` if ≤3 s; never retry 4xx validation/auth. 401/403 → `reason:"misconfigured"`.
- **Rate limit (honest):** in-memory limiter on serverless is per-instance and resets on cold start — fine as a **soft** guard, not real abuse protection. MVP: in-memory token bucket per IP (`x-forwarded-for`) — 6 req/min, 60 req/day — **plus** a per-device daily cap enforced client-side, **plus** a Groq-side spend limit set by the user in the Groq console (the actual hard ceiling). If abuse appears: Upstash Redis via Vercel Marketplace (`@upstash/ratelimit`) — one integration, no self-run infra; flagged as an upgrade, not done now.
- **Usage logging:** one structured `console.log` JSON line per call `{model, promptTokens, completionTokens, latencyMs, outcome, retry}` → visible in Vercel logs. No message content logged.
- **Offline / no key / quota:** route returns `200 {ok:false, reason:"unavailable"|"rate_limited"|"misconfigured"}`; client shows a local in-character line ("my brain's napping. try again in a bit.") and returns to idle. `navigator.onLine === false` → skip the request entirely.

## 3. Response schema & adapter

```ts
// src/ai/schema.ts — derived from engine constants, not hand-typed
const EMOTIONS = Object.keys(EMOTION_STYLE) as [Emotion, ...Emotion[]];  // the 7
const ACTIONS = ["none", ...AI_ACTIONS] ;   // AI_ACTIONS = allowlist map below
export const TuckReply = z.object({
  dialogue: z.string().min(1).max(220),
  emotion: z.enum(EMOTIONS),
  action: z.enum(ACTIONS),
  memory_candidate: z.object({ kind: z.enum(["name","likes","dislikes","hobby","game","topic","other"]), value: z.string().max(80) }).nullable(),
});
```
JSON schema for Groq generated from the same zod (`z.toJSONSchema`), strict-compatible (all required, `additionalProperties:false`, nullables).

**Action allowlist adapter** (`src/ai/actions.ts`) — semantic names → controller commands, filtered at build by `backend.has()`:
| action | commands |
|---|---|
| `none` | – |
| `hop` | play hop |
| `cheer` | play happy |
| `look_around` | play lookAround |
| `nap` | play sleep (only if emotion sleepy) |
Future clips (yawn, stretch…) are added here with `fallback` chains when living P2 lands; unknown → dropped. Model never sees bone/three/JS concepts.

**Validation & recovery:** server parses + zod-validates. On failure: if a `dialogue` string is extractable and passes the length/safety filter → use it with `emotion:"content", action:"none"`; otherwise local fallback line. Response always delivered as a valid `TuckReply`.

**Priority:** opening chat → `controller.run([... lookAt camera, play talk hold ∞], PRIORITY.user, "conversation")` (exists as `startConversation`). While awaiting: emotion `focused` (blink slows = "thinking"), talk paused → idle. On reply: emote, say, action, then back to talk-hold. Closing chat / 60 s inactivity → `returnToIdle()` → priority 0; idle behaviour (later BehaviorEngine) resumes automatically. Guarantee: every request path ends in a settle in `finally`, so no stuck "thinking".

## 4. Memory

**Short-term:** client keeps last 12 turns (6 exchanges), trims to ~1,500 tokens estimated (chars/4). No server-side summarisation in MVP (extra call = cost); when the window overflows, drop oldest. Optional later: summary computed in the same call as a `rolling_summary` field.

**Long-term:** user facts only.
- Only from `memory_candidate`, which the prompt restricts to facts the **user explicitly stated about themselves** in the latest message. Server double-checks: candidate value must have lexical overlap with the user's last message; else dropped (prevents Tuck "remembering" his own guesses).
- Sensitive filter (server, regex + keyword lists) rejects: emails, phone numbers, addresses, card/ID numbers, passwords, health, sexuality, religion, politics, finances, precise location, other people's names-with-details. Rejected silently.
- **Confirmation:** new fact shown as a small chip "Tuck will remember: *likes Pokémon* · ✓ · ✕" (default accept on ✓ only — user-approved per brief).
- Cap 50 facts; dedupe by kind+normalised value; each fact `{id, kind, value, createdAt, lastUsedAt, source:"user"}`.
- Relevant facts injected into prompt: top 8 by recency/keyword match.
- UI: "What Tuck remembers" sheet (Pocket panel + Desk ⋯ menu): list, delete individual, "forget everything", toggle "Remember things" (off = no candidates stored, none sent).

**Persistence — recommendation: localStorage-only MVP.**
| | localStorage | Supabase anon auth + RLS |
|---|---|---|
| Isolation | per-device by construction (no shared store → no cross-user leak) | RLS `user_id = auth.uid()`; correct but must be tested |
| Infra | none | new project, keys, migrations, auth flow |
| Cross-device | no | possible (after linking accounts) |
| Privacy | data never leaves device except the facts sent per request | memories stored server-side → needs privacy notice, deletion API |
| Risk | lost on storage clear / Safari 7-day ITP eviction for non-installed PWAs | more moving parts |
Choose localStorage (versioned key `pocketpal:v1:*`, zod-validated on load, `navigator.storage.persist()` requested). Server stays **stateless** — client sends relevant facts with each request. Revisit Supabase only when cross-device sync is a real requirement; the memory module sits behind a `MemoryStore` interface so a Supabase impl drops in.

## 5. Context snapshot contract (client builds, server re-validates)
```ts
const ContextSnapshot = z.object({
  localTime: z.string().regex(/^\d{2}:\d{2}$/), timeOfDay: z.enum(["morning","afternoon","evening","night"]),
  layout: z.enum(["desk","pocket"]), mood: z.enum(EMOTIONS),
  activity: z.enum(["idle","wandering","sleeping","reacting","conversing"]),   // widened when BehaviorEngine exists
  nearbyObjects: z.array(z.enum(["clock","lamp","window","plant","shelf"])).max(3).optional(), // only after EnvironmentRegistry
  recentTaps: z.number().int().min(0).max(99),
  familiarity: Familiarity /* §7 */, memories: z.array(z.string().max(80)).max(8),
}).strict();
```
Rendered into the system prompt as a short labelled block with the instruction "use only when natural; never list these".

## 6. AI-suggested behaviour
- AI only *suggests* via `emotion`/`action`; the adapter + controller decide (priority, `has()`, sleepy gating). Engine stays authoritative.
- Event-driven only: user message, explicit "chat" open. **No polling, no idle-time calls.**
- Spontaneous AI lines: **off by default** (setting). When enabled: only on notable events (first open of the day, return after ≥4 h), max 1 per 30 min and ≤ `personality.boundaries.maxSpontaneousLinesPerHour`, only if tab visible and user interacted in last 2 min. Otherwise local lines.

## 7. Familiarity (no meters)
Stored locally: `{conversations, firstMetAt, lastConversationAt, topTopics: string[≤5], referencedMemoryIds}`. Sent as derived text only: "met 12 days ago; 9 chats; last chat 2 days ago; often talks about: games". No levels, scores or decay penalties; long absence produces at most a light "oh, hey — been a bit." Never guilt.

## 8. Security
- Key only in server env; route is the sole caller; no `NEXT_PUBLIC_` AI vars. Verify via build-output grep for `gsk_` in tests.
- Input limits: message ≤500 chars, ≤12 history turns, body ≤16 KB, zod `.strict()` on request.
- Origin allowlist: `Origin` must be `https://pocket-pal-teal.vercel.app`, the project's own deployment hosts, or localhost in dev; else 403 (weak but cheap; real cost guard is rate limit + Groq spend cap).
- Prompt injection: history/memories are passed as data inside delimited blocks; system prompt pins persona and forbids claiming actions. Memory poisoning mitigated by: user-only provenance, overlap check, sensitive filter, user confirmation chip, length cap, and stripping instruction-like text ("ignore previous…", URLs) from stored facts.
- Output: dialogue rendered as text (React escaping), never HTML; actions only via allowlist.
- No Tuck claims of capabilities: prompt lists what he *can't* do (timers, notes, wardrobe, browsing, accounts).

## 9. Mobile UI
- **Desk:** a 💬 button in the existing overlay corner (bottom right, opposite the time line). Tapping opens a single-line input pill anchored bottom-centre, max width 360 px, height 44 px — below the shelf edge, never over the flip clock (clock occupies centre-left mid-band). Replies appear in Tuck's existing speech bubble, not a transcript. Auto-close after 60 s idle. Landscape keyboard: input moves up with `visualViewport`; scene untouched.
- **Pocket:** reuse `PocketPanel` — add a conversation section above the chips: last 3–4 exchanges (scrollable), input row, memory sheet link. **The Tea timer / Note / Wardrobe chips stay exactly as they are** (same file, line untouched; new markup goes in a sibling component).
- Thinking: `focused` face + bubble "…"; error: in-character line.
- Respect safe-area utilities already in `globals.css`.

## 10. Performance & cost
- All AI work in event handlers/promises; nothing inside `useFrame`. Store updates are coarse (per reply).
- No new client deps except `zod` (~13 KB gz, lazy-loaded with chat UI via `next/dynamic`).
- Per-request: system ≈ 600 tokens (persona + rules + context), history ≤1,500, output ≤300 → ~2.4 K tokens worst case.
- **MVP limits:** 6 msgs/min/IP, 60/day/IP (server), 80/day/device (client), message 500 chars, Groq spend limit set by user. Kill switch `AI_ENABLED=false`.
- Risks: serverless limiter leakage (accepted; Upstash upgrade path), reasoning-token overrun on gpt-oss (cap + `reasoning_effort:low`), cold start (~few hundred ms), Safari storage eviction.

## 11. Testing
- **Unit (vitest, fake clock — existing setup):** schema derivation equals engine constants; adapter drops unknown actions; recovery path; memory filter (sensitive patterns, overlap rule, dedupe, cap); limiter; prompt builder size bound; context `.strict()` rejects extras; conversation priority/resume using existing FakeBackend.
- **Route tests:** `MockProvider` for success / invalid JSON / timeout / 429 / 401 / no key; asserts no content logging and key never in responses.
- **Playwright (Chromium + WebKit, landscape + portrait):** route intercepted with fixtures (no real Groq in CI); send message → bubble, talk clip, emotion face; failure → idle within 1 s; rotation mid-conversation keeps state; memory chip accept → reload → still listed → delete; screenshot diff vs current baseline shows placeholders unchanged.
- **Manual live check (needs user's key):** 20-turn persona script (tone examples from brief), latency p50/p95, token log review.
- Build-output secret grep.

## 12. Implementation order
- **A — Foundation:** zod dep; `src/ai/{schema,actions,prompt,provider,groq,mock}.ts`; `/api/conversation` with validation, timeout, retry, limiter, origin check, usage log, offline responses. *Deliverable:* validated reply via curl with Mock (and Groq once the user adds the key).
- **B — Conversation:** client `ConversationSession`, controller wiring (priority 2, thinking/talk/settle), Desk input pill, Pocket chat section, error lines. *Deliverable:* chat while Tuck reacts; placeholders intact.
- **C — Memory (+ living P5-lite persistence):** short-term window, `MemoryStore` (localStorage), extraction rules, confirmation chip, inspect/delete/disable UI. *Deliverable:* approved facts survive reload.
- *(Living P2 + P3 here.)*
- **D — Context:** snapshot builder (activity / nearby objects from BehaviorEngine + EnvironmentRegistry), familiarity, AI suggestions through the engine, optional spontaneous lines with cooldowns; merge with living P4 DialogueManager.
- **E — Polish/testing:** latency, persona review, offline, rotation, isolation, cost check, real-device test.

Out of scope: voice, TTS, new models/environments, evolution, multi-agent, browsing, external accounts, productivity tools (tea timer / notes / wardrobe stay placeholders), StandBy.
