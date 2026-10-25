/**
 * Wall clock for timestamp-based features (focus timer). Tests can skew it forward with
 * __pocketPal.clock.advance(ms); the skew lives in sessionStorage so it survives reloads.
 */
const KEY = "pocketpal:test:skew";
let skew = 0;
try { if (typeof window !== "undefined") skew = Number(sessionStorage.getItem(KEY) ?? 0) || 0; } catch {}
export const clock = {
  now: () => Date.now() + skew,
  advance(ms: number) { skew += ms; try { sessionStorage.setItem(KEY, String(skew)); } catch {} },
  reset() { skew = 0; try { sessionStorage.removeItem(KEY); } catch {} },
};
