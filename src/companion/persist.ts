import type { z } from "zod";
/** Versioned localStorage (pocketpal:v1:*), zod-validated on load. Shared by memory + session (living P5-lite). */
export const PREFIX = "pocketpal:v1:";
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const browserKV = (): KV | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function load<T>(kv: KV | null, key: string, schema: z.ZodType<T>, dflt: T): T {
  try { const raw = kv?.getItem(PREFIX + key); if (!raw) return dflt; const r = schema.safeParse(JSON.parse(raw)); return r.success ? r.data : dflt; } catch { return dflt; }
}
export function save(kv: KV | null, key: string, v: unknown) { try { kv?.setItem(PREFIX + key, JSON.stringify(v)); } catch { /* quota / private mode */ } }
export function requestPersist() { try { void navigator.storage?.persist?.(); } catch {} }
