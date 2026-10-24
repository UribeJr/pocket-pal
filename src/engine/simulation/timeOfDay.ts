/** 0 = deep night, 1 = full day. Smooth dawn (6-8h) and dusk (18-20h). */
export function daylightAt(d: Date) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 8 && h < 18) return 1;
  if (h >= 6 && h < 8) return (h - 6) / 2;
  if (h >= 18 && h < 20) return 1 - (h - 18) / 2;
  return 0;
}
/** allow ?time=HH:MM override for testing / screenshots */
export function nowWithOverride(): Date {
  if (typeof window === "undefined") return new Date();
  const t = new URLSearchParams(window.location.search).get("time");
  const d = new Date();
  if (t && /^\d{1,2}:\d{2}$/.test(t)) { const [h, m] = t.split(":").map(Number); d.setHours(h, m); }
  return d;
}
