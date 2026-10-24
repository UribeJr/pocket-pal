/**
 * Fixed-window limiter (per minute + per day). In-memory: per serverless instance and reset on
 * cold start, so this is a soft guard. The hard cost ceiling is the Groq spend limit.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private perMinute: number, private perDay: number, private now: () => number = Date.now) {}
  take(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < 86_400_000);
    const lastMin = arr.filter((x) => t - x < 60_000).length;
    if (lastMin >= this.perMinute || arr.length >= this.perDay) { this.hits.set(key, arr); return false; }
    arr.push(t); this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.delete(this.hits.keys().next().value as string);
    return true;
  }
}
