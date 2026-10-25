export function originAllowed(origin: string | null): boolean {
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
