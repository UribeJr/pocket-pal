import { GroqProvider } from "@/ai/provider";
import { RateLimiter } from "@/ai/rateLimit";
import { originAllowed } from "@/ai/origin";
import { react, reactFallback, ReactRequest } from "@/ai/react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// reactions are rare by design (moments only); limits are tighter than chat
const ipLimiter = new RateLimiter(6, 60);
const deviceLimiter = new RateLimiter(4, 60);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!originAllowed(req.headers.get("origin"))) return json(reactFallback("env_tap", "forbidden"), 403);
  if (Number(req.headers.get("content-length") ?? 0) > 8_000) return json(reactFallback("env_tap", "invalid_request"), 413);
  let body: unknown;
  try { body = await req.json(); } catch { return json(reactFallback("env_tap", "invalid_request"), 400); }
  const parsed = ReactRequest.safeParse(body);
  if (!parsed.success) return json(reactFallback("env_tap", "invalid_request"), 400);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!ipLimiter.take(ip) || (parsed.data.deviceId && !deviceLimiter.take(parsed.data.deviceId))) return json(reactFallback(parsed.data.event, "rate_limited"), 429);
  const key = process.env.GROQ_API_KEY;
  if (process.env.AI_ENABLED === "false" || !key) return json(reactFallback(parsed.data.event, "nokey"));
  const provider = new GroqProvider(key, process.env.GROQ_MODEL || "openai/gpt-oss-20b");
  return json(await react(parsed.data, provider, { log: (l) => console.log(JSON.stringify(l)) }));
}
