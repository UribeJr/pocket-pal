import { ConversationRequest } from "@/ai/schema";
import { converse, fallback } from "@/ai/converse";
import { GroqProvider } from "@/ai/provider";
import { RateLimiter } from "@/ai/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipLimiter = new RateLimiter(6, 60);
const deviceLimiter = new RateLimiter(6, 80);

function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true; // dev + local Playwright; Origin is spoofable anyway (soft guard)
    if (u.protocol !== "https:") return false;
    if (u.hostname === "pocket-pal-teal.vercel.app") return true;
    if (/^pocket-pal-[a-z0-9-]+-enrique-uribe-s-projects\.vercel\.app$/.test(u.hostname) || /^pocket-[a-z0-9]+-enrique-uribe-s-projects\.vercel\.app$/.test(u.hostname)) return true;
    return false;
  } catch { return false; }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!originAllowed(req.headers.get("origin"))) return json(fallback("forbidden"), 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 16_000) return json(fallback("invalid_request"), 413);
  let body: unknown;
  try { body = await req.json(); } catch { return json(fallback("invalid_request"), 400); }
  const parsed = ConversationRequest.safeParse(body);
  if (!parsed.success) return json(fallback("invalid_request"), 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!ipLimiter.take(ip) || (parsed.data.deviceId && !deviceLimiter.take(parsed.data.deviceId))) return json(fallback("rate_limited"), 429);

  const key = process.env.GROQ_API_KEY;
  if (process.env.AI_ENABLED === "false" || !key) return json(fallback("nokey"));
  const provider = new GroqProvider(key, process.env.GROQ_MODEL || "openai/gpt-oss-20b");
  const res = await converse(parsed.data, provider, { log: (l) => console.log(JSON.stringify(l)) });
  return json(res);
}
