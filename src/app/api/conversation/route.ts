import { ConversationRequest } from "@/ai/schema";
import { converse, fallback } from "@/ai/converse";
import { GroqProvider } from "@/ai/provider";
import { RateLimiter } from "@/ai/rateLimit";
import { originAllowed } from "@/ai/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// generous enough for a long study session (and a judge's demo); Groq's own limits and spend cap sit behind these
const ipLimiter = new RateLimiter(30, 500);
const deviceLimiter = new RateLimiter(30, 500);

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!originAllowed(req.headers.get("origin"))) return json(fallback("forbidden"), 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 32_000) return json(fallback("invalid_request"), 413);
  let body: unknown;
  try { body = await req.json(); } catch { return json(fallback("invalid_request"), 400); }
  const parsed = ConversationRequest.safeParse(body);
  if (!parsed.success) return json(fallback("invalid_request"), 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!ipLimiter.take(ip) || (parsed.data.deviceId && !deviceLimiter.take(parsed.data.deviceId))) return json(fallback("rate_limited", parsed.data.mode), 429);

  const key = process.env.GROQ_API_KEY;
  if (process.env.AI_ENABLED === "false" || !key) return json(fallback("nokey", parsed.data.mode));
  const provider = new GroqProvider(key, process.env.GROQ_MODEL || "openai/gpt-oss-20b");
  const res = await converse(parsed.data, provider, { log: (l) => console.log(JSON.stringify(l)) });
  return json(res);
}
